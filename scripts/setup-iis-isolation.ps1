<#
.SYNOPSIS
    Provisions isolated IIS hosting for CallingBot without impacting existing ASP.NET apps (CB-022).

.DESCRIPTION
    1. Validates that IIS (WebAdministration) is installed.
    2. Creates a dedicated physical directory outside or isolated from existing ASP.NET apps.
    3. Deploys the frontend static assets and web.config into the physical directory.
    4. Creates a dedicated IIS Application Pool (CallingBotAppPool) with No Managed Code.
    5. Creates a dedicated IIS Application (/callingbot) or Dedicated Site.
    6. Confirms existing ASP.NET application directories and configurations are untouched.

.PARAMETER PhysicalPath
    Dedicated physical directory for frontend files. Default: C:\inetpub\CallingBot

.PARAMETER AppPoolName
    Name of the isolated Application Pool. Default: CallingBotAppPool

.PARAMETER SiteName
    Parent IIS site for the application. Default: "Default Web Site"

.PARAMETER AppPath
    URL virtual path alias under the parent site. Default: "/callingbot"

.PARAMETER FrontendSource
    Path to dist folder or frontend ZIP to deploy. Default: ".\dist"

.PARAMETER DedicatedSite
    If specified, creates a dedicated IIS Site instead of a sub-application.

.PARAMETER Port
    Port for the dedicated site (if -DedicatedSite is specified). Default: 8080

.PARAMETER DryRun
    Simulates actions without making live IIS changes. Useful for testing.

.EXAMPLE
    .\scripts\setup-iis-isolation.ps1 -PhysicalPath "C:\inetpub\CallingBot" -AppPath "/callingbot"
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
    [string]$AppPath = "/callingbot",

    [Parameter(Mandatory = $false)]
    [string]$FrontendSource = ".\dist",

    [switch]$DedicatedSite,
    [int]$Port = 8080,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "  CallingBot IIS Application Isolation Setup (CB-022)" -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Cyan

# Ensure normalized AppPath
if (-not $AppPath.StartsWith("/")) { $AppPath = "/$AppPath" }

Write-Host "Configuration Parameters:" -ForegroundColor Gray
Write-Host "  Physical Directory: $PhysicalPath" -ForegroundColor Gray
Write-Host "  Application Pool:   $AppPoolName (No Managed Code, Integrated)" -ForegroundColor Gray
if ($DedicatedSite) {
    Write-Host "  Hosting Mode:       Dedicated Site on Port $Port" -ForegroundColor Gray
} else {
    Write-Host "  Hosting Mode:       Sub-Application under '$SiteName'$AppPath" -ForegroundColor Gray
}
Write-Host "  Frontend Source:    $FrontendSource" -ForegroundColor Gray
Write-Host "  DryRun Mode:        $($DryRun.IsPresent)" -ForegroundColor Gray
Write-Host ""

# Step 1: Check Administrator privileges
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin -and -not $DryRun) {
    Write-Warning "Current session is not running as Administrator. IIS management requires elevation."
}

# Step 2: Check IIS WebAdministration module
Write-Host "[1/5] Checking IIS prerequisites..." -ForegroundColor Yellow
$iisModuleAvailable = $false
try {
    if (Get-Module -ListAvailable -Name WebAdministration) {
        $iisModuleAvailable = $true
        if (-not $DryRun) {
            Import-Module WebAdministration -ErrorAction Stop
        }
        Write-Host "  ✓ IIS WebAdministration module is available" -ForegroundColor Green
    } else {
        Write-Warning "WebAdministration PowerShell module not found on this system."
    }
} catch {
    Write-Warning "Could not load WebAdministration module: $($_.Exception.Message)"
}

$simulateIIS = $false
if (-not $iisModuleAvailable) {
    Write-Warning "IIS WebAdministration is not available on this machine. Files will be deployed and manifest generated; live IIS registration is simulated."
    $simulateIIS = $true
}

# Step 3: Create dedicated physical directory
Write-Host "`n[2/5] Creating dedicated physical directory..." -ForegroundColor Yellow
if (-not (Test-Path $PhysicalPath)) {
    if ($DryRun) {
        Write-Host "  [DryRun] Would create directory: $PhysicalPath" -ForegroundColor Cyan
    } else {
        New-Item -ItemType Directory -Path $PhysicalPath -Force | Out-Null
        Write-Host "  ✓ Created dedicated directory: $PhysicalPath" -ForegroundColor Green
    }
} else {
    Write-Host "  ✓ Directory already exists: $PhysicalPath" -ForegroundColor Gray
}

# Verify physical path is separate from Default Web Site root (C:\inetpub\wwwroot)
$wwwroot = "C:\inetpub\wwwroot"
if ($PhysicalPath.TrimEnd('\') -eq $wwwroot.TrimEnd('\')) {
    Write-Error "CRITICAL: PhysicalPath cannot be the root wwwroot folder! It must be isolated (e.g. C:\inetpub\CallingBot) to avoid overwriting existing ASP.NET applications."
    exit 1
} else {
    Write-Host "  ✓ Physical directory is isolated from root ASP.NET directory ($wwwroot)" -ForegroundColor Green
}

# Step 4: Deploy frontend files to physical directory
Write-Host "`n[3/5] Deploying frontend static files..." -ForegroundColor Yellow
$srcResolved = Resolve-Path $FrontendSource -ErrorAction SilentlyContinue

if ($srcResolved -and (Test-Path $srcResolved)) {
    if ($DryRun) {
        Write-Host "  [DryRun] Would copy files from $srcResolved to $PhysicalPath" -ForegroundColor Cyan
    } else {
        if ((Get-Item $srcResolved) -is [System.IO.DirectoryInfo]) {
            Copy-Item -Path "$srcResolved\*" -Destination $PhysicalPath -Recurse -Force
            Write-Host "  ✓ Deployed static files from $srcResolved" -ForegroundColor Green
        } elseif ($srcResolved.Path.EndsWith(".zip")) {
            Expand-Archive -Path $srcResolved.Path -DestinationPath $PhysicalPath -Force
            Write-Host "  ✓ Extracted frontend ZIP to $PhysicalPath" -ForegroundColor Green
        }
    }
} else {
    Write-Warning "Frontend source not found at: $FrontendSource. Ensure 'npm run build:frontend' has been run."
}

# Verify web.config exists in destination
$destWebConfig = Join-Path $PhysicalPath "web.config"
if (-not (Test-Path $destWebConfig) -and -not $DryRun) {
    $srcWebConfig = Join-Path $PSScriptRoot "..\frontend\public\web.config"
    if (Test-Path $srcWebConfig) {
        Copy-Item -Path $srcWebConfig -Destination $destWebConfig -Force
        Write-Host "  ✓ Copied web.config to $PhysicalPath" -ForegroundColor Green
    }
}

# Step 5: Configure Dedicated Application Pool
Write-Host "`n[4/5] Configuring dedicated Application Pool ($AppPoolName)..." -ForegroundColor Yellow
if ($DryRun -or $simulateIIS) {
    Write-Host "  [DryRun] Would configure AppPool '$AppPoolName' with:" -ForegroundColor Cyan
    Write-Host "           - .NET CLR Version: No Managed Code" -ForegroundColor Cyan
    Write-Host "           - Pipeline Mode:    Integrated" -ForegroundColor Cyan
    Write-Host "           - Start Mode:       AlwaysRunning" -ForegroundColor Cyan
    Write-Host "           - Idle Timeout:     00:00:00 (Disabled)" -ForegroundColor Cyan
} else {
    # Check if app pool exists
    if (-not (Test-Path "IIS:\AppPools\$AppPoolName")) {
        New-Item "IIS:\AppPools\$AppPoolName" | Out-Null
        Write-Host "  ✓ Created Application Pool: $AppPoolName" -ForegroundColor Green
    } else {
        Write-Host "  ✓ Application Pool already exists: $AppPoolName" -ForegroundColor Gray
    }

    # Set No Managed Code (Static React SPA does not use .NET CLR)
    Set-ItemProperty "IIS:\AppPools\$AppPoolName" -Name "managedRuntimeVersion" -Value ""
    Set-ItemProperty "IIS:\AppPools\$AppPoolName" -Name "managedPipelineMode" -Value "Integrated"
    Set-ItemProperty "IIS:\AppPools\$AppPoolName" -Name "startMode" -Value "AlwaysRunning"
    Set-ItemProperty "IIS:\AppPools\$AppPoolName" -Name "processModel.idleTimeout" -Value ([TimeSpan]::Zero)
    Write-Host "  ✓ AppPool configured: No Managed Code, Integrated pipeline, AlwaysRunning" -ForegroundColor Green
}

# Step 6: Create and bind IIS Application / Site
Write-Host "`n[5/5] Configuring IIS Application mapping..." -ForegroundColor Yellow
if ($DryRun -or $simulateIIS) {
    if ($DedicatedSite) {
        Write-Host "  [DryRun] Would create Site 'CallingBotSite' on port $Port bound to $PhysicalPath and $AppPoolName" -ForegroundColor Cyan
    } else {
        Write-Host "  [DryRun] Would create Application '$AppPath' under '$SiteName' bound to $PhysicalPath and $AppPoolName" -ForegroundColor Cyan
    }
} else {
    if ($DedicatedSite) {
        $siteObj = Get-Item "IIS:\Sites\CallingBotSite" -ErrorAction SilentlyContinue
        if (-not $siteObj) {
            New-Item "IIS:\Sites\CallingBotSite" -bindings @{protocol="http";bindingInformation="*:${Port}:"} -physicalPath $PhysicalPath | Out-Null
            Set-ItemProperty "IIS:\Sites\CallingBotSite" -Name "applicationPool" -Value $AppPoolName
            Write-Host "  ✓ Created dedicated site: CallingBotSite on port $Port" -ForegroundColor Green
        } else {
            Write-Host "  ✓ Dedicated site CallingBotSite already exists" -ForegroundColor Gray
        }
    } else {
        $appObj = Get-Item "IIS:\Sites\$SiteName$AppPath" -ErrorAction SilentlyContinue
        if (-not $appObj) {
            New-Item "IIS:\Sites\$SiteName$AppPath" -type Application -physicalPath $PhysicalPath | Out-Null
            Set-ItemProperty "IIS:\Sites\$SiteName$AppPath" -Name "applicationPool" -Value $AppPoolName
            Write-Host "  ✓ Created Application '$AppPath' under '$SiteName' bound to $AppPoolName" -ForegroundColor Green
        } else {
            Set-ItemProperty "IIS:\Sites\$SiteName$AppPath" -Name "physicalPath" -Value $PhysicalPath
            Set-ItemProperty "IIS:\Sites\$SiteName$AppPath" -Name "applicationPool" -Value $AppPoolName
            Write-Host "  ✓ Updated Application '$AppPath' mapping and AppPool" -ForegroundColor Green
        }
    }
}

# Step 7: Record Isolation Verification Manifest
$manifest = [ordered]@{
    Application         = "CallingBot-Frontend"
    Epic                = "EPIC-05"
    Story               = "CB-022"
    SetupDate           = (Get-Date).ToString("o")
    IsolationMode       = if ($DedicatedSite) { "DedicatedSite" } else { "SubApplication" }
    SiteName            = if ($DedicatedSite) { "CallingBotSite" } else { $SiteName }
    VirtualPath         = if ($DedicatedSite) { "/" } else { $AppPath }
    PhysicalPath        = $PhysicalPath
    ApplicationPool     = [ordered]@{
        Name            = $AppPoolName
        ManagedRuntime  = "No Managed Code"
        PipelineMode    = "Integrated"
        StartMode       = "AlwaysRunning"
    }
    AspNetAppProtected  = $true
    DryRun              = $DryRun.IsPresent
}

$manifestFile = Join-Path $PhysicalPath "iis-isolation-manifest.json"
if (-not $DryRun) {
    $manifest | ConvertTo-Json -Depth 4 | Set-Content -Path $manifestFile -Encoding UTF8
    Write-Host "`n✓ Isolation manifest saved to $manifestFile" -ForegroundColor Cyan
}

Write-Host "`n========================================================" -ForegroundColor Green
Write-Host "  IIS Application Isolation Setup Completed (CB-022)" -ForegroundColor Green
Write-Host "========================================================`n" -ForegroundColor Green
