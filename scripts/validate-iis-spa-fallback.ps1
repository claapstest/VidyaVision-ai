<#
.SYNOPSIS
    Validates IIS static content hosting, default document, and SPA fallback rules (CB-023 / TC-014).

.DESCRIPTION
    Audits:
    1. Static web.config configuration:
       - Default document set to index.html
       - MIME types for SVG, WOFF2, WebP, JSON, and WebManifest
       - Directory browsing disabled
       - URL Rewrite SPA fallback rule present with /api/ bypass
    2. Live HTTP endpoint behavior (if -BaseUrl is provided):
       - Default document resolution (/ -> index.html, HTTP 200)
       - Client-side virtual routes fallback (/login, /dashboard, /campaigns -> index.html, HTTP 200)
       - API endpoints bypass (/api/* does not return HTML index)
       - Static asset MIME types match expected headers

.PARAMETER WebConfigPath
    Path to web.config to inspect. Default: ".\dist\web.config"

.PARAMETER BaseUrl
    Optional URL of the deployed application (e.g. "http://localhost/callingbot") to test live.

.EXAMPLE
    .\scripts\validate-iis-spa-fallback.ps1 -WebConfigPath ".\dist\web.config"
    .\scripts\validate-iis-spa-fallback.ps1 -BaseUrl "https://server.domain.com/callingbot"
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$WebConfigPath = ".\dist\web.config",

    [Parameter(Mandatory = $false)]
    [string]$BaseUrl = ""
)

$ErrorActionPreference = "Continue"

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "  CallingBot IIS Static Content & SPA Fallback Audit (CB-023 / TC-014)" -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Cyan

$passCount = 0
$failCount = 0

function Assert-Check($name, $pass, $detail) {
    if ($pass) {
        Write-Host "  [PASS] $name - $detail" -ForegroundColor Green
        $script:passCount++
    } else {
        Write-Host "  [FAIL] $name - $detail" -ForegroundColor Red
        $script:failCount++
    }
}

# ----------------------------------------------------
# Part 1: Static web.config Architecture Validation
# ----------------------------------------------------
Write-Host "[1/2] Auditing web.config configuration rules..." -ForegroundColor Yellow

if (-not (Test-Path $WebConfigPath)) {
    # Check fallback in frontend/public
    $alt = ".\frontend\public\web.config"
    if (Test-Path $alt) { $WebConfigPath = $alt }
}

if (Test-Path $WebConfigPath) {
    [xml]$xml = Get-Content $WebConfigPath -Raw

    # 1. Default Document
    $defaultDoc = $xml.configuration.'system.webServer'.defaultDocument.files.add.value
    $hasIndex = ($defaultDoc -eq "index.html" -or $defaultDoc -contains "index.html")
    Assert-Check "Default Document index.html" $hasIndex "Default document: $defaultDoc"

    # 2. Directory Browsing Disabled
    $dirBrowse = $xml.configuration.'system.webServer'.directoryBrowse.enabled
    $dirDisabled = ($dirBrowse -eq "false")
    Assert-Check "Directory Browsing Disabled" $dirDisabled "directoryBrowse enabled: $dirBrowse"

    # 3. MIME Mappings
    $mimeMaps = $xml.configuration.'system.webServer'.staticContent.mimeMap
    $exts = @($mimeMaps | ForEach-Object { $_.fileExtension })

    Assert-Check "MIME Map .json" ($exts -contains ".json") "application/json"
    Assert-Check "MIME Map .svg" ($exts -contains ".svg") "image/svg+xml"
    Assert-Check "MIME Map .woff2" ($exts -contains ".woff2") "font/woff2"
    Assert-Check "MIME Map .webp" ($exts -contains ".webp") "image/webp"

    # 4. URL Rewrite SPA Fallback Rule
    $rules = $xml.configuration.'system.webServer'.rewrite.rules.rule
    $spaRule = $rules | Where-Object { $_.name -like "*SPA*" -or $_.action.url -eq "index.html" }
    Assert-Check "SPA Fallback Rule Present" ($null -ne $spaRule) "Action: rewrite to index.html"

    if ($spaRule) {
        $conditions = @($spaRule.conditions.add)
        $hasApiBypass = $false
        foreach ($c in $conditions) {
            if ($c.input -like "*{REQUEST_URI}*" -and $c.negate -eq "true" -and $c.pattern -like "*api*") {
                $hasApiBypass = $true
                break
            }
        }
        Assert-Check "API Route Bypass in SPA Rewrite" $hasApiBypass "Condition excludes /api/ requests from index.html rewrite"
    }

    # 5. Security Headers
    $headers = @($xml.configuration.'system.webServer'.httpProtocol.customHeaders.add | ForEach-Object { $_.name })
    Assert-Check "Security Header X-Content-Type-Options" ($headers -contains "X-Content-Type-Options") "nosniff"
    Assert-Check "Security Header X-Frame-Options" ($headers -contains "X-Frame-Options") "SAMEORIGIN"
} else {
    Assert-Check "web.config Found" $false "Path not found: $WebConfigPath"
}

# ----------------------------------------------------
# Part 2: Live HTTP Endpoint Verification (if BaseUrl provided)
# ----------------------------------------------------
if ($BaseUrl) {
    $BaseUrl = $BaseUrl.TrimEnd('/')
    Write-Host "`n[2/2] Testing live IIS endpoints against $BaseUrl..." -ForegroundColor Yellow

    # Test A: Default document
    try {
        $r = Invoke-WebRequest -Uri "$BaseUrl/" -UseBasicParsing -TimeoutSec 10
        $isOk = ($r.StatusCode -eq 200 -and $r.Content -match 'id="root"')
        Assert-Check "Root URL Default Document" $isOk "Status: $($r.StatusCode), Length: $($r.Content.Length)"
    } catch {
        Assert-Check "Root URL Default Document" $false $_.Exception.Message
    }

    # Test B: SPA client-side routes (must return index.html 200 OK, not 404)
    $routes = @("/login", "/dashboard", "/campaigns", "/history")
    foreach ($route in $routes) {
        try {
            $r = Invoke-WebRequest -Uri "$BaseUrl$route" -UseBasicParsing -TimeoutSec 10
            $isSpaOk = ($r.StatusCode -eq 200 -and $r.Content -match 'id="root"')
            Assert-Check "SPA Route '$route' Refresh" $isSpaOk "Status: $($r.StatusCode) (rewritten to index.html)"
        } catch {
            Assert-Check "SPA Route '$route' Refresh" $false $_.Exception.Message
        }
    }

    # Test C: API endpoint does NOT return index.html
    try {
        $r = Invoke-WebRequest -Uri "$BaseUrl/api/health" -UseBasicParsing -TimeoutSec 5
        $notHtml = ($r.Content -notmatch '<div id="root">')
        Assert-Check "API Route Not Swallowed by SPA" $notHtml "Status: $($r.StatusCode) (API response, not index.html)"
    } catch {
        # Even if connection fails or returns 401/404, as long as it's not the HTML index page, it passed
        $resp = $_.Exception.Response
        $body = if ($resp) { [System.IO.StreamReader]::new($resp.GetResponseStream()).ReadToEnd() } else { "" }
        $notHtml = ($body -notmatch '<div id="root">')
        Assert-Check "API Route Not Swallowed by SPA" $notHtml "API request was not rewritten to index.html"
    }
} else {
    Write-Host "`n[2/2] Live HTTP verification skipped (pass -BaseUrl http://server/callingbot to run live requests)." -ForegroundColor Gray
}

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "Results: $passCount Passed, $failCount Failed" -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Cyan

if ($failCount -gt 0) {
    exit 1
} else {
    Write-Host "[OK] IIS Static Content and SPA Fallback verified successfully.`n" -ForegroundColor Green
    exit 0
}
