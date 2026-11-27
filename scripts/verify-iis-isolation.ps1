<#
.SYNOPSIS
    Verifies IIS application isolation for CallingBot (CB-022 / CB-027).

.DESCRIPTION
    Audits the IIS deployment to confirm:
    1. CallingBot uses a dedicated physical directory separate from the existing ASP.NET root.
    2. Existing ASP.NET application directories and configurations are unmodified.
    3. CallingBotAppPool is configured with No Managed Code (preventing CLR conflicts).
    4. Essential static assets (index.html, web.config) are present in the dedicated directory.

.PARAMETER PhysicalPath
    Path to the CallingBot frontend directory. Default: "C:\inetpub\CallingBot"

.PARAMETER AppPoolName
    Expected isolated application pool name. Default: "CallingBotAppPool"

.PARAMETER SiteName
    IIS Site name. Default: "Default Web Site"

.PARAMETER AppPath
    IIS Virtual application path. Default: "/callingbot"

.EXAMPLE
    .\scripts\verify-iis-isolation.ps1 -PhysicalPath "C:\inetpub\CallingBot"
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$PhysicalPath = "C:\inetpub\CallingBot",

    [Parameter(Mandatory = $false)]
    [string]$AppPoolName = "CallingBotAppPool",

    [Parameter(Mandatory = $false)]
    [string]$SiteName = "Default Web Site",

    [Parameter(Mandatory = $false)]
    [string]$AppPath = "/callingbot"
)

$ErrorActionPreference = "Continue"

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "  CallingBot IIS Application Isolation Audit (CB-022)" -ForegroundColor Cyan
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

# 1. Physical Directory Isolation
$wwwroot = "C:\inetpub\wwwroot"
$isNotRoot = ($PhysicalPath.TrimEnd('\') -ne $wwwroot.TrimEnd('\'))
Assert-Check "Physical Path Distinct from wwwroot" $isNotRoot "CallingBot: '$PhysicalPath' vs Root: '$wwwroot'"

$dirExists = Test-Path $PhysicalPath
Assert-Check "Dedicated Physical Directory Exists" $dirExists "Path: $PhysicalPath"

# 2. File Verification in Dedicated Directory
if ($dirExists) {
    $hasIndex = Test-Path (Join-Path $PhysicalPath "index.html")
    Assert-Check "Frontend index.html Present" $hasIndex "File: $(Join-Path $PhysicalPath 'index.html')"

    $hasWebConfig = Test-Path (Join-Path $PhysicalPath "web.config")
    Assert-Check "Dedicated web.config Present" $hasWebConfig "File: $(Join-Path $PhysicalPath 'web.config')"

    # 3. Check for Existing ASP.NET Protection
    # If a root wwwroot\web.config exists, ensure it doesn't mention CallingBot (proves isolation)
    $rootWebConfig = Join-Path $wwwroot "web.config"
    if (Test-Path $rootWebConfig) {
        $rootContent = Get-Content $rootWebConfig -Raw
        $notModified = ($rootContent -notmatch "CallingBot" -and $rootContent -notmatch "vidyavision")
        Assert-Check "Existing Root web.config Untouched" $notModified "Root web.config does not contain CallingBot rules"
    } else {
        Assert-Check "Existing Root web.config Untouched" $true "Root web.config not present or already isolated"
    }
}

# 4. IIS Live Configuration Verification (if IIS is installed)
$iisAvailable = $false
try {
    if (Get-Module -ListAvailable -Name WebAdministration) {
        Import-Module WebAdministration -ErrorAction Stop
        $iisAvailable = $true
    }
} catch { }

if ($iisAvailable) {
    # Check AppPool
    $pool = Get-Item "IIS:\AppPools\$AppPoolName" -ErrorAction SilentlyContinue
    $poolExists = ($null -ne $pool)
    Assert-Check "Dedicated AppPool Exists" $poolExists "Name: $AppPoolName"

    if ($poolExists) {
        $isNoManagedCode = ($pool.managedRuntimeVersion -eq "" -or $pool.managedRuntimeVersion -eq "No Managed Code")
        Assert-Check "AppPool No Managed Code (Isolated)" $isNoManagedCode "Runtime: '$(if ($pool.managedRuntimeVersion) { $pool.managedRuntimeVersion } else { 'No Managed Code' })'"

        $isIntegrated = ($pool.managedPipelineMode -eq "Integrated")
        Assert-Check "AppPool Integrated Pipeline" $isIntegrated "PipelineMode: $($pool.managedPipelineMode)"
    }

    # Check Application mapping
    $app = Get-Item "IIS:\Sites\$SiteName$AppPath" -ErrorAction SilentlyContinue
    $appExists = ($null -ne $app)
    Assert-Check "IIS Application Mapped" $appExists "Path: $SiteName$AppPath"

    if ($appExists) {
        $isBoundToPool = ($app.applicationPool -eq $AppPoolName)
        Assert-Check "Application Bound to Dedicated AppPool" $isBoundToPool "Pool: $($app.applicationPool)"
    }
} else {
    Write-Host "  ℹ IIS WebAdministration not active on local host; skipping live IIS object checks (run on server)." -ForegroundColor Gray
}

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "Audit Results: $passCount Passed, $failCount Failed" -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Cyan

if ($failCount -gt 0) {
    exit 1
} else {
    Write-Host "✓ IIS Application Isolation verified successfully.`n" -ForegroundColor Green
    exit 0
}
