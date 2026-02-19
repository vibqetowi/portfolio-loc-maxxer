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
    const assetType = document.getElementById('assetInputType').value;
    const years = parseFloat(document.getElementById('loanPeriod').value);
    const paymentTypeSelect = document.getElementById('paymentType').value;
    const monthlyBudget = parseFloat(document.getElementById('monthlyBudget').value);
    
    let initialAssets = assetType === 'ltv' ? (loan / (assetInput / 100)) : assetInput;
    let initialEquity = initialAssets - loan;
    
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
        initialAssets: initialAssets,
        initialEquity: initialEquity,
        
        // Additional metadata for UI
        amortizedPayment: amortizedPayment,
        months: months,
        paymentType: paymentTypeSelect
    };
}

/**
 * Check if WebAssembly is supported and adapter is available
 */
function isWasmAvailable() {
    return typeof WebAssembly !== 'undefined' && 
           typeof window.SimulationAdapter !== 'undefined';
}

/**
 * Run simulation using the appropriate engine (Wasm or fallback to JS)
 */
async function runSimulationWithAdapter() {
    console.log('[Integration] Starting simulation...');
    
    if (!validateInputs()) {
        console.error('[Integration] Validation failed');
        return null;
    }
    
    const inputs = getSimulationInputs();
    console.log('[Integration] Inputs collected:', inputs);
    
    try {
        if (isWasmAvailable()) {
            console.log('[Integration] Using WebAssembly accelerated simulation');
            console.log('[Integration] Calling SimulationAdapter.run()...');
            const results = await window.SimulationAdapter.run(inputs);
            console.log(`[Integration] Wasm simulation completed in ${results.computeTime.toFixed(2)}ms`);
            console.log('[Integration] Results received:', results);
            return results;
        } else {
            console.warn('[Integration] WebAssembly not available, falling back to JavaScript');
            return runSimulationJS(inputs);
        }
    } catch (error) {
        console.error('[Integration] Simulation failed:', error);
        alert('Simulation failed: ' + error.message);
        return null;
    }
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
