function asyncFilterCallback(array, predicate, callback) {
    try {
        if (!Array.isArray(array)) {
            return callback(new Error('Array required'));
        }
        
        const result = [];
        let completed = 0;
        let hasError = false;
        
        if (array.length === 0) {
            return callback(null, []);
        }
        
        array.forEach((item, index) => {
            predicate(item, (err, shouldInclude) => {
                if (hasError) return;
                
                if (err) {
                    hasError = true;
                    return callback(err);
                }
                
                if (shouldInclude) {
                    result.push(item);
                }
                
                completed++;
                if (completed === array.length) {
                    callback(null, result);
                }
            });
        });
    } catch (error) {
        callback(error);
    }
}

async function asyncFilterPromise(array, predicate) {
    if (!Array.isArray(array)) {
        throw new Error('Array required');
    }
    
    const results = await Promise.all(
        array.map(async item => ({
            item,
            include: await predicate(item)
        }))
    );
    
    return results
        .filter(result => result.include)
        .map(result => result.item);
}

async function asyncFilterAbortable(array, predicate, signal) {
    if (!Array.isArray(array)) {
        throw new Error('Array required');
    }
    
    const result = [];
    
    for (let i = 0; i < array.length; i++) {
        if (signal?.aborted) {
            throw new Error('Operation aborted');
        }
        
        const shouldInclude = await predicate(array[i]);
        if (shouldInclude) {
            result.push(array[i]);
        }
    }
    
    return result;
}

function isEvenCallback(num, callback) {
    setTimeout(() => {
        try {
            callback(null, num % 2 === 0);
        } catch (error) {
            callback(error);
        }
    }, 100);
}

async function isEvenPromise(num) {
    await new Promise(resolve => setTimeout(resolve, 100));
    return num % 2 === 0;
}

let currentController = null;
let isProcessing = false;

function log(message) {
    const output = document.getElementById('output');
    if (output) {
        const timestamp = new Date().toLocaleTimeString();
        output.textContent += `[${timestamp}] ${message}\n`;
        output.scrollTop = output.scrollHeight;
    }
}

function clearOutput() {
    const output = document.getElementById('output');
    if (output) {
        output.textContent = '';
    }
}

async function runFilter() {
    if (isProcessing) {
        log('Operation already in progress');
        return;
    }

    try {
        isProcessing = true;
        clearOutput();

        const arrayInput = document.getElementById('arrayInput');
        const variant = document.getElementById('variant');
        const runBtn = document.getElementById('runButton') || document.getElementById('runBtn');
        const abortBtn = document.getElementById('abortButton') || document.getElementById('abortBtn');

        if (!arrayInput || !variant) {
            throw new Error('Required elements not found');
        }

        const array = arrayInput.value
            .split(',')
            .map(x => parseInt(x.trim()))
            .filter(x => !isNaN(x));

        if (array.length === 0) {
            throw new Error('Please enter valid numbers');
        }

        log(`Input: [${array.join(', ')}]`);
        log(`Filtering even numbers using ${variant.value} approach...`);

        if (runBtn) runBtn.disabled = true;
        const startTime = performance.now();

        let result;

        switch (variant.value) {
            case 'callback':
                result = await new Promise((resolve, reject) => {
                    asyncFilterCallback(array, isEvenCallback, (err, res) => {
                        if (err) reject(err);
                        else resolve(res);
                    });
                });
                break;

            case 'promise':
                result = await asyncFilterPromise(array, isEvenPromise);
                break;

            case 'abortable':
                currentController = new AbortController();
                if (abortBtn) abortBtn.style.display = 'block';
                result = await asyncFilterAbortable(array, isEvenPromise, currentController.signal);
                break;

            default:
                throw new Error(`Unknown variant: ${variant.value}`);
        }

        const endTime = performance.now();
        log(`Result: [${result.join(', ')}]`);
        log(`Completed in ${Math.round(endTime - startTime)}ms`);

    } catch (error) {
        if (error.message === 'Operation aborted') {
            log('Operation was aborted');
        } else {
            log(`Error: ${error.message}`);
        }
    } finally {
        isProcessing = false;
        const runBtn = document.getElementById('runButton') || document.getElementById('runBtn');
        const abortBtn = document.getElementById('abortButton') || document.getElementById('abortBtn');
        
        if (runBtn) runBtn.disabled = false;
        if (abortBtn) abortBtn.style.display = 'none';
        currentController = null;
    }
}

function abortOperation() {
    if (currentController) {
        currentController.abort();
        log('Abort signal sent');
    } else {
        log('No operation to abort');
    }
}

function updateVariantInfo() {
    const variant = document.getElementById('variant');
    const info = document.getElementById('variantInfo');
    const abortBtn = document.getElementById('abortButton') || document.getElementById('abortBtn');
    
    if (!variant || !info) return;
    
    const descriptions = {
        callback: 'Callback-based: Uses traditional callback pattern for async operations',
        promise: 'Promise-based: Returns promises for async/await usage',
        abortable: 'Abortable: Can be cancelled using AbortController'
    };
    
    info.textContent = descriptions[variant.value] || '';
    
    if (abortBtn) {
        abortBtn.style.display = variant.value === 'abortable' ? 'block' : 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const runBtn = document.getElementById('runButton') || document.getElementById('runBtn');
    const abortBtn = document.getElementById('abortButton') || document.getElementById('abortBtn');
    const variant = document.getElementById('variant');

    if (runBtn) {
        runBtn.addEventListener('click', runFilter);
    }

    if (abortBtn) {
        abortBtn.addEventListener('click', abortOperation);
    }

    if (variant) {
        variant.addEventListener('change', updateVariantInfo);
        updateVariantInfo(); 
    }

    log('Async Filter Demo Ready');
});