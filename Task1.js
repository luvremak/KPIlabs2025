export function* randomNumberGenerator(min = 0, max = 100, isFloat = false) {
  while (true) {
    if (isFloat) {
      yield Math.random() * (max - min) + min;
    } else {
      yield Math.floor(Math.random() * (max - min + 1)) + min;
    }
  }
}

export function* roundRobinGenerator(items) {
  let index = 0;
  while (true) {
    yield items[index];
    index = (index + 1) % items.length;
  }
}

export function* fibonacciGenerator() {
  let a = 0, b = 1;
  while (true) {
    yield a;
    [a, b] = [b, a + b];
  }
}

export function* cyclicDateGenerator() {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  let index = 0;
  while (true) {
    yield days[index];
    index = (index + 1) % days.length;
  }
}

export function* incrementalCounterGenerator(start = 0, step = 1) {
  let current = start;
  while (true) {
    yield current;
    current += step;
  }
}

export function* randomStringGenerator(minLength = 5, maxLength = 10) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  while (true) {
    const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    yield result;
  }
}

export function* colorCycleGenerator(colors = ["red", "green", "blue", "yellow", "purple", "orange"]) {
  let index = 0;
  while (true) {
    yield colors[index];
    index = (index + 1) % colors.length;
  }
}

export async function timeoutIterator(iterator, timeoutSeconds, processFn) {
  const start = Date.now();
  let iteration = 0;
  let total = 0;
  let numberCount = 0;
  
  const colorMap = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    blue: '\x1b[34m',
    yellow: '\x1b[33m',
    purple: '\x1b[35m',
    orange: '\x1b[38;5;208m',
    reset: '\x1b[0m'
  };

  const defaultProcessFn = (value) => {
    iteration++;
    
    if (typeof value === 'number') {
      total += value;
      numberCount++;
      const avg = total / numberCount;
      console.log(`Value: ${value} | Total: ${total} | Average: ${avg.toFixed(2)} | Iteration: ${iteration}`);
    } else if (typeof value === 'string' && Object.keys(colorMap).includes(value.toLowerCase())) {
      const color = colorMap[value.toLowerCase()] || '';
      const reset = colorMap.reset;
      const currentDate = new Date().toLocaleString();
      console.log(`${color}Color: ${value} | Date: ${currentDate} | Iteration: ${iteration}${reset}`);
    } else {
      console.log(`Value: ${value} | Iteration: ${iteration}`);
    }
  };

  const processor = processFn || defaultProcessFn;

  while ((Date.now() - start) / 1000 < timeoutSeconds) {
    const next = iterator.next();
    if (next.done) break;

    processor(next.value);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log(`\nTimeout reached after ${timeoutSeconds} seconds. Total iterations: ${iteration}`);
}

export async function demonstrateGenerators() {
  console.log("=== Random Number Generator Demo ===");
  const randomGen = randomNumberGenerator(1, 100);
  await timeoutIterator(randomGen, 3);

  console.log("\n=== Round Robin Generator Demo ===");
  const roundRobinGen = roundRobinGenerator(["Alpha", "Beta", "Gamma", "Delta"]);
  await timeoutIterator(roundRobinGen, 2);

  console.log("\n=== Fibonacci Generator Demo ===");
  const fibGen = fibonacciGenerator();
  await timeoutIterator(fibGen, 2);

  console.log("\n=== Cyclic Date Generator Demo ===");
  const dateGen = cyclicDateGenerator();
  await timeoutIterator(dateGen, 2);

  console.log("\n=== Incremental Counter Demo ===");
  const counterGen = incrementalCounterGenerator(10, 5);
  await timeoutIterator(counterGen, 2);

  console.log("\n=== Random String Generator Demo ===");
  const stringGen = randomStringGenerator(3, 8);
  await timeoutIterator(stringGen, 2);

  console.log("\n=== Color Cycle Generator Demo ===");
  const colorGen = colorCycleGenerator();
  await timeoutIterator(colorGen, 3);
}
