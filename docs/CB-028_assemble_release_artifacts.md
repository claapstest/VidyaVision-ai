# CB-028: Assemble Release Directory and Artifacts

## Summary
Created an automated release assembly script that packages all CallingBot deployment artifacts into a versioned, self-contained release directory — ready for handover to the deployment team.

## Script
**File**: `scripts/assemble-release.ps1`

## Release Structure
```
release/CallingBot-v1.0.0-20261127/
  ├── backend/
  │     └── CallingBot.exe              Standalone backend EXE (102 MB)
  ├── frontend/
  │     └── vidyavision-frontend-*.zip  Production React/Vite build for IIS
  ├── service/
  │     └── CallingBot-service.xml      WinSW service descriptor
  ├── config/
  │     ├── callingbot.template.json    Configuration template (no secrets)
  │     ├── .env.example                Environment variable reference
  │     └── README.md                   Config documentation
  ├── scripts/                          21 deployment and validation scripts
  ├── docs/                             27 story implementation documents
  ├── RELEASE_NOTES.md                  Version summary and deployment steps
  └── MANIFEST.txt                      File listing with sizes
```

## What Is Excluded
- Source code and repositories (`.git`, `node_modules`)
- Build scripts (esbuild bundler, ESM-to-CJS converter, SEA builder)
- Secrets, private keys, credentials
- Debug artifacts (`dist-server/`, source maps)
- Dev dependencies

## Security Scan
The assembly runs an automated secret scan on all text files in the release, checking for:
- Hardcoded passwords, API keys, secrets
- Private key files
- `.env` files (actual, not `.env.example`)

Known false positives (scanner scripts that contain pattern strings) are excluded.

## Usage
```powershell
# Full build + assemble
.\scripts\assemble-release.ps1

# Assemble from existing artifacts (skip rebuild)
.\scripts\assemble-release.ps1 -SkipBuild

# Custom version
.\scripts\assemble-release.ps1 -Version "1.1.0"

# npm script
npm run release:assemble
```

## Parameters
| Parameter | Default | Description |
|-----------|---------|-------------|
| Version | From package.json | Release version string |
| OutputDir | `.\release` | Parent directory for the release folder |
| SkipBuild | false | Skip frontend/backend builds |
