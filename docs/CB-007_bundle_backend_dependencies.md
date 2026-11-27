# CB-007: Bundle All Backend Dependencies

## Summary
All 1,674 backend modules (application code + npm dependencies) are bundled into a single file by esbuild, eliminating the need for `node_modules` at runtime.

## Bundled Dependencies
- **express** v5.2.1 — HTTP framework
- **mssql** v11.0.1 — SQL Server driver (tedious is pure JS)
- **bcryptjs** v3.0.3 — Password hashing (pure JS, no native addon)
- **jsonwebtoken** v9.0.3 — JWT auth
- **googleapis** v174.0.1 — Google API client
- **ws** v8.21.3 — WebSocket server
- **dotenv** v17.4.2 — Environment variable loading
- **exceljs** v4.4.0 — Excel file handling
- **cors** v2.8.6 — CORS middleware

## Output Sizes
- Debug bundle: ~36 MB (unminified, 1,674 modules)
- Production bundle: ~15 MB (minified + mangled)

## Verification
Run `node scripts/build-backend.js` and check that the metafile reports all expected modules bundled with zero errors.
