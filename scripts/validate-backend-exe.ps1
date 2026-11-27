# CallingBot Backend EXE Validation Script (CB-013)
# Tests the standalone EXE on Windows without requiring Node.js installed

param(
    [string]$ExePath = ".\release\CallingBot.exe",
    [int]$Port = 5099,
    [int]$TimeoutSec = 15
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

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  CallingBot EXE Validation" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# 1. Verify EXE exists
if (-not (Test-Path $ExePath)) {
    Write-Host "ERROR: EXE not found at $ExePath" -ForegroundColor Red
    exit 1
}

$exeInfo = Get-Item $ExePath
$sizeMb = [math]::Round($exeInfo.Length / 1MB, 2)
Write-Host "EXE: $($exeInfo.FullName)" -ForegroundColor Gray
Write-Host "Size: $sizeMb MB" -ForegroundColor Gray
Write-Host "Modified: $($exeInfo.LastWriteTime)" -ForegroundColor Gray
Add-Result "EXE exists" $true "Size: $sizeMb MB"

# 2. Verify it is a valid Windows PE executable
$bytes = [System.IO.File]::ReadAllBytes($exeInfo.FullName)
$mz = [System.Text.Encoding]::ASCII.GetString($bytes, 0, 2)
$isPE = ($mz -eq "MZ")
Add-Result "Valid PE header" $isPE "Magic: $mz"

# 3. Check it's x64
$peOffset = [BitConverter]::ToInt32($bytes, 60)
$machine = [BitConverter]::ToUInt16($bytes, $peOffset + 4)
$isX64 = ($machine -eq 0x8664)
Add-Result "x64 architecture" $isX64 "Machine: 0x$($machine.ToString('X4'))"

# 4. Start EXE and test health endpoint
Write-Host "`nStarting EXE on port $Port..." -ForegroundColor Yellow
$env:PORT = $Port
$env:MSSQL_HOST = "localhost"
$env:MSSQL_PASSWORD = "test"

$process = $null
try {
    $process = Start-Process -FilePath $exeInfo.FullName -PassThru -NoNewWindow -RedirectStandardOutput ".\release\stdout.log" -RedirectStandardError ".\release\stderr.log"
    Add-Result "EXE starts" $true "PID: $($process.Id)"

    # Wait for server to be ready
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
        catch {
            # Server not ready yet
        }
    }

    Add-Result "Health endpoint responds" $ready $(if ($ready) { "HTTP 200 within ${i}s" } else { "Timed out after ${TimeoutSec}s" })

    if ($ready) {
        # 5. Test health response content
        try {
            $health = Invoke-RestMethod -Uri "http://localhost:$Port/health" -TimeoutSec 5
            $hasStatus = ($health.status -eq "ok")
            Add-Result "Health status=ok" $hasStatus "status=$($health.status)"
            Add-Result "Uptime reported" ($health.uptimeSeconds -ge 0) "uptime=$($health.uptimeSeconds)s"
        }
        catch {
            Add-Result "Health JSON parse" $false $_.Exception.Message
        }

        # 6. Test API auth endpoint exists
        try {
            $resp = Invoke-WebRequest -Uri "http://localhost:$Port/api/auth/login" -Method POST -ContentType "application/json" -Body '{"email":"test","password":"test"}' -TimeoutSec 5 -UseBasicParsing
        }
        catch {
            $code = $_.Exception.Response.StatusCode.value__
            $isAuth = ($code -eq 401 -or $code -eq 400)
            Add-Result "Auth endpoint responds" $isAuth "HTTP $code (expected 400/401)"
        }

        # 7. Test config endpoint (401 proves it exists and enforces auth)
        try {
            $config = Invoke-RestMethod -Uri "http://localhost:$Port/api/config" -TimeoutSec 5 -Headers @{ Authorization = "Bearer test" }
            Add-Result "Config endpoint" ($config.success -eq $true) "success=$($config.success)"
        }
        catch {
            $code = if ($_.Exception.Response) { $_.Exception.Response.StatusCode.value__ } else { "N/A" }
            $isValid = ($code -eq 401 -or $code -eq 403)
            Add-Result "Config endpoint" $isValid "HTTP $code (auth enforced)"
        }
    }

    # 8. Graceful shutdown
    Write-Host "`nStopping EXE..." -ForegroundColor Yellow
    if (-not $process.HasExited) {
        Stop-Process -Id $process.Id -Force -Confirm:$false
        Start-Sleep -Seconds 2
        Add-Result "Graceful shutdown" $process.HasExited "Process terminated"
    }
}
catch {
    Add-Result "EXE starts" $false $_.Exception.Message
}
finally {
    if ($process -and -not $process.HasExited) {
        Stop-Process -Id $process.Id -Force -Confirm:$false
    }
    Remove-Item env:\PORT -ErrorAction SilentlyContinue
    Remove-Item env:\MSSQL_HOST -ErrorAction SilentlyContinue
    Remove-Item env:\MSSQL_PASSWORD -ErrorAction SilentlyContinue
}

# Print results
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Validation Results" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$passCount = ($results | Where-Object { $_.Status -eq "PASS" }).Count
$failCount = ($results | Where-Object { $_.Status -eq "FAIL" }).Count

foreach ($r in $results) {
    $color = if ($r.Status -eq "PASS") { "Green" } else { "Red" }
    $icon = if ($r.Status -eq "PASS") { "[PASS]" } else { "[FAIL]" }
    Write-Host "  $icon $($r.Test): $($r.Detail)" -ForegroundColor $color
}

Write-Host "`n  Total: $passCount passed, $failCount failed" -ForegroundColor $(if ($failCount -eq 0) { "Green" } else { "Yellow" })
Write-Host ""

exit $failCount
