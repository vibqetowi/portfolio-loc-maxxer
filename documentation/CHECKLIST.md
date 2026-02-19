# Pre-Flight Checklist - WebAssembly Migration

## ✅ Development Complete - Ready for Build

Use this checklist to verify successful deployment.

---

## Phase 1: Pre-Build Verification

- [ ] All files present in workspace:
  - [ ] `package.json`
  - [ ] `asconfig.json`
  - [ ] `assembly/math.ts`
  - [ ] `assembly/index.ts`
  - [ ] `simulation.worker.js`
  - [ ] `adapter.js`
  - [ ] `integration.js`
  - [ ] `index.html` (updated with new scripts)
  - [ ] `script.js` (modified with async)

- [ ] Check HTML loads scripts in order:
  ```html
  <script src="adapter.js"></script>
  <script src="integration.js"></script>
  <script src="script.js"></script>
  ```

---

## Phase 2: Build Process

### 2.1 Install Dependencies
```bash
npm install
```

**Verify**:
- [ ] `node_modules/` directory created
- [ ] `node_modules/assemblyscript/` exists
- [ ] No error messages in terminal

### 2.2 Compile WebAssembly
```bash
npm run asbuild
```

**Verify**:
- [ ] `build/sim.wasm` file created
- [ ] File size: ~2-5KB (check with `ls -lh build/`)
- [ ] No compilation errors
- [ ] Terminal shows: "asc assembly/index.ts ... --textFile ... --outFile build/sim.wasm..."

**If compilation fails**:
- [ ] Check `assembly/index.ts` syntax
- [ ] Run `npm run asbuild:untouched` for debug build
- [ ] Review error messages for line numbers

---

## Phase 3: Local Testing

### 3.1 Start HTTP Server
```bash
python3 -m http.server 8000
```

**Verify**:
- [ ] Server starts without errors
- [ ] Terminal shows: "Serving HTTP on 0.0.0.0 port 8000..."

### 3.2 Open Browser
Navigate to: **http://localhost:8000**

**Verify**:
- [ ] Page loads without errors
- [ ] UI appears normal
- [ ] No console errors on page load

### 3.3 Open DevTools Console
Press **F12** (or **Cmd+Opt+I** on macOS)

**Verify Console Tab**:
- [ ] No red errors visible
- [ ] No "Failed to fetch sim.wasm" errors

### 3.4 Run First Calculation
1. Set parameters:
   - Loan: $500,000
   - Period: 40 years
   - Interest: 7%
   - Growth: 8%
   - Volatility: 15%
   - Monthly Budget: $3,500

2. Click **Calculate**

**Verify Console Output**:
- [ ] See: `[Integration] Using WebAssembly accelerated simulation`
- [ ] See: `[Worker] WebAssembly module loaded successfully`
- [ ] See: `[Worker] Simulation completed in XXXXms`
- [ ] No errors or red messages

**Verify UI**:
- [ ] Results appear within 1-2 seconds
- [ ] Histogram renders
- [ ] Strategy pills show 11 strategies
- [ ] Slider works smoothly
- [ ] UI did NOT freeze during calculation

### 3.5 Performance Check
**Check console for compute time**:
- [ ] Time < 3000ms? ✅ **Good** (likely 1000-2000ms)
- [ ] Time > 3000ms? ⚠️ Check if Wasm loaded correctly

---

## Phase 4: Validation Testing

### 4.1 Compare with JavaScript Fallback
1. Open `integration.js`
2. Line 59: Temporarily change to `return false;`
3. Save and refresh browser
4. Run same calculation parameters

**Verify**:
- [ ] Console shows: `[Integration] Using legacy JavaScript simulation`
- [ ] Results appear (slower, 8-15 seconds)
- [ ] Survival rates similar (±2% acceptable)
- [ ] Median wealth similar (±5% acceptable)

5. Revert `integration.js` line 59 back to original
6. Refresh browser

### 4.2 UI Responsiveness Test
1. Click **Calculate**
2. **Immediately** try to:
   - [ ] Hover over tooltips
   - [ ] Move sliders
   - [ ] Click other buttons

**Verify**:
- [ ] UI responds smoothly
- [ ] No "Page Not Responding" warning
- [ ] Loading spinner animates smoothly

### 4.3 Edge Case Testing
Test these scenarios:

**Test 1: Maximum leverage**
- [ ] Set minimum payment to interest-only
- [ ] Monthly budget to 2x amortized payment
- [ ] Verify results show high-risk strategies

**Test 2: Conservative approach**  
- [ ] Set minimum payment to full amortized amount
- [ ] Verify all strategies show high survival (~99%+)

**Test 3: Short period**
- [ ] Set loan period to 5 years
- [ ] Verify calculation still completes
- [ ] Results make sense

**Test 4: Long period**
- [ ] Set loan period to 50 years
- [ ] Verify calculation completes
- [ ] No memory errors

---

## Phase 5: Production Deployment

### 5.1 File Checklist
Ensure these files are uploaded:

**Required**:
- [ ] `index.html`
- [ ] `script.js`
- [ ] `adapter.js`
- [ ] `integration.js`
- [ ] `simulation.worker.js`
- [ ] `config.js`
- [ ] `styles.css`
- [ ] `build/sim.wasm`

**Exclude** (DO NOT upload):
- [ ] `assembly/` folder
- [ ] `node_modules/` folder
- [ ] `package.json`
- [ ] `asconfig.json`
- [ ] `.gitignore`
- [ ] `build/*.debug.wasm`
- [ ] `build/*.wat`
- [ ] `*.md` files (optional, but not needed)

### 5.2 Server Configuration

**Check MIME Types**:
- [ ] `.wasm` files served with: `application/wasm`
- [ ] `.js` files served with: `text/javascript`

**Check CORS** (if worker/wasm on CDN):
- [ ] `Access-Control-Allow-Origin` header set
- [ ] Same-origin policy respected

**Check Caching**:
- [ ] `sim.wasm` has cache-control headers
- [ ] Consider versioning (e.g., `sim.v1.wasm`)

### 5.3 Production Test
After deployment:

1. **Open production URL**
2. **Open DevTools Console**
3. **Run calculation**

**Verify**:
- [ ] Wasm loads successfully
- [ ] No 404 errors
- [ ] Compute time < 3 seconds
- [ ] Results match local testing

---

## Phase 6: Monitoring

### First 24 Hours
Monitor for:

**Console Errors**:
- [ ] Check browser console for user-reported issues
- [ ] Look for "Failed to fetch" errors
- [ ] Check for Wasm compilation failures

**Performance**:
- [ ] Verify compute times remain fast
- [ ] Check for memory leaks (long sessions)
- [ ] Monitor browser compatibility reports

**Fallback Rate**:
- [ ] Check how many users fall back to JS
- [ ] Expected: <5% (only very old browsers)

### User Feedback
Monitor for reports of:
- [ ] "Calculator slower than before" → Check Wasm loading
- [ ] "Page freezes" → Check worker implementation
- [ ] "Wrong results" → Compare Wasm vs JS output

---

## Rollback Procedure

If critical issues arise:

### Option 1: Force JavaScript Fallback
1. Open `integration.js`
2. Line 59: Change to `return false;`
3. Re-deploy only `integration.js`
4. **Result**: App uses JS, slower but functional

### Option 2: Full Rollback
1. Restore previous version of:
   - `index.html` (remove adapter/integration scripts)
   - `script.js` (restore old runSimulation)
2. Remove from server:
   - `adapter.js`, `integration.js`, `simulation.worker.js`
   - `build/sim.wasm`

---

## Success Metrics

After deployment, success means:

✅ **Performance**: Compute time < 3s (target: 1-2s)  
✅ **Non-blocking**: UI remains fully responsive  
✅ **Compatibility**: >95% users load Wasm successfully  
✅ **Accuracy**: Results match JS version (±1%)  
✅ **Reliability**: No crashes or memory leaks  
✅ **User Feedback**: Positive reports of speed improvement  

---

## Support Contact

If issues persist:

1. **Check documentation**:
   - `QUICKSTART.md` - Basic setup
   - `BUILD_AND_TEST.md` - Detailed testing
   - `MIGRATION_SUMMARY.md` - Complete overview

2. **Enable debug mode**:
   ```javascript
   localStorage.setItem('DEBUG_WASM', 'true');
   ```

3. **Check browser compatibility**:
   - Wasm supported: Chrome 57+, Firefox 52+, Safari 11+
   - Workers supported: All modern browsers

4. **Review error logs**:
   - Browser console
   - Network tab (for loading issues)
   - Memory profiler (for leaks)

---

## Final Sign-Off

Before declaring migration complete:

- [ ] All Phase 1 checks passed
- [ ] Build completed successfully (Phase 2)
- [ ] Local tests passed (Phase 3)
- [ ] Validation tests passed (Phase 4)
- [ ] Production deployed (Phase 5)
- [ ] Monitoring active (Phase 6)
- [ ] Team trained on rollback procedure

**Date Completed**: _______________

**Deployed By**: _______________

**Production URL**: _______________

**Average Compute Time**: _______________

**Notes**: _______________________________________________

---

## Quick Reference Commands

```bash
# Install
npm install

# Compile (production)
npm run asbuild

# Compile (debug)
npm run asbuild:untouched

# Test locally
python3 -m http.server 8000
# Open: http://localhost:8000

# Check build
ls -lh build/sim.wasm

# Clean rebuild
rm -rf build/ node_modules/
npm install
npm run asbuild
```

---

**STATUS**: ✅ Ready to execute `npm install` and `npm run asbuild`
