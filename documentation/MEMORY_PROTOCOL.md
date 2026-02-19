/**
 * WebAssembly Memory Protocol Documentation
 * 
 * This defines the byte-level memory layout for communication between JavaScript and WebAssembly.
 * All values are Float64 (8 bytes each) for precision in financial calculations.
 */

// ========================================
// INPUT BUFFER (10 values = 80 bytes)
// ========================================
// Index 0:  loanAmount          ($)
// Index 1:  interestRate         (decimal, e.g., 0.07 for 7%)
// Index 2:  volatility           (decimal, e.g., 0.15 for 15%)
// Index 3:  growth               (decimal, e.g., 0.08 for 8%)
// Index 4:  inflation            (decimal, e.g., 0.035 for 3.5%)
// Index 5:  monthlyBudget        ($)
// Index 6:  minPayment           ($)
// Index 7:  maxPayment           ($) - This is now the monthly budget
// Index 8:  simulationCount      (integer as float)
// Index 9:  years                (integer as float)
// Index 10: marginCallLTV        (decimal, e.g., 0.60 for 60%)
// Index 11: initialAssets        ($)
// Index 12: initialEquity        ($)

const INPUT_SIZE = 13;

// ========================================
// OUTPUT BUFFER STRUCTURE
// ========================================
// The output contains results for 11 scenarios:
// - 1 Benchmark (no leverage)
// - 10 Leveraged Strategies (different payment amounts)
//
// Each scenario contains:
// - paymentAmount (f64)
// - surplusAmount (f64)
// - survivalRate (f64, as percentage)
// - medianWealth (f64)
// - p90Wealth (f64)
// - expectedWealth (f64)
// - benchmarkPercentDiff (f64)
// - Sorted wealth array (variable length, prefixed with count)
//
// TOTAL PER STRATEGY: 7 scalars + array

const STRATEGY_HEADER_SIZE = 7; // Number of scalar fields before wealth array
const MAX_SIMULATIONS = 20000;  // Maximum array size per strategy

// Output layout:
// [0]: Status code (0 = success, negative = error)
// [1]: Number of strategies calculated (should be 11)
// [2+]: Strategy data blocks...

module.exports = {
    INPUT_SIZE,
    STRATEGY_HEADER_SIZE,
    MAX_SIMULATIONS
};
