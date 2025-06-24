class AuthenticationProxy {
    constructor() {
        this.authStrategies = new Map();
        this.currentStrategy = null;
        this.rateLimiter = new RateLimiter();
        this.logger = new Logger();
        this.tokenCache = new Map();

        this.initializeAuthStrategies();
    }

    initializeAuthStrategies() {
        this.authStrategies.set('apikey', new ApiKeyAuthStrategy());
        this.authStrategies.set('oauth', new OAuthAuthStrategy());
        this.authStrategies.set('jwt', new JWTAuthStrategy());
        this.authStrategies.set('bearer', new BearerTokenAuthStrategy());
    }

    setAuthStrategy(strategyName, config = {}) {
        if (!this.authStrategies.has(strategyName)) {
            throw new Error(`Authentication strategy '${strategyName}' not found`);
        }
        
        this.currentStrategy = this.authStrategies.get(strategyName);
        this.currentStrategy.configure(config);
        this.logger.log(`Authentication strategy set to: ${strategyName}`);
    }

    async proxyRequest(url, options = {}) {
        const requestId = this.generateRequestId();
        
        try {
            if (!this.rateLimiter.canMakeRequest()) {
                throw new Error('Rate limit exceeded');
            }

            this.logger.logRequest(requestId, url, options);

            if (!this.currentStrategy) {
                throw new Error('No authentication strategy configured');
            }

            const proxyOptions = { ...options };
            proxyOptions.headers = { ...options.headers };

            await this.injectAuthentication(proxyOptions);

            const response = await this.makeRequest(url, proxyOptions);

            if (this.isAuthError(response)) {
                await this.handleAuthError(response);
                await this.injectAuthentication(proxyOptions);
                const retryResponse = await this.makeRequest(url, proxyOptions);
                this.logger.logResponse(requestId, retryResponse);
                return retryResponse;
            }

            this.logger.logResponse(requestId, response);
            return response;

        } catch (error) {
            this.logger.logError(requestId, error);
            throw error;
        }
    }

    async injectAuthentication(options) {
        if (this.currentStrategy) {
            await this.currentStrategy.injectAuth(options);
        }
    }

    async makeRequest(url, options) {
        const response = await fetch(url, options);
        
        return {
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            data: await this.parseResponse(response),
            ok: response.ok
        };
    }

    async parseResponse(response) {
        const contentType = response.headers.get('content-type');
        
        if (contentType && contentType.includes('application/json')) {
            return await response.json();
        } else if (contentType && contentType.includes('text/')) {
            return await response.text();
        } else {
            return await response.blob();
        }
    }

    isAuthError(response) {
        return response.status === 401 || response.status === 403;
    }

    async handleAuthError(response) {
        if (this.currentStrategy && this.currentStrategy.canRefreshToken()) {
            await this.currentStrategy.refreshToken();
            this.logger.log('Token refreshed due to authentication error');
        }
    }

    generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    getRateLimitStatus() {
        return this.rateLimiter.getStatus();
    }

    getStats() {
        return {
            rateLimitStatus: this.rateLimiter.getStatus(),
            logStats: this.logger.getStats(),
            currentStrategy: this.currentStrategy ? this.currentStrategy.getName() : 'none'
        };
    }
}

class AuthStrategy {
    constructor(name) {
        this.name = name;
        this.config = {};
    }

    configure(config) {
        this.config = { ...this.config, ...config };
    }

    getName() {
        return this.name;
    }

    async injectAuth(options) {
        throw new Error('injectAuth method must be implemented');
    }

    canRefreshToken() {
        return false;
    }

    async refreshToken() {
        throw new Error('refreshToken method must be implemented');
    }
}

class ApiKeyAuthStrategy extends AuthStrategy {
    constructor() {
        super('apikey');
    }

    async injectAuth(options) {
        const { apiKey, headerName = 'X-API-Key', queryParam } = this.config;
        
        if (!apiKey) {
            throw new Error('API key not configured');
        }

        if (queryParam) {
            const url = new URL(options.url || '');
            url.searchParams.set(queryParam, apiKey);
            options.url = url.toString();
        } else {
            options.headers[headerName] = apiKey;
        }
    }
}

class BearerTokenAuthStrategy extends AuthStrategy {
    constructor() {
        super('bearer');
    }

    async injectAuth(options) {
        const { token } = this.config;
        
        if (!token) {
            throw new Error('Bearer token not configured');
        }

        options.headers['Authorization'] = `Bearer ${token}`;
    }
}

class JWTAuthStrategy extends AuthStrategy {
    constructor() {
        super('jwt');
        this.tokenExpiry = null;
    }

    async injectAuth(options) {
        let { token, refreshToken } = this.config;
        
        if (this.isTokenExpired() && refreshToken) {
            await this.refreshToken();
            token = this.config.token;
        }

        if (!token) {
            throw new Error('JWT token not configured');
        }

        options.headers['Authorization'] = `Bearer ${token}`;
    }

    canRefreshToken() {
        return !!this.config.refreshToken;
    }

    async refreshToken() {
        const { refreshToken, refreshUrl } = this.config;
        
        if (!refreshToken || !refreshUrl) {
            throw new Error('Refresh token or refresh URL not configured');
        }

        try {
            const response = await fetch(refreshUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ refresh_token: refreshToken })
            });

            if (!response.ok) {
                throw new Error('Failed to refresh token');
            }

            const data = await response.json();
            this.config.token = data.access_token;
            this.tokenExpiry = Date.now() + (data.expires_in * 1000);
            
        } catch (error) {
            throw new Error(`Token refresh failed: ${error.message}`);
        }
    }

    isTokenExpired() {
        if (!this.tokenExpiry) {
            return false;
        }
        return Date.now() >= this.tokenExpiry - 30000;
    }
}

class OAuthAuthStrategy extends AuthStrategy {
    constructor() {
        super('oauth');
    }

    async injectAuth(options) {
        let { accessToken, clientId, clientSecret, tokenUrl } = this.config;
        
        if (!accessToken && clientId && clientSecret && tokenUrl) {
            await this.getAccessToken();
            accessToken = this.config.accessToken;
        }

        if (!accessToken) {
            throw new Error('OAuth access token not available');
        }

        options.headers['Authorization'] = `Bearer ${accessToken}`;
    }

    canRefreshToken() {
        return !!(this.config.refreshToken || (this.config.clientId && this.config.clientSecret));
    }

    async refreshToken() {
        await this.getAccessToken();
    }

    async getAccessToken() {
        const { clientId, clientSecret, tokenUrl, refreshToken } = this.config;
        
        const body = refreshToken 
            ? new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
                client_id: clientId,
                client_secret: clientSecret
            })
            : new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: clientId,
                client_secret: clientSecret
            });

        try {
            const response = await fetch(tokenUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: body
            });

            if (!response.ok) {
                throw new Error('Failed to get access token');
            }

            const data = await response.json();
            this.config.accessToken = data.access_token;
            this.config.refreshToken = data.refresh_token || this.config.refreshToken;
            
        } catch (error) {
            throw new Error(`OAuth token request failed: ${error.message}`);
        }
    }
}

class RateLimiter {
    constructor(maxRequests = 100, windowMs = 60000) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
        this.requests = [];
    }

    canMakeRequest() {
        const now = Date.now();

        this.requests = this.requests.filter(time => now - time < this.windowMs);

        if (this.requests.length < this.maxRequests) {
            this.requests.push(now);
            return true;
        }
        
        return false;
    }

    getStatus() {
        const now = Date.now();
        this.requests = this.requests.filter(time => now - time < this.windowMs);
        
        return {
            current: this.requests.length,
            max: this.maxRequests,
            windowMs: this.windowMs,
            resetTime: this.requests.length > 0 ? Math.min(...this.requests) + this.windowMs : now
        };
    }

    setLimits(maxRequests, windowMs) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
    }
}

class Logger {
    constructor() {
        this.logs = [];
        this.maxLogs = 1000;
        this.stats = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            authErrors: 0
        };
    }

    log(message, level = 'info') {
        const logEntry = {
            timestamp: new Date().toISOString(),
            level,
            message,
            id: this.generateLogId()
        };
        
        this.addLog(logEntry);
        console.log(`[${logEntry.timestamp}] ${level.toUpperCase()}: ${message}`);
    }

    logRequest(requestId, url, options) {
        this.stats.totalRequests++;
        
        const logEntry = {
            timestamp: new Date().toISOString(),
            level: 'info',
            type: 'request',
            requestId,
            url,
            method: options.method || 'GET',
            headers: options.headers || {},
            id: this.generateLogId()
        };
        
        this.addLog(logEntry);
        console.log(`[${logEntry.timestamp}] REQUEST: ${logEntry.method} ${url}`);
    }

    logResponse(requestId, response) {
        if (response.ok) {
            this.stats.successfulRequests++;
        } else {
            this.stats.failedRequests++;
            if (response.status === 401 || response.status === 403) {
                this.stats.authErrors++;
            }
        }
        
        const logEntry = {
            timestamp: new Date().toISOString(),
            level: response.ok ? 'info' : 'warn',
            type: 'response',
            requestId,
            status: response.status,
            statusText: response.statusText,
            id: this.generateLogId()
        };
        
        this.addLog(logEntry);
        console.log(`[${logEntry.timestamp}] RESPONSE: ${response.status} ${response.statusText}`);
    }

    logError(requestId, error) {
        this.stats.failedRequests++;
        
        const logEntry = {
            timestamp: new Date().toISOString(),
            level: 'error',
            type: 'error',
            requestId,
            error: error.message,
            stack: error.stack,
            id: this.generateLogId()
        };
        
        this.addLog(logEntry);
        console.error(`[${logEntry.timestamp}] ERROR: ${error.message}`);
    }

    addLog(logEntry) {
        this.logs.push(logEntry);

        if (this.logs.length > this.maxLogs) {
            this.logs = this.logs.slice(-this.maxLogs);
        }
    }

    getLogs(limit = 100) {
        return this.logs.slice(-limit);
    }

    getStats() {
        return { ...this.stats };
    }

    generateLogId() {
        return `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    clearLogs() {
        this.logs = [];
        this.stats = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            authErrors: 0
        };
    }
}

function createAuthProxy(config = {}) {
    const proxy = new AuthenticationProxy();
    
    if (config.rateLimit) {
        proxy.rateLimiter.setLimits(
            config.rateLimit.maxRequests || 100,
            config.rateLimit.windowMs || 60000
        );
    }
    
    return proxy;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        AuthenticationProxy,
        createAuthProxy,
        AuthStrategy,
        ApiKeyAuthStrategy,
        BearerTokenAuthStrategy,
        JWTAuthStrategy,
        OAuthAuthStrategy,
        RateLimiter,
        Logger
    };
}

if (typeof window !== 'undefined') {
    window.AuthenticationProxy = AuthenticationProxy;
    window.createAuthProxy = createAuthProxy;
}