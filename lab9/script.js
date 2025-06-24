const LogLevel = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
};

const LogDestination = {
    CONSOLE: 'console',
    DOM: 'dom',
    MEMORY: 'memory',
    FILE: 'file'
};

let globalConfig = {
    destination: LogDestination.CONSOLE,
    format: 'standard',
    enableProfiling: false,
    minLogLevel: LogLevel.DEBUG
};

let memoryStore = [];

const formatters = {
    standard: (entry) => {
        const timestamp = new Date(entry.timestamp).toISOString();
        const level = Object.keys(LogLevel)[entry.level];
        const duration = entry.duration ? ` [${entry.duration}ms]` : '';
        return `[${timestamp}] ${level}${duration}: ${entry.message}`;
    },
    
    json: (entry) => {
        return JSON.stringify(entry, null, 2);
    },
    
    custom: (entry) => {
        const timestamp = new Date(entry.timestamp).toLocaleString();
        const level = Object.keys(LogLevel)[entry.level];
        const func = entry.functionName || 'unknown';
        const duration = entry.duration ? ` (${entry.duration}ms)` : '';
        return `🔹 ${timestamp} | ${level} | ${func}${duration}\n   └─ ${entry.message}`;
    }
};

class Logger {
    constructor(config = {}) {
        this.config = { ...globalConfig, ...config };
    }

    log(level, message, metadata = {}) {
        if (level < this.config.minLogLevel) {
            return;
        }

        const entry = {
            timestamp: Date.now(),
            level: level,
            message: message,
            ...metadata
        };

        this.output(entry);
    }

    output(entry) {
        const formatter = formatters[this.config.format] || formatters.standard;
        const formattedMessage = formatter(entry);

        switch (this.config.destination) {
            case LogDestination.CONSOLE:
                this.outputToConsole(entry.level, formattedMessage);
                break;
            case LogDestination.DOM:
                this.outputToDOM(formattedMessage);
                break;
            case LogDestination.MEMORY:
                this.outputToMemory(entry);
                break;
        }
    }

    outputToConsole(level, message) {
        const methods = ['log', 'info', 'warn', 'error'];
        const method = methods[level] || 'log';
        console[method](message);
    }

    outputToDOM(message) {
        const output = document.getElementById('logOutput');
        if (output) {
            output.textContent += message + '\n';
            output.scrollTop = output.scrollHeight;
        }
    }

    outputToMemory(entry) {
        memoryStore.push(entry);
        if (memoryStore.length > 1000) {
            memoryStore = memoryStore.slice(-1000);
        }
    }
}

function log(options = {}) {
    const {
        level = 'INFO',
        condition = null,
        enableProfiling = globalConfig.enableProfiling,
        customFormatter = null
    } = options;

    const logLevel = LogLevel[level.toUpperCase()] !== undefined ? 
        LogLevel[level.toUpperCase()] : LogLevel.INFO;

    return function decorator(target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;
        const isAsync = originalMethod.constructor.name === 'AsyncFunction';

        descriptor.value = function(...args) {
            const logger = new Logger({
                format: customFormatter ? 'custom' : globalConfig.format,
                enableProfiling: enableProfiling
            });

            if (condition && !condition(args, this)) {
                return originalMethod.apply(this, args);
            }

            const functionName = propertyKey || originalMethod.name || 'anonymous';
            const startTime = enableProfiling ? performance.now() : null;

            if (logLevel !== LogLevel.ERROR) {
                logger.log(logLevel, `Calling ${functionName}`, {
                    functionName: functionName,
                    arguments: args,
                    type: 'entry'
                });
            }

            try {
                const result = originalMethod.apply(this, args);

                if (isAsync) {
                    return result.then(asyncResult => {
                        const duration = enableProfiling ? 
                            Math.round(performance.now() - startTime) : null;
                        
                        logger.log(logLevel, `${functionName} completed successfully`, {
                            functionName: functionName,
                            arguments: args,
                            result: asyncResult,
                            duration: duration,
                            type: 'success'
                        });
                        
                        return asyncResult;
                    }).catch(error => {
                        const duration = enableProfiling ? 
                            Math.round(performance.now() - startTime) : null;
                        
                        logger.log(LogLevel.ERROR, `${functionName} failed with error: ${error.message}`, {
                            functionName: functionName,
                            arguments: args,
                            error: error.message,
                            duration: duration,
                            type: 'error'
                        });
                        
                        throw error;
                    });
                } else {
                    const duration = enableProfiling ? 
                        Math.round(performance.now() - startTime) : null;
                    
                    logger.log(logLevel, `${functionName} completed successfully`, {
                        functionName: functionName,
                        arguments: args,
                        result: result,
                        duration: duration,
                        type: 'success'
                    });
                    
                    return result;
                }
            } catch (error) {
                const duration = enableProfiling ? 
                    Math.round(performance.now() - startTime) : null;
                
                logger.log(LogLevel.ERROR, `${functionName} failed with error: ${error.message}`, {
                    functionName: functionName,
                    arguments: args,
                    error: error.message,
                    duration: duration,
                    type: 'error'
                });
                
                throw error;
            }
        };

        return descriptor;
    };
}

function logFunction(fn, options = {}) {
    const {
        level = 'INFO',
        condition = null,
        enableProfiling = globalConfig.enableProfiling,
        customFormatter = null
    } = options;

    const logLevel = LogLevel[level.toUpperCase()] !== undefined ? 
        LogLevel[level.toUpperCase()] : LogLevel.INFO;

    const isAsync = fn.constructor.name === 'AsyncFunction';

    return function(...args) {
        const logger = new Logger({
            format: customFormatter ? 'custom' : globalConfig.format,
            enableProfiling: enableProfiling
        });

        if (condition && !condition(args)) {
            return fn.apply(this, args);
        }

        const functionName = fn.name || 'anonymous';
        const startTime = enableProfiling ? performance.now() : null;

        if (logLevel !== LogLevel.ERROR) {
            logger.log(logLevel, `Calling ${functionName}`, {
                functionName: functionName,
                arguments: args,
                type: 'entry'
            });
        }

        try {
            const result = fn.apply(this, args);

            if (isAsync) {
                return result.then(asyncResult => {
                    const duration = enableProfiling ? 
                        Math.round(performance.now() - startTime) : null;
                    
                    logger.log(logLevel, `${functionName} completed successfully`, {
                        functionName: functionName,
                        arguments: args,
                        result: asyncResult,
                        duration: duration,
                        type: 'success'
                    });
                    
                    return asyncResult;
                }).catch(error => {
                    const duration = enableProfiling ? 
                        Math.round(performance.now() - startTime) : null;
                    
                    logger.log(LogLevel.ERROR, `${functionName} failed with error: ${error.message}`, {
                        functionName: functionName,
                        arguments: args,
                        error: error.message,
                        duration: duration,
                        type: 'error'
                    });
                    
                    throw error;
                });
            } else {
                const duration = enableProfiling ? 
                    Math.round(performance.now() - startTime) : null;
                
                logger.log(logLevel, `${functionName} completed successfully`, {
                    functionName: functionName,
                    arguments: args,
                    result: result,
                    duration: duration,
                    type: 'success'
                });
                
                return result;
            }
        } catch (error) {
            const duration = enableProfiling ? 
                Math.round(performance.now() - startTime) : null;
            
            logger.log(LogLevel.ERROR, `${functionName} failed with error: ${error.message}`, {
                functionName: functionName,
                arguments: args,
                error: error.message,
                duration: duration,
                type: 'error'
            });
            
            throw error;
        }
    };
}

const testSyncFunction = logFunction(function calculateSum(a, b) {
    return a + b;
}, { level: 'INFO' });

const testAsyncFunction = logFunction(async function fetchData(url) {
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000));
    return { data: `Data from ${url}`, timestamp: Date.now() };
}, { level: 'DEBUG' });

const testErrorFunction = logFunction(function divide(a, b) {
    if (b === 0) {
        throw new Error('Division by zero');
    }
    return a / b;
}, { level: 'ERROR' });

const testConditionalFunction = logFunction(function processValue(value) {
    return value * 2;
}, { 
    level: 'INFO', 
    condition: (args) => args[0] > 5 
});

const testCustomFormatterFunction = logFunction(function customFormattedFunction(data) {
    return data.toUpperCase();
}, { level: 'INFO', customFormatter: true });

const testJSONLoggingFunction = logFunction(function jsonLoggedFunction(obj) {
    return { ...obj, processed: true };
}, { level: 'INFO' });

function testSyncFunction() {
    const result = testSyncFunction(5, 3);
    console.log('Sync result:', result);
}

async function testAsyncFunction() {
    try {
        const result = await testAsyncFunction('https://api.example.com/data');
        console.log('Async result:', result);
    } catch (error) {
        console.error('Async error:', error);
    }
}

function testErrorFunction() {
    try {
        testErrorFunction(10, 0);
    } catch (error) {
        console.log('Caught expected error');
    }
}

function testConditionalLogging() {
    testConditionalFunction(3); 
    testConditionalFunction(8); 
}

function testCustomFormatter() {
    const oldFormat = globalConfig.format;
    globalConfig.format = 'custom';
    testCustomFormatterFunction('hello world');
    globalConfig.format = oldFormat;
}

function testStructuredLogging() {
    const oldFormat = globalConfig.format;
    globalConfig.format = 'json';
    testJSONLoggingFunction({ name: 'test', value: 42 });
    globalConfig.format = oldFormat;
}

function updateLogDestination() {
    const select = document.getElementById('logDestination');
    globalConfig.destination = select.value;
}

function updateLogFormat() {
    const select = document.getElementById('logFormat');
    globalConfig.format = select.value;
}

function updateProfiling() {
    const checkbox = document.getElementById('enableProfiling');
    globalConfig.enableProfiling = checkbox.checked;
}

function showMemoryLogs() {
    const output = document.getElementById('memoryOutput');
    if (memoryStore.length === 0) {
        output.textContent = 'No logs in memory store.';
        return;
    }

    const formatted = memoryStore.map(entry => formatters.standard(entry)).join('\n');
    output.textContent = formatted;
    output.scrollTop = output.scrollHeight;
}

function exportLogs() {
    if (memoryStore.length === 0) {
        alert('No logs to export.');
        return;
    }

    const jsonData = JSON.stringify(memoryStore, null, 2);
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function clearLogs() {
    const logOutput = document.getElementById('logOutput');
    const memoryOutput = document.getElementById('memoryOutput');
    
    if (logOutput) logOutput.textContent = '';
    if (memoryOutput) memoryOutput.textContent = '';
    
    memoryStore = [];
    console.clear();
}

document.addEventListener('DOMContentLoaded', function() {
    updateLogDestination();
    updateLogFormat();
    updateProfiling();

    const logger = new Logger();
    logger.log(LogLevel.INFO, 'Logging Decorator System initialized', {
        functionName: 'system',
        type: 'info'
    });
});