<#
.SYNOPSIS
    Automated validation of SQL Server and Calling Provider (OmniDimension) connectivity (CB-026 / TC-017).

.DESCRIPTION
    Wraps the Node.js integration diagnostic suite (scripts/validate-integrations.js):
    1. Audits database configuration parameters (Host, Port, User, DB, Encrypt, TrustCert).
    2. Tests TCP socket connectivity to SQL Server and validates table schemas.
    3. Audits Calling Provider (OmniDimension) endpoint, authentication, and dispatch payloads.
    4. Validates timeout handling, HTTP 429 concurrency retries (3 attempts), and failure recovery.
    5. Verifies call-status state machine transitions and emits connectivity-audit.json evidence.

.PARAMETER ConfigPath
    Optional path to configuration file (sets CALLINGBOT_CONFIG).

.EXAMPLE
    .\scripts\validate-integrations.ps1
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$ConfigPath = ""
)

$ErrorActionPreference = "Continue"

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "  CallingBot SQL & Provider Integration Test (CB-026)" -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Cyan

if ($ConfigPath -and (Test-Path $ConfigPath)) {
    $env:CALLINGBOT_CONFIG = (Resolve-Path $ConfigPath).Path
    Write-Host "Using external configuration: $env:CALLINGBOT_CONFIG" -ForegroundColor Gray
}

$scriptPath = Join-Path $PSScriptRoot "validate-integrations.js"
if (-not (Test-Path $scriptPath)) {
    Write-Error "Integration validation script not found: $scriptPath"
    exit 1
}

# Execute Node.js diagnostic suite
& node $scriptPath

$exitCode = $LASTEXITCODE

if ($exitCode -eq 0) {
    Write-Host "[OK] SQL and Calling-Provider connectivity validated successfully.`n" -ForegroundColor Green
    exit 0
} else {
    Write-Host "[FAIL] SQL and Calling-Provider connectivity validation failed (Exit Code: $exitCode).`n" -ForegroundColor Red
    exit 1
}
