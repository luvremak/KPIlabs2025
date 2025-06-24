export function memoize(fn, {
  maxSize = Infinity,
  evictionPolicy = 'LRU',
  maxAge = Infinity,
  customEvictFn = null
} = {}) {
  const cache = new Map();
  let accessOrder = [];

  function evict() {
    if (evictionPolicy === 'LFU') {
      let leastKey = null;
      let leastHits = Infinity;
      for (const [key, entry] of cache) {
        if (entry.hits < leastHits) {
          leastHits = entry.hits;
          leastKey = key;
        }
      }
      if (leastKey !== null) {
        cache.delete(leastKey);
        const index = accessOrder.indexOf(leastKey);
        if (index > -1) accessOrder.splice(index, 1);
      }
    } else if (evictionPolicy === 'TIME') {
      const now = Date.now();
      const keysToDelete = [];
      for (const [key, entry] of cache) {
        if (now - entry.timestamp > maxAge) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach(key => {
        cache.delete(key);
        const index = accessOrder.indexOf(key);
        if (index > -1) accessOrder.splice(index, 1);
      });
      if (cache.size >= maxSize && accessOrder.length > 0) {
        const oldestKey = accessOrder.shift();
        cache.delete(oldestKey);
      }
    } else if (evictionPolicy === 'CUSTOM' && typeof customEvictFn === 'function') {
      customEvictFn(cache);
    } else {
      if (accessOrder.length > 0) {
        const oldestKey = accessOrder.shift();
        cache.delete(oldestKey);
      }
    }
  }

  return function (...args) {
    const key = JSON.stringify(args);
    const now = Date.now();

    if (cache.has(key)) {
      const entry = cache.get(key);
      if (evictionPolicy === 'TIME' && maxAge !== Infinity && now - entry.timestamp > maxAge) {
        cache.delete(key);
        const index = accessOrder.indexOf(key);
        if (index > -1) accessOrder.splice(index, 1);
      } else {
        entry.hits++;
        if (evictionPolicy === 'LRU') {
          const index = accessOrder.indexOf(key);
          if (index > -1) accessOrder.splice(index, 1);
          accessOrder.push(key);
        }
        return entry.value;
      }
    }

    const result = fn.apply(this, args);

    if (cache.size >= maxSize) {
      evict();
    }

    cache.set(key, { value: result, hits: 1, timestamp: now });
    
    if (evictionPolicy === 'LRU') {
      accessOrder.push(key);
    }

    return result;
  };
}
