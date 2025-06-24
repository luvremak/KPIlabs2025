class Logger {
  constructor(config = {}) {
    this.levels = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 };
    this.currentLevel = this.levels[config.level || 'INFO'];
    this.outputs = config.outputs || ['console'];
    this.formatter = config.formatter || this.defaultFormatter;
    this.structuredLogging = config.structuredLogging || false;
    this.timestampFormat = config.timestampFormat || 'ISO';
    this.conditionalLogging = config.conditionalLogging || {};
  }

  log(level, functionName, data) {
    if (this.levels[level] <= this.currentLevel) {
      const logEntry = this.formatter(level, functionName, data);
      this.outputs.forEach(output => this.writeToOutput(output, logEntry));
    }
  }

  writeToOutput(output, logEntry) {
    switch (output) {
      case 'console':
        console.log(logEntry);
        break;
      case 'file':
        this.writeToFile(logEntry);
        break;
      case 'external':
        this.sendToExternalService(logEntry);
        break;
      default:
        if (typeof output === 'function') {
          output(logEntry);
        }
    }
  }

  writeToFile(logEntry) {
    try {
      const logs = JSON.parse(localStorage.getItem('app_logs') || '[]');
      logs.push(logEntry);
      if (logs.length > 1000) logs.shift();
      localStorage.setItem('app_logs', JSON.stringify(logs));
    } catch (error) {
      console.warn('Failed to write to file storage:', error);
    }
  }

  async sendToExternalService(logEntry) {
    try {
      await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logEntry)
      });
    } catch (error) {
      console.warn('Failed to send log to external service:', error);
    }
  }

  defaultFormatter(level, functionName, data) {
    const timestamp = this.getTimestamp();
    
    if (this.structuredLogging) {
      return JSON.stringify({
        timestamp,
        level,
        function: functionName,
        ...data
      });
    }
    
    let message = `[${timestamp}] ${level} - ${functionName}`;
    if (data.args && data.args.length > 0) {
      message += ` | Args: ${JSON.stringify(data.args)}`;
    }
    if (data.result !== undefined) {
      message += ` | Result: ${JSON.stringify(data.result)}`;
    }
    if (data.error) {
      message += ` | Error: ${data.error}`;
    }
    if (data.duration !== undefined) {
      message += ` | Duration: ${data.duration}ms`;
    }
    
    return message;
  }

  getTimestamp() {
    const now = new Date();
    switch (this.timestampFormat) {
      case 'ISO':
        return now.toISOString();
      case 'locale':
        return now.toLocaleString();
      case 'epoch':
        return now.getTime();
      default:
        return now.toISOString();
    }
  }

  shouldLog(level, condition) {
    if (!this.conditionalLogging[level]) return true;
    return typeof condition === 'function' ? condition() : condition;
  }
}

let globalLogger = new Logger();

function configureLogger(config) {
  globalLogger = new Logger(config);
}

function log(options = {}) {
  const {
    level = 'INFO',
    includeArgs = true,
    includeResult = true,
    includeErrors = true,
    includeTiming = false,
    condition = null,
    formatter = null
  } = options;

  return function decorator(target, propertyKey, descriptor) {
    if (descriptor) {
      const originalMethod = descriptor.value;
      
      if (typeof originalMethod !== 'function') {
        throw new Error('Decorator can only be applied to functions');
      }

      const isAsync = originalMethod.constructor.name === 'AsyncFunction';
      
      descriptor.value = isAsync 
        ? createAsyncWrapper(originalMethod, propertyKey, level, options)
        : createSyncWrapper(originalMethod, propertyKey, level, options);
      
      return descriptor;
    } else {
      return function(func) {
        const isAsync = func.constructor.name === 'AsyncFunction';
        return isAsync 
          ? createAsyncWrapper(func, func.name, level, options)
          : createSyncWrapper(func, func.name, level, options);
      };
    }
  };
}

function createSyncWrapper(originalFunction, functionName, level, options) {
  return function(...args) {
    const startTime = Date.now();
    const actualFunctionName = functionName || originalFunction.name || 'anonymous';

    if (options.condition && !options.condition()) {
      return originalFunction.apply(this, args);
    }

    if (options.includeArgs && globalLogger.shouldLog(level)) {
      globalLogger.log(level, actualFunctionName, {
        event: 'entry',
        args: sanitizeArgs(args)
      });
    }

    try {
      const result = originalFunction.apply(this, args);
      const duration = Date.now() - startTime;

      if (globalLogger.shouldLog(level)) {
        const logData = { event: 'success' };
        if (options.includeResult) logData.result = sanitizeResult(result);
        if (options.includeTiming) logData.duration = duration;
        
        globalLogger.log(level, actualFunctionName, logData);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      if (options.includeErrors) {
        const errorLevel = level === 'ERROR' ? 'ERROR' : 'ERROR';
        const logData = {
          event: 'error',
          error: error.message,
          stack: error.stack
        };
        if (options.includeTiming) logData.duration = duration;
        
        globalLogger.log(errorLevel, actualFunctionName, logData);
      }

      throw error;
    }
  };
}

function createAsyncWrapper(originalFunction, functionName, level, options) {
  return async function(...args) {
    const startTime = Date.now();
    const actualFunctionName = functionName || originalFunction.name || 'anonymous';
    
    if (options.condition && !options.condition()) {
      return originalFunction.apply(this, args);
    }

    if (options.includeArgs && globalLogger.shouldLog(level)) {
      globalLogger.log(level, actualFunctionName, {
        event: 'entry',
        args: sanitizeArgs(args)
      });
    }

    try {
      const result = await originalFunction.apply(this, args);
      const duration = Date.now() - startTime;

      if (globalLogger.shouldLog(level)) {
        const logData = { event: 'success' };
        if (options.includeResult) logData.result = sanitizeResult(result);
        if (options.includeTiming) logData.duration = duration;
        
        globalLogger.log(level, actualFunctionName, logData);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      if (options.includeErrors) {
        const errorLevel = level === 'ERROR' ? 'ERROR' : 'ERROR';
        const logData = {
          event: 'error',
          error: error.message,
          stack: error.stack
        };
        if (options.includeTiming) logData.duration = duration;
        
        globalLogger.log(errorLevel, actualFunctionName, logData);
      }

      throw error;
    }
  };
}

function sanitizeArgs(args) {
  return args.map(arg => {
    if (arg === null || arg === undefined) return arg;
    if (typeof arg === 'function') return '[Function]';
    if (arg instanceof Error) return { error: arg.message };
    if (typeof arg === 'object') {
      try {
        return JSON.parse(JSON.stringify(arg)); 
      } catch {
        return '[Complex Object]';
      }
    }
    return arg;
  });
}

function sanitizeResult(result) {
  if (result === null || result === undefined) return result;
  if (typeof result === 'function') return '[Function]';
  if (result instanceof Error) return { error: result.message };
  if (typeof result === 'object') {
    try {
      return JSON.parse(JSON.stringify(result));
    } catch {
      return '[Complex Object]';
    }
  }
  return result;
}

const formatters = {
  json: (level, functionName, data) => JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    function: functionName,
    ...data
  }),
  
  compact: (level, functionName, data) => {
    const parts = [level.charAt(0), functionName];
    if (data.args) parts.push(`A:${data.args.length}`);
    if (data.result !== undefined) parts.push('R:✓');
    if (data.error) parts.push('E:✗');
    if (data.duration) parts.push(`${data.duration}ms`);
    return parts.join('|');
  },
  
  detailed: (level, functionName, data) => {
    let message = `\n=== ${level} LOG ===\n`;
    message += `Function: ${functionName}\n`;
    message += `Time: ${new Date().toISOString()}\n`;
    if (data.args) message += `Arguments: ${JSON.stringify(data.args, null, 2)}\n`;
    if (data.result !== undefined) message += `Result: ${JSON.stringify(data.result, null, 2)}\n`;
    if (data.error) message += `Error: ${data.error}\n`;
    if (data.duration) message += `Duration: ${data.duration}ms\n`;
    message += '================\n';
    return message;
  }
};
