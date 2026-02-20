/**
 * WebAssembly Monte Carlo Simulation Engine - Generic Simulator
 * 
 * This is a DUMB calculator. It takes initial conditions and simulation parameters.
 * It does NOT know what scenario it's running. It just:
 * 1. Calculates a cash flow schedule internally (delayed annuity: T=0 + monthly flows)
 * 2. Runs simulations using that schedule
 * 3. Returns results and schedules
 * 
 * The adapter decides what initial conditions to pass in.
 * 
 * INPUT BUFFER (20 f64 values):
 * [0] initialDebt - amount owed at t=0
 * [1] initialBalance - cash/assets at t=0
 * [2] monthlyPayment - fixed debt payment per month
 * [3] monthlyBudget - deposits available per month
 * [4] monthlyRate - interest rate as decimal (e.g., 0.06/12)
 * [5] years - simulation duration
 * [6] volatility - standard deviation of returns
 * [7] growth - expected annual return
 * [8] inflation - inflation rate
 * [9] marginCallLTV - debt/assets ratio threshold for failure
 * [10] simulationCount - number of Monte Carlo runs
 * [11-19] (unused, reserved)
 * 
 * OUTPUT BUFFER:
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

import { randn, simulateMonthlyReturn, calculateAmortizedPayment } from './math';

// Input buffer: per-strategy parameters
let inputBuffer: StaticArray<f64> = new StaticArray<f64>(20);

// Output buffer: results + schedules + wealth array
// Max size: 2 + 6 + 480 + 480 + 100000 = ~101k f64 values
let outputBuffer: StaticArray<f64> = new StaticArray<f64>(1000000);

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
 * Main simulation - generic, knows nothing about strategy types
 * Just takes initial conditions and runs the numbers
 */
export function runSimulation(): i32 {
    // Read inputs
    const initialDebt = inputBuffer[0];
    const initialBalance = inputBuffer[1];
    const monthlyPayment = inputBuffer[2];
    const monthlyBudget = inputBuffer[3];
    const monthlyRate = inputBuffer[4];
    const years = inputBuffer[5];
    const volatility = inputBuffer[6];
    const growth = inputBuffer[7];
    const inflation = inputBuffer[8];
    const marginCallLTV = inputBuffer[9];
    const simulationCount = i32(inputBuffer[10]);
    
    const months = i32(years * 12.0);
    
    // Calculate the schedule internally (delayed annuity: T=0 is initial capital, T=1..months are monthly flows)
    let depositPath = new StaticArray<f64>(months + 1);
    let debtPath = new StaticArray<f64>(months + 1);
    
    // T=0: Initial capital injection
    depositPath[0] = initialBalance;
    debtPath[0] = initialDebt;
    
    let currentDebt = initialDebt;
    for (let t = 1; t <= months; t++) {
        if (currentDebt > 0) {
            const interest = currentDebt * monthlyRate;
            const principalReduction = monthlyPayment - interest;
            
            // Force payoff at final month OR when payment covers remaining debt
            if (t === months || principalReduction >= currentDebt) {
                // Final payoff: must liquidate all remaining debt
                const actualPaymentNeeded = currentDebt + interest;
                depositPath[t] = monthlyBudget - actualPaymentNeeded;
                currentDebt = 0;
            } else {
                // Normal month: reduce principal by payment minus interest
                currentDebt -= principalReduction;
                depositPath[t] = monthlyBudget - monthlyPayment;
            }
        } else {
            // Debt already paid off
            depositPath[t] = monthlyBudget;
        }
        
        debtPath[t] = currentDebt >= 0 ? currentDebt : 0;
    }
    
    // Run simulations
    let survivorCount = 0;
    let wealthResults = new StaticArray<f64>(simulationCount);
    
    for (let s = 0; s < simulationCount; s++) {
        let balance = depositPath[0]; // Start with T=0 initial capital
        let ruined = false;
        
        for (let t = 1; t <= months; t++) {
            const ret = simulateMonthlyReturn(growth, volatility);
            balance = (balance * ret) + depositPath[t];
            
            // Check margin call
            if (debtPath[t] > 0 && debtPath[t] / balance > marginCallLTV) {
                ruined = true;
                break;
            }
        }
        
        if (!ruined) {
            const finalDebt = debtPath[months];
            const nominalWealth = balance - finalDebt;
            const realWealth = nominalWealth / Math.pow(1.0 + inflation, years);
            wealthResults[survivorCount] = realWealth;
            survivorCount++;
        }
    }
    
    // Calculate statistics
    let outputIdx = 0;
    outputBuffer[outputIdx++] = 0.0; // status: success
    outputBuffer[outputIdx++] = f64(months);
    
    if (survivorCount > 0) {
        // Sort for percentiles
        wealthResults.sort();
        
        const medianIdx = i32(f64(survivorCount) * 0.5);
        const median = wealthResults[medianIdx < survivorCount ? medianIdx : survivorCount - 1];
        
        const p90Idx = i32(f64(survivorCount) * 0.9);
        const p90 = wealthResults[p90Idx < survivorCount ? p90Idx : survivorCount - 1];
        
        let sum: f64 = 0.0;
        for (let i = 0; i < survivorCount; i++) {
            sum += wealthResults[i];
        }
        const expected = sum / f64(survivorCount);
        
        const survivalRate = (f64(survivorCount) / f64(simulationCount)) * 100.0;
        
        // Write statistics
        outputBuffer[outputIdx++] = survivalRate;
        outputBuffer[outputIdx++] = median;
        outputBuffer[outputIdx++] = p90;
        outputBuffer[outputIdx++] = expected;
        outputBuffer[outputIdx++] = debtPath[months];
        outputBuffer[outputIdx++] = 0.0; // totalDeposits (not calculated)
        outputBuffer[outputIdx++] = f64(survivorCount);
        
        // Write schedule (includes T=0, so months+1 elements)
        for (let t = 0; t <= months && outputIdx < 1000000; t++) {
            outputBuffer[outputIdx++] = depositPath[t];
        }
        for (let t = 0; t <= months && outputIdx < 1000000; t++) {
            outputBuffer[outputIdx++] = debtPath[t];
        }
        
        // Write wealth array
        for (let i = 0; i < survivorCount && outputIdx < 1000000; i++) {
            outputBuffer[outputIdx++] = wealthResults[i];
        }
    } else {
        // No survivors
        outputBuffer[outputIdx++] = 0.0; // survivalRate
        outputBuffer[outputIdx++] = 0.0; // median
        outputBuffer[outputIdx++] = 0.0; // p90
        outputBuffer[outputIdx++] = 0.0; // expected
        outputBuffer[outputIdx++] = debtPath[months];
        outputBuffer[outputIdx++] = 0.0; // totalDeposits
        outputBuffer[outputIdx++] = 0.0; // survivorCount
        
        // Write schedule (includes T=0, so months+1 elements)
        for (let t = 0; t <= months && outputIdx < 1000000; t++) {
            outputBuffer[outputIdx++] = depositPath[t];
        }
        for (let t = 0; t <= months && outputIdx < 1000000; t++) {
            outputBuffer[outputIdx++] = debtPath[t];
        }
    }
    
    return outputIdx;
}


