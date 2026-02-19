# Dynamic Copywriting Implementation

## Overview
All hardcoded numeric values in copywriting have been replaced with references to the config file. This allows easy updates to all displayed values by simply changing values in `config.js`.

## Changes Made

### 1. New File: `scripts/copywriting-helpers.js`
Created a helper module that provides functions to generate dynamic text from config values:
- Interest rates, growth rates, volatility, margin call thresholds
- Simulation counts, number of strategies
- Default loan periods, inflation rates
- Calculated values like spread (growth - interest rate)
- Complete text blocks for methodology, assumptions, and references

### 2. Updated: `index.html`
- Added `<script src="scripts/copywriting-helpers.js"></script>` to load the helpers
- Replaced all hardcoded values with `<span id="..."></span>` placeholders
- Added initialization script that runs on `DOMContentLoaded` to populate all dynamic values
- Updated sections:
  - Introduction paragraphs (interest rates, growth rates, spreads)
  - Tooltips (max LTV, payment percentages, etc.)
  - Methodology section (simulation counts, strategy counts)
  - Standard Mode Assumptions list
  - Three Outcomes section
  - Economic Theory references

### 3. Updated: `scripts/script.js`
- Replaced hardcoded `35%` (MAX_LTV) references with `STANDARD_MODE_DEFAULTS.MAX_LTV`
- Replaced hardcoded `0.5` (50% payment) with `STANDARD_MODE_DEFAULTS.PAYMENT_PERCENTAGE / 100`
- Updated calculation functions to use config values
- Updated comments to reference config file instead of hardcoded values

## Config Values Used

All values are pulled from `config.js`:

### From STANDARD_MODE_DEFAULTS:
- `INFLATION_RATE`: 3.5%
- `INTEREST_RATE`: 7.0%
- `GROWTH_RATE`: 8.0%
- `VOLATILITY`: 15.0%
- `MARGIN_CALL_LTV`: 60.0%
- `PAYMENT_PERCENTAGE`: 50.0%
- `MAX_LTV`: 35.0%

### From DEFAULT_INPUTS:
- `LOAN_PERIOD`: 15 years

### From UI_CONSTANTS:
- `BASE_CASE_SIMULATIONS`: 100,000
- `SIMULATION_COUNT`: 50,000
- `NUM_STRATEGIES`: 11

## Benefits

1. **Single Source of Truth**: All numeric values are defined once in `config.js`
2. **Easy Updates**: Change a value in config, and it updates everywhere automatically
3. **Consistency**: No risk of different values being hardcoded in different places
4. **Maintainability**: Future changes require editing only the config file

## Testing

To verify the changes work:
1. Open `index.html` in a browser
2. Check that all percentages and numbers display correctly in:
   - Introduction text
   - Tooltips (hover over ? icons)
   - Methodology section
   - Standard Mode Assumptions
   - Three Outcomes section
3. Try changing values in `config.js` and refresh the page to see updates

## Example: Changing Interest Rate

To change the interest rate from 7.0% to 6.5%:

```javascript
// In config.js
const STANDARD_MODE_DEFAULTS = {
    INTEREST_RATE: 6.5,  // Changed from 7.0
    // ... other values
};
```

After this change:
- All mentions of "7.0%" will show "6.5%"
- The spread calculation (growth - interest) will update automatically
- No changes needed in HTML or other JS files
