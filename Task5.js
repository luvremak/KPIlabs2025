function asyncFilterCallback(array, callback, done) {
  const result = [];
  let index = 0;
  
  function processNext() {
    if (index >= array.length) {
      done(result);
      return;
    }
    
    callback(array[index], index, array, (include) => {
      if (include) result.push(array[index]);
      index++;
      setImmediate ? setImmediate(processNext) : setTimeout(processNext, 0);
    });
  }
  
  processNext();
}

function asyncFilterPromise(array, asyncPredicate) {
  return Promise.all(array.map(async (item, index) => {
    const keep = await asyncPredicate(item, index, array);
    return { item, keep };
  })).then(results => 
    results.filter(r => r.keep).map(r => r.item)
  );
}

function asyncFilterSequential(array, asyncPredicate) {
  return array.reduce(async (promiseAcc, item, index) => {
    const acc = await promiseAcc;
    const keep = await asyncPredicate(item, index, array);
    return keep ? [...acc, item] : acc;
  }, Promise.resolve([]));
}

async function asyncFilterWithAbort(array, asyncPredicate, signal) {
  const results = [];
  
  for (let i = 0; i < array.length; i++) {
    if (signal?.aborted) {
      throw new DOMException('Operation was aborted', 'AbortError');
    }
    
    const keep = await asyncPredicate(array[i], i, array);
    if (keep) results.push(array[i]);
  }
  
  return results;
}

async function asyncFilterConcurrentBatched(array, asyncPredicate, batchSize = 3) {
  const results = [];
  
  for (let i = 0; i < array.length; i += batchSize) {
    const batch = array.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (item, batchIndex) => {
        const actualIndex = i + batchIndex;
        const keep = await asyncPredicate(item, actualIndex, array);
        return { item, keep };
      })
    );
    
    results.push(...batchResults.filter(r => r.keep).map(r => r.item));
  }
  
  return results;
}

async function isEvenAsync(num) {
  await new Promise(r => setTimeout(r, 100));
  return num % 2 === 0;
}

async function isGreaterThanThreeAsync(num) {
  await new Promise(r => setTimeout(r, 50));
  return num > 3;
}

async function runDemos() {
  const numbers = [1, 2, 3, 4, 5, 6, 7, 8];
  
  console.log("=== Async Filter Variants Demo ===\n");
  
  console.log("1. Callback-based asyncFilter:");
  asyncFilterCallback(numbers, (num, idx, arr, done) => {
    setTimeout(() => done(num % 2 === 0), 50);
  }, result => {
    console.log("   Result:", result);
  });
  
  console.log("\n2. Promise-based asyncFilter (concurrent):");
  const promiseResult = await asyncFilterPromise(numbers, isEvenAsync);
  console.log("   Result:", promiseResult);
  
  console.log("\n3. Sequential asyncFilter:");
  const sequentialResult = await asyncFilterSequential(numbers, isEvenAsync);
  console.log("   Result:", sequentialResult);
  
  console.log("\n4. Batched concurrent asyncFilter:");
  const batchedResult = await asyncFilterConcurrentBatched(numbers, isEvenAsync, 3);
  console.log("   Result:", batchedResult);
  
  console.log("\n5. Abortable asyncFilter (will be aborted):");
  const controller = new AbortController();
  setTimeout(() => {
    console.log("   Aborting...");
    controller.abort();
  }, 250);
  
  try {
    const abortedResult = await asyncFilterWithAbort(numbers, isEvenAsync, controller.signal);
    console.log("   Result:", abortedResult);
  } catch (err) {
    console.log("   Error:", err.message);
  }
  
  console.log("\n6. Successful abortable asyncFilter:");
  const controller2 = new AbortController();
  const successfulResult = await asyncFilterWithAbort([1, 2, 3, 4], isGreaterThanThreeAsync, controller2.signal);
  console.log("   Result:", successfulResult);
  
  console.log("\n7. Chaining with async/await:");
  const chainedResult = await asyncFilterPromise(numbers, isEvenAsync)
    .then(evens => asyncFilterPromise(evens, isGreaterThanThreeAsync));
  console.log("   Even numbers > 3:", chainedResult);
}

runDemos().catch(console.error);
