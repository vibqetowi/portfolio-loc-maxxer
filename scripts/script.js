/**
 * Portfolio LOC Strategy Analyzer - Main Script
 * Implements Monte Carlo simulation with inflation adjustment, 
 * histogram visualization, and interactive slider
 * 
 * DATA FLOW ARCHITECTURE:
 * ┌─────────────┐
 * │ 1. UI Input │ User fills form with loan parameters
 * └──────┬──────┘
 *        ↓
 * ┌─────────────────────────┐
 * │ 2. Integration Layer    │ getSimulationInputs() collects form data
 * │    (integration.js)     │ runSimulationWithAdapter() coordinates execution
 * └──────┬──────────────────┘
 *        ↓
 * ┌─────────────────────────┐
 * │ 3. Adapter Layer        │ marshallInputs() converts UI → flat buffer
 * │    (adapter.js)         │ Spawns Web Worker for non-blocking execution
 * └──────┬──────────────────┘
 *        ↓
 * ┌─────────────────────────┐
 * │ 4. Web Worker           │ Loads WebAssembly module
 * │    (simulation.worker)  │ Writes input buffer, calls runSimulation()
 * └──────┬──────────────────┘
 *        ↓
 * ┌─────────────────────────┐
 * │ 5. WebAssembly Engine   │ Runs UI_CONSTANTS.NUM_STRATEGIES scenarios
 * │    (assembly/index.ts)  │ Each scenario: UI_CONSTANTS.SIMULATION_COUNT Monte Carlo simulations
 * │                         │ Returns flat buffer with survival rates, wealth arrays
 * └──────┬──────────────────┘
 *        ↓
 * ┌─────────────────────────┐
 * │ 6. Adapter Layer        │ unmarshallResults() converts buffer → objects
 * │    (adapter.js)         │ Links benchmark data to each strategy
 * └──────┬──────────────────┘
 *        ↓
 * ┌─────────────────────────┐
 * │ 7. Display Layer        │ displayResults() receives full results object
 * │    (script.js)          │ ├─ renderHistogram() generates Plotly charts
 * │                         │ └─ updateSummary() displays strategic analysis
 * └─────────────────────────┘
 * 
 * All numeric constants (simulation counts, default rates, etc.) are defined in config.js
 */

// Global state
let currentMode = 'standard';
let riskTarget = UI_CONSTANTS.DEFAULT_RISK_PROFILES.median; // Default to median
let simulationResults = null; // Store last simulation results for slider interaction
let amortizationStrategyIndex = null; // Index of strategy closest to amortization payment

/**
 * Risk Profile Management
 */
function setRiskProfile(profile) {
    if (profile === 'aggressive') {
        riskTarget = UI_CONSTANTS.DEFAULT_RISK_PROFILES.aggressive;
    } else if (profile === 'median') {
        riskTarget = UI_CONSTANTS.DEFAULT_RISK_PROFILES.median;
    } else if (profile === 'conservative') {
        riskTarget = UI_CONSTANTS.DEFAULT_RISK_PROFILES.conservative;
    }
    
    document.getElementById('riskAggressive').classList.remove('risk-btn-active');
    document.getElementById('riskMedian').classList.remove('risk-btn-active');
    document.getElementById('riskConservative').classList.remove('risk-btn-active');
    
    if (profile === 'aggressive') {
        document.getElementById('riskAggressive').classList.add('risk-btn-active');
    } else if (profile === 'median') {
        document.getElementById('riskMedian').classList.add('risk-btn-active');
    } else if (profile === 'conservative') {
        document.getElementById('riskConservative').classList.add('risk-btn-active');
    }
}

/**
 * Mode Management (Standard vs Custom)
 */
function setMode(mode) {
    currentMode = mode;
    const isStandard = mode === 'standard';
    document.getElementById('standardMode').className = isStandard ? 'btn-active' : 'btn-inactive';
    document.getElementById('customMode').className = isStandard ? 'btn-inactive' : 'btn-active';
    
    document.getElementById('modeDescription').innerHTML = isStandard 
        ? `<p><strong>Standard Mode:</strong> Uses research-backed defaults. Set your budget, collateral, and desired LTV; the calculator determines your loan amount and payment strategy.</p>` 
        : `<p><strong>Custom Mode:</strong> For power users auditing other lenders, different borrowing costs, or higher-risk margin strategies. All parameters are unlocked including inflation rate; variability and risk increase with inputs.</p>`;
    
    const inputs = ['growth', 'vol', 'marginCall'];
    inputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.disabled = isStandard;
    });
    
    // Interest rate is always visible, just readonly in Standard Mode
    const interestRateInput = document.getElementById('interestRate');
    if (interestRateInput) {
        interestRateInput.readOnly = isStandard;
        interestRateInput.style.backgroundColor = isStandard ? '#f5f5f5' : '';
        interestRateInput.style.cursor = isStandard ? 'not-allowed' : '';
    }

    // Inflation rate is always visible, just readonly in Standard Mode
    const inflationRateInput = document.getElementById('inflationRate');
    if (inflationRateInput) {
        inflationRateInput.readOnly = isStandard;
        inflationRateInput.style.backgroundColor = isStandard ? '#f5f5f5' : '';
        inflationRateInput.style.cursor = isStandard ? 'not-allowed' : '';
    }
    
    // Hide payment type in Standard Mode
    const paymentTypeGroup = document.getElementById('paymentTypeGroup');
    if (paymentTypeGroup) {
        paymentTypeGroup.style.display = isStandard ? 'none' : 'flex';
    }
    
    // Show/hide appropriate input groups based on mode
    if (isStandard) {
        // Show Standard Mode inputs (monthly budget shown in both modes now)
        document.getElementById('ltvSliderGroup').style.display = 'flex';
        document.getElementById('loanAmountDisplay').style.display = 'flex';
        document.getElementById('loanAmountInput').style.display = 'none';
        document.getElementById('assetInputTypeGroup').style.display = 'none';
        
        // Lock standard mode parameters
        document.getElementById('interestRate').value = STANDARD_MODE_DEFAULTS.INTEREST_RATE;
        document.getElementById('growth').value = STANDARD_MODE_DEFAULTS.GROWTH_RATE;
        document.getElementById('vol').value = STANDARD_MODE_DEFAULTS.VOLATILITY;
        document.getElementById('marginCall').value = STANDARD_MODE_DEFAULTS.MARGIN_CALL_LTV;
        document.getElementById('inflationRate').value = STANDARD_MODE_DEFAULTS.INFLATION_RATE;
        
        // Set payment type to standard but it will be hidden
        document.getElementById('paymentType').value = 'standard';
        
        // Set assetInputType to collateral
        document.getElementById('assetInputType').value = 'collateral';
        
        // Calculate loan amount from LTV and collateral
        updateLoanFromSlider();
        
        // Calculate min payment from budget
        updateStandardModeFromBudget();
    } else {
        // Show Custom Mode inputs (monthly budget shown in both modes now)
        document.getElementById('ltvSliderGroup').style.display = 'none';
        document.getElementById('loanAmountDisplay').style.display = 'none';
        document.getElementById('loanAmountInput').style.display = 'flex';
        document.getElementById('assetInputTypeGroup').style.display = 'flex';
        
        // Copy loan amount from standard display to custom input
        const currentLoanAmount = parseFloat(document.getElementById('loanAmount').value);
        document.getElementById('loanAmountCustom').value = currentLoanAmount;
        
        document.getElementById('minPayment').value = 0;
        
        // Update budget warning for custom mode
        updateBudgetWarningCustom();
    }

    updatePaymentType();
    syncMinPayment();
}

/**
 * Asset Input Type Toggle (Collateral $ vs LTV %)
 */
function toggleAssetInput() {
    const type = document.getElementById('assetInputType').value;
    const loanAmount = currentMode === 'standard' 
        ? parseFloat(document.getElementById('loanAmount').value)
        : parseFloat(document.getElementById('loanAmountCustom').value);
    
    // Update label and tooltip based on type
    if (type === 'ltv') {
        document.getElementById('assetLabel').innerText = 'Starting LTV (%)';
        document.getElementById('assetTooltip').innerText = `Loan-to-Value ratio: percentage of portfolio that is borrowed. ${STANDARD_MODE_DEFAULTS.MAX_LTV}% LTV on a $${(100000 / (STANDARD_MODE_DEFAULTS.MAX_LTV / 100)).toLocaleString()}K portfolio = $100K loan. Higher LTV increases margin call probability.`;
        document.getElementById('assetValue').value = STANDARD_MODE_DEFAULTS.MAX_LTV;
    } else {
        document.getElementById('assetLabel').innerText = 'Book Value of Collateral Account ($)';
        document.getElementById('assetTooltip').innerText = 'The book value of your deposits as reported by your broker. This is typically the original cost basis of deposits, not the current market value. Your broker will provide the difference between book and market value.';
        document.getElementById('assetValue').value = (loanAmount / (STANDARD_MODE_DEFAULTS.MAX_LTV / 100)).toFixed(0);
    }
}

/**
 * Sync Loan Amount Changes
 */
function syncLoanAmount() {
    const type = document.getElementById('assetInputType').value;
    const loanAmount = parseFloat(document.getElementById('loanAmountCustom').value);
    
    // Update the main loanAmount field from custom input
    document.getElementById('loanAmount').value = loanAmount;
    
    // If in collateral mode, update the cash value to maintain MAX_LTV
    if (type === 'collateral') {
        document.getElementById('assetValue').value = (loanAmount / (STANDARD_MODE_DEFAULTS.MAX_LTV / 100)).toFixed(0);
    }
    
    // Recalculate minimum payment
    syncMinPayment();
    
    // Update budget warning in custom mode
    updateBudgetWarningCustom();
}

/**
 * Sync loan amount from custom input to main field
 */
function syncLoanAmountFromCustom() {
    const customAmount = parseFloat(document.getElementById('loanAmountCustom').value);
    document.getElementById('loanAmount').value = customAmount;
}

/**
 * Update loan amount based on LTV slider (Standard Mode)
 */
function updateLoanFromSlider() {
    if (currentMode !== 'standard') return;
    
    const ltv = parseFloat(document.getElementById('ltvSlider').value);
    const collateral = parseFloat(document.getElementById('assetValue').value);
    const loanAmount = (collateral * ltv / 100).toFixed(0);
    
    document.getElementById('ltvDisplay').innerText = ltv;
    document.getElementById('loanAmount').value = loanAmount;
    
    // Update min payment based on new loan amount
    updateStandardModeFromBudget();
}

/**
 * Update loan amount when collateral changes (Standard Mode)
 */
function updateLoanFromCollateral() {
    if (currentMode !== 'standard') return;
    
    const ltv = parseFloat(document.getElementById('ltvSlider').value);
    const collateral = parseFloat(document.getElementById('assetValue').value);
    const loanAmount = (collateral * ltv / 100).toFixed(0);
    
    document.getElementById('loanAmount').value = loanAmount;
    
    // Update min payment based on new loan amount
    updateStandardModeFromBudget();
}

/**
 * Update min payment based on monthly budget (Standard Mode)
 */
function updateStandardModeFromBudget() {
    if (currentMode !== 'standard') return;
    
    const monthlyBudget = parseFloat(document.getElementById('monthlyBudget').value);
    const loan = parseFloat(document.getElementById('loanAmount').value);
    const annualRate = STANDARD_MODE_DEFAULTS.INTEREST_RATE / 100;
    const years = parseFloat(document.getElementById('loanPeriod').value);
    const months = years * 12;
    const mRate = annualRate / 12;
    
    // Calculate amortized payment
    const amortizedPayment = loan * (mRate * Math.pow(1 + mRate, months)) / (Math.pow(1 + mRate, months) - 1);
    
    // Recalculate min payment based on current payment type
    syncMinPayment();
    
    // Show budget warning if needed
    const warningDiv = document.getElementById('budgetWarning');
    const warningText = document.getElementById('budgetWarningText');
    
    if (amortizedPayment > monthlyBudget) {
        warningDiv.style.display = 'block';
        warningText.textContent = `Your monthly budget ($${monthlyBudget.toFixed(2)}) is less than the full amortization payment ($${amortizedPayment.toFixed(2)}). This means you cannot fully pay off the loan over ${years} years with your current budget.`;
    } else {
        warningDiv.style.display = 'none';
    }
}

/**
 * Update budget warning in Custom Mode
 */
function updateBudgetWarningCustom() {
    if (currentMode !== 'custom') return;
    
    const monthlyBudget = parseFloat(document.getElementById('monthlyBudget').value);
    const loan = parseFloat(document.getElementById('loanAmount').value);
    const annualRate = parseFloat(document.getElementById('interestRate').value) / 100;
    const years = parseFloat(document.getElementById('loanPeriod').value);
    const months = years * 12;
    const mRate = annualRate / 12;
    
    // Calculate amortized payment
    const amortizedPayment = loan * (mRate * Math.pow(1 + mRate, months)) / (Math.pow(1 + mRate, months) - 1);
    
    // Always show warning if amortized payment exceeds budget
    const warningDiv = document.getElementById('budgetWarning');
    const warningText = document.getElementById('budgetWarningText');
    
    if (amortizedPayment > monthlyBudget) {
        warningDiv.style.display = 'block';
        warningText.textContent = `Your monthly budget ($${monthlyBudget.toFixed(2)}) is less than the full amortization payment ($${amortizedPayment.toFixed(2)}). This means you cannot fully pay off the loan over ${years} years with your current budget.`;
    } else {
        warningDiv.style.display = 'none';
    }
}

/**
 * Handle interest rate changes and recalculate payments
 */
function handleInterestRateChange() {
    // Recalculate minimum payment based on payment type
    syncMinPayment();
    
    // Update budget warnings based on mode
    if (currentMode === 'standard') {
        updateStandardModeFromBudget();
    } else {
        updateBudgetWarningCustom();
    }
}

/**
 * Handle budget or period changes
 */
function handleBudgetOrPeriodChange() {
    if (currentMode === 'standard') {
        updateStandardModeFromBudget();
    } else {
        updateBudgetWarningCustom();
    }
}

/**
 * Sync Minimum Payment
 */
function syncMinPayment() {
    const paymentType = document.getElementById('paymentType').value;
    const loan = parseFloat(document.getElementById('loanAmount').value);
    const annualRate = parseFloat(document.getElementById('interestRate').value) / 100;
    const years = parseFloat(document.getElementById('loanPeriod').value);
    const months = years * 12;
    const mRate = annualRate / 12;
    const monthlyInterest = loan * (annualRate / 12);
    const amortizedPayment = loan * (mRate * Math.pow(1 + mRate, months)) / (Math.pow(1 + mRate, months) - 1);
    
    if (paymentType === 'interest') {
        document.getElementById('minPayment').value = monthlyInterest.toFixed(2);
    } else if (paymentType === 'standard') {
        const standardPayment = amortizedPayment * (STANDARD_MODE_DEFAULTS.PAYMENT_PERCENTAGE / 100);
        document.getElementById('minPayment').value = standardPayment.toFixed(2);
    }
}

/**
 * Update Payment Type
 */
function updatePaymentType() {
    const paymentType = document.getElementById('paymentType').value;
    const loan = parseFloat(document.getElementById('loanAmount').value);
    const annualRate = parseFloat(document.getElementById('interestRate').value) / 100;
    const years = parseFloat(document.getElementById('loanPeriod').value);
    const months = years * 12;
    const mRate = annualRate / 12;
    const monthlyInterest = loan * (annualRate / 12);
    const amortizedPayment = loan * (mRate * Math.pow(1 + mRate, months)) / (Math.pow(1 + mRate, months) - 1);
    
    if (paymentType === 'interest') {
        document.getElementById('minPayment').value = monthlyInterest.toFixed(2);
        document.getElementById('minPayment').disabled = true;
    } else if (paymentType === 'standard') {
        // Calculate PAYMENT_PERCENTAGE of amortized payment
        const standardPayment = amortizedPayment * (STANDARD_MODE_DEFAULTS.PAYMENT_PERCENTAGE / 100);
        document.getElementById('minPayment').value = standardPayment.toFixed(2);
        document.getElementById('minPayment').disabled = true;
    } else {
        // custom - default to 0
        if (currentMode !== 'standard') {
            document.getElementById('minPayment').value = 0;
        }
        document.getElementById('minPayment').disabled = false;
    }
}

/**
 * Generate random normal variable (Box-Muller transform)
 */
function randn_bm() {
    let u = 0, v = 0;
    while(u === 0) u = Math.random();
    while(v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}


/**
 * Main Simulation Function
 * Runs Monte Carlo simulations with inflation adjustment
 */
/**
 * Main Simulation Runner - Uses WebAssembly if available, falls back to JS
 */
async function runSimulation() {
    console.log('[Script] runSimulation() called');
    if (!validateInputs()) {
        console.error('[Script] Input validation failed');
        return;
    }

    try {
        console.log('[Script] Calling runSimulationWithAdapter()...');
        const results = await runSimulationWithAdapter();
        console.log('[Script] Results received from adapter:', results);
        
        if (!results) {
            console.error('[Script] No results returned from adapter');
            return null;
        }
        
        // Store results globally for slider interaction
        simulationResults = results;
        console.log('[Script] Results stored globally, strategies count:', results.strategies.length);
        
        // Display results (histogram and strategic report)
        console.log('[Script] Calling displayResults with full results object');
        displayResults(results);
        console.log('[Script] displayResults completed');
        
        return results;
    } catch (error) {
        console.error('[Script] Simulation error:', error);
        alert('Simulation failed: ' + error.message);
        return null;
    }
}

/**
 * Legacy JavaScript Implementation (Fallback)
 * Preserved for browsers without WebAssembly support
 */
function runSimulationLegacy() {
    if (!validateInputs()) {
        return;
    }

    const loan = parseFloat(document.getElementById('loanAmount').value);
    const assetInput = parseFloat(document.getElementById('assetValue').value);
    const assetType = document.getElementById('assetInputType').value;
    const years = parseFloat(document.getElementById('loanPeriod').value);
    const paymentTypeSelect = document.getElementById('paymentType').value;
    const monthlyBudget = parseFloat(document.getElementById('monthlyBudget').value);
    
    // Book value of collateral account (your equity)
    let collateralBookValue = assetType === 'ltv' ? (loan / (assetInput / 100)) : assetInput;
    // Total portfolio value = book value + borrowed amount (margin)
    let initialAssets = collateralBookValue + loan;
    // Your equity is just the book value
    let initialEquity = collateralBookValue;
    
    const annualRate = parseFloat(document.getElementById('interestRate').value) / 100;
    const g = parseFloat(document.getElementById('growth').value) / 100;
    const vol = parseFloat(document.getElementById('vol').value) / 100;
    const marginCallLTV = parseFloat(document.getElementById('marginCall').value) / 100;
    const inflationRate = parseFloat(document.getElementById('inflationRate').value) / 100;
    
    const months = years * 12;
    const mRate = annualRate / 12;
    const leveragedSimulations = UI_CONSTANTS.SIMULATION_COUNT;
    const benchmarkSimulations = UI_CONSTANTS.BASE_CASE_SIMULATIONS;

    const amortizedPayment = loan * (mRate * Math.pow(1 + mRate, months)) / (Math.pow(1 + mRate, months) - 1);
    const monthlyInterest = loan * mRate;
    
    // Determine minimum payment based on payment type selector
    let minRequired = parseFloat(document.getElementById('minPayment').value);
    let minPayment;
    
    if (paymentTypeSelect === 'interest') {
        minPayment = monthlyInterest;
    } else {
        // custom - use the value entered by user
        minPayment = minRequired;
    }
    
    let results = [];
    
    // Calculate the maximum payment strategy: use the full monthly budget
    const maxPayment = monthlyBudget;
    
    // Calculate the percentage that minimum payment represents of max payment
    const minPaymentPercent = (minPayment / maxPayment) * 100;
    const numSteps = UI_CONSTANTS.NUM_STRATEGIES;
    const stepSize = (100 - minPaymentPercent) / (numSteps - 1);
    
    // Calculate 11 payment strategies from minimum to maximum feasible payment (monthly budget)
    for(let i = 0; i < numSteps; i++) {
        const percentOfMax = minPaymentPercent + (i * stepSize);
        const k = percentOfMax / 100;
        const payment = k * maxPayment;
        const paymentPercent = percentOfMax;
        const surplus = monthlyBudget - payment;
        
        let survivedCount = 0;
        let finalWealths = [];
        let benchmarkWealths = [];

        // Track cash flows for each strategy
        const totalBudgeted = monthlyBudget * months;
        const totalDebtPayments = payment * months;
        const totalSurplusInvested = surplus * months;

        for (let s = 0; s < leveragedSimulations; s++) {
            let assets = initialAssets;
            let debt = loan;
            let ruined = false;
            let benchmarkAssets = initialEquity;

            for (let t = 0; t < months; t++) {
                const ret = Math.exp((g - 0.5 * vol * vol) * (1/12) + vol * Math.sqrt(1/12) * randn_bm());
                assets = (assets * ret) + surplus;
                benchmarkAssets = (benchmarkAssets * ret) + monthlyBudget;
                
                debt = (debt * (1 + mRate)) - payment;

                if (debt / assets > marginCallLTV) { 
                    ruined = true; 
                    break; 
                }
            }

            if (!ruined) {
                survivedCount++;
                const nominalWealth = assets - debt;
                
                // Convert to Real Dollars: RealWealth = NominalWealth / (1 + InflationRate)^Years
                const realWealth = nominalWealth / Math.pow(1 + inflationRate, years);
                
                finalWealths.push(realWealth);
            }

            if (s < benchmarkSimulations) {
                const nominalBenchmark = benchmarkAssets;
                const realBenchmark = nominalBenchmark / Math.pow(1 + inflationRate, years);
                benchmarkWealths.push(realBenchmark);
            }
        }

        for (let s = leveragedSimulations; s < benchmarkSimulations; s++) {
            let benchmarkAssets = initialEquity;

            for (let t = 0; t < months; t++) {
                const ret = Math.exp((g - 0.5 * vol * vol) * (1/12) + vol * Math.sqrt(1/12) * randn_bm());
                benchmarkAssets = (benchmarkAssets * ret) + monthlyBudget;
            }

            const nominalBenchmark = benchmarkAssets;
            const realBenchmark = nominalBenchmark / Math.pow(1 + inflationRate, years);
            benchmarkWealths.push(realBenchmark);
        }

        finalWealths.sort((a, b) => a - b);
        
        // Calculate percentiles in Real Dollars
        const medianWealth = finalWealths.length > 0 ? finalWealths[Math.floor(finalWealths.length * UI_CONSTANTS.WEALTH_PERCENTILES.median / 100)] : 0;
        const p90Wealth = finalWealths.length > 0 ? finalWealths[Math.floor(finalWealths.length * UI_CONSTANTS.WEALTH_PERCENTILES.high / 100)] : 0;

        benchmarkWealths.sort((a, b) => a - b);
        const benchmarkMedian = benchmarkWealths.length > 0 ? benchmarkWealths[Math.floor(benchmarkWealths.length * UI_CONSTANTS.WEALTH_PERCENTILES.median / 100)] : 0;
        const benchmarkExpected = benchmarkWealths.length > 0
            ? benchmarkWealths.reduce((sum, value) => sum + value, 0) / benchmarkWealths.length
            : 0;
        const benchmarkVariance = benchmarkWealths.length > 0
            ? benchmarkWealths.reduce((sum, value) => sum + Math.pow(value - benchmarkExpected, 2), 0) / benchmarkWealths.length
            : 0;
        const benchmarkSigma = Math.sqrt(benchmarkVariance);

        const expectedWealth = finalWealths.length > 0
            ? finalWealths.reduce((sum, value) => sum + value, 0) / finalWealths.length
            : 0;
        const benchmarkPercentDiff = benchmarkExpected > 0
            ? ((expectedWealth - benchmarkExpected) / benchmarkExpected) * 100
            : 0;
        
        results.push({
            paymentAmount: payment,
            surplusAmount: surplus,
            paymentPercent,
            survivalRate: (survivedCount / leveragedSimulations) * 100,
            medianWealth,
            p90Wealth,
            expectedWealth,
            benchmarkPercentDiff,
            amortizedPayment,
            finalWealthArray: finalWealths,
            benchmarkWealthArray: benchmarkWealths,
            benchmarkMedian,
            benchmarkExpected,
            benchmarkSigma,
            totalBudgeted,
            totalDebtPayments,
            totalInvested: totalSurplusInvested,
            totalInterestPaid: (totalDebtPayments - loan)
        });
    }

    // Find the strategy index closest to the amortized payment amount
    // Only consider leveraged strategies (0-9) for pill display
    let closestIndex = 0;
    let minDiff = Math.abs(results[0].paymentAmount - amortizedPayment);
    for (let i = 1; i < Math.min(10, results.length); i++) {
        const diff = Math.abs(results[i].paymentAmount - amortizedPayment);
        if (diff < minDiff) {
            minDiff = diff;
            closestIndex = i;
        }
    }
    amortizationStrategyIndex = closestIndex;

    const loanDetails = {
        loanAmount: loan,
        initialAssets: initialAssets,
        initialEquity: initialEquity,
        months: months,
        amortizedPayment: amortizedPayment,
        monthlyBudget: monthlyBudget,
        interestRate: annualRate,
        inflationRate: inflationRate,
        years: years
    };
    
    // Store results globally for slider interaction
    simulationResults = {
        strategies: results,
        loanDetails: loanDetails
    };
    
    displayResults(results, amortizedPayment, loanDetails);

    return simulationResults;
}

/**
 * Find Target Strategy Index based on Risk Target
 * Chooses the closest survival rate at or above the target,
 * or the max payment strategy if none are safe.
 * Only considers leveraged strategies (indices 0-9).
 */
function findTargetStrategyIndex(targetSurvival) {
    if (!simulationResults) return 0;
    
    const strategies = simulationResults.strategies;
    // Only consider leveraged strategies (0-9), not the baseline strategy (10)
    const leveragedStrategies = strategies.slice(0, 10);
    
    const safeStrategies = leveragedStrategies
        .map((strategy, index) => ({ strategy, index }))
        .filter(({ strategy }) => strategy.survivalRate >= targetSurvival);

    if (safeStrategies.length === 0) {
        // Return the most conservative leveraged strategy (index 9)
        return 9;
    }

    const closest = safeStrategies.reduce((best, current) => {
        const bestDiff = best.strategy.survivalRate - targetSurvival;
        const currentDiff = current.strategy.survivalRate - targetSurvival;
        return currentDiff < bestDiff ? current : best;
    });

    return closest.index;
}

/**
 * Calculate Trinary Outcome Statistics
 * Categorizes 100% of outcomes into: Ruin, Sucker, Profit
 * 
 * Ruin: Margin call (wealth = $0)
 * Profit: Survived AND final wealth > benchmark median
 * Sucker: Survived BUT final wealth < benchmark median
 */
function calculateTrinaryStats(strategyIndex) {
    if (!simulationResults) return null;
    
    const strategy = simulationResults.strategies[strategyIndex];
    const leveragedWealths = strategy.finalWealthArray;
    const benchmarkMedian = strategy.benchmarkMedian;
    
    const totalSimulations = UI_CONSTANTS.SIMULATION_COUNT;
    const survivors = leveragedWealths.length;
    const ruined = totalSimulations - survivors;
    
    // RUIN: Any simulation that hit a margin call
    const ruinPercent = (ruined / totalSimulations) * 100;
    
    // Among survivors, categorize by benchmark comparison
    const profitSurvivors = leveragedWealths.filter(w => w > benchmarkMedian).length;
    const suckerSurvivors = survivors - profitSurvivors;
    
    // PROFIT: Survived AND outperformed benchmark
    const profitPercent = (profitSurvivors / totalSimulations) * 100;
    
    // SUCKER: Survived BUT underperformed benchmark
    const suckerPercent = (suckerSurvivors / totalSimulations) * 100;
    
    // Verify: Ruin % + Sucker % + Profit % = 100%
    const total = ruinPercent + suckerPercent + profitPercent;
    
    return {
        ruinPercent: Math.max(0, ruinPercent),
        suckerPercent: Math.max(0, suckerPercent),
        profitPercent: Math.max(0, profitPercent),
        ruinCount: ruined,
        profitCount: profitSurvivors,
        suckerCount: suckerSurvivors,
        totalSims: totalSimulations,
        calculationTotal: total  // Should equal 100 (for verification)
    };
}

/**
 * Generate Verdict Based on Trinary Outcomes (Ruin/Sucker/Profit)
 * 
 * Professional Trading Standards - Status Logic:
 * - Red Status (DANGEROUS): Ruin > 5%
 * - Orange Status (POINTLESS): Profit % - Sucker % < 10% (and Ruin <= 5%)
 * - Grey Status (MARGINAL): 10% <= Spread < 20% (positive edge but risky, likely underperforming years)
 * - Green Status (STRONG): Spread >= 20% AND Ruin < 2% (drift is statistically powerful)
 */
function generateVerdict(trinaryStats) {
    if (!trinaryStats) return null;
    
    const { ruinPercent, suckerPercent, profitPercent } = trinaryStats;
    const spreadPercent = profitPercent - suckerPercent;
    
    // Professional thresholds
    const POINTLESS_CEILING = 10.0;    // Below 10% spread = garbage
    const STRONG_FLOOR = 20.0;         // 20%+ spread = statistically powerful
    
    const isDangerous = ruinPercent > 5.0;
    const isPointless = spreadPercent < POINTLESS_CEILING && !isDangerous;
    const isStrong = spreadPercent >= STRONG_FLOOR && ruinPercent < 2.0;
    const isMarginal = spreadPercent >= POINTLESS_CEILING && spreadPercent < STRONG_FLOOR && !isDangerous;
    
    let status = null;
    let color = null;
    let icon = null;
    let title = null;
    let message = null;
    let fixSuggestion = null;
    
    if (isDangerous) {
        // RED: Ruin > 5% - Too much risk of total loss
        status = 'DANGEROUS';
        color = '#B3261E';
        icon = '⛔';
        title = 'DANGEROUS: UNACCEPTABLE RUIN RISK';
        message = `You have a <strong>${ruinPercent.toFixed(1)}%</strong> chance of forced liquidation (margin call = total loss). This exceeds acceptable risk tolerance. Reduce borrowed principal or increase monthly payment significantly.`;
        fixSuggestion = generateDiagnosticFix('dangerous', trinaryStats);
    } else if (isPointless) {
        // ORANGE: Spread < 10% - Below minimum viability
        status = 'POINTLESS';
        color = '#FF9800';
        icon = '⚠️';
        title = 'POINTLESS: ODDS UNFAVORABLE';
        message = `The probability of outperforming a standard no-debt investment is <strong>${profitPercent.toFixed(1)}%</strong>. Underperformance probability is <strong>${(suckerPercent + ruinPercent).toFixed(1)}%</strong> combined (liquidation or negative spread). The borrowing cost exceeds the investment return advantage.`;
        fixSuggestion = generateDiagnosticFix('pointless', trinaryStats);
    } else if (isMarginal) {
        // GREY: 10% <= Spread < 20% - Positive expectancy but risky
        status = 'MARGINAL';
        color = '#AFAFAF';
        icon = '🤔';
        title = 'MARGINAL: LOW EDGE WITH RUIN RISK';
        message = `Spread advantage: <strong>${spreadPercent.toFixed(1)}%</strong> per year. Profit probability: <strong>${profitPercent.toFixed(1)}%</strong>. Underperformance probability: <strong>${suckerPercent.toFixed(1)}%</strong>. Liquidation probability: <strong>${ruinPercent.toFixed(1)}%</strong>. The spread advantage exists but is below industry-standard thresholds (>20%) for confidence. Expect portfolio volatility during downturns.`;
        fixSuggestion = generateDiagnosticFix('marginal', trinaryStats);
    } else if (isStrong) {
        // GREEN: Spread >= 20% AND Ruin < 2% - Statistically powerful edge
        status = 'STRONG';
        color = '#1B5E20';
        icon = '✅';
        title = 'STRONG: FAVORABLE RISK-REWARD RATIO';
        message = `Spread advantage: <strong>${spreadPercent.toFixed(1)}%</strong> per year. Profit probability: <strong>${profitPercent.toFixed(1)}%</strong>. Liquidation risk: <strong>${ruinPercent.toFixed(1)}%</strong>. The spread is sufficient to meet industry standards (>20%) with liquidation risk contained below 2%. The strategy has mathematical justification relative to risk.`;
        fixSuggestion = null;  // No fix needed for strong strategies
    } else {
        // Fallback (should not reach here)
        status = 'MARGINAL';
        color = '#AFAFAF';
        icon = '🤔';
        title = 'MARGINAL: INSUFFICIENT DATA';
        message = `Spread: <strong>${spreadPercent.toFixed(1)}%</strong>. Ruin probability: <strong>${ruinPercent.toFixed(1)}%</strong>. Classification: marginal strategy with limited advantage.`;
        fixSuggestion = generateDiagnosticFix('marginal', trinaryStats);
    }
    
    return {
        status,
        color,
        icon,
        title,
        message,
        ruinPercent,
        suckerPercent,
        profitPercent,
        spread: spreadPercent,
        fixSuggestion
    };
}

/**
 * Generate Diagnostic Fix Suggestions Based on Outcome Category
 * Provides actionable advice on how to improve the strategy
 */
function generateDiagnosticFix(category, trinaryStats) {
    const { ruinPercent, suckerPercent, profitPercent } = trinaryStats;
    
    let fixes = [];
    
    if (category === 'dangerous') {
        // DANGEROUS: Ruin > 5% - Portfolio cannot survive a standard market crash
        fixes.push("<strong>Reduce your Loan Amount.</strong> Your borrowed capital is too large relative to your safety buffer. Avoid borrowing more than a third of your portfolio's value.");
        fixes.push("<strong>Add More Collateral.</strong> Deposit additional cash into your account without borrowing more. This strengthens your cushion against margin calls.");
        fixes.push("<strong>Increase Monthly Payment.</strong> Pay down the loan faster before a crash occurs. The longer you stay leveraged, the higher your ruin risk.");
    } else if (category === 'pointless') {
        // POINTLESS: Spread < 10% - Interest drag equals market drift; no compensation for risk
        fixes.push("<strong>Check Your Interest Rate.</strong> If you're paying more than 7-8% annual interest, leverage rarely works mathematically. Consider switching to a lower-cost loan or margin product.");
        fixes.push("<strong>Increase Your Monthly Budget.</strong> Pay down the principal faster. Leverage works best when your debt is a shrinking percentage of your assets.");
        fixes.push("<strong>Extend Your Time Horizon.</strong> If your simulation is under 10 years, short-term volatility is drowning out long-term gains. Leverage needs time to compound.");
    } else if (category === 'marginal') {
        // MARGINAL: 10% <= Spread < 20% - Positive expectancy, but low reward-to-risk ratio
        fixes.push("<strong>Lower Your LTV by 5%.</strong> Often, a small reduction in borrowed capital significantly increases your spread by reducing interest costs and ruin risk together.");
        fixes.push("<strong>Invest Your Monthly Surplus.</strong> Ensure the money you don't use for debt payments goes into growth assets (stocks/ETFs), not cash. If you're holding cash, you're wasting the leverage benefit.");
        fixes.push("<strong>Test Interest Rate Risk.</strong> Try to increase your interest rate by 1%. If this strategy becomes \"Pointless,\" it's too fragile. You need more cushion.");
    }
    
    return fixes.length > 0 ? fixes : null;
}

/**
 * Render Histogram for a Specific Strategy
 * Uses "0 to Mean + 1 Sigma" filtering for performance and ethical display
 */
function renderHistogram(strategyIndex) {
    console.log('[Histogram] renderHistogram called with index:', strategyIndex);
    console.log('[Histogram] simulationResults:', simulationResults);
    
    if (!simulationResults) {
        console.error('[Histogram] No simulationResults available');
        return;
    }
    
    console.log('[Histogram] Number of strategies:', simulationResults.strategies?.length);
    const strategy = simulationResults.strategies[strategyIndex];
    console.log('[Histogram] Selected strategy:', strategy);
    
    const wealthData = strategy.finalWealthArray;
    const benchmarkData = strategy.benchmarkWealthArray;
    
    console.log('[Histogram] Wealth data length:', wealthData?.length);
    console.log('[Histogram] Benchmark data length:', benchmarkData?.length);
    
    if (wealthData.length === 0 || benchmarkData.length === 0) {
        console.warn('[Histogram] Empty data arrays - no simulations survived');
        document.getElementById('histogramChart').innerHTML = '<p style="text-align:center;color:var(--md-error);">No data available - all simulations resulted in margin calls.</p>';
        return;
    }
    
    // ========================================
    // 1.0 STATISTICAL CALCULATION (Pre-Processing)
    // ========================================
    
    // 1.1 Extract Combined Dataset
    const allOutcomes = [...wealthData, ...benchmarkData];
    
    // 1.2 Define Cutoff Boundaries
    const chartMin = 0;  // Hard constraint: show all downside
    
    // 1.3 Find chartMax by filtering out bins with < 0.3% probability
    // Create initial bins to find max value that meets threshold
    const numBins = UI_CONSTANTS.HISTOGRAM_BINS;
    const tempMax = Math.max(...allOutcomes);
    const tempBinSize = tempMax / numBins;
    
    let tempBins = new Array(numBins).fill(0);
    allOutcomes.forEach(w => {
        const binIndex = Math.min(Math.floor(w / tempBinSize), numBins - 1);
        tempBins[binIndex]++;
    });
    
    // Find highest bin with at least 0.3% probability
    const threshold = allOutcomes.length * 0.003; // 0.3% threshold
    let maxBinIndex = numBins - 1;
    for (let i = numBins - 1; i >= 0; i--) {
        if (tempBins[i] >= threshold) {
            maxBinIndex = i;
            break;
        }
    }
    
    const chartMax = (maxBinIndex + 1) * tempBinSize;
    
    // ========================================
    // 2.0 DATA FILTERING
    // ========================================
    
    // 2.1 Filter Datasets (keep only outcomes visible on chart)
    const visibleWealthData = wealthData.filter(w => w >= chartMin && w <= chartMax);
    const visibleBenchmarkData = benchmarkData.filter(w => w >= chartMin && w <= chartMax);
    
    // ========================================
    // 3.0 DYNAMIC BINNING (The Performance Fix)
    // ========================================
    
    // 3.1 Calculate Dynamic Bin Size (reusing numBins from above)
    const binSize = chartMax / numBins;
    
    // 3.2 Generate Histogram Bins
    let binsLeveraged = new Array(numBins).fill(0);
    visibleWealthData.forEach(w => {
        const binIndex = Math.min(Math.floor(w / binSize), numBins - 1);
        binsLeveraged[binIndex]++;
    });

    let binsBenchmark = new Array(numBins).fill(0);
    visibleBenchmarkData.forEach(w => {
        const binIndex = Math.min(Math.floor(w / binSize), numBins - 1);
        binsBenchmark[binIndex]++;
    });

    // Convert to probabilities (%)
    const totalLeveraged = wealthData.length;  // Use ORIGINAL count for probability
    const totalBenchmark = benchmarkData.length;
    const leveragedProb = binsLeveraged.map(count => (count / totalLeveraged) * 100);
    const benchmarkProb = binsBenchmark.map(count => (count / totalBenchmark) * 100);

    // Create x-axis labels
    const xLabels = leveragedProb.map((_, i) => i * binSize);

    // Sort data to extract percentiles accurately (from ORIGINAL data)
    const sortedWealth = [...wealthData].sort((a, b) => a - b);
    const total = sortedWealth.length;

    // Extract Real-World Percentiles
    const p50 = sortedWealth[Math.floor(total * 0.50)]; // Leveraged Median
    
    // ========================================
    // 4.0 RENDER & CLEANUP
    // ========================================
    
    // 4.1 Calculate benchmark median for performance comparison
    const benchmarkMedianWealth = strategy.benchmarkMedian;
    
    // 4.2 Create separate arrays for ruin, underperformed, and overperformed outcomes
    const ruinProb = [];
    const underperformedProb = [];
    const overperformedProb = [];
    
    xLabels.forEach((x, i) => {
        if (x === 0) {
            // Ruin outcomes (margin call)
            ruinProb.push(leveragedProb[i]);
            underperformedProb.push(0);
            overperformedProb.push(0);
        } else if (x < benchmarkMedianWealth) {
            // Underperformed vs benchmark
            ruinProb.push(0);
            underperformedProb.push(leveragedProb[i]);
            overperformedProb.push(0);
        } else {
            // Overperformed vs benchmark
            ruinProb.push(0);
            underperformedProb.push(0);
            overperformedProb.push(leveragedProb[i]);
        }
    });
    
    // 4.3 Create histogram traces with color-coded performance zones
    const ruinTrace = {
        x: xLabels,
        y: ruinProb,
        type: 'bar',
        name: 'Ruin (Margin Call)',
        marker: {
            color: UI_CONSTANTS.HISTOGRAM_COLORS.ruin,
            opacity: UI_CONSTANTS.HISTOGRAM_COLORS.ruinOpacity,
            line: {
                color: UI_CONSTANTS.HISTOGRAM_COLORS.ruin,
                width: 2
            }
        },
        width: binSize * 1.5  // Make ruin bar wider for visibility
    };
    
    const underperformedTrace = {
        x: xLabels,
        y: underperformedProb,
        type: 'bar',
        name: 'Underperformed Benchmark',
        marker: {
            color: UI_CONSTANTS.HISTOGRAM_COLORS.underperformed,
            opacity: UI_CONSTANTS.HISTOGRAM_COLORS.performanceOpacity,
            line: {
                color: UI_CONSTANTS.HISTOGRAM_COLORS.underperformed,
                width: 1
            }
        }
    };
    
    const overperformedTrace = {
        x: xLabels,
        y: overperformedProb,
        type: 'bar',
        name: 'Outperformed Benchmark',
        marker: {
            color: UI_CONSTANTS.HISTOGRAM_COLORS.overperformed,
            opacity: UI_CONSTANTS.HISTOGRAM_COLORS.performanceOpacity,
            line: {
                color: UI_CONSTANTS.HISTOGRAM_COLORS.overperformed,
                width: 1
            }
        }
    };

    const benchmarkTrace = {
        x: xLabels,
        y: benchmarkProb,
        type: 'bar',
        name: 'No-Leverage Baseline',
        marker: {
            color: UI_CONSTANTS.HISTOGRAM_COLORS.benchmark,
            line: {
                color: 'rgba(0, 0, 0, 0.8)',
                width: 1
            }
        }
    };
    
    // Calculate percentage of outcomes filtered out for transparency
    const filteredLeveraged = wealthData.length - visibleWealthData.length;
    const filteredBenchmark = benchmarkData.length - visibleBenchmarkData.length;
    const filteredPctLeveraged = (filteredLeveraged / wealthData.length) * 100;
    const filteredPctBenchmark = (filteredBenchmark / benchmarkData.length) * 100;
    
    // Create layout with THREE LINES visualization (Ruin/Benchmark/Strategy)
    const layout = {
        title: `Wealth Distribution (Strategy ${strategyIndex + 1})`,
        xaxis: {
            title: 'Final Real Wealth (Today\'s Purchasing Power)',
            tickformat: '$,.0f',
            range: [0, chartMax]  // Enforce the view
        },
        yaxis: {
            title: 'Probability (%)',
            ticksuffix: '%'
        },
        barmode: 'overlay',
        annotations: [],
        margin: { t: 80, b: 80, l: 70, r: 30 },
        autosize: true,
        plot_bgcolor: '#f9f9f9',
        paper_bgcolor: '#ffffff'
    };
    
    // Add subtitle showing filtered percentage if significant
    if (filteredPctLeveraged > 1 || filteredPctBenchmark > 1) {
        layout.annotations.push({
            x: 0.5,
            xref: 'paper',
            y: 1.08,
            yref: 'paper',
            text: `Outcomes below 0.3% probability filtered from chart. Extreme winners (${filteredPctLeveraged.toFixed(1)}% leveraged, ${filteredPctBenchmark.toFixed(1)}% baseline) included in statistics.`,
            showarrow: false,
            xanchor: 'center',
            font: {
                size: 10,
                color: '#666'
            }
        });
    }
    
    // Plotly config for responsive full-width display
    const config = {
        responsive: true,
        displayModeBar: true,
        displaylogo: false
    };
    
    // Render with all traces: benchmark, ruin, underperformed, overperformed
    return Plotly.newPlot('histogramChart', [benchmarkTrace, ruinTrace, underperformedTrace, overperformedTrace], layout, config);
}

/**
 * Update Dynamic Summary for a Specific Strategy
 */
function updateSummary(strategyIndex) {
    if (!simulationResults) return;
    
    const strategy = simulationResults.strategies[strategyIndex];
    const loanDetails = simulationResults.loanDetails;
    
    // Calculate trinary statistics (Ruin/Sucker/Profit)
    const trinaryStats = calculateTrinaryStats(strategyIndex);
    const verdict = generateVerdict(trinaryStats);
    
    const summaryBox = document.getElementById('dynamicSummary');
    const monthlyBudget = loanDetails.monthlyBudget;
    const amortizedPayment = loanDetails.amortizedPayment;
    const debtPayment = strategy.paymentAmount;
    const marketInvestment = strategy.surplusAmount;
    const medianRealWealth = strategy.medianWealth;
    const survivalRate = strategy.survivalRate;
    const benchmarkMedian = strategy.benchmarkMedian;
    const delta = medianRealWealth - benchmarkMedian;
    const deltaPrefix = delta >= 0 ? '+' : '-';

    // Build the summary HTML with verdict
    let summaryHTML = `

        
        <!-- VERDICT CONTAINER (Traffic Light) -->
        <div style="background: ${verdict.color}; border: 3px solid ${verdict.color}; border-radius: 8px; padding: 20px; margin: 20px 0; color: white;">
            <h3 style="margin-top: 0; color: white;">${verdict.icon} ${verdict.title}</h3>
            <p>${verdict.message}</p>
        </div>
        
        <!-- OUTCOME ZONES GRID -->
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 20px;">
            <div style="background: #ffebee; border-left: 4px solid #B3261E; padding: 16px; border-radius: 4px; text-align: center;">
                <div style="font-size: 28px; font-weight: bold; color: #B3261E;">${trinaryStats.ruinPercent.toFixed(1)}%</div>
                <div style="font-size: 0.9rem; color: #666; font-weight: 600;">RUIN</div>
                <div style="font-size: 0.75rem; color: #999;">Margin Call</div>
            </div>
            <div style="background: #fff3e0; border-left: 4px solid #FF9800; padding: 16px; border-radius: 4px; text-align: center;">
                <div style="font-size: 28px; font-weight: bold; color: #FF9800;">${trinaryStats.suckerPercent.toFixed(1)}%</div>
                <div style="font-size: 0.9rem; color: #666; font-weight: 600;">SUCKER</div>
                <div style="font-size: 0.75rem; color: #999;">Underperform</div>
            </div>
            <div style="background: #e8f5e9; border-left: 4px solid #1B5E20; padding: 16px; border-radius: 4px; text-align: center;">
                <div style="font-size: 28px; font-weight: bold; color: #1B5E20;">${trinaryStats.profitPercent.toFixed(1)}%</div>
                <div style="font-size: 0.9rem; color: #666; font-weight: 600;">PROFIT</div>
                <div style="font-size: 0.75rem; color: #999;">Outperform</div>
            </div>
        </div>

                <p>You have a monthly budget of <strong>$${monthlyBudget.toLocaleString(undefined, {maximumFractionDigits: 0})}</strong> for debt payments and investments.</p>
        <p>With this strategy, you pay <strong>$${debtPayment.toLocaleString(undefined, {maximumFractionDigits: 0})}</strong> to the lender and invest the remaining <strong>$${marketInvestment.toLocaleString(undefined, {maximumFractionDigits: 0})}</strong> into a low-cost S&P 500 ETF.</p>
        <p>This allocation results in a <strong>${survivalRate.toFixed(1)}%</strong> probability of survival. In the expected case, your Real Wealth (in today's purchasing power) is <strong>$${medianRealWealth.toLocaleString(undefined, {maximumFractionDigits: 0})}</strong>.</p>
        <p><strong>Baseline Comparison:</strong> If you simply invested your <strong>$${monthlyBudget.toLocaleString(undefined, {maximumFractionDigits: 0})}</strong> monthly budget into the S&P 500 without borrowing, you would likely end up with <strong>$${benchmarkMedian.toLocaleString(undefined, {maximumFractionDigits: 0})}</strong>.</p>
        <p><strong>Leverage Impact: ${deltaPrefix}$${Math.abs(delta).toLocaleString(undefined, {maximumFractionDigits: 0})}</strong></p>
        
        <hr style="margin-top: 20px; margin-bottom: 20px; border: none; border-top: 1px solid #E0E0E0;">
        
        <!-- IMPLEMENTATION SUMMARY TABLE -->
        <div style="margin-top: 24px; background: #F5F5F5; padding: 16px; border-radius: 4px; border-left: 4px solid #6200EE;">
            <h4 style="margin-top: 0; color: #212121;">Strategy Success Criteria</h4>
            <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
                <thead>
                    <tr style="background: #EEEEEE;">
                        <th style="padding: 10px; text-align: left; border-bottom: 2px solid #BDBDBD;">Outcome</th>
                        <th style="padding: 10px; text-align: center; border-bottom: 2px solid #BDBDBD;">Target Goal</th>
                        <th style="padding: 10px; text-align: center; border-bottom: 2px solid #BDBDBD;">Your Current</th>
                        <th style="padding: 10px; text-align: center; border-bottom: 2px solid #BDBDBD;">Status</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td style="padding: 10px; border-bottom: 1px solid #E0E0E0;"><strong style="color: #B3261E;">Ruin</strong></td>
                        <td style="padding: 10px; text-align: center; border-bottom: 1px solid #E0E0E0;">&le; 2%</td>
                        <td style="padding: 10px; text-align: center; border-bottom: 1px solid #E0E0E0;">${trinaryStats.ruinPercent.toFixed(1)}%</td>
                        <td style="padding: 10px; text-align: center; border-bottom: 1px solid #E0E0E0;">
                            <span style="font-weight: 600; color: ${trinaryStats.ruinPercent < 2 ? '#1B5E20' : '#B3261E'};">
                                ${trinaryStats.ruinPercent < 2 ? '✓ SAFE' : '✗ HIGH RISK'}
                            </span>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border-bottom: 1px solid #E0E0E0;"><strong style="color: #FF9800;">Sucker</strong></td>
                        <td style="padding: 10px; text-align: center; border-bottom: 1px solid #E0E0E0;">Lower is Better</td>
                        <td style="padding: 10px; text-align: center; border-bottom: 1px solid #E0E0E0;">${trinaryStats.suckerPercent.toFixed(1)}%</td>
                        <td style="padding: 10px; text-align: center; border-bottom: 1px solid #E0E0E0;">
                            <span style="font-weight: 600; color: ${trinaryStats.suckerPercent < trinaryStats.profitPercent ? '#1B5E20' : '#FF9800'};">
                                ${trinaryStats.suckerPercent < trinaryStats.profitPercent ? '✓ OK' : '✗ LIKELY'}
                            </span>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 10px;"><strong style="color: #1B5E20;">Profit</strong></td>
                        <td style="padding: 10px; text-align: center;">&ge; 20% Spread*</td>
                        <td style="padding: 10px; text-align: center;">${trinaryStats.profitPercent.toFixed(1)}%</td>
                        <td style="padding: 10px; text-align: center;">
                            <span style="font-weight: 600; color: ${verdict.spread > 20 && trinaryStats.ruinPercent < 2 ? '#1B5E20' : '#FF9800'};">
                                ${verdict.spread > 20 && trinaryStats.ruinPercent < 2 ? '✓ STRONG' : 'REVIEW'}
                            </span>
                        </td>
                    </tr>
                </tbody>
            </table>
            <p style="font-size: 0.75rem; color: #999; margin-top: 10px; margin-bottom: 0;">
                *Spread = Profit % minus Sucker %. A 51/49 split is a coin flip; a 60/40 split is a strategy.
            </p>
        </div>
    `;
    
    // Add diagnostic fix suggestions if available
    if (verdict.fixSuggestion && verdict.fixSuggestion.length > 0) {
        const fixListHTML = verdict.fixSuggestion.map(fix => `<li style="margin: 8px 0; line-height: 1.5;">${fix}</li>`).join('');
        summaryHTML += `
        <div style="margin-top: 24px; background: #FFF8E1; border-left: 4px solid #FF9800; padding: 16px; border-radius: 4px;">
            <h4 style="margin-top: 0; color: #F57F17;">How to Fix Your Strategy</h4>
            <ul style="margin: 12px 0; padding-left: 20px;">
                ${fixListHTML}
            </ul>
        </div>
        `;
    }
    
    summaryBox.innerHTML = summaryHTML;
}

/**
 * Display Results and Initialize Interactive Elements
 * @param {Object} results - Full results object from adapter {strategies, loanDetails, benchmark}
 */
function displayResults(results) {
    console.log('[DisplayResults] Called with results:', results);
    
    const data = results.strategies;
    const loanDetails = results.loanDetails;
    const amortizedPayment = loanDetails.amortizedPayment;
    
    // Calculate amortization details
    const totalPayments = amortizedPayment * loanDetails.months;
    const totalInterest = totalPayments - loanDetails.loanAmount;
    const presentValue = loanDetails.loanAmount;
    
    // Find strategies with target survival rate
    const safeStrategies = data.filter(d => d.survivalRate >= riskTarget);
    const summary = document.getElementById('summary');
    const targetIndex = findTargetStrategyIndex(riskTarget);
    const targetStrategy = data[targetIndex];

    if (safeStrategies.length > 0) {
        summary.innerHTML = `
            <div style="margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #E0E0E0;">
                <strong>Analysis Parameters</strong><br>
                <span style="font-size: 0.95rem; color: #757575;">Monthly Budget (Baseline): <strong>$${loanDetails.monthlyBudget.toLocaleString(undefined, {maximumFractionDigits: 0})}</strong></span><br>
                <span style="font-size: 0.95rem; color: #757575;">Loan Amount: <strong>$${presentValue.toLocaleString(undefined, {maximumFractionDigits: 0})}</strong></span><br>
                <span style="font-size: 0.95rem; color: #757575;">Inflation Rate: <strong>${(loanDetails.inflationRate * 100).toFixed(1)}%</strong> (All wealth values in today's dollars)</span><br><br>
                <span style="font-size: 0.85rem; color: #999;"><em>Reference: Full Amortization Payment = $${amortizedPayment.toLocaleString(undefined, {maximumFractionDigits: 0})}/month (would pay off loan completely over ${loanDetails.years} years with $${totalInterest.toLocaleString(undefined, {maximumFractionDigits: 0})} total interest)</em></span>
            </div>
            <strong>Default Strategy Selection (Risk-Based):</strong><br><br>
            Your risk profile targets <strong>${riskTarget}% survival</strong>. The slider starts at the closest strategy that meets or exceeds this target.<br><br>
            Selected Strategy: <strong>$${targetStrategy.paymentAmount.toLocaleString(undefined, {maximumFractionDigits: 0})}</strong> per month
            with <strong>${targetStrategy.survivalRate.toFixed(1)}%</strong> survival.<br><br>
            <em style="font-size: 0.9rem;">Use the slider below to explore different payment strategies from minimum required to your full monthly budget.</em>
        `;
    } else {
        summary.innerHTML = `
            <div style="margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #E0E0E0;">
                <strong>Analysis Parameters</strong><br>
                <span style="font-size: 0.95rem; color: #757575;">Monthly Budget (Baseline): <strong>$${loanDetails.monthlyBudget.toLocaleString(undefined, {maximumFractionDigits: 0})}</strong></span><br>
                <span style="font-size: 0.95rem; color: #757575;">Loan Amount: <strong>$${presentValue.toLocaleString(undefined, {maximumFractionDigits: 0})}</strong></span><br>
                <span style="font-size: 0.95rem; color: #757575;">Inflation Rate: <strong>${(loanDetails.inflationRate * 100).toFixed(1)}%</strong> (All wealth values in today's dollars)</span><br><br>
                <span style="font-size: 0.85rem; color: #999;"><em>Reference: Full Amortization Payment = $${amortizedPayment.toLocaleString(undefined, {maximumFractionDigits: 0})}/month (would pay off loan completely over ${loanDetails.years} years with $${totalInterest.toLocaleString(undefined, {maximumFractionDigits: 0})} total interest)</em></span>
            </div>
            <strong>⚠️ High Risk:</strong> No strategies meet the ${riskTarget}% survival target. The slider starts at the maximum payment strategy to maximize safety.
        `;
    }


    // Find target strategy index based on risk target
    const slider = document.getElementById('strategySlider');
    slider.value = targetIndex;

    updateSliderPills(targetIndex);
    updateSummary(targetIndex);
    
    // Show results div FIRST so Plotly can calculate proper dimensions
    document.getElementById('results').style.display = 'block';
    
    // Then render histogram with proper sizing
    console.log('[DisplayResults] Rendering histogram for strategy index:', targetIndex);
    renderHistogram(targetIndex);
}

/**
 * Handle Slider Input Event
 */
function handleSliderChange(event) {
    const strategyIndex = parseInt(event.target.value);
    updateSliderPills(strategyIndex);
    renderHistogram(strategyIndex);
    updateSummary(strategyIndex);
}

/**
 * Handle Calculate button with loading state
 */
async function handleCalculate() {
    const button = document.getElementById('calculateBtn');
    if (!button) {
        await runSimulation();
        return;
    }

    button.disabled = true;
    button.classList.add('loading');
    button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Calculating...';

    // Use setTimeout to allow the UI to update with the loading state
    setTimeout(async () => {
        try {
            await runSimulation();
        } finally {
            button.innerHTML = 'Calculate';
            button.classList.remove('loading');
            button.disabled = false;
        }
    }, 0);
}

/**
 * Update Slider Pill States and Percentages
 */
function updateSliderPills(activeIndex) {
    if (!simulationResults) return;
    
    const amortizedPayment = simulationResults.loanDetails.amortizedPayment;
    const monthlyBudget = simulationResults.loanDetails.monthlyBudget;
    const selectedStrategy = simulationResults.strategies[activeIndex];
    
    if (!selectedStrategy) return;
    
    // Update payment reference information
    const selectedPaymentAmountSpan = document.getElementById('selectedPaymentAmount');
    const paymentPercentAmortizationSpan = document.getElementById('paymentPercentAmortization');
    const paymentPercentBudgetSpan = document.getElementById('paymentPercentBudget');
    
    if (selectedPaymentAmountSpan && paymentPercentAmortizationSpan && paymentPercentBudgetSpan) {
        selectedPaymentAmountSpan.textContent = `$${Math.round(selectedStrategy.paymentAmount).toLocaleString()}`;
        
        const percentOfAmortization = (selectedStrategy.paymentAmount / amortizedPayment) * 100;
        const percentOfBudget = (selectedStrategy.paymentAmount / monthlyBudget) * 100;
        
        paymentPercentAmortizationSpan.textContent = Math.round(percentOfAmortization);
        paymentPercentBudgetSpan.textContent = Math.round(percentOfBudget);
    }
}

/**
 * Input Validation
 */
function validateInputs() {
    const inputs = ['loanAmount', 'loanPeriod', 'assetValue', 'minPayment', 'monthlyBudget', 'interestRate', 'growth', 'vol', 'marginCall', 'inflationRate'];
    
    for (const id of inputs) {
        const element = document.getElementById(id);
        if (element && !element.disabled) {
            const value = parseFloat(element.value);
            if (isNaN(value) || value < 0) {
                const label = element.closest('.input-group')?.querySelector('label');
                const labelText = label ? label.textContent : id;
                alert(`Please enter a valid non-negative number for ${labelText}`);
                return false;
            }
        }
    }
    
    return true;
}

/**
 * Initialize Application
 */
document.addEventListener('DOMContentLoaded', () => {
    // Initialize input values from config
    document.getElementById('loanPeriod').value = DEFAULT_INPUTS.LOAN_PERIOD;
    document.getElementById('monthlyBudget').value = DEFAULT_INPUTS.MONTHLY_BUDGET;
    document.getElementById('assetValue').value = DEFAULT_INPUTS.COLLATERAL_VALUE;
    document.getElementById('ltvSlider').value = DEFAULT_INPUTS.STARTING_LTV;
    document.getElementById('ltvDisplay').innerText = DEFAULT_INPUTS.STARTING_LTV;
    
    // Set initial mode to standard
    setMode('standard');
    
    // Attach slider event listener
    const slider = document.getElementById('strategySlider');
    if (slider) {
        slider.addEventListener('input', handleSliderChange);
    }
});
