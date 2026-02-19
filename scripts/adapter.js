/**
 * Simulation Adapter - Bridge between UI and WebAssembly Worker
 * 
 * This implements the Adapter Pattern to:
 * 1. Convert UI input format to Wasm format (marshalling)
 * 2. Execute simulation via Web Worker
 * 3. Convert Wasm output format back to UI format (unmarshalling)
 * 
 * This allows swapping out the engine without changing UI code.
 */

class SimulationAdapter {
    constructor() {
        this.worker = null;
        this.requestId = 0;
        this.pendingRequests = new Map();
    }
    
    /**
     * Initialize the Web Worker
     */
    initWorker() {
        if (this.worker) return;
        
        this.worker = new Worker('scripts/simulation.worker.js');
        
        this.worker.onmessage = (e) => {
            const { id, success, rawBuffer, computeTime, error, ready } = e.data;
            
            if (ready) {
                console.log('[Adapter] Worker ready');
                return;
            }
            
            const request = this.pendingRequests.get(id);
            if (!request) {
                console.warn(`[Adapter] No pending request for id ${id}`);
                return;
            }
            
            this.pendingRequests.delete(id);
            
            if (success) {
                console.log(`[Adapter] Simulation completed in ${computeTime.toFixed(2)}ms`);
                request.resolve({ rawBuffer, computeTime });
            } else {
                request.reject(new Error(error));
            }
        };
        
        this.worker.onerror = (error) => {
            console.error('[Adapter] Worker error:', error);
            // Reject all pending requests
            for (const [id, request] of this.pendingRequests) {
                request.reject(new Error('Worker crashed'));
            }
            this.pendingRequests.clear();
        };
    }
    
    /**
     * Marshall inputs: Convert UI object to Wasm-compatible flat structure
     */
    static marshallInputs(uiInputs) {
        return {
            loanAmount: uiInputs.loanAmount,
            interestRate: uiInputs.interestRate,
            volatility: uiInputs.volatility,
            growth: uiInputs.growth,
            inflation: uiInputs.inflation,
            monthlyBudget: uiInputs.monthlyBudget,
            minPayment: uiInputs.minPayment,
            maxPayment: uiInputs.maxPayment,
            simulationCount: uiInputs.simulationCount,
            years: uiInputs.years,
            marginCallLTV: uiInputs.marginCallLTV,
            initialAssets: uiInputs.initialAssets,
            initialEquity: uiInputs.initialEquity,
            numStrategies: uiInputs.numStrategies,
            baselineSimulationCount: uiInputs.baselineSimulationCount
        };
    }
    
    /**
     * Calculate required buffer size based on simulation parameters
     * Must match calculation in config.js and assembly/index.ts
     */
    static calculateRequiredBufferSize(uiInputs) {
        const headerSize = 2;
        const scenarioHeaderSize = 8;
        const baseSimCount = uiInputs.baselineSimulationCount || UI_CONSTANTS.BASE_CASE_SIMULATIONS;
        const benchmarkSize = scenarioHeaderSize + baseSimCount;
        const numLeveragedStrategies = uiInputs.numStrategies || (UI_CONSTANTS.NUM_STRATEGIES - 1);
        const leveragedSize = numLeveragedStrategies * (scenarioHeaderSize + uiInputs.simulationCount);
        return headerSize + benchmarkSize + leveragedSize;
    }
    
    /**
     * Unmarshall results: Convert Wasm flat buffer back to UI object structure
     */
    static unmarshallResults(rawBuffer, uiInputs) {
        // Validate buffer has minimum required data (at least header)
        if (rawBuffer.length < 2) {
            throw new Error('Invalid buffer: missing header');
        }
        
        let pos = 0;
        
        // Read header
        const status = rawBuffer[pos++];
        const numScenarios = rawBuffer[pos++];
        
        if (status !== 0) {
            throw new Error(`Simulation failed with status: ${status}`);
        }
        
        // Read benchmark (first scenario)
        const benchmark = SimulationAdapter.readScenario(rawBuffer, pos);
        pos = benchmark.nextPos;
        
        // Read leveraged strategies (numStrategies scenarios)
        const numLeveragedStrategies = uiInputs.numStrategies || (UI_CONSTANTS.NUM_STRATEGIES - 1);
        const strategies = [];
        for (let i = 0; i < numLeveragedStrategies; i++) {
            const strategy = SimulationAdapter.readScenario(rawBuffer, pos);
            pos = strategy.nextPos;
            
            // Calculate benchmark percent diff
            if (benchmark.data.expectedWealth > 0) {
                strategy.data.benchmarkPercentDiff = 
                    ((strategy.data.expectedWealth - benchmark.data.expectedWealth) / 
                     benchmark.data.expectedWealth) * 100.0;
            }
            
            // Add amortized payment reference
            strategy.data.amortizedPayment = uiInputs.amortizedPayment;
            
            // Calculate payment percent (informational)
            strategy.data.paymentPercent = 
                (strategy.data.paymentAmount / uiInputs.maxPayment) * 100.0;
            
            // Link benchmark data to each strategy
            strategy.data.benchmarkWealthArray = benchmark.data.finalWealthArray;
            strategy.data.benchmarkMedian = benchmark.data.medianWealth;
            strategy.data.benchmarkExpected = benchmark.data.expectedWealth;
            
            strategies.push(strategy.data);
        }
        
        // Construct loan details
        const loanDetails = {
            loanAmount: uiInputs.loanAmount,
            initialAssets: uiInputs.initialAssets,
            initialEquity: uiInputs.initialEquity,
            months: uiInputs.years * 12,
            amortizedPayment: uiInputs.amortizedPayment,
            monthlyBudget: uiInputs.monthlyBudget,
            interestRate: uiInputs.interestRate,
            inflationRate: uiInputs.inflation,
            years: uiInputs.years
        };
        
        // Return in expected UI format
        return {
            strategies: strategies,
            loanDetails: loanDetails,
            benchmark: benchmark.data,
            computeTime: 0 // Will be set by caller
        };
    }
    
    /**
     * Read a single scenario from the buffer
     */
    static readScenario(buffer, startPos) {
        let pos = startPos;
        
        const paymentAmount = buffer[pos++];
        const surplusAmount = buffer[pos++];
        const survivalRate = buffer[pos++];
        const medianWealth = buffer[pos++];
        const p90Wealth = buffer[pos++];
        const expectedWealth = buffer[pos++];
        const benchmarkPercentDiff = buffer[pos++];
        
        // Read wealth array
        // Note: In Float64Array, i32 is stored as f64, so we convert back
        const arrayLength = Math.floor(buffer[pos++]);
        const finalWealthArray = [];
        
        for (let i = 0; i < arrayLength; i++) {
            finalWealthArray.push(buffer[pos++]);
        }
        
        return {
            data: {
                paymentAmount,
                surplusAmount,
                survivalRate,
                medianWealth,
                p90Wealth,
                expectedWealth,
                benchmarkPercentDiff,
                finalWealthArray,
                benchmarkWealthArray: [], // Will use benchmark's array
                benchmarkMedian: 0,       // Will be set from benchmark
                benchmarkExpected: 0      // Will be set from benchmark
            },
            nextPos: pos
        };
    }
    
    /**
     * Main entry point: Run simulation with UI inputs
     * Returns Promise<SimulationResults>
     */
    async run(uiInputs) {
        console.log('[Adapter] run() called with inputs:', uiInputs);
        this.initWorker();
        console.log('[Adapter] Worker initialized');
        
        // Marshall inputs
        const marshalledInputs = SimulationAdapter.marshallInputs(uiInputs);
        console.log('[Adapter] Inputs marshalled:', marshalledInputs);
        
        // Create promise for this request
        const requestId = this.requestId++;
        const promise = new Promise((resolve, reject) => {
            this.pendingRequests.set(requestId, { resolve, reject });
        });
        
        // Send to worker
        console.log('[Adapter] Sending message to worker, requestId:', requestId);
        this.worker.postMessage({
            id: requestId,
            inputs: marshalledInputs
        });
        
        // Wait for result
        console.log('[Adapter] Waiting for worker response...');
        const { rawBuffer, computeTime } = await promise;
        console.log('[Adapter] Received response from worker, buffer size:', rawBuffer.length, 'computeTime:', computeTime);
        
        // Unmarshall results
        console.log('[Adapter] Unmarshalling results...');
        const results = SimulationAdapter.unmarshallResults(rawBuffer, uiInputs);
        console.log('[Adapter] Unmarshalled results:', results);
        results.computeTime = computeTime;
        
        // Post-process: Link strategies to benchmark (add calculated fields)
        console.log('[Adapter] Post-processing results - adding benchmark sigma...');
        for (const strategy of results.strategies) {
            // benchmarkWealthArray, benchmarkMedian, benchmarkExpected already set in unmarshall
            strategy.benchmarkSigma = this.calculateStdDev(
                results.benchmark.finalWealthArray,
                results.benchmark.expectedWealth
            );
        }
        
        console.log('[Adapter] ✓ Results ready, returning to integration layer');
        console.log('[Adapter] Final structure:', {
            strategiesCount: results.strategies.length,
            benchmarkMedian: results.benchmark.medianWealth,
            firstStrategyPayment: results.strategies[0]?.paymentAmount,
            lastStrategyPayment: results.strategies[9]?.paymentAmount
        });
        return results;
    }
    
    /**
     * Helper: Calculate standard deviation
     */
    calculateStdDev(array, mean) {
        if (array.length === 0) return 0;
        
        let sumSquaredDiff = 0;
        for (let i = 0; i < array.length; i++) {
            const diff = array[i] - mean;
            sumSquaredDiff += diff * diff;
        }
        
        return Math.sqrt(sumSquaredDiff / array.length);
    }
}

// Singleton instance
const simulationAdapter = new SimulationAdapter();

// Export for use in script.js
if (typeof window !== 'undefined') {
    window.SimulationAdapter = simulationAdapter;
}
