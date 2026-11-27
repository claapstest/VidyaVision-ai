<#
.SYNOPSIS
    Assembles a versioned release directory with all CallingBot deployment artifacts (CB-028).

.DESCRIPTION
    Creates a self-contained release package:
      release/CallingBot-v<version>-<date>/
        |-- backend/           CallingBot.exe
        |-- frontend/          vidyavision-frontend-*.zip
        |-- service/           WinSW XML config
        |-- config/            callingbot.template.json + README
        |-- scripts/           Deployment and validation scripts
        |-- docs/              All story documentation
        |-- RELEASE_NOTES.md   Version summary
        \-- MANIFEST.txt       File listing with sizes

    Excludes: source code, .git, node_modules, secrets, private keys, debug artifacts.

.PARAMETER Version
    Release version string. Default: read from package.json.

.PARAMETER OutputDir
    Parent directory for the release folder. Default: .\release

.PARAMETER SkipBuild
    Skip frontend/backend builds (use existing artifacts).

.EXAMPLE
    .\scripts\assemble-release.ps1
    .\scripts\assemble-release.ps1 -Version "1.0.0" -SkipBuild
#>

[CmdletBinding()]
param(
    [string]$Version = "",
    [string]$OutputDir = ".\release",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

# Read version from package.json if not provided
if (-not $Version) {
    $pkg = Get-Content (Join-Path $root "package.json") -Raw | ConvertFrom-Json
    $Version = $pkg.version
    if (-not $Version) { $Version = "1.0.0" }
}

$date = Get-Date -Format "yyyyMMdd"
$releaseName = "CallingBot-v$Version-$date"
$releaseDir = Join-Path $OutputDir $releaseName

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  CallingBot Release Assembly" -ForegroundColor Cyan
Write-Host "  Version: $Version" -ForegroundColor Cyan
Write-Host "  Date:    $date" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# --- Step 1: Build artifacts if needed ---
if (-not $SkipBuild) {
    Write-Host "[1/6] Building artifacts..." -ForegroundColor Yellow

    Write-Host "  Building frontend..." -ForegroundColor Gray
    Push-Location $root
    npm run build:frontend 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Error "Frontend build failed." }

    Write-Host "  Packaging frontend ZIP..." -ForegroundColor Gray
    npm run package:frontend 2>&1 | Out-Null

    Write-Host "  Building backend EXE..." -ForegroundColor Gray
    npm run build:backend:all 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Error "Backend build failed." }
    Pop-Location

    Write-Host "  Builds complete" -ForegroundColor Green
}
else {
    Write-Host "[1/6] Skipping builds (--SkipBuild)" -ForegroundColor Yellow
}

# --- Step 2: Create release directory structure ---
Write-Host "[2/6] Creating release directory: $releaseName" -ForegroundColor Yellow

if (Test-Path $releaseDir) {
    Remove-Item -Path $releaseDir -Recurse -Force -Confirm:$false
}

$subDirs = @("backend", "frontend", "service", "config", "scripts", "docs")
foreach ($dir in $subDirs) {
    New-Item -ItemType Directory -Path (Join-Path $releaseDir $dir) -Force | Out-Null
}
Write-Host "  Directory structure created" -ForegroundColor Green

# --- Step 3: Copy artifacts ---
Write-Host "[3/6] Copying artifacts..." -ForegroundColor Yellow

# Backend EXE
$exeSrc = Join-Path $root "release\CallingBot.exe"
if (Test-Path $exeSrc) {
    Copy-Item -Path $exeSrc -Destination (Join-Path $releaseDir "backend\CallingBot.exe") -Confirm:$false
    $exeSize = [math]::Round((Get-Item $exeSrc).Length / 1MB, 1)
    Write-Host "  backend/CallingBot.exe ($exeSize MB)" -ForegroundColor Gray
}
else {
    Write-Warning "CallingBot.exe not found at $exeSrc"
}

# Frontend ZIP
$frontendZips = Get-ChildItem (Join-Path $root "release") -Filter "vidyavision-frontend-*.zip" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending
if ($frontendZips.Count -gt 0) {
    $latestZip = $frontendZips[0]
    Copy-Item -Path $latestZip.FullName -Destination (Join-Path $releaseDir "frontend\$($latestZip.Name)") -Confirm:$false
    $zipSize = [math]::Round($latestZip.Length / 1MB, 1)
    Write-Host "  frontend/$($latestZip.Name) ($zipSize MB)" -ForegroundColor Gray
}
else {
    Write-Warning "No frontend ZIP found in release/"
}

# Service wrapper config
$serviceXml = Join-Path $root "service\CallingBot-service.xml"
if (Test-Path $serviceXml) {
    Copy-Item -Path $serviceXml -Destination (Join-Path $releaseDir "service\CallingBot-service.xml") -Confirm:$false
    Write-Host "  service/CallingBot-service.xml" -ForegroundColor Gray
}

# Config template (NOT actual secrets)
$configTemplate = Join-Path $root "config\callingbot.template.json"
if (Test-Path $configTemplate) {
    Copy-Item -Path $configTemplate -Destination (Join-Path $releaseDir "config\callingbot.template.json") -Confirm:$false
    Write-Host "  config/callingbot.template.json" -ForegroundColor Gray
}
$configReadme = Join-Path $root "config\README.md"
if (Test-Path $configReadme) {
    Copy-Item -Path $configReadme -Destination (Join-Path $releaseDir "config\README.md") -Confirm:$false
    Write-Host "  config/README.md" -ForegroundColor Gray
}

# SQL Server Database Creation Script
$schemaSql = Join-Path $root "schema.sql"
if (Test-Path $schemaSql) {
    Copy-Item -Path $schemaSql -Destination (Join-Path $releaseDir "config\schema.sql") -Confirm:$false
    Write-Host "  config/schema.sql" -ForegroundColor Gray
}

# Deployment scripts (only the ones needed for deployment)
$deployScripts = @(
    "init-windows-layout.ps1",
    "verify-windows-layout.ps1",
    "set-config-acls.ps1",
    "verify-config-acls.ps1",
    "install-service.ps1",
    "uninstall-service.ps1",
    "validate-service-lifecycle.ps1",
    "validate-backend-exe.ps1",
    "setup-iis-isolation.ps1",
    "verify-iis-isolation.ps1",
    "configure-iis-features.ps1",
    "configure-iis-https-permissions.ps1",
    "verify-iis-https-permissions.ps1",
    "configure-iis-backend-routing.ps1",
    "validate-iis-backend-routing.ps1",
    "validate-iis-spa-fallback.ps1",
    "validate-existing-iis-isolation.ps1",
    "validate-integrations.js",
    "validate-integrations.ps1",
    "validate-config-template.js",
    "audit-secrets.js"
)
$scriptsSrc = Join-Path $root "scripts"
$scriptsDst = Join-Path $releaseDir "scripts"
$copiedScripts = 0
foreach ($s in $deployScripts) {
    $src = Join-Path $scriptsSrc $s
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination (Join-Path $scriptsDst $s) -Confirm:$false
        $copiedScripts++
    }
}
Write-Host "  scripts/ ($copiedScripts deployment scripts)" -ForegroundColor Gray

# Documentation
$docsSrc = Join-Path $root "docs"
$docsDst = Join-Path $releaseDir "docs"
if (Test-Path $docsSrc) {
    $docFiles = Get-ChildItem $docsSrc -Filter "*.md"
    foreach ($doc in $docFiles) {
        Copy-Item -Path $doc.FullName -Destination (Join-Path $docsDst $doc.Name) -Confirm:$false
    }
    Write-Host "  docs/ ($($docFiles.Count) documents)" -ForegroundColor Gray
}

# .env.example (reference, not actual secrets)
$envExample = Join-Path $root ".env.example"
if (Test-Path $envExample) {
    Copy-Item -Path $envExample -Destination (Join-Path $releaseDir "config\.env.example") -Confirm:$false
    Write-Host "  config/.env.example" -ForegroundColor Gray
}

Write-Host "  Artifacts copied" -ForegroundColor Green

# --- Step 4: Generate RELEASE_NOTES.md ---
Write-Host "[4/6] Generating release notes..." -ForegroundColor Yellow

$releaseNotes = @"
# CallingBot Release v$Version

**Date:** $(Get-Date -Format "yyyy-MM-dd")
**Node.js:** $(node --version 2>$null)
**Platform:** Windows x64

## Contents

| Artifact | Location | Description |
|----------|----------|-------------|
| Backend EXE | ``backend/CallingBot.exe`` | Standalone Node.js SEA binary |
| Frontend | ``frontend/*.zip`` | Production React/Vite build for IIS |
| Service Config | ``service/CallingBot-service.xml`` | WinSW service descriptor |
| Config Template | ``config/callingbot.template.json`` | Deployment configuration template |
| Scripts | ``scripts/`` | Deployment, validation, and verification scripts |
| Documentation | ``docs/`` | Per-story implementation documentation |

## Deployment Steps

1. Run ``scripts/init-windows-layout.ps1`` to create the folder structure
2. Copy ``backend/CallingBot.exe`` to ``C:\CallingBot\Backend\``
3. Copy and edit ``config/callingbot.template.json`` as ``C:\CallingBot\Config\callingbot.json``
4. Run ``scripts/set-config-acls.ps1`` to lock down config permissions
5. Run ``scripts/install-service.ps1`` to register the Windows service
6. Extract the frontend ZIP to the IIS site directory
7. Run ``scripts/validate-service-lifecycle.ps1`` to verify

## Security Notes

- This release contains NO secrets, private keys, or credentials
- The config template has placeholder values that MUST be replaced before deployment
- CallingBot.exe is unsigned; sign with an Authenticode certificate before deployment
- The service runs as ``NT SERVICE\CallingBot`` (least-privilege virtual account)

## Epics Completed

- **EPIC-01:** Frontend production build and IIS packaging
- **EPIC-02:** Backend standalone Windows EXE packaging
- **EPIC-03:** External configuration, secrets handling, Windows folder layout
- **EPIC-04:** Windows service wrapper (WinSW)
- **EPIC-05:** IIS frontend deployment and connectivity validation
- **EPIC-06:** Release packaging (this release)
"@

$releaseNotes | Out-File -FilePath (Join-Path $releaseDir "RELEASE_NOTES.md") -Encoding utf8
Write-Host "  RELEASE_NOTES.md generated" -ForegroundColor Green

# --- Step 5: Generate MANIFEST.txt ---
Write-Host "[5/6] Generating manifest..." -ForegroundColor Yellow

$manifestLines = @("# CallingBot Release Manifest", "# Version: $Version", "# Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')", "")
$allFiles = Get-ChildItem $releaseDir -Recurse -File | Sort-Object FullName
foreach ($f in $allFiles) {
    $relPath = $f.FullName.Substring($releaseDir.Length + 1)
    $sizeKb = [math]::Round($f.Length / 1KB, 1)
    $manifestLines += "{0,-70} {1,10} KB" -f $relPath, $sizeKb
}
$manifestLines += ""
$manifestLines += "Total files: $($allFiles.Count)"
$totalSize = [math]::Round(($allFiles | Measure-Object Length -Sum).Sum / 1MB, 1)
$manifestLines += "Total size:  $totalSize MB"

($manifestLines -join "`n") | Out-File -FilePath (Join-Path $releaseDir "MANIFEST.txt") -Encoding utf8
Write-Host "  MANIFEST.txt ($($allFiles.Count) files, $totalSize MB)" -ForegroundColor Green

# --- Step 6: Verify no secrets leaked ---
Write-Host "[6/6] Scanning for leaked secrets..." -ForegroundColor Yellow

$secretPatterns = @(
    "password\s*[:=]\s*[""'][^<""'\s]",
    "api[_-]?key\s*[:=]\s*[""'][^<""'\s]",
    "secret\s*[:=]\s*[""'][^<""'\s]",
    "-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY",
    "\.env$"
)
$excludeFiles = @("audit-secrets.js", ".env.example", "validate-backend-exe.ps1", "validate-integrations.js")
$suspectFiles = @()
foreach ($f in $allFiles) {
    if ($f.Extension -eq ".exe" -or $f.Extension -eq ".zip") { continue }
    if ($excludeFiles -contains $f.Name) { continue }
    $content = Get-Content $f.FullName -Raw -ErrorAction SilentlyContinue
    if (-not $content) { continue }
    foreach ($pattern in $secretPatterns) {
        if ($content -match $pattern) {
            if ($content -match "<REPLACE_WITH_") { continue }
            $suspectFiles += "$($f.Name): matched '$pattern'"
        }
    }
}
if ($suspectFiles.Count -gt 0) {
    Write-Warning "Potential secrets found in release:"
    $suspectFiles | ForEach-Object { Write-Warning "  $_" }
}
else {
    Write-Host "  No secrets detected" -ForegroundColor Green
}

# --- Summary ---
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Release Assembly Complete" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Output:  $releaseDir" -ForegroundColor Gray
Write-Host "  Files:   $($allFiles.Count)" -ForegroundColor Gray
Write-Host "  Size:    $totalSize MB" -ForegroundColor Gray
Write-Host "  Notes:   $releaseDir\RELEASE_NOTES.md" -ForegroundColor Gray
Write-Host "  Manifest: $releaseDir\MANIFEST.txt" -ForegroundColor Gray
Write-Host ""
