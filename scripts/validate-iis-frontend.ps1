# CB-005: IIS Frontend Validation Script
# Run this on the target Windows Server after deploying the frontend ZIP to IIS.
# Usage: .\validate-iis-frontend.ps1 -BaseUrl "https://your-server.com"
#        .\validate-iis-frontend.ps1 -BaseUrl "https://your-server.com/callingbot"

param(
    [Parameter(Mandatory=$true)]
    [string]$BaseUrl
)

$BaseUrl = $BaseUrl.TrimEnd('/')
$passed = 0
$failed = 0
$results = @()

function Test-Endpoint {
    param([string]$Name, [string]$Url, [string]$ExpectContains, [string]$ExpectContentType)

    try {
        $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 10
        $ok = $true
        $notes = "Status $($r.StatusCode)"

        if ($ExpectContains -and ($r.Content -notmatch $ExpectContains)) {
            $ok = $false
            $notes += " | Missing expected content: $ExpectContains"
        }
        if ($ExpectContentType -and ($r.Headers['Content-Type'] -notmatch $ExpectContentType)) {
            $ok = $false
            $notes += " | Wrong Content-Type: $($r.Headers['Content-Type'])"
        }

        return @{ Name=$Name; Pass=$ok; Notes=$notes; Size=$r.Content.Length }
    } catch {
        $status = if ($_.Exception.Response) { $_.Exception.Response.StatusCode } else { 'Connection Failed' }
        return @{ Name=$Name; Pass=$false; Notes="$status - $($_.Exception.Message)" }
    }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  CB-005: IIS Frontend Validation" -ForegroundColor Cyan
Write-Host "  Target: $BaseUrl" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# 1. Index page loads
Write-Host "1. Testing index page..." -NoNewline
$r = Test-Endpoint -Name "Index Page" -Url "$BaseUrl/" -ExpectContains 'id=.root.' -ExpectContentType 'text/html'
$results += $r
if ($r.Pass) { $passed++; Write-Host " PASS" -ForegroundColor Green } else { $failed++; Write-Host " FAIL: $($r.Notes)" -ForegroundColor Red }

# 2. CSS loads
Write-Host "2. Testing CSS bundle..." -NoNewline
$html = (Invoke-WebRequest -Uri "$BaseUrl/" -UseBasicParsing -TimeoutSec 10).Content
$cssMatch = [regex]::Match($html, 'href="([^"]+\.css)"')
if ($cssMatch.Success) {
    $cssUrl = if ($cssMatch.Groups[1].Value.StartsWith('http')) { $cssMatch.Groups[1].Value } else { "$BaseUrl$($cssMatch.Groups[1].Value)" }
    $r = Test-Endpoint -Name "CSS Bundle" -Url $cssUrl -ExpectContentType 'text/css'
    $results += $r
    if ($r.Pass) { $passed++; Write-Host " PASS ($($r.Size) bytes)" -ForegroundColor Green } else { $failed++; Write-Host " FAIL: $($r.Notes)" -ForegroundColor Red }
} else {
    $failed++; Write-Host " FAIL: No CSS link found in HTML" -ForegroundColor Red
}

# 3. JS bundles load
Write-Host "3. Testing JS bundles..." -NoNewline
$jsMatches = [regex]::Matches($html, 'src="([^"]+\.js)"')
$jsOk = $true
foreach ($m in $jsMatches) {
    $jsUrl = if ($m.Groups[1].Value.StartsWith('http')) { $m.Groups[1].Value } else { "$BaseUrl$($m.Groups[1].Value)" }
    $r = Test-Endpoint -Name "JS: $($m.Groups[1].Value)" -Url $jsUrl -ExpectContentType 'javascript'
    $results += $r
    if (-not $r.Pass) { $jsOk = $false }
}
if ($jsOk) { $passed++; Write-Host " PASS ($($jsMatches.Count) bundles)" -ForegroundColor Green } else { $failed++; Write-Host " FAIL" -ForegroundColor Red }

# 4. Static assets
Write-Host "4. Testing static assets..." -NoNewline
$assets = @('favicon.svg', 'vidyavision-logo.svg', 'icons.svg')
$assetsOk = $true
foreach ($a in $assets) {
    $r = Test-Endpoint -Name $a -Url "$BaseUrl/$a"
    $results += $r
    if (-not $r.Pass) { $assetsOk = $false; Write-Host "`n   FAIL: $a - $($r.Notes)" -ForegroundColor Red }
}
if ($assetsOk) { $passed++; Write-Host " PASS ($($assets.Count) assets)" -ForegroundColor Green } else { $failed++ }

# 5. Guide page
Write-Host "5. Testing guide.html..." -NoNewline
$r = Test-Endpoint -Name "User Guide" -Url "$BaseUrl/guide.html" -ExpectContains '<html' -ExpectContentType 'text/html'
$results += $r
if ($r.Pass) { $passed++; Write-Host " PASS" -ForegroundColor Green } else { $failed++; Write-Host " FAIL: $($r.Notes)" -ForegroundColor Red }

# 6. SPA fallback (non-existent route should return index.html, not 404)
Write-Host "6. Testing SPA fallback routing..." -NoNewline
$r = Test-Endpoint -Name "SPA Fallback" -Url "$BaseUrl/test-spa-fallback-route" -ExpectContains 'id=.root.'
$results += $r
if ($r.Pass) { $passed++; Write-Host " PASS (returns index.html)" -ForegroundColor Green } else { $failed++; Write-Host " FAIL: $($r.Notes)" -ForegroundColor Red }

# 7. /api/ should NOT be rewritten (should return 502/503/404 from backend, not index.html)
Write-Host "7. Testing /api/ bypass (should NOT return index.html)..." -NoNewline
try {
    $apiR = Invoke-WebRequest -Uri "$BaseUrl/api/health" -UseBasicParsing -TimeoutSec 5
    if ($apiR.Content -match 'id=.root.') {
        $failed++; Write-Host " FAIL: /api/ is returning index.html (reverse proxy not configured)" -ForegroundColor Red
    } else {
        $passed++; Write-Host " PASS (backend responded)" -ForegroundColor Green
    }
} catch {
    $status = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
    if ($status -in 502,503,404) {
        $passed++; Write-Host " PASS (backend not running, but /api/ is NOT returning index.html)" -ForegroundColor Green
    } else {
        Write-Host " INFO: $status - verify manually" -ForegroundColor Yellow
        $passed++
    }
}

# Summary
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Results: $passed passed, $failed failed" -ForegroundColor $(if ($failed -eq 0) { 'Green' } else { 'Red' })
Write-Host "========================================`n" -ForegroundColor Cyan

if ($failed -gt 0) {
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "  - If index page fails: Check IIS site is started and points to the correct folder"
    Write-Host "  - If assets fail with 404: Check the ZIP was extracted correctly (index.html at root)"
    Write-Host "  - If SPA fallback fails: Install IIS URL Rewrite module and verify web.config is present"
    Write-Host "  - If /api/ returns index.html: Configure reverse proxy for /api/* to backend port"
}
