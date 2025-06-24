function memoize(fn, {
  maxSize = Infinity,
  evictionPolicy = 'LRU',
  expiryTime = null,
  customEvict = null
} = {}) {
  const cache = new Map();
  const accessCount = new Map();
  let stats = { hits: 0, misses: 0 };

  function getKey(args) {
    return JSON.stringify(args);
  }

  function evictIfNeeded() {
    if (cache.size < maxSize) return;

    let keyToEvict;

    if (evictionPolicy === 'LRU') {
      keyToEvict = cache.keys().next().value;
    } else if (evictionPolicy === 'LFU') {
      let minFreq = Infinity;
      for (const [key, count] of accessCount.entries()) {
        if (count < minFreq) {
          minFreq = count;
          keyToEvict = key;
        }
      }
    } else if (evictionPolicy === 'TIME') {
      const now = Date.now();
      for (const [key, entry] of cache.entries()) {
        if (now - entry.timestamp > expiryTime) {
          keyToEvict = key;
          break;
        }
      }
      if (!keyToEvict) return;
    } else if (evictionPolicy === 'CUSTOM' && typeof customEvict === 'function') {
      keyToEvict = customEvict(cache);
    }

    if (keyToEvict !== undefined) {
      cache.delete(keyToEvict);
      accessCount.delete(keyToEvict);
    }
  }

  const memoizedFn = function (...args) {
    const key = getKey(args);

    if (evictionPolicy === 'TIME' && cache.has(key)) {
      const now = Date.now();
      if (now - cache.get(key).timestamp > expiryTime) {
        cache.delete(key);
        accessCount.delete(key);
      }
    }

    if (cache.has(key)) {
      stats.hits++;
      accessCount.set(key, (accessCount.get(key) || 0) + 1);

      const entry = cache.get(key);
      if (evictionPolicy === 'LRU') {
        cache.delete(key);
        cache.set(key, entry);
      }

      return entry.value;
    }

    stats.misses++;
    const result = fn(...args);
    evictIfNeeded();

    const now = Date.now();
    cache.set(key, { value: result, timestamp: now });
    accessCount.set(key, 1);
    return result;
  };

  memoizedFn.getCache = () => cache;
  memoizedFn.getStats = () => stats;
  memoizedFn.getAccessCount = () => accessCount;
  memoizedFn.clearCache = () => {
    cache.clear();
    accessCount.clear();
    stats = { hits: 0, misses: 0 };
  };

  return memoizedFn;
}

// Test functions
const testFunctions = {
  fibonacci: function fibonacci(n) {
    if (n <= 1) return n;
    return fibonacci(n - 1) + fibonacci(n - 2);
  },

  factorial: function factorial(n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
  },

  expensiveCalc: function expensiveCalc(n) {
    let result = 0;
    for (let i = 0; i < n * 100000; i++) {
      result += Math.sqrt(i);
    }
    return result;
  },

  fibonacci_iter: function fibonacciIter(n) {
    if (n <= 1) return n;
    let a = 0, b = 1;
    for (let i = 2; i <= n; i++) {
      [a, b] = [b, a + b];
    }
    return b;
  }
};

let currentMemoizedFn = null;
let performanceData = [];

// Custom eviction function example
function customEvict(cache) {
  for (const [key, entry] of cache.entries()) {
    if (entry.value % 2 === 0) {
      return key;
    }
  }
  return cache.keys().next().value;
}

function initializeMemoizedFunction() {
  const fnName = document.getElementById('testFunction').value;
  const evictionPolicy = document.getElementById('evictionPolicy').value;
  const maxSize = parseInt(document.getElementById('maxSize').value);
  const expiryTime = parseInt(document.getElementById('expiryTime').value);

  const options = {
    maxSize,
    evictionPolicy,
    expiryTime: evictionPolicy === 'TIME' ? expiryTime : null,
    customEvict: evictionPolicy === 'CUSTOM' ? customEvict : null
  };

  currentMemoizedFn = memoize(testFunctions[fnName], options);
}

function runSingleTest() {
  initializeMemoizedFunction();

  const input = document.getElementById('testInput').value;
  const inputs = input.split(',').map(x => parseInt(x.trim())).filter(x => !isNaN(x));
  if (inputs.length === 0) {
    alert('Please enter valid input numbers');
    return;
  }

  const results = document.getElementById('results');
  results.innerHTML += `\n=== Single Test Run ===\n`;
  results.innerHTML += `Function: ${document.getElementById('testFunction').value}\n`;
  results.innerHTML += `Policy: ${document.getElementById('evictionPolicy').value}\n`;
  results.innerHTML += `Max Size: ${document.getElementById('maxSize').value}\n\n`;

  let totalTime = 0;
  inputs.forEach((input) => {
    const start = performance.now();
    const result = currentMemoizedFn(input);
    const end = performance.now();
    const time = end - start;
    totalTime += time;
    results.innerHTML += `Input: ${input} | Result: ${result} | Time: ${time.toFixed(3)}ms\n`;
  });

  results.innerHTML += `\nTotal Time: ${totalTime.toFixed(3)}ms\n`;
  results.innerHTML += `Average Time: ${(totalTime / inputs.length).toFixed(3)}ms\n`;

  updateStats();
  updateCacheVisualization();
  results.scrollTop = results.scrollHeight;
}

function runBenchmark() {
  initializeMemoizedFunction();

  const input = document.getElementById('testInput').value;
  const inputs = input.split(',').map(x => parseInt(x.trim())).filter(x => !isNaN(x));
  if (inputs.length === 0) {
    alert('Please enter valid input numbers');
    return;
  }

  const performance_output = document.getElementById('performance');
  performance_output.innerHTML += `\n=== Benchmark Test ===\n`;

  const iterations = 5;
  let totalResults = [];

  for (let iter = 0; iter < iterations; iter++) {
    currentMemoizedFn.clearCache();
    const iterResults = [];

    inputs.forEach(input => {
      const start = performance.now();
      const result = currentMemoizedFn(input);
      const end = performance.now();
      iterResults.push(end - start);
    });

    totalResults.push(iterResults);
    const avgTime = iterResults.reduce((a, b) => a + b, 0) / iterResults.length;
    performance_output.innerHTML += `Iteration ${iter + 1}: Avg ${avgTime.toFixed(3)}ms\n`;
  }

  const allTimes = totalResults.flat();
  const avgTotal = allTimes.reduce((a, b) => a + b, 0) / allTimes.length;
  const minTime = Math.min(...allTimes);
  const maxTime = Math.max(...allTimes);

  performance_output.innerHTML += `\nStatistics:\n`;
  performance_output.innerHTML += `Average: ${avgTotal.toFixed(3)}ms\n`;
  performance_output.innerHTML += `Min: ${minTime.toFixed(3)}ms\n`;
  performance_output.innerHTML += `Max: ${maxTime.toFixed(3)}ms\n`;

  updateStats();
  updateCacheVisualization();
  performance_output.scrollTop = performance_output.scrollHeight;
}

function updateStats() {
  if (!currentMemoizedFn) return;

  const stats = currentMemoizedFn.getStats();
  const cache = currentMemoizedFn.getCache();

  document.getElementById('cacheHits').textContent = stats.hits;
  document.getElementById('cacheMisses').textContent = stats.misses;
  document.getElementById('cacheSize').textContent = cache.size;

  const total = stats.hits + stats.misses;
  const hitRatio = total > 0 ? ((stats.hits / total) * 100).toFixed(1) : 0;
  document.getElementById('hitRatio').textContent = hitRatio + '%';
}

function updateCacheVisualization() {
  if (!currentMemoizedFn) return;

  const cache = currentMemoizedFn.getCache();
  const accessCount = currentMemoizedFn.getAccessCount();
  const cacheViz = document.getElementById('cacheViz');

  if (cache.size === 0) {
    cacheViz.innerHTML = '<p>Cache is empty</p>';
    return;
  }

  let html = '<h4>Cache Entries:</h4><br>';
  const now = Date.now();
  const expiryTime = parseInt(document.getElementById('expiryTime').value) || 5000;

  for (const [key, entry] of cache.entries()) {
    const args = JSON.parse(key);
    const accessFreq = accessCount.get(key) || 0;
    const age = now - entry.timestamp;
    const isExpired = age > expiryTime;

    let className = 'cache-entry';
    if (isExpired && document.getElementById('evictionPolicy').value === 'TIME') {
      className += ' expired';
    } else if (accessFreq <= 1) {
      className += ' lfu';
    }

    html += `<span class="${className}" title="Access Count: ${accessFreq}, Age: ${age}ms">
      ${args.join(',')} → ${entry.value}
    </span>`;
  }

  cacheViz.innerHTML = html;
}

function clearCache() {
  if (currentMemoizedFn) {
    currentMemoizedFn.clearCache();
    updateStats();
    updateCacheVisualization();
  }
}

function clearResults() {
  document.getElementById('results').innerHTML = '';
  document.getElementById('performance').innerHTML = '';
  document.getElementById('cacheViz').innerHTML = '<p>Cache entries will appear here...</p>';
}

function showTab(tabName) {
  const contents = document.querySelectorAll('.tab-content');
  contents.forEach(content => content.classList.remove('active'));

  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => tab.classList.remove('active'));

  document.getElementById(tabName + '-content').classList.add('active');
  event.target.classList.add('active');
}

document.getElementById('evictionPolicy').addEventListener('change', function () {
  const expiryGroup = document.getElementById('expiryTimeGroup');
  expiryGroup.style.display = this.value === 'TIME' ? 'block' : 'none';
});

document.addEventListener('DOMContentLoaded', function () {
  updateStats();
});
