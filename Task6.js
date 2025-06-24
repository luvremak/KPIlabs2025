export class AsyncLineIterator {
  constructor(readableStream) {
    this.reader = readableStream.getReader();
    this.decoder = new TextDecoder();
    this.buffer = '';
    this.done = false;
  }

  async *[Symbol.asyncIterator]() {
    try {
      while (!this.done) {
        const { value, done } = await this.reader.read();
        
        if (done) {
          this.done = true;
          if (this.buffer.trim()) {
            yield this.buffer.trim();
          }
          break;
        }

        this.buffer += this.decoder.decode(value, { stream: true });
        
        const lines = this.buffer.split('\n');
        
        this.buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.trim()) {
            yield line.trim();
          }
        }
      }
    } finally {
      this.reader.releaseLock();
    }
  }

  async close() {
    if (!this.done) {
      await this.reader.cancel();
      this.reader.releaseLock();
    }
  }
}

export class AsyncJSONIterator {
  constructor(readableStream) {
    this.lineIterator = new AsyncLineIterator(readableStream);
  }

  async *[Symbol.asyncIterator]() {
    for await (const line of this.lineIterator) {
      try {

        if (line.startsWith('[') || line.startsWith('{')) {
          const parsed = JSON.parse(line);
          
          if (Array.isArray(parsed)) {
            for (const item of parsed) {
              yield item;
            }
          } else {
            yield parsed;
          }
        }
      } catch (error) {
        console.warn('Failed to parse JSON line:', line, error);
      }
    }
  }
}

export class CSVStreamProcessor {
  constructor(options = {}) {
    this.delimiter = options.delimiter || ',';
    this.headers = options.headers || null;
    this.skipHeader = options.skipHeader || false;
    this.batchSize = options.batchSize || 1000;
  }

  async *processStream(readableStream) {
    const lineIterator = new AsyncLineIterator(readableStream);
    let isFirstLine = true;
    let headers = this.headers;
    let batch = [];

    for await (const line of lineIterator) {
      if (isFirstLine && this.skipHeader) {
        headers = this.parseLine(line);
        isFirstLine = false;
        continue;
      }
      isFirstLine = false;

      const values = this.parseLine(line);
      const record = headers 
        ? this.createRecord(headers, values)
        : values;

      batch.push(record);

      if (batch.length >= this.batchSize) {
        yield batch;
        batch = [];
      }
    }

    if (batch.length > 0) {
      yield batch;
    }
  }

  parseLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === this.delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current.trim());
    return result;
  }

  createRecord(headers, values) {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = values[index] || '';
    });
    return record;
  }
}

export class StreamAggregator {
  constructor() {
    this.aggregations = new Map();
  }

  addAggregation(name, aggregateFn, initialValue = 0) {
    this.aggregations.set(name, {
      fn: aggregateFn,
      value: initialValue
    });
  }

  async *processData(asyncIterable, transformFn = (x) => x) {
    let processedCount = 0;
    const startTime = Date.now();

    for await (const item of asyncIterable) {
      const transformedItem = transformFn(item);
      
      for (const [name, agg] of this.aggregations) {
        agg.value = agg.fn(agg.value, transformedItem);
      }

      processedCount++;

      if (processedCount % 1000 === 0) {
        yield {
          type: 'progress',
          processed: processedCount,
          aggregations: this.getResults(),
          timeElapsed: Date.now() - startTime
        };
      }

      yield {
        type: 'item',
        data: transformedItem,
        index: processedCount - 1
      };
    }

    yield {
      type: 'complete',
      totalProcessed: processedCount,
      aggregations: this.getResults(),
      totalTime: Date.now() - startTime
    };
  }

  getResults() {
    const results = {};
    for (const [name, agg] of this.aggregations) {
      results[name] = agg.value;
    }
    return results;
  }
}

export class DataTransformer {
  constructor(transformFn, options = {}) {
    this.transformFn = transformFn;
    this.batchSize = options.batchSize || 100;
    this.parallel = options.parallel || false;
    this.maxConcurrency = options.maxConcurrency || 4;
  }

  async *transform(asyncIterable) {
    if (this.parallel) {
      yield* this.transformParallel(asyncIterable);
    } else {
      yield* this.transformSequential(asyncIterable);
    }
  }

  async *transformSequential(asyncIterable) {
    let batch = [];
    
    for await (const item of asyncIterable) {
      batch.push(item);
      
      if (batch.length >= this.batchSize) {
        const transformedBatch = await Promise.all(
          batch.map(this.transformFn)
        );
        yield transformedBatch;
        batch = [];
      }
    }
    
    if (batch.length > 0) {
      const transformedBatch = await Promise.all(
        batch.map(this.transformFn)
      );
      yield transformedBatch;
    }
  }

  async *transformParallel(asyncIterable) {
    const semaphore = new Semaphore(this.maxConcurrency);
    let batch = [];
    
    for await (const item of asyncIterable) {
      batch.push(item);
      
      if (batch.length >= this.batchSize) {
        const promises = batch.map(async (item) => {
          await semaphore.acquire();
          try {
            return await this.transformFn(item);
          } finally {
            semaphore.release();
          }
        });
        
        yield await Promise.all(promises);
        batch = [];
      }
    }
    
    if (batch.length > 0) {
      const promises = batch.map(async (item) => {
        await semaphore.acquire();
        try {
          return await this.transformFn(item);
        } finally {
          semaphore.release();
        }
      });
      
      yield await Promise.all(promises);
    }
  }
}

class Semaphore {
  constructor(capacity) {
    this.capacity = capacity;
    this.running = 0;
    this.queue = [];
  }

  async acquire() {
    return new Promise((resolve) => {
      if (this.running < this.capacity) {
        this.running++;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }

  release() {
    this.running--;
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      this.running++;
      next();
    }
  }
}

export class LargeFileProcessor {
  static async processLargeFile(url, processorType = 'lines') {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    if (!response.body) {
      throw new Error('Response body is not available');
    }

    switch (processorType) {
      case 'lines':
        return new AsyncLineIterator(response.body);
      case 'json':
        return new AsyncJSONIterator(response.body);
      case 'csv':
        return new CSVStreamProcessor({ skipHeader: true });
      default:
        throw new Error(`Unknown processor type: ${processorType}`);
    }
  }

  static async processLocalFile(file, processorType = 'lines') {
    const stream = file.stream();
    
    switch (processorType) {
      case 'lines':
        return new AsyncLineIterator(stream);
      case 'json':
        return new AsyncJSONIterator(stream);
      case 'csv':
        return new CSVStreamProcessor({ skipHeader: true });
      default:
        throw new Error(`Unknown processor type: ${processorType}`);
    }
  }
}

export async function* generateLargeDataset(size = 1000000) {
  for (let i = 0; i < size; i++) {
    yield {
      id: i,
      name: `User ${i}`,
      email: `user${i}@example.com`,
      score: Math.floor(Math.random() * 1000),
      timestamp: Date.now() + i,
      data: Array(10).fill(0).map(() => Math.random())
    };
    
    if (i % 1000 === 0) {
      await new Promise(resolve => setTimeout(resolve, 1));
    }
  }
}

export async function demonstrateLargeDataProcessing() {
  console.log('=== Large Data Processing Demonstration ===\n');

  console.log('1. Processing large generated dataset with aggregations:');
  
  const aggregator = new StreamAggregator();
  aggregator.addAggregation('totalScore', (sum, item) => sum + item.score, 0);
  aggregator.addAggregation('maxScore', (max, item) => Math.max(max, item.score), 0);
  aggregator.addAggregation('userCount', (count) => count + 1, 0);

  const dataStream = generateLargeDataset(10000);
  let itemCount = 0;

  for await (const result of aggregator.processData(dataStream)) {
    if (result.type === 'progress') {
      console.log(`Processed ${result.processed} items in ${result.timeElapsed}ms`);
      console.log('Current aggregations:', result.aggregations);
    } else if (result.type === 'complete') {
      console.log('Final results:', result.aggregations);
      console.log(`Total time: ${result.totalTime}ms`);
      break;
    }
    itemCount++;
    
    if (itemCount > 5) break;
  }

  console.log('\n2. Data transformation with memory-efficient processing:');
  
  const transformer = new DataTransformer(
    async (item) => ({
      ...item,
      scoreLevel: item.score > 500 ? 'high' : 'low',
      processed: true
    }),
    { batchSize: 5, parallel: true }
  );

  const smallDataStream = generateLargeDataset(20);
  let batchCount = 0;

  for await (const batch of transformer.transform(smallDataStream)) {
    console.log(`Batch ${++batchCount}:`, batch.length, 'items transformed');
    if (batchCount >= 3) break; 
  }

  console.log('\n3. CSV Stream Processing simulation:');

  const mockCSVData = `name,age,city,score
John,25,New York,850
Jane,30,Los Angeles,920
Bob,22,Chicago,750
Alice,28,Houston,680
Charlie,35,Phoenix,590`;

  const mockStream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(mockCSVData));
      controller.close();
    }
  });

  const csvProcessor = new CSVStreamProcessor({ skipHeader: true, batchSize: 2 });
  
  for await (const batch of csvProcessor.processStream(mockStream)) {
    console.log('CSV Batch:', batch);
  }

  console.log('\n4. Memory efficiency comparison:');
  
  console.log('Streaming approach: Processes one item at a time, constant memory usage');
  console.log('Traditional approach: Loads all data into memory, grows with dataset size');

  console.log('\n5. Memory-efficient filtering:');
  
  async function* filterHighScores(dataStream) {
    for await (const item of dataStream) {
      if (item.score > 800) {
        yield item;
      }
    }
  }

  const filteredStream = filterHighScores(generateLargeDataset(1000));
  let highScoreCount = 0;
  
  for await (const item of filteredStream) {
    highScoreCount++;
    if (highScoreCount <= 5) {
      console.log(`High scorer: ${item.name} - ${item.score}`);
    }
    if (highScoreCount >= 5) break;
  }
  
  console.log(`Found ${highScoreCount} high scorers without loading full dataset into memory`);
}

