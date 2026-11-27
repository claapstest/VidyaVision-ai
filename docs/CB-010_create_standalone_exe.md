# CB-010: Create Standalone Windows EXE

## Summary
Packages the SEA blob into a standalone Windows executable (`CallingBot.exe`) that runs the full backend server without requiring Node.js to be installed.

## Process
1. Copy `node.exe` as `release/CallingBot.exe` (~87 MB base)
2. Inject SEA blob using `postject@1.0.0-alpha.6` with the `NODE_SEA_FUSE` sentinel
3. Final EXE: ~102 MB

## Technical Details
- **Tool**: postject (npm package) injects the blob into the PE binary's resource section
- **Sentinel fuse**: `NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2` — Node.js checks this at startup to determine if it's running as a SEA
- **Architecture**: x64 Windows (matches the build host's Node.js)
- **Node.js version**: v25.0.0 (pinned in .nvmrc)

## Runtime Behavior
- Reads `.env` from the current working directory
- Connects to SQL Server at the configured `MSSQL_HOST`
- Falls back to file-based storage if SQL Server is unavailable
- Listens on `PORT` environment variable (default: 5000)
- WebSocket endpoint at `/api/stream`

## Usage
```powershell
# Build the full pipeline
npm run build:backend:all

# Run the EXE
$env:PORT = 5000
.\release\CallingBot.exe
```

## Output
```
release/CallingBot.exe  (~102 MB, standalone Windows x64)
```
