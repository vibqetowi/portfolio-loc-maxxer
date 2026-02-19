/**
 * Math utilities for Monte Carlo simulation
 * AssemblyScript implementation
 */

// Box-Muller transform for generating normal random variables
// Returns a standard normal random variable (mean=0, stddev=1)
export function randn(): f64 {
    let u: f64 = 0.0;
    let v: f64 = 0.0;
    
    // Ensure we don't get exactly 0 (would cause log(0) = -infinity)
    while (u === 0.0) u = Math.random();
    while (v === 0.0) v = Math.random();
    
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// Calculate amortized payment using present value of annuity formula
// P = L × [r(1+r)^n] / [(1+r)^n - 1]
export function calculateAmortizedPayment(
    loan: f64,
    monthlyRate: f64,
    months: f64
): f64 {
    if (monthlyRate === 0.0) {
        return loan / months;
    }
    
    const onePlusR = 1.0 + monthlyRate;
    const powerTerm = Math.pow(onePlusR, months);
    
    return loan * (monthlyRate * powerTerm) / (powerTerm - 1.0);
}

// Simulate geometric Brownian motion for one month
// Returns the multiplicative return factor
export function simulateMonthlyReturn(
    growthRate: f64,
    volatility: f64
): f64 {
    const dt = 1.0 / 12.0; // Monthly time step
    const drift = (growthRate - 0.5 * volatility * volatility) * dt;
    const diffusion = volatility * Math.sqrt(dt) * randn();
    
    return Math.exp(drift + diffusion);
}
