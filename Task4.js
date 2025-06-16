class BiDirectionalPriorityQueue {
  constructor() {
    this._items = [];
    this._counter = 0;
    this._priorityIndexCache = new Map();
    this._insertionIndexCache = new Map();
  }

  enqueue(item, priority) {
    const entry = {
      item,
      priority,
      insertedAt: this._counter++,
      id: this._counter - 1
    };
    
    this._items.push(entry);
    this._invalidateCache();
    return this;
  }

  _invalidateCache() {
    this._priorityIndexCache.clear();
    this._insertionIndexCache.clear();
  }

  _findExtremePriorityIndex(isHighest) {
    const cacheKey = isHighest ? 'highest' : 'lowest';
    if (this._priorityIndexCache.has(cacheKey)) {
      return this._priorityIndexCache.get(cacheKey);
    }

    if (this._items.length === 0) return -1;

    let extremeValue = this._items[0].priority;
    let extremeIdx = 0;

    for (let i = 1; i < this._items.length; i++) {
      const currentPriority = this._items[i].priority;
      if (isHighest ? currentPriority > extremeValue : currentPriority < extremeValue) {
        extremeValue = currentPriority;
        extremeIdx = i;
      } else if (currentPriority === extremeValue) {
        if (this._items[i].insertedAt < this._items[extremeIdx].insertedAt) {
          extremeIdx = i;
        }
      }
    }

    this._priorityIndexCache.set(cacheKey, extremeIdx);
    return extremeIdx;
  }

  _findExtremeInsertionIndex(isOldest) {
    const cacheKey = isOldest ? 'oldest' : 'newest';
    if (this._insertionIndexCache.has(cacheKey)) {
      return this._insertionIndexCache.get(cacheKey);
    }

    if (this._items.length === 0) return -1;

    let extremeValue = this._items[0].insertedAt;
    let extremeIdx = 0;

    for (let i = 1; i < this._items.length; i++) {
      const currentInsertedAt = this._items[i].insertedAt;
      if (isOldest ? currentInsertedAt < extremeValue : currentInsertedAt > extremeValue) {
        extremeValue = currentInsertedAt;
        extremeIdx = i;
      }
    }

    this._insertionIndexCache.set(cacheKey, extremeIdx);
    return extremeIdx;
  }

  _getTargetIndex(options) {
    const { highest, lowest, oldest, newest } = options;
    
    if (highest) return this._findExtremePriorityIndex(true);
    if (lowest) return this._findExtremePriorityIndex(false);
    if (oldest) return this._findExtremeInsertionIndex(true);
    if (newest) return this._findExtremeInsertionIndex(false);
    
    return this._findExtremePriorityIndex(true);
  }

  peek(options = {}) {
    if (this._items.length === 0) return null;
    
    const idx = this._getTargetIndex(options);
    return idx === -1 ? null : this._items[idx].item;
  }

  dequeue(options = {}) {
    if (this._items.length === 0) return null;
    
    const idx = this._getTargetIndex(options);
    if (idx === -1) return null;

    const removed = this._items.splice(idx, 1)[0];
    this._invalidateCache();
    return removed.item;
  }

  peekWithPriority(options = {}) {
    if (this._items.length === 0) return null;
    
    const idx = this._getTargetIndex(options);
    if (idx === -1) return null;
    
    const entry = this._items[idx];
    return { 
      item: entry.item, 
      priority: entry.priority, 
      insertedAt: entry.insertedAt 
    };
  }

  dequeueWithPriority(options = {}) {
    if (this._items.length === 0) return null;
    
    const idx = this._getTargetIndex(options);
    if (idx === -1) return null;

    const removed = this._items.splice(idx, 1)[0];
    this._invalidateCache();
    return { 
      item: removed.item, 
      priority: removed.priority, 
      insertedAt: removed.insertedAt 
    };
  }

  size() {
    return this._items.length;
  }

  isEmpty() {
    return this._items.length === 0;
  }

  clear() {
    this._items = [];
    this._counter = 0;
    this._invalidateCache();
    return this;
  }

  toArray(sortBy = "priority-desc") {
    const sortFunctions = {
      "priority-desc": (a, b) => b.priority - a.priority || a.insertedAt - b.insertedAt,
      "priority-asc": (a, b) => a.priority - b.priority || a.insertedAt - b.insertedAt,
      "insertion-asc": (a, b) => a.insertedAt - b.insertedAt,
      "insertion-desc": (a, b) => b.insertedAt - a.insertedAt
    };

    const sortFn = sortFunctions[sortBy] || sortFunctions["priority-desc"];
    return [...this._items].sort(sortFn).map(entry => entry.item);
  }

  toArrayWithPriority(sortBy = "priority-desc") {
    const sortFunctions = {
      "priority-desc": (a, b) => b.priority - a.priority || a.insertedAt - b.insertedAt,
      "priority-asc": (a, b) => a.priority - b.priority || a.insertedAt - b.insertedAt,
      "insertion-asc": (a, b) => a.insertedAt - b.insertedAt,
      "insertion-desc": (a, b) => b.insertedAt - a.insertedAt
    };

    const sortFn = sortFunctions[sortBy] || sortFunctions["priority-desc"];
    return [...this._items].sort(sortFn).map(entry => ({
      item: entry.item,
      priority: entry.priority,
      insertedAt: entry.insertedAt
    }));
  }

  getStats() {
    if (this._items.length === 0) return null;

    const priorities = this._items.map(item => item.priority);
    const insertionTimes = this._items.map(item => item.insertedAt);

    return {
      size: this._items.length,
      highestPriority: Math.max(...priorities),
      lowestPriority: Math.min(...priorities),
      oldestInsertionTime: Math.min(...insertionTimes),
      newestInsertionTime: Math.max(...insertionTimes),
      averagePriority: priorities.reduce((sum, p) => sum + p, 0) / priorities.length
    };
  }
}

function runDemos() {
  console.log("=== Bi-Directional Priority Queue Demo ===\n");

  const pq = new BiDirectionalPriorityQueue();

  console.log("1. Basic Operations:");
  pq.enqueue("Task A", 5)
    .enqueue("Task B", 1)
    .enqueue("Task C", 10)
    .enqueue("Task D", 3)
    .enqueue("Task E", 7);

  console.log("   Queue size:", pq.size());
  console.log("   Highest priority:", pq.peek({ highest: true }));
  console.log("   Lowest priority:", pq.peek({ lowest: true }));
  console.log("   Oldest item:", pq.peek({ oldest: true }));
  console.log("   Newest item:", pq.peek({ newest: true }));

  console.log("\n2. Priority-based dequeuing:");
  console.log("   Dequeue highest:", pq.dequeue({ highest: true }));
  console.log("   Dequeue lowest:", pq.dequeue({ lowest: true }));
  console.log("   Remaining size:", pq.size());

  console.log("\n3. Insertion-order dequeuing:");
  console.log("   Dequeue oldest:", pq.dequeue({ oldest: true }));
  console.log("   Dequeue newest:", pq.dequeue({ newest: true }));
  console.log("   Remaining size:", pq.size());

  console.log("\n4. Detailed peek operations:");
  pq.clear();
  pq.enqueue("High Priority Task", 10)
    .enqueue("Medium Priority Task", 5)
    .enqueue("Low Priority Task", 1);

  console.log("   Highest with details:", pq.peekWithPriority({ highest: true }));
  console.log("   Lowest with details:", pq.peekWithPriority({ lowest: true }));

  console.log("\n5. Array representations:");
  console.log("   By priority (desc):", pq.toArray("priority-desc"));
  console.log("   By priority (asc):", pq.toArray("priority-asc"));
  console.log("   By insertion (asc):", pq.toArray("insertion-asc"));

  console.log("\n6. Statistics:");
  console.log("   Stats:", pq.getStats());

  console.log("\n7. Stress test with same priorities:");
  pq.clear();
  pq.enqueue("First Same Priority", 5)
    .enqueue("Second Same Priority", 5)
    .enqueue("Third Same Priority", 5);

  console.log("   All have priority 5, dequeue by highest (FIFO for ties):");
  while (!pq.isEmpty()) {
    console.log("   Dequeued:", pq.dequeue({ highest: true }));
  }

  console.log("\n8. Mixed operations workflow:");
  pq.clear();
  pq.enqueue("Email", 2)
    .enqueue("Critical Bug", 10)
    .enqueue("Meeting", 6)
    .enqueue("Code Review", 4);

  console.log("   Handle most critical:", pq.dequeue({ highest: true }));
  console.log("   Check what came in first:", pq.peek({ oldest: true }));
  console.log("   Handle least important:", pq.dequeue({ lowest: true }));
  console.log("   Final queue:", pq.toArrayWithPriority());
}

runDemos();
