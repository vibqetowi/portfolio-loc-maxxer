/**
 * Integration Helper for WebAssembly Migration
 * 
 * This module provides functions to help integrate the new WebAssembly adapter
 * with the existing UI code, allowing for gradual migration.
 */

/**
 * Extract UI inputs in format expected by both old and new simulation engines
 */
function getSimulationInputs() {
    const loan = parseFloat(document.getElementById('loanAmount').value);
    const assetInput = parseFloat(document.getElementById('assetValue').value);
    const years = parseFloat(document.getElementById('loanPeriod').value);
    const paymentTypeSelect = document.getElementById('paymentType').value;
    const monthlyBudget = parseFloat(document.getElementById('monthlyBudget').value);
    
    const initialEquity = assetInput;
    
    const annualRate = parseFloat(document.getElementById('interestRate').value) / 100;
    const g = parseFloat(document.getElementById('growth').value) / 100;
    const vol = parseFloat(document.getElementById('vol').value) / 100;
    const marginCallLTV = parseFloat(document.getElementById('marginCall').value) / 100;
    const inflationRate = parseFloat(document.getElementById('inflationRate').value) / 100;
    
    const months = years * 12;
    const mRate = annualRate / 12;
    
    // Calculate amortized payment
    const amortizedPayment = loan * (mRate * Math.pow(1 + mRate, months)) / 
                            (Math.pow(1 + mRate, months) - 1);
    const monthlyInterest = loan * mRate;
    
    // Determine minimum payment based on payment type
    let minRequired = parseFloat(document.getElementById('minPayment').value);
    let minPayment;
    
    if (paymentTypeSelect === 'interest') {
        minPayment = monthlyInterest;
    } else {
        minPayment = minRequired;
    }
    
    return {
        // Core simulation parameters
        loanAmount: loan,
        interestRate: annualRate,
        volatility: vol,
        growth: g,
        inflation: inflationRate,
        monthlyBudget: monthlyBudget,
        minPayment: minPayment,
        maxPayment: monthlyBudget, // Now uses full budget as max
        simulationCount: UI_CONSTANTS.SIMULATION_COUNT,
        baselineSimulationCount: UI_CONSTANTS.BASE_CASE_SIMULATIONS,
        numStrategies: UI_CONSTANTS.NUM_STRATEGIES - 1, // Number of leveraged strategies (excluding benchmark)
        years: years,
        marginCallLTV: marginCallLTV,
        initialEquity: initialEquity,
        
        // Additional metadata for UI
        amortizedPayment: amortizedPayment,
        months: months,
        paymentType: paymentTypeSelect
    };
}

/**
 * Schedule Generator - Pre-calculate deterministic debt and deposit paths
 * Returns arrays of length `months+1` representing the cashflow schedule:
 * - Index 0: T=0 (initial state)
 * - Indices 1 to months: T=1 to T=months (monthly values)
 */
function generateCashFlowSchedule(loanAmount, monthlyRate, payment, monthlyBudget, months) {
    let currentDebt = loanAmount;
    const debtPath = [loanAmount];  // T=0: initial debt
    const depositPath = [0];  // T=0: no deposits at initial time (capital already in assets)

    for (let t = 1; t <= months; t++) {
        if (currentDebt > 0) {
            const interest = currentDebt * monthlyRate;
            const principalReduction = payment - interest;
            
            // Force payoff at final month OR when payment covers remaining debt
            if (t === months || principalReduction >= currentDebt) {
                // Final payoff: must liquidate all remaining debt
                const actualPaymentNeeded = currentDebt + interest;
                const surplusThisMonth = monthlyBudget - actualPaymentNeeded;
                depositPath.push(surplusThisMonth); // Can be negative if budget insufficient
                currentDebt = 0;
            } else {
                // Normal month: principal is reduced, debt continues
                currentDebt -= principalReduction;
                depositPath.push(monthlyBudget - payment);
            }
        } else {
            // Debt already paid off: entire budget is a deposit
            depositPath.push(monthlyBudget);
        }
        
        // Record debt balance at end of this month
        debtPath.push(Math.max(0, currentDebt));
    }
    
    return { debtPath, depositPath };
}

/**
 * Generate schedules for all strategies (benchmark + leveraged)
 * Returns array of schedule objects indexed by strategy
 * Each schedule now includes T=0 as the first element (months+1 total)
 */
function generateAllSchedules(inputs) {
    const schedules = [];
    const mRate = inputs.interestRate / 12;
    
    // Benchmark schedule: no debt, just full budget deposits
    // Now includes T=0 element (months+1 total elements)
    const benchmarkDeposits = [0]; // T=0: no initial deposit
    const benchmarkDebt = [0];     // T=0: no initial debt
    for (let month = 1; month <= inputs.months; month++) {
        benchmarkDeposits.push(inputs.monthlyBudget);
        benchmarkDebt.push(0);
    }
    schedules.push({ debtPath: benchmarkDebt, depositPath: benchmarkDeposits });
    
    // Leveraged strategy schedules
    const minPaymentPercent = (inputs.minPayment / inputs.maxPayment) * 100;
    const stepSize = (100 - minPaymentPercent) / (inputs.numStrategies);
    
    for (let i = 0; i < inputs.numStrategies; i++) {
        const percentOfMax = minPaymentPercent + (i * stepSize);
        const paymentAmount = (percentOfMax / 100) * inputs.maxPayment;
        
        const schedule = generateCashFlowSchedule(
            inputs.loanAmount,
            mRate,
            paymentAmount,
            inputs.monthlyBudget,
            inputs.months
        );
        
        schedules.push(schedule);
    }
    
    return schedules;
}

/**
 * Check if WebAssembly is supported
 */
function isWasmAvailable() {
    return typeof WebAssembly !== 'undefined';
}

/**
 * Run simulation using 21 separate Worker instances
 * Each worker processes one strategy independently
 */
async function runSimulationWithAdapter() {
    console.log('[Integration] Starting simulation with 21 workers...');
    
    if (!validateInputs()) {
        console.error('[Integration] Validation failed');
        return null;
    }
    
    const uiInputs = getSimulationInputs();
    console.log('[Integration] Inputs collected:', uiInputs);
    
    try {
        if (!isWasmAvailable()) {
            console.warn('[Integration] WebAssembly not available');
            return runSimulationJS(uiInputs);
        }
        
        // Create worker inputs for each strategy
        const strategyInputs = [];
        for (let i = 0; i < 21; i++) {
            const isBenchmark = i === 0;
            let initialDebt, initialBalance, monthlyPayment;

            initialDebt = isBenchmark ? 0 : uiInputs.loanAmount;
            initialBalance = uiInputs.initialEquity + initialDebt;
            monthlyPayment = 0;

            if (!isBenchmark) {
                // Interpolate payment
                const leverageIndex = i - 1;
                const ratio = (leverageIndex + 1) / 20;
                monthlyPayment = uiInputs.minPayment + (uiInputs.maxPayment - uiInputs.minPayment) * ratio;
            }
            
            strategyInputs.push({
                initialDebt: initialDebt,
                initialBalance: initialBalance,
                monthlyPayment: monthlyPayment,
                monthlyBudget: uiInputs.monthlyBudget,
                monthlyRate: uiInputs.interestRate / 12.0,
                years: uiInputs.years,
                volatility: uiInputs.volatility,
                growth: uiInputs.growth,
                inflation: uiInputs.inflation,
                marginCallLTV: uiInputs.marginCallLTV,
                simulationCount: isBenchmark ? uiInputs.baselineSimulationCount : uiInputs.simulationCount,
                paymentAmount: monthlyPayment,
                surplusAmount: uiInputs.monthlyBudget - monthlyPayment
            });
        }
        
        // Create and send to 21 workers
        console.log('[Integration] Creating 21 workers...');
        const workers = [];
        const promises = [];
        
        for (let i = 0; i < 21; i++) {
            const worker = new Worker('scripts/simulation.worker.js', { 
                name: `strategy-${i}` 
            });
            workers.push(worker);
            
            const promise = new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error(`Strategy ${i} worker timeout`));
                }, 600000); // 10 minute timeout
                
                worker.onmessage = (e) => {
                    clearTimeout(timeout);
                    if (e.data.success) {
                        resolve({ rawResults: e.data.rawResults, strategyIndex: i, computeTime: e.data.computeTime });
                    } else {
                        const errorMsg = e.data.error || 'Unknown error from worker';
                        console.error(`[Integration] Worker ${i} returned error: ${errorMsg}`);
                        reject(new Error(`Strategy ${i}: ${errorMsg}`));
                    }
                    worker.terminate();
                };
                
                worker.onerror = (error) => {
                    clearTimeout(timeout);
                    const errorMsg = error instanceof Error ? error.message : String(error);
                    console.error(`[Integration] Worker ${i} error event:`, errorMsg);
                    reject(new Error(`Strategy ${i} worker error: ${errorMsg}`));
                    worker.terminate();
                };
                
                // Send strategy inputs to worker
                console.log(`[Integration] Posting message to worker ${i}`);
                worker.postMessage({
                    id: i,
                    inputs: strategyInputs[i],
                    strategyIndex: i
                });
            });
            
            promises.push(promise);
        }
        
        console.log('[Integration] Waiting for all 21 workers...');
        const startTime = performance.now();
        try {
            const results = await Promise.all(promises);
            const endTime = performance.now();
            
            console.log(`[Integration] All workers completed in ${(endTime - startTime).toFixed(2)}ms`);
            
            // Aggregate results
            return aggregateWorkerResults(results, uiInputs, endTime - startTime);
        } catch (promiseError) {
            console.error('[Integration] Promise.all() failed:', promiseError);
            throw promiseError;
        }
        
    } catch (error) {
        console.error('[Integration] Simulation failed:', error);
        alert(CopywritingHelpers.getSimulationErrorMessage(error.message));
        return null;
    }
}

/**
 * Aggregate results from all 21 worker instances
 */
function aggregateWorkerResults(workerResults, uiInputs, totalTime) {
    const aggregated = {
        benchmark: null,
        strategies: [],
        loanDetails: {
            loanAmount: uiInputs.loanAmount,
            initialEquity: uiInputs.initialEquity,
            months: uiInputs.years * 12,
            amortizedPayment: uiInputs.amortizedPayment,
            monthlyBudget: uiInputs.monthlyBudget,
            interestRate: uiInputs.interestRate,
            inflationRate: uiInputs.inflation,
            years: uiInputs.years
        },
        schedules: [],
        computeTime: totalTime
    };
    
    // Sort results by strategy index
    workerResults.sort((a, b) => a.strategyIndex - b.strategyIndex);
    
    for (const result of workerResults) {
        const strategyIndex = result.strategyIndex;
        const rawBuffer = result.rawResults;
        const isBenchmark = strategyIndex === 0;
        
        // Unmarshal results
        const strategyData = unmarshalStrategyResults(rawBuffer);
        
        // Add payment info
        if (isBenchmark) {
            strategyData.paymentAmount = 0;
            strategyData.surplusAmount = uiInputs.monthlyBudget;
        } else {
            const leverageIndex = strategyIndex - 1;
            const ratio = (leverageIndex + 1) / 20;
            strategyData.paymentAmount = uiInputs.minPayment + (uiInputs.maxPayment - uiInputs.minPayment) * ratio;
            strategyData.surplusAmount = uiInputs.monthlyBudget - strategyData.paymentAmount;
        }
        
        if (isBenchmark) {
            aggregated.benchmark = strategyData;
        } else {
            aggregated.strategies.push(strategyData);
        }
        
        aggregated.schedules.push({
            strategyIndex: strategyIndex,
            isBenchmark: isBenchmark,
            depositPath: strategyData.depositPath,
            debtPath: strategyData.debtPath
        });
    }
    
    // Post-process
    if (aggregated.benchmark && aggregated.benchmark.expectedWealth > 0) {
        for (let i = 0; i < aggregated.strategies.length; i++) {
            const strategy = aggregated.strategies[i];
            strategy.benchmarkPercentDiff = 
                ((strategy.expectedWealth - aggregated.benchmark.expectedWealth) / 
                 aggregated.benchmark.expectedWealth) * 100.0;
            strategy.amortizedPayment = uiInputs.amortizedPayment;
            strategy.paymentPercent = (strategy.paymentAmount / uiInputs.maxPayment) * 100.0;
            strategy.benchmarkWealthArray = aggregated.benchmark.finalWealthArray;
            strategy.benchmarkMedian = aggregated.benchmark.medianWealth;
            strategy.benchmarkExpected = aggregated.benchmark.expectedWealth;
            strategy.benchmarkSigma = calculateStdDev(aggregated.benchmark.finalWealthArray, aggregated.benchmark.expectedWealth);
        }
    }
    
    return aggregated;
}

/**
 * Unmarshal WASM output for a single strategy
 */
function unmarshalStrategyResults(rawBuffer) {
    let pos = 0;
    
    const status = rawBuffer[pos++];
    const months = Math.floor(rawBuffer[pos++]);
    const survivalRate = rawBuffer[pos++];
    const medianWealth = rawBuffer[pos++];
    const p90Wealth = rawBuffer[pos++];
    const expectedWealth = rawBuffer[pos++];
    const finalDebt = rawBuffer[pos++];
    const totalDeposits = rawBuffer[pos++];
    const numSurvived = Math.floor(rawBuffer[pos++]);
    
    if (status !== 0) {
        throw new Error(`Strategy simulation failed with status: ${status}`);
    }
    
    // depositPath and debtPath now include T=0, so they have months+1 elements
    const depositPath = [];
    for (let i = 0; i <= months && pos < rawBuffer.length; i++) {
        depositPath.push(rawBuffer[pos++]);
    }
    
    const debtPath = [];
    for (let i = 0; i <= months && pos < rawBuffer.length; i++) {
        debtPath.push(rawBuffer[pos++]);
    }
    
    const finalWealthArray = [];
    for (let i = 0; i < numSurvived && pos < rawBuffer.length; i++) {
        finalWealthArray.push(rawBuffer[pos++]);
    }
    
    return {
        survivalRate,
        medianWealth,
        p90Wealth,
        expectedWealth,
        finalWealthArray,
        depositPath,
        debtPath,
        numSurvived,
        months,
        benchmarkPercentDiff: 0,
        paymentAmount: 0,
        surplusAmount: 0
    };
}

/**
 * Calculate standard deviation
 */
function calculateStdDev(array, mean) {
    if (array.length === 0) return 0;
    let sumSquaredDiff = 0;
    for (let i = 0; i < array.length; i++) {
        const diff = array[i] - mean;
        sumSquaredDiff += diff * diff;
    }
    return Math.sqrt(sumSquaredDiff / array.length);
}

/**
 * Fallback JavaScript implementation
 * This keeps the original algorithm for browsers without Wasm support
 */
function runSimulationJS(inputs) {
    console.warn('[Integration] Using legacy JavaScript simulation (slower)');
    
    // Call the original runSimulation function
    // This is preserved in script.js as runSimulationLegacy
    if (typeof runSimulationLegacy === 'function') {
        return runSimulationLegacy();
    } else {
        throw new Error('Legacy simulation function not available');
    }
}

// Export for use in script.js
if (typeof window !== 'undefined') {
    window.getSimulationInputs = getSimulationInputs;
    window.isWasmAvailable = isWasmAvailable;
    window.runSimulationWithAdapter = runSimulationWithAdapter;
}
