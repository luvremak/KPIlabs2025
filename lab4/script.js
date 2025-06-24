// перепиши функцію конструктор та enqeueu 
// щоб зберігалось в конструкторі було місце для збереження індекса 
// з найбільшим пріоритетом. 
// і переписати enqeue
class BiDirectionalPriorityQueue {
  constructor() {
    this.items = [];
    this.counter = 0;
    this.highestPriorityIndex = -1; 
  }

  enqueue(item, priority) {
    try {
      if (item === null || item === undefined) {
        throw new Error("Item cannot be null or undefined");
      }
      
      if (typeof priority !== 'number' || isNaN(priority) || !isFinite(priority)) {
        throw new Error("Priority must be a valid finite number");
      }

      const newItem = { item, priority, insertedAt: this.counter++ };
      this.items.push(newItem);

      const newIndex = this.items.length - 1;
      if (this.highestPriorityIndex === -1 || 
          priority > this.items[this.highestPriorityIndex].priority ||
          (priority === this.items[this.highestPriorityIndex].priority && 
           newItem.insertedAt < this.items[this.highestPriorityIndex].insertedAt)) {
        this.highestPriorityIndex = newIndex;
      }
      
      return this;
    } catch (error) {
      console.error('Enqueue error:', error.message);
      throw error;
    }
  }

  _findHighestPriorityIndex() {
    if (this.items.length === 0) return -1;
    
    let maxIndex = 0;
    for (let i = 1; i < this.items.length; i++) {
      const current = this.items[i];
      const max = this.items[maxIndex];
      
      if (current.priority > max.priority || 
          (current.priority === max.priority && current.insertedAt < max.insertedAt)) {
        maxIndex = i;
      }
    }
    return maxIndex;
  }

  _findLowestPriorityIndex() {
    if (this.items.length === 0) return -1;
    
    let minIndex = 0;
    for (let i = 1; i < this.items.length; i++) {
      const current = this.items[i];
      const min = this.items[minIndex];
      
      if (current.priority < min.priority || 
          (current.priority === min.priority && current.insertedAt < min.insertedAt)) {
        minIndex = i;
      }
    }
    return minIndex;
  }

  _findOldestIndex() {
    if (this.items.length === 0) return -1;
    
    let oldestIndex = 0;
    for (let i = 1; i < this.items.length; i++) {
      if (this.items[i].insertedAt < this.items[oldestIndex].insertedAt) {
        oldestIndex = i;
      }
    }
    return oldestIndex;
  }

  _findNewestIndex() {
    if (this.items.length === 0) return -1;
    
    let newestIndex = 0;
    for (let i = 1; i < this.items.length; i++) {
      if (this.items[i].insertedAt > this.items[newestIndex].insertedAt) {
        newestIndex = i;
      }
    }
    return newestIndex;
  }

  _findIndex(highest = false, lowest = false, oldest = false, newest = false) {
    try {
      const modes = [highest, lowest, oldest, newest];
      const activeCount = modes.filter(Boolean).length;
      
      if (activeCount === 0 || activeCount > 1) {
        throw new Error("Exactly one selection mode must be active");
      }

      if (highest) return this._findHighestPriorityIndex();
      if (lowest) return this._findLowestPriorityIndex();
      if (oldest) return this._findOldestIndex();
      if (newest) return this._findNewestIndex();

      return -1;
    } catch (error) {
      console.error('Find index error:', error.message);
      throw error;
    }
  }

  peek(highest = false, lowest = false, oldest = false, newest = false) {
    try {
      const index = this._findIndex(highest, lowest, oldest, newest);
      return index === -1 ? null : this.items[index].item;
    } catch (error) {
      console.error('Peek error:', error.message);
      return null;
    }
  }

  dequeue(highest = false, lowest = false, oldest = false, newest = false) {
    try {
      const index = this._findIndex(highest, lowest, oldest, newest);
      if (index === -1) return null;
      
      const removedItem = this.items.splice(index, 1)[0];
      
      // Update highest priority index after removal
      if (index === this.highestPriorityIndex) {
        this.highestPriorityIndex = this._findHighestPriorityIndex();
      } else if (index < this.highestPriorityIndex) {
        this.highestPriorityIndex--;
      }
      
      return removedItem.item;
    } catch (error) {
      console.error('Dequeue error:', error.message);
      return null;
    }
  }

  size() {
    return this.items.length;
  }

  isEmpty() {
    return this.items.length === 0;
  }

  clear() {
    this.items = [];
    this.counter = 0;
    this.highestPriorityIndex = -1;
  }
}