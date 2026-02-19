/**
 * WebAssembly Monte Carlo Simulation Engine
 * Batch processes 11 scenarios (1 benchmark + 10 leveraged strategies)
 */

import { randn, simulateMonthlyReturn, calculateAmortizedPayment } from './math';

// Global buffers for input/output communication
// Input buffer layout:
//  [0] loanAmount, [1] interestRate, [2] volatility, [3] growth
//  [4] inflation, [5] monthlyBudget, [6] minPayment, [7] maxPayment
//  [8] simulationCount (leveraged), [9] years, [10] marginCallLTV, [11] initialAssets
//  [12] initialEquity, [13] numStrategies, [14] baselineSimulationCount
let inputBuffer: StaticArray<f64> = new StaticArray<f64>(15);
// Output buffer size calculation (must match config.js calculation):
// Formula: 2 header + (8 + BASE_CASE_SIMS) + (NUM_STRATS - 1) * (8 + SIM_COUNT)
let outputBuffer: StaticArray<f64> = new StaticArray<f64>(800000);

/**
 * Get pointer to input buffer for JS to write to
 */
export function getInputPtr(): usize {
    return changetype<usize>(inputBuffer);
}

/**
 * Get pointer to output buffer for JS to read from
 */
export function getOutputPtr(): usize {
    return changetype<usize>(outputBuffer);
}

/**
 * Main simulation entry point
 * Processes all 11 scenarios in a single batch operation
 * 
 * @returns Size of output data in bytes
 */
export function runSimulation(): i32 {
    // ========================================
    // 1. READ INPUTS FROM BUFFER
    // ========================================
    const loanAmount = inputBuffer[0];
    const interestRate = inputBuffer[1];
    const volatility = inputBuffer[2];
    const growth = inputBuffer[3];
    const inflation = inputBuffer[4];
    const monthlyBudget = inputBuffer[5];
    const minPayment = inputBuffer[6];
    const maxPayment = inputBuffer[7];
    const simulationCount = i32(inputBuffer[8]); // Leveraged strategies simulation count
    const years = inputBuffer[9];
    const marginCallLTV = inputBuffer[10];
    const initialAssets = inputBuffer[11];
    const initialEquity = inputBuffer[12];
    const numStrategies = i32(inputBuffer[13]); // Number of leveraged strategies
    const baselineSimulationCount = i32(inputBuffer[14]); // Baseline simulation count
    
    const months = i32(years * 12.0);
    const monthlyRate = interestRate / 12.0;
    
    // Calculate ranges for strategies
    const minPaymentPercent = (minPayment / maxPayment) * 100.0;
    const stepSize = (100.0 - minPaymentPercent) / f64(numStrategies - 1);
    
    // Track output position (index into outputBuffer)
    let outputIdx = 0;
    
    // Write status header
    outputBuffer[outputIdx++] = 0.0; // Status: 0 = success
    outputBuffer[outputIdx++] = f64(numStrategies + 1); // Number of scenarios (leveraged + 1 benchmark)
    
    // ========================================
    // 2. BENCHMARK CALCULATION (No Leverage)
    // ========================================
    outputIdx = calculateBenchmark(
        initialEquity,
        monthlyBudget,
        growth,
        volatility,
        inflation,
        years,
        months,
        baselineSimulationCount,
        outputIdx
    );
    
    // ========================================
    // 3. LEVERAGED STRATEGIES (numStrategies from config)
    // ========================================
    for (let i = 0; i < numStrategies; i++) {
        const percentOfMax = minPaymentPercent + (f64(i) * stepSize);
        const paymentAmount = (percentOfMax / 100.0) * maxPayment;
        const surplusAmount = monthlyBudget - paymentAmount;
        
        outputIdx = calculateLeveragedStrategy(
            loanAmount,
            initialAssets,
            paymentAmount,
            surplusAmount,
            monthlyRate,
            growth,
            volatility,
            inflation,
            marginCallLTV,
            years,
            months,
            simulationCount,
            outputIdx
        );
    }
    
    // Bounds check: ensure we haven't exceeded buffer capacity
    if (outputIdx > 800000) {
        // Write error status
        outputBuffer[0] = 1.0; // Error status
        return 2; // Return minimal size with error
    }
    
    return outputIdx; // Return number of elements written
}

/**
 * Calculate benchmark scenario (invest budget only, no debt)
 */
function calculateBenchmark(
    initialEquity: f64,
    monthlyBudget: f64,
    growth: f64,
    volatility: f64,
    inflation: f64,
    years: f64,
    months: i32,
    simCount: i32,
    outputIdx: i32
): i32 {
    // Allocate array for results
    const results = new StaticArray<f64>(simCount);
    
    // Run simulations
    for (let s = 0; s < simCount; s++) {
        let assets = initialEquity;
        
        for (let t = 0; t < months; t++) {
            const ret = simulateMonthlyReturn(growth, volatility);
            assets = (assets * ret) + monthlyBudget;
        }
        
        // Convert to real dollars
        const realWealth = assets / Math.pow(1.0 + inflation, years);
        results[s] = realWealth;
    }
    
    // Sort for percentile calculations
    results.sort();
    
    // Write benchmark header
    outputBuffer[outputIdx++] = 0.0; // paymentAmount (N/A for benchmark)
    outputBuffer[outputIdx++] = monthlyBudget; // surplusAmount (all budget invested)
    outputBuffer[outputIdx++] = 100.0; // survivalRate (always 100% - no margin call risk)
    
    // Calculate and write statistics
    const median = results[i32(simCount * 0.5)];
    const p90 = results[i32(simCount * 0.9)];
    let sum: f64 = 0.0;
    for (let i = 0; i < simCount; i++) {
        sum += results[i];
    }
    const expected = sum / f64(simCount);
    
    outputBuffer[outputIdx++] = median;
    outputBuffer[outputIdx++] = p90;
    outputBuffer[outputIdx++] = expected;
    outputBuffer[outputIdx++] = 0.0; // benchmarkPercentDiff (N/A for benchmark itself)
    
    // Write array length and data
    outputBuffer[outputIdx++] = f64(simCount);
    
    for (let i = 0; i < simCount; i++) {
        if (outputIdx >= 800000) break; // Prevent buffer overflow
        outputBuffer[outputIdx++] = results[i];
    }
    
    return outputIdx;
}

/**
 * Calculate leveraged strategy scenario
 */
function calculateLeveragedStrategy(
    loanAmount: f64,
    initialAssets: f64,
    paymentAmount: f64,
    surplusAmount: f64,
    monthlyRate: f64,
    growth: f64,
    volatility: f64,
    inflation: f64,
    marginCallLTV: f64,
    years: f64,
    months: i32,
    simCount: i32,
    outputIdx: i32
): i32 {
    // Allocate arrays for survivors only
    const maxSurvivors = simCount;
    const results = new StaticArray<f64>(maxSurvivors);
    let survivorCount = 0;
    
    // Run simulations
    for (let s = 0; s < simCount; s++) {
        let assets = initialAssets;
        let debt = loanAmount;
        let ruined = false;
        
        for (let t = 0; t < months; t++) {
            const ret = simulateMonthlyReturn(growth, volatility);
            assets = (assets * ret) + surplusAmount;
            debt = (debt * (1.0 + monthlyRate)) - paymentAmount;
            
            // Check margin call
            if (debt / assets > marginCallLTV) {
                ruined = true;
                break;
            }
        }
        
        if (!ruined) {
            const nominalWealth = assets - debt;
            const realWealth = nominalWealth / Math.pow(1.0 + inflation, years);
            results[survivorCount] = realWealth;
            survivorCount++;
        }
    }
    
    // Calculate survival rate
    const survivalRate = (f64(survivorCount) / f64(simCount)) * 100.0;
    
    // Sort survivors for percentiles
    if (survivorCount > 0) {
        // Sort only the survivor portion of the results array
        // Note: StaticArray.sort() sorts the entire array, but we only use first survivorCount elements
        results.sort();
        
        // Write strategy header
        outputBuffer[outputIdx++] = paymentAmount;
        outputBuffer[outputIdx++] = surplusAmount;
        outputBuffer[outputIdx++] = survivalRate;
        
        // Calculate and write statistics (using only first survivorCount elements)
        const medianIdx = i32(f64(survivorCount) * 0.5);
        const median = results[medianIdx < survivorCount ? medianIdx : survivorCount - 1];
        
        const p90Idx = i32(f64(survivorCount) * 0.9);
        const p90 = results[p90Idx < survivorCount ? p90Idx : survivorCount - 1];
        
        let sum: f64 = 0.0;
        for (let i = 0; i < survivorCount; i++) {
            sum += results[i];
        }
        const expected = sum / f64(survivorCount);
        
        outputBuffer[outputIdx++] = median;
        outputBuffer[outputIdx++] = p90;
        outputBuffer[outputIdx++] = expected;
        outputBuffer[outputIdx++] = 0.0; // benchmarkPercentDiff (calculated in adapter)
        
        // Write array length and data
        outputBuffer[outputIdx++] = f64(survivorCount);
        
        for (let i = 0; i < survivorCount; i++) {
            if (outputIdx >= 800000) break; // Prevent buffer overflow
            outputBuffer[outputIdx++] = results[i];
        }
    } else {
        // No survivors - write zeros
        outputBuffer[outputIdx++] = paymentAmount;
        outputBuffer[outputIdx++] = surplusAmount;
        outputBuffer[outputIdx++] = 0.0; // survivalRate
        outputBuffer[outputIdx++] = 0.0; // median
        outputBuffer[outputIdx++] = 0.0; // p90
        outputBuffer[outputIdx++] = 0.0; // expected
        outputBuffer[outputIdx++] = 0.0; // benchmarkPercentDiff
        outputBuffer[outputIdx++] = 0.0; // array length
    }
    
    return outputIdx;
}
