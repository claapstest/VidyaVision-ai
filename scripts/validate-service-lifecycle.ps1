<#
.SYNOPSIS
    Validates CallingBot Windows service lifecycle, recovery and logging (CB-021).

.DESCRIPTION
    Tests:
      1. Service is registered and configuration is correct
      2. Service starts and health endpoint responds
      3. Service stops gracefully within timeout
      4. Service recovers after process kill (simulated crash)
      5. Logs are written to the Logs folder
      6. Automatic startup type is configured

.PARAMETER InstallRoot
    CallingBot deployment root. Default: C:\CallingBot

.PARAMETER Port
    Port the backend listens on. Default: 5000

.PARAMETER TimeoutSec
    Seconds to wait for service startup. Default: 30

.EXAMPLE
    .\scripts\validate-service-lifecycle.ps1 -InstallRoot "C:\CallingBot"
#>

[CmdletBinding()]
param(
    [string]$InstallRoot = "C:\CallingBot",
    [int]$Port = 5000,
    [int]$TimeoutSec = 30
)

$ErrorActionPreference = "Continue"
$results = @()

function Add-Result($name, $pass, $detail) {
    $script:results += [pscustomobject]@{
        Test   = $name
        Status = if ($pass) { "PASS" } else { "FAIL" }
        Detail = $detail
    }
}

function Print-Results {
    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host "  Service Lifecycle Results" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan

    $passCount = @($results | Where-Object { $_.Status -eq "PASS" }).Count
    $failCount = @($results | Where-Object { $_.Status -eq "FAIL" }).Count

    foreach ($r in $results) {
        $color = if ($r.Status -eq "PASS") { "Green" } else { "Red" }
        $icon = if ($r.Status -eq "PASS") { "[PASS]" } else { "[FAIL]" }
        Write-Host "  $icon $($r.Test): $($r.Detail)" -ForegroundColor $color
    }

    Write-Host "`n  Total: $passCount passed, $failCount failed" -ForegroundColor $(if ($failCount -eq 0) { "Green" } else { "Yellow" })
    Write-Host ""
}

$serviceDir = Join-Path $InstallRoot "Service"
$logsDir    = Join-Path $InstallRoot "Logs"
$serviceExe = Join-Path $serviceDir "CallingBot-service.exe"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  CallingBot Service Lifecycle Tests" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# --- Test 1: Service is registered ---
Write-Host "[1/7] Checking service registration..." -ForegroundColor Yellow
$svc = Get-Service -Name "CallingBot" -ErrorAction SilentlyContinue
$registered = ($null -ne $svc)
Add-Result "Service registered" $registered $(if ($registered) { "Status: $($svc.Status)" } else { "Service 'CallingBot' not found" })

if (-not $registered) {
    Write-Host "  Service not found. Run install-service.ps1 first." -ForegroundColor Red
    Print-Results
    exit 1
}

# --- Test 2: Startup type is auto/delayed ---
Write-Host "[2/7] Checking startup type..." -ForegroundColor Yellow
$startType = $svc.StartType.ToString()
$isAuto = ($startType -eq "Automatic" -or $startType -eq "AutomaticDelayedStart")
Add-Result "Auto-start configured" $isAuto "StartType: $startType"

# --- Test 3: Recovery policy ---
Write-Host "[3/7] Checking recovery policy..." -ForegroundColor Yellow
$scOutput = sc.exe qfailure CallingBot 2>&1 | Out-String
$hasRestart = $scOutput -match "RESTART"
Add-Result "Recovery policy set" $hasRestart $(if ($hasRestart) { "Restart actions configured" } else { "No restart actions found" })

# --- Test 4: Service starts and health responds ---
Write-Host "[4/7] Starting service and testing health..." -ForegroundColor Yellow
if ($svc.Status -ne "Running") {
    try {
        Start-Service -Name "CallingBot" -ErrorAction Stop
    }
    catch {
        Add-Result "Service starts" $false $_.Exception.Message
    }
}

$ready = $false
for ($i = 0; $i -lt $TimeoutSec; $i++) {
    Start-Sleep -Seconds 1
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:$Port/health" -TimeoutSec 2 -UseBasicParsing
        if ($resp.StatusCode -eq 200) {
            $ready = $true
            break
        }
    }
    catch {}
}
Add-Result "Service starts and serves HTTP" $ready $(if ($ready) { "Health OK within ${i}s" } else { "No response after ${TimeoutSec}s" })

# --- Test 5: Graceful stop ---
Write-Host "[5/7] Testing graceful shutdown..." -ForegroundColor Yellow
if ($ready) {
    $stopWatch = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        Stop-Service -Name "CallingBot" -Force -Confirm:$false -ErrorAction Stop
        $stopWatch.Stop()
        $stopSec = [math]::Round($stopWatch.Elapsed.TotalSeconds, 1)
        $graceful = ($stopSec -lt 35)
        Add-Result "Graceful shutdown" $graceful "Stopped in ${stopSec}s"
    }
    catch {
        $stopWatch.Stop()
        Add-Result "Graceful shutdown" $false $_.Exception.Message
    }
    Start-Sleep -Seconds 2
}
else {
    Add-Result "Graceful shutdown" $false "Skipped (service not running)"
}

# --- Test 6: Recovery after crash (kill process) ---
Write-Host "[6/7] Testing crash recovery..." -ForegroundColor Yellow
try {
    Start-Service -Name "CallingBot" -ErrorAction Stop
    Start-Sleep -Seconds 5

    # Find the CallingBot.exe process (child of WinSW)
    $proc = Get-Process -Name "CallingBot" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($proc) {
        Stop-Process -Id $proc.Id -Force -Confirm:$false
        Write-Host "  Killed PID $($proc.Id), waiting for recovery..." -ForegroundColor Gray

        $recovered = $false
        for ($i = 0; $i -lt 30; $i++) {
            Start-Sleep -Seconds 2
            try {
                $resp = Invoke-WebRequest -Uri "http://localhost:$Port/health" -TimeoutSec 2 -UseBasicParsing
                if ($resp.StatusCode -eq 200) {
                    $recovered = $true
                    break
                }
            }
            catch {}
        }
        Add-Result "Crash recovery" $recovered $(if ($recovered) { "Recovered after kill within $($i*2)s" } else { "Did not recover within 60s" })
    }
    else {
        Add-Result "Crash recovery" $false "Could not find CallingBot.exe process to kill"
    }
}
catch {
    Add-Result "Crash recovery" $false $_.Exception.Message
}

# --- Test 7: Logs written ---
Write-Host "[7/7] Checking log output..." -ForegroundColor Yellow
$logFiles = @()
if (Test-Path $logsDir) {
    $logFiles = Get-ChildItem -Path $logsDir -Filter "*.log" -ErrorAction SilentlyContinue
}
$hasLogs = ($logFiles.Count -gt 0)
$logDetail = if ($hasLogs) { "$($logFiles.Count) log file(s): $($logFiles[0].Name)" } else { "No .log files in $logsDir" }
Add-Result "Logs written" $hasLogs $logDetail

# --- Cleanup: stop service ---
$svcFinal = Get-Service -Name "CallingBot" -ErrorAction SilentlyContinue
if ($svcFinal -and $svcFinal.Status -eq "Running") {
    Write-Host "`nStopping service for cleanup..." -ForegroundColor Yellow
    Stop-Service -Name "CallingBot" -Force -Confirm:$false -ErrorAction SilentlyContinue
}

# --- Print results ---
Print-Results

$failCount = ($results | Where-Object { $_.Status -eq "FAIL" }).Count
exit $failCount
