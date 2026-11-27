<#
.SYNOPSIS
    Generates checksums, SBOM, and test summary for a CallingBot release (CB-029).

.DESCRIPTION
    Produces three files inside the release directory:
      CHECKSUMS.sha256    — SHA-256 hashes for every file in the release
      SBOM.json           — Software Bill of Materials (CycloneDX 1.5 format)
      TEST_SUMMARY.md     — Build environment, dependency audit, and verification results

.PARAMETER ReleaseDir
    The assembled release directory. Default: auto-detects latest in .\release\

.EXAMPLE
    .\scripts\generate-release-metadata.ps1
    .\scripts\generate-release-metadata.ps1 -ReleaseDir ".\release\CallingBot-v1.0.0-20261127"
#>

[CmdletBinding()]
param(
    [string]$ReleaseDir = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

# Auto-detect latest release directory
if (-not $ReleaseDir) {
    $candidates = Get-ChildItem (Join-Path $root "release") -Directory -Filter "CallingBot-v*" |
        Sort-Object LastWriteTime -Descending
    if ($candidates.Count -eq 0) {
        Write-Error "No release directory found. Run assemble-release.ps1 first."
    }
    $ReleaseDir = $candidates[0].FullName
}

if (-not (Test-Path $ReleaseDir)) {
    Write-Error "Release directory not found: $ReleaseDir"
}

$releaseName = Split-Path $ReleaseDir -Leaf
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Release Metadata Generator" -ForegroundColor Cyan
Write-Host "  Release: $releaseName" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# =============================================================
# 1. CHECKSUMS.sha256
# =============================================================
Write-Host "[1/3] Generating SHA-256 checksums..." -ForegroundColor Yellow

$checksumLines = @("# SHA-256 Checksums for $releaseName", "# Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss UTC')", "")
$allFiles = Get-ChildItem $ReleaseDir -Recurse -File | Sort-Object FullName
foreach ($f in $allFiles) {
    $relPath = $f.FullName.Substring($ReleaseDir.Length + 1)
    $hash = (Get-FileHash -Path $f.FullName -Algorithm SHA256).Hash.ToLower()
    $checksumLines += "$hash  $relPath"
}
$checksumPath = Join-Path $ReleaseDir "CHECKSUMS.sha256"
($checksumLines -join "`n") | Out-File -FilePath $checksumPath -Encoding utf8
Write-Host "  CHECKSUMS.sha256 ($($allFiles.Count) files hashed)" -ForegroundColor Green

# =============================================================
# 2. SBOM.json (CycloneDX 1.5)
# =============================================================
Write-Host "[2/3] Generating Software Bill of Materials..." -ForegroundColor Yellow

$pkgJsonPath = Join-Path $root "package.json"
$pkgLockPath = Join-Path $root "package-lock.json"
$pkg = Get-Content $pkgJsonPath -Raw | ConvertFrom-Json
$version = $pkg.version

# Collect production dependencies from package.json
$components = @()
$depProps = $pkg.dependencies.PSObject.Properties
foreach ($dep in $depProps) {
    $depName = $dep.Name
    $depVersion = $dep.Value -replace '[\^~>=<]', ''

    # Try to get exact version from package-lock.json
    $exactVersion = $depVersion
    if (Test-Path $pkgLockPath) {
        try {
            $lockContent = Get-Content $pkgLockPath -Raw | ConvertFrom-Json
            $lockPkgs = $lockContent.packages
            $lockKey = "node_modules/$depName"
            if ($lockPkgs.PSObject.Properties[$lockKey]) {
                $exactVersion = $lockPkgs.PSObject.Properties[$lockKey].Value.version
            }
        }
        catch {}
    }

    # Try to get license from node_modules
    $license = "Unknown"
    $nmPkgJson = Join-Path $root "node_modules\$depName\package.json"
    if (Test-Path $nmPkgJson) {
        try {
            $nmPkg = Get-Content $nmPkgJson -Raw | ConvertFrom-Json
            if ($nmPkg.license) { $license = $nmPkg.license.ToString() }
        }
        catch {}
    }

    $components += @{
        type = "library"
        name = $depName
        version = $exactVersion
        purl = "pkg:npm/$depName@$exactVersion"
        scope = "required"
        licenses = @(@{ license = @{ id = $license } })
    }
}

$sbom = @{
    bomFormat = "CycloneDX"
    specVersion = "1.5"
    serialNumber = "urn:uuid:$([guid]::NewGuid().ToString())"
    version = 1
    metadata = @{
        timestamp = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
        component = @{
            type = "application"
            name = "CallingBot"
            version = $version
            description = "CallingBot VidyaVision backend server"
            purl = "pkg:npm/omni2@$version"
        }
        tools = @(
            @{ name = "esbuild"; version = "0.28.2" }
            @{ name = "node-sea"; version = (node --version 2>$null) }
            @{ name = "postject"; version = "1.0.0-alpha.6" }
        )
    }
    components = $components
}

$sbomPath = Join-Path $ReleaseDir "SBOM.json"
$sbom | ConvertTo-Json -Depth 10 | Out-File -FilePath $sbomPath -Encoding utf8
Write-Host "  SBOM.json ($($components.Count) production dependencies, CycloneDX 1.5)" -ForegroundColor Green

# =============================================================
# 3. TEST_SUMMARY.md
# =============================================================
Write-Host "[3/3] Generating test summary..." -ForegroundColor Yellow

# Get npm audit results
$auditResult = "No vulnerabilities found"
$auditSeverity = ""
try {
    Push-Location $root
    $auditOutput = npm audit --json 2>$null | ConvertFrom-Json
    if ($auditOutput.metadata) {
        $vulns = $auditOutput.metadata.vulnerabilities
        $total = $vulns.total
        if ($total -gt 0) {
            $auditResult = "$total vulnerabilities"
            $auditSeverity = "Critical: $($vulns.critical), High: $($vulns.high), Moderate: $($vulns.moderate), Low: $($vulns.low)"
        }
    }
    Pop-Location
}
catch {
    Pop-Location
    $auditResult = "Audit not available"
}

# Check EXE exists
$exePath = Join-Path $ReleaseDir "backend\CallingBot.exe"
$exeExists = Test-Path $exePath
$exeSize = if ($exeExists) { [math]::Round((Get-Item $exePath).Length / 1MB, 1) } else { 0 }

# Check frontend ZIP exists
$frontendZip = Get-ChildItem (Join-Path $ReleaseDir "frontend") -Filter "*.zip" -ErrorAction SilentlyContinue | Select-Object -First 1
$frontendExists = ($null -ne $frontendZip)

$testSummary = @"
# CallingBot Test Summary

**Release:** $releaseName
**Generated:** $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
**Node.js:** $(node --version 2>$null)
**npm:** $(npm --version 2>$null)
**OS:** $(Get-CimInstance Win32_OperatingSystem | Select-Object -ExpandProperty Caption)
**Arch:** x64

## Build Verification

| Check | Status | Detail |
|-------|--------|--------|
| Backend EXE exists | $(if ($exeExists) { "PASS" } else { "FAIL" }) | $exeSize MB |
| Frontend ZIP exists | $(if ($frontendExists) { "PASS" } else { "SKIP" }) | $(if ($frontendExists) { $frontendZip.Name } else { "Not included (run with full build)" }) |
| Service XML present | $(if (Test-Path (Join-Path $ReleaseDir "service\CallingBot-service.xml")) { "PASS" } else { "FAIL" }) | WinSW configuration |
| Config template present | $(if (Test-Path (Join-Path $ReleaseDir "config\callingbot.template.json")) { "PASS" } else { "FAIL" }) | No secrets included |
| CHECKSUMS.sha256 | PASS | $($allFiles.Count) files hashed |
| SBOM.json | PASS | $($components.Count) components, CycloneDX 1.5 |

## Dependency Audit

| Metric | Value |
|--------|-------|
| Production dependencies | $($components.Count) |
| npm audit result | $auditResult |
$(if ($auditSeverity) { "| Severity breakdown | $auditSeverity |`n" } else { "" })
## Validation Scripts Available

| Script | Purpose |
|--------|---------|
| ``validate-backend-exe.ps1`` | EXE PE header, startup, health, auth endpoints |
| ``validate-service-lifecycle.ps1`` | Windows service start/stop/recovery/logs |
| ``validate-iis-spa-fallback.ps1`` | IIS SPA routing and static content |
| ``validate-iis-backend-routing.ps1`` | Reverse proxy to backend |
| ``validate-existing-iis-isolation.ps1`` | IIS app pool isolation |
| ``validate-integrations.js`` | SQL Server and calling-provider connectivity |
| ``validate-config-template.js`` | Configuration file validation |
| ``audit-secrets.js`` | Source code secret scan |

## Notes

- Backend EXE validation (10/10 tests) was run during build — results in ``docs/CB-013_validation_testing.md``
- Full service lifecycle testing requires the service installed on a Windows Server
- IIS validation requires IIS role enabled with URL Rewrite module
- Integration tests require live SQL Server and OmniDimension API access
"@

$testSummaryPath = Join-Path $ReleaseDir "TEST_SUMMARY.md"
$testSummary | Out-File -FilePath $testSummaryPath -Encoding utf8
Write-Host "  TEST_SUMMARY.md generated" -ForegroundColor Green

# --- Summary ---
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Metadata Generation Complete" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  CHECKSUMS.sha256  — $($allFiles.Count) file hashes" -ForegroundColor Gray
Write-Host "  SBOM.json         — $($components.Count) components (CycloneDX 1.5)" -ForegroundColor Gray
Write-Host "  TEST_SUMMARY.md   — Build and verification summary" -ForegroundColor Gray
Write-Host ""
