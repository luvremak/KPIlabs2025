async function* generateLargeDataset(size = 1000000) {
    for (let i = 0; i < size; i++) {
        yield {
            id: i,
            name: `User ${i}`,
            score: Math.floor(Math.random() * 1000),
            timestamp: Date.now() + i
        };

        if (i % 1000 === 0) {
            await new Promise(resolve => setTimeout(resolve, 1));
        }
    }
}

class StreamProcessor {
    constructor() {
        this.totalScore = 0;
        this.maxScore = 0;
        this.count = 0;
        this.stats = {rowsProcessed: 0};
    }

    async *process(asyncIterable) {
    this.stats.startTime = Date.now();
    
    for await (const item of asyncIterable) {
        this.totalScore += item.score;
        this.maxScore = Math.max(this.maxScore, item.score);
        this.count++;
        this.stats.rowsProcessed = this.count;

        if (this.count % 1000 === 0) {
            const elapsed = Date.now() - this.stats.startTime;
            this.stats.totalProcessingTime = elapsed;
            this.stats.rowsPerSecond = Math.round((this.count / elapsed) * 1000);

            yield {
                type: 'progress',
                processed: this.count,
                avgScore: this.totalScore / this.count,
                maxScore: this.maxScore,
            };
        }
    }

    const finalTime = Date.now() - this.stats.startTime;
    this.stats.totalProcessingTime = finalTime;
    this.stats.rowsPerSecond = Math.round((this.count / finalTime) * 1000);

    yield {
        type: 'complete',
        totalProcessed: this.count,
        avgScore: this.totalScore / this.count,
        maxScore: this.maxScore,
    };
}}

class CSVProcessor {
    async *processCSV(csvText) {
        const lines = csvText.split('\n');
        const headers = lines[0].split(',');

        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim()) {
                const values = lines[i].split(',');
                const record = {};
                headers.forEach((header, index) => {
                    record[header.trim()] = values[index]?.trim() || '';
                });
                yield record;
            }
        }
    }
}

const output = document.getElementById('output');
const recordCount = document.getElementById('recordCount');
const avgScore = document.getElementById('avgScore');
const maxScore = document.getElementById('maxScore');
const progressFill = document.getElementById('progressFill');

function addOutput(message, type = 'info') {
    const div = document.createElement('div');
    div.className = `output-line ${type}`;
    div.textContent = message;
    output.appendChild(div);
    output.scrollTop = output.scrollHeight;
}

function clearOutput() {
    output.innerHTML = '<p class="placeholder">Output cleared. Click a button to start processing...</p>';
    recordCount.textContent = '0';
    avgScore.textContent = '0';
    maxScore.textContent = '0';
    progressFill.style.width = '0%';
}

function updateStats(processed, avg, max, total) {
    recordCount.textContent = processed.toLocaleString();
    avgScore.textContent = avg.toFixed(1);
    maxScore.textContent = max;
    progressFill.style.width = `${(processed / total) * 100}%`;
}

async function startLargeDataProcessing() {
    const startBtn = document.getElementById('startProcessing');
    startBtn.disabled = true;
    startBtn.textContent = 'Processing...';

    output.innerHTML = '';
    addOutput('Starting large dataset processing...', 'success');

    try {
        const processor = new StreamProcessor();
        const dataStream = generateLargeDataset(50000);
        const total = 50000;

        for await (const result of processor.process(dataStream)) {
            if (result.type === 'progress') {
                addOutput(
                    `Processed: ${result.processed.toLocaleString()} | Avg Score: ${result.avgScore.toFixed(2)} | Max: ${result.maxScore}`,
                    'info'
                );
                updateStats(result.processed, result.avgScore, result.maxScore, total);
            } else if (result.type === 'complete') {
                addOutput(`Complete! Total: ${result.totalProcessed.toLocaleString()} records processed`, 'success');
                addOutput(`Final Statistics - Avg: ${result.avgScore.toFixed(2)}, Max: ${result.maxScore}`, 'success');
                updateStats(result.totalProcessed, result.avgScore, result.maxScore, total);
            }
        }
    } catch (error) {
        addOutput(`Error: ${error.message}`, 'error');
    } finally {
        startBtn.disabled = false;
        startBtn.textContent = 'Start Processing 50,000 Records';
    }
}

async function filterHighScores() {
    output.innerHTML = '';
    addOutput('Filtering high scores (>800) from data stream...', 'success');

    async function* filterHighScores(dataStream) {
        for await (const item of dataStream) {
            if (item.score > 800) {
                yield item;
            }
        }
    }

    const filteredStream = filterHighScores(generateLargeDataset(10000));
    let count = 0;

    for await (const item of filteredStream) {
        addOutput(`High scorer: ${item.name} - Score: ${item.score}`, 'info');
        count++;
        if (count >= 10) {
            addOutput('... and more (showing first 10 of many high scorers)', 'info');
            break;
        }
    }

    addOutput(`Found ${count}+ high scorers without loading full dataset into memory`, 'success');
}

async function processCSVData() {
    output.innerHTML = '';
    addOutput('Processing CSV data stream...', 'success');

    const csvData = `name,age,score,department
John Smith,25,850,Engineering
Jane Doe,30,920,Marketing
Bob Johnson,22,750,Sales
Alice Brown,28,680,HR
Charlie Wilson,35,590,Finance
Diana Miller,29,810,Engineering
Frank Davis,26,740,Marketing
Grace Lee,31,890,Sales
Henry Clark,24,720,HR
Ivy Martinez,27,860,Finance`;

    const csvProcessor = new CSVProcessor();
    let count = 0;

    for await (const record of csvProcessor.processCSV(csvData)) {
        count++;
        addOutput(
            `Record ${count}: ${record.name}, Age: ${record.age}, Score: ${record.score}, Dept: ${record.department}`,
            'info'
        );
    }

    addOutput(`Processed ${count} CSV records using streaming`, 'success');
}

document.getElementById('startProcessing').addEventListener('click', startLargeDataProcessing);
document.getElementById('filterData').addEventListener('click', filterHighScores);
document.getElementById('processCSV').addEventListener('click', processCSVData);
document.getElementById('clearOutput').addEventListener('click', clearOutput);

addOutput('Large Data Processing Demo Ready!', 'success');
addOutput('Click any button above to see memory-efficient stream processing in action.', 'info');
