class AuthenticationProxy {
  constructor(config = {}) {
    this.config = {
      baseURL: config.baseURL || '',
      timeout: config.timeout || 30000,
      retries: config.retries || 3,
      rateLimit: config.rateLimit || { requests: 100, window: 60000 }, 
      logging: config.logging !== false,
      ...config
    };
    
    this.authStrategies = new Map();
    this.requestQueue = [];
    this.rateLimitTracker = { count: 0, resetTime: Date.now() + this.config.rateLimit.window };
    this.logger = new ProxyLogger(config.logLevel || 'INFO');
    
    this.setupDefaultStrategies();
  }

  setupDefaultStrategies() {
    this.registerAuthStrategy('oauth', {
      inject: async (request, credentials) => {
        if (!credentials.accessToken) {
          credentials.accessToken = await this.refreshOAuthToken(credentials);
        }
        request.headers = { ...request.headers, Authorization: `Bearer ${credentials.accessToken}` };
        return request;
      },
      refresh: this.refreshOAuthToken.bind(this),
      shouldRefresh: (response) => response.status === 401
    });

    this.registerAuthStrategy('apikey', {
      inject: async (request, credentials) => {
        if (credentials.headerName) {
          request.headers = { ...request.headers, [credentials.headerName]: credentials.apiKey };
        } else {
          request.headers = { ...request.headers, 'X-API-Key': credentials.apiKey };
        }
        return request;
      },
      refresh: null,
      shouldRefresh: () => false
    });

    this.registerAuthStrategy('jwt', {
      inject: async (request, credentials) => {
        if (this.isTokenExpired(credentials.token)) {
          credentials.token = await this.refreshJWT(credentials);
        }
        request.headers = { ...request.headers, Authorization: `Bearer ${credentials.token}` };
        return request;
      },
      refresh: this.refreshJWT.bind(this),
      shouldRefresh: (response) => response.status === 401
    });
  }

  registerAuthStrategy(name, strategy) {
    this.authStrategies.set(name, strategy);
  }

  async request(options) {
    const requestId = this.generateRequestId();
    
    try {
      await this.checkRateLimit();
      
      const request = await this.prepareRequest(options);
      
      if (this.config.logging) {
        this.logger.info(`[${requestId}] Outgoing request`, {
          method: request.method,
          url: request.url,
          headers: this.sanitizeHeaders(request.headers)
        });
      }

      const response = await this.executeWithRetry(request, requestId);
      
      if (this.config.logging) {
        this.logger.info(`[${requestId}] Response received`, {
          status: response.status,
          statusText: response.statusText
        });
      }

      return response;
    } catch (error) {
      this.logger.error(`[${requestId}] Request failed`, { error: error.message });
      throw error;
    }
  }

  async prepareRequest(options) {
    const request = {
      method: options.method || 'GET',
      url: this.buildURL(options.url || options.endpoint),
      headers: { 'Content-Type': 'application/json', ...options.headers },
      body: options.body,
      credentials: options.credentials
    };

    if (options.auth && this.authStrategies.has(options.auth.type)) {
      const strategy = this.authStrategies.get(options.auth.type);
      return await strategy.inject(request, options.auth.credentials);
    }

    return request;
  }

  async executeWithRetry(request, requestId, attempt = 1) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.timeout);

      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        signal: controller.signal
      });

      clearTimeout(timeout);

      // Handle authentication refresh
      if (request.credentials && this.shouldRefreshAuth(response, request.auth?.type)) {
        return await this.handleAuthRefresh(request, requestId);
      }

      return response;
    } catch (error) {
      if (attempt < this.config.retries && this.isRetryableError(error)) {
        this.logger.warn(`[${requestId}] Retrying request (attempt ${attempt + 1})`);
        await this.delay(Math.pow(2, attempt) * 1000); 
        return this.executeWithRetry(request, requestId, attempt + 1);
      }
      throw error;
    }
  }

  async handleAuthRefresh(request, requestId) {
    const authType = request.auth?.type;
    const strategy = this.authStrategies.get(authType);
    
    if (strategy && strategy.refresh) {
      try {
        this.logger.info(`[${requestId}] Refreshing authentication`);
        const newCredentials = await strategy.refresh(request.credentials);
        request.credentials = { ...request.credentials, ...newCredentials };
        
        const updatedRequest = await strategy.inject(request, request.credentials);
        return this.executeWithRetry(updatedRequest, requestId);
      } catch (refreshError) {
        this.logger.error(`[${requestId}] Auth refresh failed`, { error: refreshError.message });
        throw refreshError;
      }
    }
    
    throw new Error('Authentication failed and no refresh strategy available');
  }

  async checkRateLimit() {
    const now = Date.now();
    
    if (now > this.rateLimitTracker.resetTime) {
      this.rateLimitTracker.count = 0;
      this.rateLimitTracker.resetTime = now + this.config.rateLimit.window;
    }
    
    if (this.rateLimitTracker.count >= this.config.rateLimit.requests) {
      const waitTime = this.rateLimitTracker.resetTime - now;
      this.logger.warn(`Rate limit reached, waiting ${waitTime}ms`);
      await this.delay(waitTime);
      return this.checkRateLimit();
    }
    
    this.rateLimitTracker.count++;
  }

  async refreshOAuthToken(credentials) {
    const response = await fetch(credentials.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: credentials.refreshToken,
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret
      })
    });

    if (!response.ok) throw new Error('Failed to refresh OAuth token');
    
    const data = await response.json();
    return data.access_token;
  }

  async refreshJWT(credentials) {
    const response = await fetch(credentials.refreshEndpoint, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${credentials.refreshToken}`
      }
    });

    if (!response.ok) throw new Error('Failed to refresh JWT token');
    
    const data = await response.json();
    return data.token;
  }

  isTokenExpired(token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return Date.now() >= payload.exp * 1000;
    } catch {
      return true;
    }
  }

  shouldRefreshAuth(response, authType) {
    const strategy = this.authStrategies.get(authType);
    return strategy && strategy.shouldRefresh(response);
  }

  buildURL(endpoint) {
    if (endpoint.startsWith('http')) return endpoint;
    return `${this.config.baseURL}${endpoint}`;
  }

  generateRequestId() {
    return Math.random().toString(36).substr(2, 9);
  }

  sanitizeHeaders(headers) {
    const sanitized = { ...headers };
    ['authorization', 'x-api-key'].forEach(key => {
      if (sanitized[key]) sanitized[key] = '[REDACTED]';
    });
    return sanitized;
  }

  isRetryableError(error) {
    return error.name === 'AbortError' || 
           error.message.includes('network') ||
           error.message.includes('timeout');
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

class ProxyLogger {
  constructor(level = 'INFO') {
    this.levels = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 };
    this.currentLevel = this.levels[level] || 2;
  }

  log(level, message, data = {}) {
    if (this.levels[level] <= this.currentLevel) {
      const timestamp = new Date().toISOString();
      const logEntry = {
        timestamp,
        level,
        message,
        ...data
      };
      console.log(`[${timestamp}] ${level}: ${message}`, data);
    }
  }

  error(message, data) { this.log('ERROR', message, data); }
  warn(message, data) { this.log('WARN', message, data); }
  info(message, data) { this.log('INFO', message, data); }
  debug(message, data) { this.log('DEBUG', message, data); }
}

export default AuthenticationProxy;
