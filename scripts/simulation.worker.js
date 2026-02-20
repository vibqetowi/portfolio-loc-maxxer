/**
 * Web Worker - WASM Bridge for Single Strategy Simulation
 * 
 * This worker:
 * 1. Receives initial conditions for ONE strategy
 * 2. Marshals data to WASM input buffer
 * 3. Calls WASM runSimulation()
 * 4. Unmarshals results from WASM output buffer
 * 5. Returns schedule + wealth array to main thread
 * 
 * WASM Input Format (11 values):
 * [0] initialDebt - amount owed at t=0
 * [1] initialBalance - cash/assets at t=0
 * [2] monthlyPayment - debt payment per month (0 if no debt)
 * [3] monthlyBudget - deposits available per month
 * [4] monthlyRate - interest rate as decimal (0 if no debt)
 * [5] years - simulation duration
 * [6] volatility - standard deviation of returns
 * [7] growth - expected annual return
 * [8] inflation - inflation rate
 * [9] marginCallLTV - debt/assets ratio threshold for failure
 * [10] simulationCount - number of Monte Carlo runs
 * 
 * WASM Output Format:
 * [0] status (0 = success)
 * [1] months (calculated from years)
 * [2] survivalRate (percent)
 * [3] medianWealth (real dollars)
 * [4] p90Wealth (real dollars)
 * [5] expectedWealth (real dollars)
 * [6] finalDebt (remaining debt at end of schedule)
 * [7] totalDeposits (sum of deposits over period)
 * [8] numSurvived (count of non-failed simulations)
 * [9 to 9+months] depositPath[] - T=0 initial capital, then monthly deposits (months+1 elements)
 * [9+months+1 to 9+2*months+1] debtPath[] - T=0 initial debt, then monthly balances (months+1 elements)
 * [9+2*months+2 onward] wealthArray[] - final wealth of survivors
 */

let wasmInstance = null;
let wasmMemory = null;

// Load and instantiate WebAssembly module
async function initWasm() {
    if (wasmInstance) return; // Already initialized
    
    try {
        const response = await fetch('../build/sim.wasm');
        if (!response.ok) {
            throw new Error(`Failed to fetch WASM module: HTTP ${response.status} ${response.statusText}`);
        }
        
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
        
        // Verify required exports exist
        if (!wasmInstance.exports.getInputPtr) {
            throw new Error('WASM module missing getInputPtr export');
        }
        if (!wasmInstance.exports.getOutputPtr) {
            throw new Error('WASM module missing getOutputPtr export');
        }
        if (!wasmInstance.exports.runSimulation) {
            throw new Error('WASM module missing runSimulation export');
        }
        if (!wasmInstance.exports.memory) {
            throw new Error('WASM module missing memory export');
        }
        
        console.log('[Worker] WebAssembly module loaded successfully');
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('[Worker] Failed to load WebAssembly:', errorMessage);
        throw new Error(`WASM initialization failed: ${errorMessage}`);
    }
}

/**
 * Marshal strategy inputs to WASM input buffer
 */
function marshalInputs(inputs) {
    const inputPtr = wasmInstance.exports.getInputPtr();
    const inputView = new Float64Array(wasmMemory.buffer, inputPtr, 20);
    
    inputView[0] = inputs.initialDebt;
    inputView[1] = inputs.initialBalance;
    inputView[2] = inputs.monthlyPayment;
    inputView[3] = inputs.monthlyBudget;
    inputView[4] = inputs.monthlyRate;
    inputView[5] = inputs.years;
    inputView[6] = inputs.volatility;
    inputView[7] = inputs.growth;
    inputView[8] = inputs.inflation;
    inputView[9] = inputs.marginCallLTV;
    inputView[10] = inputs.simulationCount;
}

/**
 * Unmarshal WASM output buffer to strategy results
 */
function unmarshalResults(outputSize) {
    const outputPtr = wasmInstance.exports.getOutputPtr();
    const outputView = new Float64Array(wasmMemory.buffer, outputPtr, outputSize);
    const rawBuffer = new Float64Array(outputSize);
    
    for (let i = 0; i < outputSize; i++) {
        rawBuffer[i] = outputView[i];
    }
    
    return rawBuffer;
}

// Handle messages from main thread
self.onmessage = async function(e) {
    const { id, inputs, strategyIndex } = e.data;
    
    try {
        // Initialize Wasm if needed
        if (!wasmInstance) {
            console.log(`[Worker ${strategyIndex}] Initializing WASM...`);
            await initWasm();
            console.log(`[Worker ${strategyIndex}] WASM initialized`);
        }
        
        // Validate inputs exist
        if (!inputs) {
            throw new Error('No inputs provided to worker');
        }
        
        // Marshal inputs to WASM
        console.log(`[Worker ${strategyIndex}] Marshaling inputs...`);
        marshalInputs(inputs);
        console.log(`[Worker ${strategyIndex}] Running simulation...`);
        
        // Run WASM simulation
        const startTime = performance.now();
        const outputSize = wasmInstance.exports.runSimulation();
        const endTime = performance.now();
        
        console.log(`[Worker ${strategyIndex}] Simulation complete, unmarshaling results...`);
        
        // Unmarshal results from WASM
        const rawResults = unmarshalResults(outputSize);
        
        // Validate
        const status = rawResults[0];
        if (status !== 0) {
            throw new Error(`WASM simulation failed with status: ${status}`);
        }
        
        console.log(`[Worker ${strategyIndex}] Success, returning results`);
        
        // Return to main thread
        self.postMessage({
            id,
            success: true,
            rawResults: rawResults,
            computeTime: endTime - startTime,
            strategyIndex: strategyIndex
        });
        
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[Worker ${e.data.strategyIndex}] Error:`, error, errorMessage);
        self.postMessage({
            id: e.data.id,
            success: false,
            error: errorMessage || 'Unknown error',
            strategyIndex: e.data.strategyIndex
        });
    }
};
