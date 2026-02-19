# Buffer Size Management and Config Robustness

## Overview
The simulation system now dynamically handles buffer sizes based on config.js values, making it robust to configuration changes without requiring code changes.

## Key Changes Made

### 1. Dynamic Buffer Size Calculation
Added `calculateRequiredBufferSize()` function to config.js that computes the exact buffer size needed based on:
- `UI_CONSTANTS.BASE_CASE_SIMULATIONS` (baseline scenario)
- `UI_CONSTANTS.SIMULATION_COUNT` (per leveraged strategy)
- `UI_CONSTANTS.NUM_STRATEGIES` (total strategies including benchmark)

**Formula:**
```
bufferSize = 2 (header) 
           + 8 + BASE_CASE_SIMULATIONS (benchmark)
           + (NUM_STRATEGIES - 1) × (8 + SIMULATION_COUNT) (leveraged strategies)
```

### 2. Expanded Output Buffer
- **Old size:** 120,000 f64 values (~960 KB)
- **New size:** 1,200,000 f64 values (~9.6 MB)
- **Reason:** Allows config flexibility without recompiling WASM

Current config (BASE_CASE=100k, SIM_COUNT=50k, NUM_STRATS=11):
- Required: 600,090 f64 values
- Allocated: 1,200,000 f64 values
- Utilization: 50%

### 3. Dynamic Strategy Count
`NUM_STRATEGIES` now flows through entire pipeline:
1. **config.js:** Define `UI_CONSTANTS.NUM_STRATEGIES = 11`
2. **integration.js:** Add `numStrategies` to inputs
3. **simulation.worker.js:** Pass to WASM via input buffer[13]
4. **assembly/index.ts:** Read and use dynamically in loop
5. **adapter.js:** Use in buffer calculations and unmarshalling

### 4. Runtime Validation
Added automatic validation on page load:
- Calculates required buffer size
- Compares against allocated size
- Logs utilization percentage
- **Warns if buffer would overflow**

Console output example:
```
✓ Buffer size OK: 50.0% utilized (600,090 / 1,200,000)
```

Error example (if config exceeds capacity):
```
⚠️ BUFFER OVERFLOW WARNING!
Required: 1,300,000 f64 values
Allocated: 1,200,000 f64 values
You must reduce SIMULATION_COUNT or BASE_CASE_SIMULATIONS in config.js
or increase outputBuffer size in assembly/index.ts and rebuild (npm run asbuild)
```

## How to Change Config Values Safely

### Simple Changes (No Rebuild Required)
These work as long as buffer utilization stays under 100%:

```javascript
// config.js
const UI_CONSTANTS = {
    BASE_CASE_SIMULATIONS: 80000,    // Reduced from 100k
    SIMULATION_COUNT: 40000,          // Reduced from 50k
    NUM_STRATEGIES: 11,               // Same
    // ... other values
};
```

Check browser console after reload - you'll see:
```
✓ Buffer size OK: 40.1% utilized (481,690 / 1,200,000)
```

### Changes Requiring WASM Rebuild
If you want to **increase** simulation counts beyond current capacity:

1. **Update config.js:**
   ```javascript
   BASE_CASE_SIMULATIONS: 200000,  // Double it
   SIMULATION_COUNT: 100000,        // Double it
   ```

2. **Check if rebuild needed:**
   Reload page and check console. If you see:
   ```
   ⚠️ BUFFER OVERFLOW WARNING!
   ```

3. **Increase buffer in assembly/index.ts:**
   ```typescript
   let outputBuffer: StaticArray<f64> = new StaticArray<f64>(2400000);
   ```

4. **Rebuild:**
   ```bash
   npm run asbuild
   ```

5. **Update allocated size in config.js:**
   ```javascript
   function calculateRequiredBufferSize() {
       // ...
       return {
           required: totalRequired,
           allocated: 2400000,  // Update to match assembly
           // ...
       };
   }
   ```

## Input Buffer Layout
Now 14 elements (expanded from 13):

| Index | Parameter | Type | Unit |
|-------|-----------|------|------|
| 0 | loanAmount | f64 | $ |
| 1 | interestRate | f64 | decimal (0.07 = 7%) |
| 2 | volatility | f64 | decimal |
| 3 | growth | f64 | decimal |
| 4 | inflation | f64 | decimal |
| 5 | monthlyBudget | f64 | $ |
| 6 | minPayment | f64 | $ |
| 7 | maxPayment | f64 | $ |
| 8 | simulationCount | f64 | count |
| 9 | years | f64 | years |
| 10 | marginCallLTV | f64 | decimal |
| 11 | initialAssets | f64 | $ |
| 12 | initialEquity | f64 | $ |
| 13 | **numStrategies** | **f64** | **count** (NEW) |

## Output Buffer Layout
Dynamic based on config:

```
[0-1]    Header: status, numScenarios
[2-...]  Benchmark: 8 + BASE_CASE_SIMULATIONS values
[...-...]  Strategy 1: 8 + SIMULATION_COUNT values
[...-...]  Strategy 2: 8 + SIMULATION_COUNT values
...
[...-end]  Strategy N: 8 + SIMULATION_COUNT values
```

Each scenario block contains:
1. survivalRate (f64)
2. medianWealth (f64)
3. expectedWealth (f64)
4. p90Wealth (f64)
5. paymentAmount (f64)
6. surplusAmount (f64)
7. reserveCount (f64) - unused, reserved
8. wealthArraySize (f64)
9-N. finalWealthArray (f64[])

## Testing Configuration Changes

1. **Edit config.js** with new values
2. **Refresh browser** (Ctrl+F5 / Cmd+Shift+R)
3. **Check console** for buffer validation
4. **Click Calculate** to run simulation
5. **Verify results** display correctly

If you see "unreachable executed" error, it means buffer overflow occurred during simulation. Follow the rebuild steps above.

## Maximum Recommended Values

With current 1.2M buffer:
- **Conservative:** BASE_CASE=100k, SIM_COUNT=50k, NUM_STRATS=11 ✅ (50% util)
- **Moderate:** BASE_CASE=150k, SIM_COUNT=75k, NUM_STRATS=11 ✅ (75% util)
- **Aggressive:** BASE_CASE=200k, SIM_COUNT=100k, NUM_STRATS=11 ❌ (100.4% util - need rebuild)

## Files Modified
- **config.js:** Added buffer calculation and validation
- **assembly/index.ts:** Expanded buffers, dynamic numStrategies
- **scripts/integration.js:** Pass numStrategies in inputs
- **scripts/simulation.worker.js:** Write numStrategies to buffer
- **scripts/adapter.js:** Dynamic buffer size checks, dynamic strategy loop

## Benefits
✅ No hardcoded constants scattered in code  
✅ Single source of truth (config.js)  
✅ Automatic validation catches issues early  
✅ Most config changes work without rebuild  
✅ Clear error messages when rebuild is needed  
✅ Buffer utilization monitoring  
