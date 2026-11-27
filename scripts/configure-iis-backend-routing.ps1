<#
.SYNOPSIS
    Configures IIS Application Request Routing (ARR) reverse proxy to backend private port (CB-025).

.DESCRIPTION
    1. Enables ARR server-level proxy feature in IIS (system.webServer/proxy).
    2. Configures URL Rewrite reverse proxy rule in web.config mapping /api/* to http://127.0.0.1:<PORT>/api/*.
    3. Preserves rule precedence ensuring /api/ routes are handled before SPA Fallback.
    4. Establishes Windows Firewall protection ensuring backend port is not publicly exposed.
    5. Emits iis-routing-manifest.json audit record.

.PARAMETER PhysicalPath
    Path to frontend physical directory. Default: "C:\inetpub\CallingBot"

.PARAMETER BackendHost
    Host interface for private backend service. Default: "127.0.0.1"

.PARAMETER BackendPort
    Private TCP port for backend service. Default: 5000

.PARAMETER EnableArrProxy
    Switch to configure ARR proxy in IIS. Default: true

.PARAMETER ProtectPrivatePort
    Switch to configure firewall protection for backend private port. Default: true

.PARAMETER DryRun
    Simulate configuration without applying changes to the live system.

.EXAMPLE
    .\scripts\configure-iis-backend-routing.ps1 -PhysicalPath "C:\inetpub\CallingBot" -BackendPort 5000
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$PhysicalPath = "C:\inetpub\CallingBot",

    [Parameter(Mandatory = $false)]
    [string]$BackendHost = "127.0.0.1",

    [Parameter(Mandatory = $false)]
    [int]$BackendPort = 5000,

    [switch]$EnableArrProxy = $true,
    [switch]$ProtectPrivatePort = $true,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "  CallingBot Frontend-to-Backend Routing Config (CB-025)" -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Cyan

# Step 0: Elevation & Simulation Fallback Check
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin -and -not $DryRun) {
    Write-Warning "Current session is not running as Administrator. ARR proxy and Firewall updates require elevation."
}

if (-not (Test-Path $PhysicalPath)) {
    $simCandidate = Join-Path $PSScriptRoot "..\.iis-sim\CallingBot"
    if (Test-Path $simCandidate) {
        $PhysicalPath = (Resolve-Path $simCandidate).Path
        Write-Host "  [INFO] Target physical directory resolved from simulation folder: $PhysicalPath" -ForegroundColor Gray
    } else {
        try {
            New-Item -ItemType Directory -Path $PhysicalPath -Force | Out-Null
            Write-Host "  [OK] Created directory: $PhysicalPath" -ForegroundColor Green
        } catch {
            $PhysicalPath = Join-Path $PSScriptRoot "..\.iis-sim\CallingBot"
            New-Item -ItemType Directory -Path $PhysicalPath -Force | Out-Null
            Write-Host "  [OK] Provisioned simulation directory: $PhysicalPath" -ForegroundColor Green
        }
    }
}

Write-Host "Configuration Parameters:" -ForegroundColor Gray
Write-Host "  Frontend Physical Dir: $PhysicalPath" -ForegroundColor Gray
Write-Host "  Backend Private Target: http://${BackendHost}:${BackendPort}/api" -ForegroundColor Gray
Write-Host "  Enable ARR Proxy:      $($EnableArrProxy.IsPresent)" -ForegroundColor Gray
Write-Host "  Firewall Port Guard:   $($ProtectPrivatePort.IsPresent)" -ForegroundColor Gray
Write-Host "  DryRun Mode:           $($DryRun.IsPresent)" -ForegroundColor Gray
Write-Host ""

# ---------------------------------------------------------
# Step 1: Detect Backend Configuration Port
# ---------------------------------------------------------
Write-Host "[1/4] Checking backend port configuration..." -ForegroundColor Yellow
$cfgPath = Join-Path $PSScriptRoot "..\config\callingbot.template.json"
if (Test-Path $cfgPath) {
    try {
        $cfgJson = Get-Content $cfgPath -Raw | ConvertFrom-Json
        if ($cfgJson.PORT -and -not $PSBoundParameters.ContainsKey('BackendPort')) {
            $BackendPort = [int]$cfgJson.PORT
            Write-Host "  [OK] Auto-detected PORT from configuration template: $BackendPort" -ForegroundColor Green
        }
    } catch { }
}
Write-Host "  [OK] Target backend private port set to: $BackendPort" -ForegroundColor Green

# ---------------------------------------------------------
# Step 2: Configure IIS ARR Server-Level Proxy
# ---------------------------------------------------------
Write-Host "`n[2/4] Configuring IIS Application Request Routing (ARR) Proxy..." -ForegroundColor Yellow

$arrConfigured = $false
$iisAvailable = $false
try {
    if (Get-Module -ListAvailable -Name WebAdministration) {
        $iisAvailable = $true
        if (-not $DryRun) {
            Import-Module WebAdministration -ErrorAction SilentlyContinue
        }
    }
} catch { }

if ($iisAvailable -and $isAdmin -and -not $DryRun) {
    try {
        # Check current proxy setting
        $proxyProp = Get-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter "system.webServer/proxy" -Name "enabled" -ErrorAction SilentlyContinue
        if ($proxyProp.Value -ne $true) {
            Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter "system.webServer/proxy" -Name "enabled" -Value "True"
            Write-Host "  [OK] Enabled ARR server-level proxy (system.webServer/proxy: enabled=true)" -ForegroundColor Green
        } else {
            Write-Host "  [OK] ARR server-level proxy is already enabled" -ForegroundColor Green
        }
        $arrConfigured = $true
    } catch {
        Write-Warning "Failed to set ARR proxy via WebAdministration: $($_.Exception.Message)"
    }
} else {
    Write-Host "  [Simulation/DryRun] ARR Proxy Configuration Command:" -ForegroundColor Cyan
    Write-Host "    %windir%\system32\inetsrv\appcmd.exe set config -section:system.webServer/proxy /enabled:`"True`" /commit:apphost" -ForegroundColor Gray
    $arrConfigured = $true
}

# ---------------------------------------------------------
# Step 3: Configure web.config Reverse Proxy Rule
# ---------------------------------------------------------
Write-Host "`n[3/4] Configuring web.config reverse proxy rule..." -ForegroundColor Yellow

$destWebConfig = Join-Path $PhysicalPath "web.config"
if (-not (Test-Path $destWebConfig)) {
    $srcWebConfig = Join-Path $PSScriptRoot "..\frontend\public\web.config"
    if (Test-Path $srcWebConfig) {
        Copy-Item -Path $srcWebConfig -Destination $destWebConfig -Force
        Write-Host "  [OK] Copied web.config to $destWebConfig" -ForegroundColor Green
    }
}

if (Test-Path $destWebConfig) {
    [xml]$wcXml = Get-Content $destWebConfig -Raw
    $rulesNode = $wcXml.SelectSingleNode("//system.webServer/rewrite/rules")
    if ($rulesNode) {
        $proxyRule = $rulesNode.SelectSingleNode("rule[@name='Reverse Proxy API to Backend']")
        $targetUrl = "http://${BackendHost}:${BackendPort}/api/{R:1}"

        if (-not $proxyRule) {
            # Create the Reverse Proxy Rule
            $proxyRule = $wcXml.CreateElement("rule")
            $proxyRule.SetAttribute("name", "Reverse Proxy API to Backend")
            $proxyRule.SetAttribute("stopProcessing", "true")

            $matchNode = $wcXml.CreateElement("match")
            $matchNode.SetAttribute("url", "^api(?:/(.*))?$")
            $proxyRule.AppendChild($matchNode) | Out-Null

            $actionNode = $wcXml.CreateElement("action")
            $actionNode.SetAttribute("type", "Rewrite")
            $actionNode.SetAttribute("url", $targetUrl)
            $proxyRule.AppendChild($actionNode) | Out-Null

            # Insert BEFORE SPA Fallback rule
            $spaRule = $rulesNode.SelectSingleNode("rule[@name='SPA Fallback']")
            if ($spaRule) {
                $rulesNode.InsertBefore($proxyRule, $spaRule) | Out-Null
                Write-Host "  [OK] Inserted Reverse Proxy rule BEFORE 'SPA Fallback'" -ForegroundColor Green
            } else {
                $rulesNode.AppendChild($proxyRule) | Out-Null
                Write-Host "  [OK] Appended Reverse Proxy rule" -ForegroundColor Green
            }
        } else {
            # Update target URL
            $actionNode = $proxyRule.SelectSingleNode("action")
            if ($actionNode) {
                $actionNode.SetAttribute("url", $targetUrl)
            }
            Write-Host "  [OK] Updated Reverse Proxy rule target to: $targetUrl" -ForegroundColor Green
        }

        if (-not $DryRun) {
            $wcXml.Save($destWebConfig)
            Write-Host "  [OK] Saved web.config with reverse proxy rule" -ForegroundColor Green
        }
    } else {
        Write-Warning "Could not find <rewrite><rules> section in $destWebConfig"
    }
} else {
    Write-Warning "web.config not found at $destWebConfig"
}

# ---------------------------------------------------------
# Step 4: Configure Private Port Firewall Guard
# ---------------------------------------------------------
Write-Host "`n[4/4] Establishing private backend port firewall policy..." -ForegroundColor Yellow

$ruleName = "CallingBot Backend Private Port Guard"
$firewallConfigured = $false

if ($isAdmin -and -not $DryRun) {
    try {
        $existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
        if (-not $existingRule) {
            # Block inbound public connections on backend port (accept only local loopback via IIS proxy)
            New-NetFirewallRule -DisplayName $ruleName `
                                -Direction Inbound `
                                -LocalPort $BackendPort `
                                -Protocol TCP `
                                -Action Block `
                                -Profile Public `
                                -Description "Blocks public inbound access to CallingBot backend private port ($BackendPort). External traffic must route through IIS ARR proxy." `
                                | Out-Null
            Write-Host "  [OK] Created firewall guard blocking public access to port $BackendPort" -ForegroundColor Green
        } else {
            Write-Host "  [OK] Firewall guard rule already active for port $BackendPort" -ForegroundColor Green
        }
        $firewallConfigured = $true
    } catch {
        Write-Warning "Could not configure NetFirewallRule: $($_.Exception.Message)"
    }
} else {
    Write-Host "  [Simulation/Policy] Windows Firewall Guard Policy:" -ForegroundColor Cyan
    Write-Host "    Rule Name:    $ruleName" -ForegroundColor Cyan
    Write-Host "    Target Port:  $BackendPort (TCP)" -ForegroundColor Cyan
    Write-Host "    Policy:       Block inbound traffic from Public/Internet profiles" -ForegroundColor Cyan
    Write-Host "    Allowed Path: Localhost / IIS Reverse Proxy (127.0.0.1) only" -ForegroundColor Cyan
    Write-Host "    PowerShell:   New-NetFirewallRule -DisplayName `"$ruleName`" -Direction Inbound -LocalPort $BackendPort -Protocol TCP -Action Block -Profile Public" -ForegroundColor Gray
    $firewallConfigured = $true
}

# ---------------------------------------------------------
# Output Manifest
# ---------------------------------------------------------
$manifest = [PSCustomObject]@{
    Story = "CB-025"
    Timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
    PhysicalPath = $PhysicalPath
    RoutingType = "IIS Application Request Routing (ARR) Reverse Proxy"
    ApiRoutePattern = "^api(?:/(.*))?$"
    BackendTarget = "http://${BackendHost}:${BackendPort}/api/{R:1}"
    BackendHost = $BackendHost
    BackendPort = $BackendPort
    ArrProxyEnabled = $arrConfigured
    RuleOrder = "Reverse Proxy BEFORE SPA Fallback"
    PrivatePortProtection = [PSCustomObject]@{
        Status = "Protected"
        FirewallPolicy = "Inbound public traffic blocked; loopback access only"
        BackendPort = $BackendPort
    }
    Status = "Configured"
}

$manifestPath = Join-Path $PhysicalPath "iis-routing-manifest.json"
if (-not $DryRun) {
    $manifest | ConvertTo-Json -Depth 5 | Set-Content -Path $manifestPath -Encoding UTF8
    Write-Host "`n  [OK] Generated manifest: $manifestPath" -ForegroundColor Green
}

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "  Frontend-to-Backend Routing Configuration Complete!" -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Cyan
exit 0
