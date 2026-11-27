# CB-008: Code Obfuscation and Minification

## Summary
Production backend code is obfuscated using esbuild's built-in minification and property mangling. The `javascript-obfuscator` package was evaluated but abandoned due to memory constraints.

## Approach
esbuild minification provides:
- **Whitespace removal** — eliminates formatting and comments
- **Identifier mangling** — shortens variable/function names
- **Property mangling** — renames properties matching `^_[a-z]` (private-convention props)
- **Dead code elimination** — removes unreachable code
- **Debugger statement removal** — strips `debugger` statements

## Results
- Input: 36 MB (unminified bundle)
- Output: ~15 MB (58% reduction)
- All legal comments stripped

## Why Not javascript-obfuscator
The `javascript-obfuscator` package (v5.10.1) caused an out-of-memory error on the 36 MB bundle even with:
- 8 GB heap (`--max-old-space-size=8192`)
- Minimal settings (no control flow flattening, no dead code injection)
- The script `scripts/obfuscate-bundle.js` is preserved for reference but not used in the production pipeline

## Usage
Minification is applied automatically during ESM-to-CJS conversion:
```powershell
npm run build:backend:cjs
```
