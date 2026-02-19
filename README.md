# Quick Start Guide - WebAssembly Migration

## 3 Commands to Get Running

```bash
# 1. Install dependencies
npm install

# 2. Compile WebAssembly
npm run asbuild

# 3. Start local server and test
python3 -m http.server 8000
# Then open: http://localhost:8000
```

## Verify Success

Open browser console (`F12`) and look for:

```
[Integration] Using WebAssembly accelerated simulation
[Worker] WebAssembly module loaded successfully
[Worker] Simulation completed in 1234.56ms
```

## Troubleshooting

**"Failed to fetch sim.wasm"**
→ Use HTTP server, not `file://`

**"Module compilation failed"**
→ Run `npm run asbuild` again 

**"Results look wrong"**
→ Check `MEMORY_PROTOCOL.md` alignment

**"UI still freezes"**
→ Check console for worker errors

## Next Steps

1. ✅ Compile (see above)
2. ✅ Test locally
3. ✅ Validate results match
4. ✅ Check performance improvement
5. ✅ Deploy to production

## Architecture

```
┌─────────────────────┐
│   UI (script.js)    │  Main Thread
└──────────┬──────────┘
           │
           ↓
┌─────────────────────┐
│  integration.js     │  Routes Wasm/JS
└──────────┬──────────┘
           │
           ↓
┌─────────────────────┐
│   adapter.js        │  Marshals Data
└──────────┬──────────┘
           │
           ↓
┌─────────────────────┐
│simulation.worker.js │  Background Thread
└──────────┬──────────┘
           │
           ↓
┌─────────────────────┐
│   sim.wasm          │  Native Speed
└─────────────────────┘
```

## Support Files

- **BUILD_AND_TEST.md** - Comprehensive testing guide
- **MEMORY_PROTOCOL.md** - Technical memory layout
- **package.json** - Dependency management
- **asconfig.json** - Compiler configuration

---

**TL;DR**: Run 3 commands above, open browser, click Calculate. Should see console logs confirming Wasm loaded and 5-10x speedup.
