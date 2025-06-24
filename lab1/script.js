function* generator(items) {
  let i = 0;
  while (true) yield items[i++ % items.length];
}

function* fibonacciGenerator() {
  let a = 0, b = 1;
  while (true) {
    yield a;
    [a, b] = [b, a + b];
  }
}

function* randomNumberGenerator() {
  while (true) yield Math.floor(Math.random() * 1000);
}

const predefinedGenerators = {
  days: () => generator(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]),
  colors: () => generator(["red", "orange", "yellow", "green", "blue", "purple", "pink"]),
  roundRobin: () => generator(["K", "P", "I"]),
  fibonacci: fibonacciGenerator,
  randomNumber: randomNumberGenerator
};

function getGenerator(type) {
  return (predefinedGenerators[type] || predefinedGenerators.roundRobin)();
}

function consumeWithTimeout(iterator, timeoutSeconds, outputElement) {
  const start = Date.now();
  const interval = setInterval(() => {
    if ((Date.now() - start) / 1000 >= timeoutSeconds) {
      outputElement.innerHTML += `\nTimeout reached after ${timeoutSeconds} seconds.`;
      return clearInterval(interval);
    }
    const time = new Date().toLocaleTimeString();
    outputElement.innerHTML += `[${time}] ${iterator.next().value}\n`;
    outputElement.scrollTop = outputElement.scrollHeight;
  }, 500);
}

document.getElementById("startBtn").addEventListener("click", () => {
  const output = document.getElementById("output");
  output.innerHTML = "";

  const timeout = parseInt(document.getElementById("timeout").value, 10);
  const type = document.getElementById("generatorType").value;

  if (!timeout || timeout <= 0) {
    output.innerHTML = "Please enter a valid timeout.";
    return;
  }

  consumeWithTimeout(getGenerator(type), timeout, output);
});
