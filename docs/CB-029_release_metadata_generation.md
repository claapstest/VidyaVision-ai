# CB-029: Generate Checksums, SBOM and Test Summary

## Summary
Created a release metadata generator that produces three verification files for every CallingBot release: SHA-256 checksums, a CycloneDX 1.5 Software Bill of Materials, and a build/test summary report.

## Script
**File**: `scripts/generate-release-metadata.ps1`

## Generated Files

### CHECKSUMS.sha256
- SHA-256 hash for every file in the release directory
- Standard BSD-style format (`hash  filename`)
- Covers all artifacts: EXE, ZIP, XML, scripts, docs, config

### SBOM.json (CycloneDX 1.5)
- Lists all production npm dependencies with:
  - Exact versions from package-lock.json
  - License identifiers from node_modules
  - Package URLs (purl) for each component
- Metadata includes build tools: esbuild, Node.js SEA, postject
- Industry-standard format consumed by security scanners

### TEST_SUMMARY.md
- Build environment: Node.js version, npm version, OS, architecture
- Artifact verification: EXE exists/size, frontend ZIP, service XML, config template
- Dependency audit: production dependency count, npm audit results with severity breakdown
- Lists all available validation scripts and their purpose
- Notes on what requires additional infrastructure to test

## Usage
```powershell
# Auto-detect latest release directory
.\scripts\generate-release-metadata.ps1

# Specify release directory
.\scripts\generate-release-metadata.ps1 -ReleaseDir ".\release\CallingBot-v1.0.0-20261127"

# npm script
npm run release:metadata
```

## Integration
Run after `assemble-release.ps1` to add metadata to the release package:
```powershell
npm run release:assemble
npm run release:metadata
```
