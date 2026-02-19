/**
 * Web Worker for offloading WebAssembly simulation to background thread
 * Prevents UI freezing during heavy computation
 */

let wasmInstance = null;
let wasmMemory = null;

// Load and instantiate WebAssembly module
async function initWasm() {
    if (wasmInstance) return; // Already initialized
    
    try {
        const response = await fetch('../build/sim.wasm');
        const buffer = await response.arrayBuffer();
        const wasmModule = await WebAssembly.instantiate(buffer, {
            env: {
                abort: (msg, file, line, col) => {
                    console.error(`Wasm abort: ${msg} at ${file}:${line}:${col}`);
                },
                seed: () => Math.random()
            }
        });
        
        wasmInstance = wasmModule.instance;
        wasmMemory = wasmInstance.exports.memory;
        
        console.log('[Worker] WebAssembly module loaded successfully');
    } catch (error) {
        console.error('[Worker] Failed to load WebAssembly:', error);
        throw error;
    }
}

// Handle messages from main thread
self.onmessage = async function(e) {
    const { id, inputs } = e.data;
    console.log('[Worker] Message received, id:', id, 'inputs:', inputs);
    
    try {
        // Initialize Wasm if needed
        console.log('[Worker] Initializing Wasm...');
        await initWasm();
        console.log('[Worker] Wasm initialized');
        
        // Get input buffer pointer and write inputs
        const inputPtr = wasmInstance.exports.getInputPtr();
        const inputView = new Float64Array(wasmMemory.buffer, inputPtr, 15);
        
        inputView[0] = inputs.loanAmount;
        inputView[1] = inputs.interestRate;
        inputView[2] = inputs.volatility;
        inputView[3] = inputs.growth;
        inputView[4] = inputs.inflation;
        inputView[5] = inputs.monthlyBudget;
        inputView[6] = inputs.minPayment;
        inputView[7] = inputs.maxPayment;
        inputView[8] = inputs.simulationCount; // Leveraged strategies simulation count
        inputView[9] = inputs.years;
        inputView[10] = inputs.marginCallLTV;
        inputView[11] = inputs.initialAssets;
        inputView[12] = inputs.initialEquity;
        inputView[13] = inputs.numStrategies || 10; // Number of leveraged strategies
        inputView[14] = inputs.baselineSimulationCount || 100000; // Baseline simulation count
        
        // Run simulation - returns number of elements written
        console.log('[Worker] Starting Wasm simulation...');
        const startTime = performance.now();
        const outputSize = wasmInstance.exports.runSimulation();
        const endTime = performance.now();
        console.log('[Worker] Wasm simulation completed, outputSize:', outputSize, 'time:', (endTime - startTime).toFixed(2), 'ms');
        
        // Get output buffer pointer and read results
        const outputPtr = wasmInstance.exports.getOutputPtr();
        const outputView = new Float64Array(wasmMemory.buffer, outputPtr, outputSize);
        
        // Read status
        const status = outputView[0];
        const numScenarios = outputView[1];
        
        if (status !== 0) {
            throw new Error(`Simulation failed with status: ${status}`);
        }
        
        // Copy output data to transferable array
        console.log('[Worker] Copying output buffer...');
        const rawBuffer = new Float64Array(outputSize);
        for (let i = 0; i < outputSize; i++) {
            rawBuffer[i] = outputView[i];
        }
        console.log('[Worker] Buffer copied, first 10 values:', Array.from(rawBuffer.slice(0, 10)));
        
        // Send results back to main thread
        console.log('[Worker] Posting message back to main thread');
        self.postMessage({
            id,
            success: true,
            rawBuffer: rawBuffer,
            computeTime: endTime - startTime
        });
        
    } catch (error) {
        console.error('[Worker] Simulation error:', error);
        self.postMessage({
            id,
            success: false,
            error: error.message
        });
    }
};

// Signal ready
self.postMessage({ ready: true });
