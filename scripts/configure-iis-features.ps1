<#
.SYNOPSIS
    Checks and enables IIS features required for CallingBot static hosting and SPA fallback (CB-023).

.DESCRIPTION
    1. Verifies/enables IIS Static Content, Default Document, and HTTP Errors features.
    2. Checks for IIS URL Rewrite 2.1 module installation.
    3. Provides automated or manual installation options for the URL Rewrite module.

.PARAMETER InstallUrlRewrite
    If specified, downloads and silently installs URL Rewrite 2.1 if missing.

.EXAMPLE
    .\scripts\configure-iis-features.ps1 -InstallUrlRewrite
#>

[CmdletBinding()]
param(
    [switch]$InstallUrlRewrite
)

$ErrorActionPreference = "Continue"

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "  CallingBot IIS Features & URL Rewrite Setup (CB-023)" -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Cyan

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Warning "Current session is not running as Administrator. Enabling Windows features requires elevation."
}

# Determine OS type (Server vs Client)
$osInfo = Get-CimInstance Win32_OperatingSystem
$isServer = ($osInfo.ProductType -eq 2 -or $osInfo.ProductType -eq 3) # 2 = DC, 3 = Server
Write-Host "Detected OS: $($osInfo.Caption) (Server: $isServer)" -ForegroundColor Gray

# Step 1: Check and Enable IIS Static Content Features
Write-Host "`n[1/2] Checking IIS static content features..." -ForegroundColor Yellow

if ($isServer) {
    $features = @("Web-Server", "Web-Static-Content", "Web-Default-Doc", "Web-Http-Errors", "Web-Filtering")
    Write-Host "Checking Server Features: $($features -join ', ')" -ForegroundColor Gray
    try {
        Import-Module ServerManager -ErrorAction Stop
        foreach ($f in $features) {
            $state = Get-WindowsFeature -Name $f -ErrorAction SilentlyContinue
            if ($state -and $state.Installed) {
                Write-Host "  [PASS] $f is already installed" -ForegroundColor Green
            } elseif ($isAdmin) {
                Write-Host "  [INSTALLING] $f..." -ForegroundColor Yellow
                Install-WindowsFeature -Name $f | Out-Null
                Write-Host "  [DONE] $f installed successfully" -ForegroundColor Green
            } else {
                Write-Host "  [MISSING] $f (run as Administrator to install)" -ForegroundColor Red
            }
        }
    } catch {
        Write-Warning "ServerManager module not available. Feature check skipped."
    }
} else {
    $features = @("IIS-WebServerRole", "IIS-WebServer", "IIS-CommonHttpFeatures", "IIS-StaticContent", "IIS-DefaultDocument", "IIS-HttpErrors", "IIS-RequestFiltering")
    Write-Host "Checking Client Optional Features..." -ForegroundColor Gray
    if ($isAdmin) {
        foreach ($f in $features) {
            try {
                $state = Get-WindowsOptionalFeature -Online -FeatureName $f -ErrorAction SilentlyContinue
                if ($state -and $state.State -eq "Enabled") {
                    Write-Host "  [PASS] $f is enabled" -ForegroundColor Green
                } else {
                    Write-Host "  [ENABLING] $f..." -ForegroundColor Yellow
                    Enable-WindowsOptionalFeature -Online -FeatureName $f -NoRestart -ErrorAction SilentlyContinue | Out-Null
                    Write-Host "  [DONE] $f enabled" -ForegroundColor Green
                }
            } catch {
                Write-Host "  [WARNING] Could not check/enable $f : $($_.Exception.Message)" -ForegroundColor Yellow
            }
        }
    } else {
        Write-Host "  ℹ Querying and enabling Windows features requires an elevated PowerShell session." -ForegroundColor Gray
        foreach ($f in $features) {
            Write-Host "  [REQUIRES ELEVATION] $f" -ForegroundColor Yellow
        }
    }
}

# Step 2: Check IIS URL Rewrite Module 2.1
Write-Host "`n[2/2] Checking IIS URL Rewrite Module 2.1..." -ForegroundColor Yellow
$rewriteInstalled = $false

# Method A: Check registry
$regPath = "HKLM:\SOFTWARE\Microsoft\IIS Extensions\URL Rewrite"
if (Test-Path $regPath) {
    $version = (Get-ItemProperty -Path $regPath -Name "Version" -ErrorAction SilentlyContinue).Version
    Write-Host "  [PASS] URL Rewrite Module detected in registry (Version: $version)" -ForegroundColor Green
    $rewriteInstalled = $true
}

# Method B: Check rewrite.dll in inetsrv
if (-not $rewriteInstalled) {
    $inetsrvDll = Join-Path $env:SystemRoot "System32\inetsrv\rewrite.dll"
    if (Test-Path $inetsrvDll) {
        Write-Host "  [PASS] rewrite.dll found in inetsrv: $inetsrvDll" -ForegroundColor Green
        $rewriteInstalled = $true
    }
}

# If missing, offer installation
if (-not $rewriteInstalled) {
    Write-Warning "URL Rewrite Module is NOT installed. SPA client-side route fallback requires URL Rewrite."
    $rewriteUrl = "https://download.microsoft.com/download/1/2/8/128E2E03-C54D-4F73-B591-7326A4094CE8/rewrite_amd64_en-US.msi"

    if ($InstallUrlRewrite -and $isAdmin) {
        Write-Host "  Downloading URL Rewrite 2.1 installer..." -ForegroundColor Yellow
        $tempMsi = Join-Path $env:TEMP "rewrite_amd64_en-US.msi"
        try {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            Invoke-WebRequest -Uri $rewriteUrl -OutFile $tempMsi -UseBasicParsing
            Write-Host "  Installing URL Rewrite 2.1 silently..." -ForegroundColor Yellow
            Start-Process msiexec.exe -ArgumentList "/i `"$tempMsi`" /qn /norestart" -Wait
            Remove-Item $tempMsi -Force -ErrorAction SilentlyContinue
            Write-Host "  [DONE] URL Rewrite Module installed successfully" -ForegroundColor Green
            $rewriteInstalled = $true
        } catch {
            Write-Error "Failed to install URL Rewrite: $($_.Exception.Message)"
        }
    } else {
        Write-Host "`nManual Installation Instructions:" -ForegroundColor Cyan
        Write-Host "  1. Download Microsoft URL Rewrite 2.1 x64:" -ForegroundColor Gray
        Write-Host "     $rewriteUrl" -ForegroundColor Gray
        Write-Host "  2. Run msiexec /i rewrite_amd64_en-US.msi" -ForegroundColor Gray
        Write-Host "  Or re-run with: .\scripts\configure-iis-features.ps1 -InstallUrlRewrite (as Admin)`n" -ForegroundColor Gray
    }
}

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "  IIS Feature Verification Complete" -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Cyan
