/**
 * Copywriting Helpers - Dynamic Text Generation
 * Generates all copywriting text dynamically from config values
 */

/**
 * Get config value formatters and text generators
 */
const CopywritingHelpers = {
    /**
     * Format percentage for display
     */
    formatPercent(value) {
        return `${value}%`;
    },

    /**
     * Get interest rate description
     */
    getInterestRateText() {
        return `${STANDARD_MODE_DEFAULTS.INTEREST_RATE}%`;
    },

    /**
     * Get growth rate text
     */
    getGrowthRateText() {
        return `${STANDARD_MODE_DEFAULTS.GROWTH_RATE}%`;
    },

    /**
     * Get volatility text
     */
    getVolatilityText() {
        return `${STANDARD_MODE_DEFAULTS.VOLATILITY}%`;
    },

    /**
     * Get margin call threshold text
     */
    getMarginCallText() {
        return `${STANDARD_MODE_DEFAULTS.MARGIN_CALL_LTV}%`;
    },

    /**
     * Get inflation rate text
     */
    getInflationText() {
        return `${STANDARD_MODE_DEFAULTS.INFLATION_RATE}%`;
    },

    /**
     * Get max LTV text
     */
    getMaxLTVText() {
        return `${STANDARD_MODE_DEFAULTS.MAX_LTV}%`;
    },

    /**
     * Get payment percentage text
     */
    getPaymentPercentageText() {
        return `${STANDARD_MODE_DEFAULTS.PAYMENT_PERCENTAGE}%`;
    },

    /**
     * Calculate spread between growth and interest
     */
    getSpreadText() {
        const spread = STANDARD_MODE_DEFAULTS.GROWTH_RATE - STANDARD_MODE_DEFAULTS.INTEREST_RATE;
        return `${spread}%`;
    },

    /**
     * Get number of simulations text
     */
    getSimulationCountText() {
        return UI_CONSTANTS.SIMULATION_COUNT.toLocaleString();
    },

    /**
     * Get base case simulations text
     */
    getBaseCaseSimulationsText() {
        return UI_CONSTANTS.BASE_CASE_SIMULATIONS.toLocaleString();
    },

    /**
     * Get number of strategies text
     */
    getNumStrategiesText() {
        return UI_CONSTANTS.NUM_STRATEGIES;
    },

    /**
     * Get total scenarios text (1 benchmark + strategies)
     */
    getTotalScenariosText() {
        return UI_CONSTANTS.NUM_STRATEGIES + ' scenarios (1 benchmark + ' + (UI_CONSTANTS.NUM_STRATEGIES - 1) + ' strategies)';
    },

    /**
     * Get default loan period text
     */
    getDefaultLoanPeriodText() {
        return DEFAULT_INPUTS.LOAN_PERIOD;
    },

    /**
     * Update all dynamic text in the page
     */
    updateAllDynamicText() {
        // Update all elements with data-config attributes
        document.querySelectorAll('[data-config-value]').forEach(element => {
            const configPath = element.getAttribute('data-config-value');
            const value = this.getConfigValue(configPath);
            if (value !== null) {
                element.textContent = value;
            }
        });
    },

    /**
     * Get config value by path (e.g., "STANDARD_MODE_DEFAULTS.INTEREST_RATE")
     */
    getConfigValue(path) {
        const parts = path.split('.');
        let value = window;
        for (const part of parts) {
            value = value[part];
            if (value === undefined) return null;
        }
        return value;
    },

    /**
     * Generate intro paragraph text
     */
    getIntroParagraph() {
        return `The reason investors consider this: the stock market historically returns around <strong>${this.getGrowthRateText()} per year</strong>, while borrowing costs around <strong>${this.getInterestRateText()} (Prime + 1%)</strong>. If you can borrow at ${this.getInterestRateText()} and invest at ${this.getGrowthRateText()}, you keep the ${this.getSpreadText()} difference on borrowed capital. Over ${DEFAULT_INPUTS.LOAN_PERIOD} years, that ${this.getSpreadText()} spread compounds into meaningful wealth.`;
    },

    /**
     * Generate catch paragraph text
     */
    getCatchParagraph() {
        return `<em>But here's the catch:</em> That ${this.getSpreadText()} spread only happens if markets go up. When markets crash, you still owe ${this.getInterestRateText()} interest on a shrinking portfolio. This strategy amplifies both gains <strong>and</strong> losses—it's leverage, and leverage cuts both ways.`;
    },

    /**
     * Generate simulation description
     */
    getSimulationDescription() {
        return `This calculator tests <strong>${UI_CONSTANTS.NUM_STRATEGIES - 1} different payment strategies</strong> across <strong>${this.getBaseCaseSimulationsText()} different market scenarios</strong>. From these simulations, it builds a probability distribution: what percentage of outcomes result in ruin, what percentage result in underperformance, and what percentage result in profit.`;
    },

    /**
     * Generate methodology step 2 text
     */
    getMethodologyStep2() {
        return `Rather than guessing at the optimal payment, we test ${UI_CONSTANTS.NUM_STRATEGIES - 1} different strategies ranging from minimum payment all the way to full amortization (100%). Each strategy represents a different point on the risk-reward spectrum. Some are aggressive (low payment = high leverage), others are conservative (high payment = pay down debt fast).`;
    },

    /**
     * Generate methodology step 3 text
     */
    getMethodologyStep3() {
        const perStrategy = UI_CONSTANTS.SIMULATION_COUNT.toLocaleString();
        const baseline = UI_CONSTANTS.BASE_CASE_SIMULATIONS.toLocaleString();
        return `For each payment strategy, we simulate ${perStrategy} different market paths. For the benchmark (no-debt baseline), I run ${baseline} simulations for better statistical accuracy.`;
    },

    /**
     * Generate methodology formula text for volatility
     */
    getMethodologyFormulaText() {
        return `μ = Expected annual growth rate (${this.getGrowthRateText()} in Standard Mode)<br>
            σ = Volatility / standard deviation (${this.getVolatilityText()} in Standard Mode)<br>
            Z = Random normal variable (simulates market surprises)`;
    },

    /**
     * Generate margin call step 4 text
     */
    getMarginCallStep4() {
        return `Lenders enforce rules. If your debt gets too large relative to your portfolio value (your Loan-to-Value ratio), they force liquidation. In Standard Mode, the margin call threshold is ${this.getMarginCallText()} LTV.`;
    },

    /**
     * Generate margin call followup text
     */
    getMarginCallFollowup() {
        return `If at any point your debt exceeds ${this.getMarginCallText()} of your portfolio's value, the lender sells your positions, pays themselves back, and you're left with $0. The calculator tracks "survival rate"—the percentage of ${this.getSimulationCountText()} simulations where your account doesn't hit this threshold.`;
    },

    /**
     * Generate margin call note
     */
    getMarginCallNote() {
        return `${this.getMarginCallText()} LTV is conservative relative to the market. Different lenders use different thresholds (40-80%); you can adjust it in Custom Mode.`;
    },

    /**
     * Generate inflation example text
     */
    getInflationExample() {
        return `For example, if your portfolio grows to $1M in ${DEFAULT_INPUTS.LOAN_PERIOD} years but inflation is ${this.getInflationText()} per year, that $1M in the future is worth less in today's dollars. This calculator shows what that really means for your lifestyle.`;
    },

    /**
     * Generate economics text
     */
    getEconomicsText() {
        return `Portfolio LOCs work because of the <strong>spread</strong> between borrowing costs and market returns. If borrowing costs are ${this.getInterestRateText()} and stocks return ${this.getGrowthRateText()}, the ${this.getSpreadText()} spread accrues on borrowed capital. Over ${DEFAULT_INPUTS.LOAN_PERIOD} years on $100K borrowed, that compounds significantly.`;
    },

    /**
     * Generate standard mode assumptions list
     */
    getStandardModeAssumptions() {
        return `
            <li><strong>Interest Rate: ${this.getInterestRateText()}</strong> — This assumes Canadian Prime Rate stays around 6% plus a 1% lender spread. It's higher than current rates (early 2026), so it accounts for rate increases over your ${DEFAULT_INPUTS.LOAN_PERIOD}-year period.</li>
            <li><strong>Market Growth: ${this.getGrowthRateText()} per year</strong> — Historical average for the S&P 500 from 1950-2024. It's <em>not</em> the best-case scenario; many years are below ${this.getGrowthRateText()}, some are above.</li>
            <li><strong>Volatility: ${this.getVolatilityText()} per year</strong> — Standard deviation of annual S&P 500 returns. This means most years fall between -7% and +23%, roughly. It captures the realistic swings you'd experience.</li>
            <li><strong>Margin Call Threshold: ${this.getMarginCallText()} LTV</strong> — Conservative. Different lenders enforce 40-80% LTV depending on their risk appetite. At ${this.getMarginCallText()}, the lender protects themselves earlier, which means higher probability of liquidation if markets decline.</li>
            <li><strong>Inflation: ${this.getInflationText()} per year</strong> — Long-term average U.S. inflation. All final wealth figures convert to "today's dollars" using this rate.</li>
            <li><strong>Monthly Payment: ${this.getPaymentPercentageText()} of Amortized</strong> (auto-calculated) — This is the default starting point. Paying ${this.getPaymentPercentageText()} means you're not paying down the principal very fast; you're betting on leverage. This lets you explore the tradeoff.</li>
        `;
    },

    /**
     * Generate three outcomes ruin text
     */
    getThreeOutcomesRuinText() {
        return `<strong>Ruin (Red):</strong> Your account hit the ${this.getMarginCallText()} margin call threshold and was liquidated. You lost everything (0 wealth remaining). This happens when debt grew faster than your portfolio value during a downturn. The "ruin probability" is the percentage of ${this.getSimulationCountText()} scenarios where this occurs.`;
    },

    /**
     * Generate reference leverage text
     */
    getReferenceLeverageText() {
        return `<strong>Leverage & The Spread:</strong> The fundamental idea behind Portfolio LOCs is <strong>positive carry</strong>. If you borrow at ${this.getInterestRateText()} and invest at ${this.getGrowthRateText()}, you keep ${this.getSpreadText()} on borrowed capital. Read more: <a href="https://www.investopedia.com/terms/c/carry.asp" target="_blank">Investopedia's carry trade explanation</a>. The catch: this only works if markets go up. In down markets, you're paying ${this.getInterestRateText()} on a shrinking asset base—the exact opposite dynamic.`;
    },

    /**
     * Generate reference time value text
     */
    getReferenceTimeValueText() {
        return `<strong>Time Value of Money & Loan Amortization:</strong> When you borrow $100,000 over ${DEFAULT_INPUTS.LOAN_PERIOD} years at ${this.getInterestRateText()}, there's a specific monthly payment that makes sense: <a href="https://www.investopedia.com/terms/a/amortization.asp" target="_blank">Investopedia's amortization guide</a> explains the math. The formula we use calculates that "fair" payment. Paying less means you're extending the debt; paying more means you're paying it off faster.`;
    },

    /**
     * Generate reference margin call text
     */
    getReferenceMarginCallText() {
        return `<strong>Margin Calls & Forced Liquidation:</strong> When you borrow against your portfolio, the lender sets a maximum Loan-to-Value ratio. Read <a href="https://www.investopedia.com/terms/m/margincall.asp" target="_blank">Investopedia's margin call explanation</a>. If the ratio is breached, the lender sells your positions without asking, pays themselves back, and you're left with $0. This is not theoretical—it happened to many investors during 2008 and 2020. Standard Mode conservatively uses a ${this.getMarginCallText()} LTV threshold; more aggressive lenders allow up to 75-80%; more conservative lenders enforce 40-50%.`;
    },

    /**
     * Generate reference inflation text
     */
    getReferenceInflationText() {
        return `<strong>Real vs. Nominal Returns—Inflation Adjustment:</strong> A $1M portfolio sounds great until you realize that $1M in ${DEFAULT_INPUTS.LOAN_PERIOD} years won't buy as much as $1M today. This calculator converts all results to "real dollars" (today's purchasing power) using the inflation rate. <a href="https://www.investopedia.com/terms/r/realinterestrate.asp" target="_blank">Investopedia on real interest rates</a> explains the concept applied to debt. For wealth: <a href="https://www.khanacademy.org/economics-finance-domain/macroeconomics/aggregate-demand-supply/inflation-tutorial/v/inflation-and-real-return" target="_blank">Khan Academy's inflation and real return video</a> walks through it step-by-step.`;
    },

    /**
     * Generate Monte Carlo intro text
     */
    getMonteCarloIntroText() {
        return `This tool uses <strong>Monte Carlo simulation</strong> combined with <strong>Present Value of Annuity</strong> principles to stress-test a Portfolio LOC strategy across ${this.getSimulationCountText()} different market scenarios.`;
    }
};

// Make available globally
if (typeof window !== 'undefined') {
    window.CopywritingHelpers = CopywritingHelpers;
}
