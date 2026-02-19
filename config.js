/**
 * Configuration Management for Portfolio LOC Strategy Analyzer
 * Contains all assumption constants and UI defaults
 */

// Standard Mode Default Values (Research-backed assumptions)
const STANDARD_MODE_DEFAULTS = {
    INFLATION_RATE: 3.5,      // Hardcoded: Long-term inflation expectation (%)
    INTEREST_RATE: 7.0,       // Prime + 1% spread (%)
    GROWTH_RATE: 8.0,         // Historical S&P 500 return (%)
    VOLATILITY: 15.0,         // Standard deviation of annual returns (%)
    MARGIN_CALL_LTV: 60.0,    // Conservative liquidation threshold (%)
    PAYMENT_PERCENTAGE: 50.0,  // Default to 50% of amortized payment
    MAX_LTV: 35.0             // Maximum LTV allowed in Standard Mode (%)
};

// Default Input Values
const DEFAULT_INPUTS = {
    LOAN_PERIOD: 30,           // Default simulation period (years)
    MONTHLY_BUDGET: 200,       // Default monthly budget ($)
    COLLATERAL_VALUE: 30000,   // Default collateral value ($)
    STARTING_LTV: 20.0         // Default starting LTV (%)
};

// UI Constants
const UI_CONSTANTS = {
    BASE_CASE_SIMULATIONS: 20000,        // Non leverage case simulation count
    DEFAULT_RISK_PROFILES: {
        aggressive: 95,                   // 95% survival rate target
        median: 98,                       // 98% survival rate target
        conservative: 99.5                  // 99.5% survival rate target
    },
    SIMULATION_COUNT: 10000,              // Number of Monte Carlo simulations per bin
    NUM_STRATEGIES: 21,                   // Number of payment strategies to test
    SURVIVAL_FILTER_THRESHOLD: 90,        // Only show strategies with survival >= 90%
    HISTOGRAM_BINS: 100,                   // Number of bins for histogram visualization
    WEALTH_PERCENTILES: {
        median: 50,                       // 50th percentile
        high: 90                          // 90th percentile
    },
    HISTOGRAM_COLORS: {
        ruin: '#B3261E',                  // Red for margin call/ruin outcomes
        underperformed: '#FDD835',        // Yellow for outcomes below benchmark
        overperformed: '#66BB6A',         // Light green for outcomes above benchmark
        benchmark: 'rgba(0, 0, 0, 0.6)',  // Black for benchmark baseline
        ruinOpacity: 0.8,                 // Opacity for ruin bar
        performanceOpacity: 0.6           // Opacity for performance bars
    }
};

/**
 * Calculate required WASM output buffer size
 * Formula: 2 header + (8 + BASE_CASE_SIMS) + (NUM_STRATS - 1) * (8 + SIM_COUNT)
 * 
 * WARNING: If you change simulation counts, the buffer must be large enough!
 */
function calculateRequiredBufferSize() {
    const headerSize = 2;
    const scenarioHeaderSize = 8;
    const benchmarkSize = scenarioHeaderSize + UI_CONSTANTS.BASE_CASE_SIMULATIONS;
    const leveragedSize = (UI_CONSTANTS.NUM_STRATEGIES - 1) * 
                          (scenarioHeaderSize + UI_CONSTANTS.SIMULATION_COUNT);
    const totalRequired = headerSize + benchmarkSize + leveragedSize;
    
    return {
        required: totalRequired,
        allocated: 800000,  // Must match assembly/index.ts outputBuffer size
        isValid: totalRequired <= 800000,
        utilizationPercent: (totalRequired / 800000 * 100).toFixed(1)
    };
}

// Validate buffer size on load
if (typeof window !== 'undefined') {
    const bufferInfo = calculateRequiredBufferSize();
    if (!bufferInfo.isValid) {
        console.error(
            `⚠️ BUFFER OVERFLOW WARNING!\n` +
            `Required: ${bufferInfo.required.toLocaleString()} f64 values\n` +
            `Allocated: ${bufferInfo.allocated.toLocaleString()} f64 values\n` +
            `You must reduce SIMULATION_COUNT or BASE_CASE_SIMULATIONS in config.js\n` +
            `or increase outputBuffer size in assembly/index.ts and rebuild (npm run asbuild)`
        );
    } else {
        console.log(
            `✓ Buffer size OK: ${bufferInfo.utilizationPercent}% utilized ` +
            `(${bufferInfo.required.toLocaleString()} / ${bufferInfo.allocated.toLocaleString()})`
        );
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { 
        STANDARD_MODE_DEFAULTS, 
        UI_CONSTANTS, 
        DEFAULT_INPUTS,
        calculateRequiredBufferSize 
    };
}
