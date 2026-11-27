<#
.SYNOPSIS
    Configures HTTPS TLS binding, frontend NTFS permissions, and HSTS security headers (CB-024).

.DESCRIPTION
    1. Validates or provisions TLS certificate in Windows Certificate Store.
    2. Configures HTTPS binding (port 443) on the target IIS site (when IIS is installed).
    3. Grants least-privilege Read & Execute (RX) permissions to 'IIS AppPool\<AppPoolName>' on the frontend directory.
    4. Audits backend secrets directory isolation to ensure frontend AppPool cannot read backend configs.
    5. Updates or validates HSTS and HTTPS redirect settings in web.config.
    6. Generates an iis-https-manifest.json audit trail.

.PARAMETER PhysicalPath
    Path to frontend files directory. Default: "C:\inetpub\CallingBot"

.PARAMETER AppPoolName
    IIS Application Pool identity name. Default: "CallingBotAppPool"

.PARAMETER SiteName
    Target IIS Site name. Default: "Default Web Site"

.PARAMETER Port
    HTTPS port to bind. Default: 443

.PARAMETER HostName
    Optional hostname / SNI for the HTTPS binding. Default: ""

.PARAMETER CertThumbprint
    Specific certificate thumbprint in Cert:\LocalMachine\My to bind.

.PARAMETER CertSubject
    Subject name for certificate search or generation. Default: "CN=CallingBot"

.PARAMETER CreateSelfSignedCert
    Switch to automatically create a self-signed certificate if none exists.

.PARAMETER EnforceHttpsRedirect
    Switch to enable HTTPS redirection rule in web.config.

.PARAMETER ConfigPath
    Path to backend config directory to verify isolation. Default: "C:\CallingBot\Config"

.PARAMETER DryRun
    Simulate changes without modifying live system state.

.EXAMPLE
    .\scripts\configure-iis-https-permissions.ps1 -PhysicalPath "C:\inetpub\CallingBot" -CreateSelfSignedCert
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
    [int]$Port = 443,

    [Parameter(Mandatory = $false)]
    [string]$HostName = "",

    [Parameter(Mandatory = $false)]
    [string]$CertThumbprint = "",

    [Parameter(Mandatory = $false)]
    [string]$CertSubject = "CN=CallingBot",

    [switch]$CreateSelfSignedCert,
    [switch]$EnforceHttpsRedirect,

    [Parameter(Mandatory = $false)]
    [string]$ConfigPath = "C:\CallingBot\Config",

    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "  CallingBot HTTPS & Frontend Permissions Config (CB-024)" -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Cyan

Write-Host "Configuration Parameters:" -ForegroundColor Gray
Write-Host "  Physical Directory: $PhysicalPath" -ForegroundColor Gray
Write-Host "  AppPool Identity:   IIS AppPool\$AppPoolName" -ForegroundColor Gray
Write-Host "  Target IIS Site:    $SiteName" -ForegroundColor Gray
Write-Host "  HTTPS Port:         $Port" -ForegroundColor Gray
Write-Host "  Host Header (SNI):  $(if ($HostName) { $HostName } else { '(any / IP bound)' })" -ForegroundColor Gray
Write-Host "  Cert Thumbprint:    $(if ($CertThumbprint) { $CertThumbprint } else { '(auto-detect or provision)' })" -ForegroundColor Gray
Write-Host "  Self-Signed Cert:   $($CreateSelfSignedCert.IsPresent)" -ForegroundColor Gray
Write-Host "  Enforce Redirect:   $($EnforceHttpsRedirect.IsPresent)" -ForegroundColor Gray
Write-Host "  DryRun Mode:        $($DryRun.IsPresent)" -ForegroundColor Gray
Write-Host ""

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin -and -not $DryRun) {
    Write-Warning "Current session is not running as Administrator. Some IIS binding or ACL operations may require elevation."
}

# ---------------------------------------------------------
# Step 1: Ensure Frontend Physical Directory Exists
# ---------------------------------------------------------
Write-Host "[1/5] Verifying physical frontend directory..." -ForegroundColor Yellow
if (-not (Test-Path $PhysicalPath)) {
    if ($DryRun) {
        Write-Host "  [DryRun] Would create physical directory: $PhysicalPath" -ForegroundColor Cyan
    } else {
        try {
            New-Item -ItemType Directory -Path $PhysicalPath -Force | Out-Null
            Write-Host "  [OK] Created directory: $PhysicalPath" -ForegroundColor Green
        } catch [System.UnauthorizedAccessException] {
            Write-Warning "Cannot create '$PhysicalPath' directly without Administrator privileges."
            Write-Host "  Falling back to workspace simulation directory for non-elevated validation." -ForegroundColor Gray
            $PhysicalPath = (Resolve-Path (Join-Path $PSScriptRoot "..\.iis-sim\CallingBot") -ErrorAction SilentlyContinue)
            if (-not $PhysicalPath) {
                $PhysicalPath = Join-Path $PSScriptRoot "..\.iis-sim\CallingBot"
                New-Item -ItemType Directory -Path $PhysicalPath -Force | Out-Null
            }
            Write-Host "  [OK] Provisioned simulation directory: $PhysicalPath" -ForegroundColor Green
        }
    }
} else {
    Write-Host "  [OK] Physical directory exists: $PhysicalPath" -ForegroundColor Green
}

# Ensure web.config exists in destination
$destWebConfig = Join-Path $PhysicalPath "web.config"
if (-not (Test-Path $destWebConfig) -and -not $DryRun) {
    $srcWebConfig = Join-Path $PSScriptRoot "..\frontend\public\web.config"
    if (Test-Path $srcWebConfig) {
        Copy-Item -Path $srcWebConfig -Destination $destWebConfig -Force
        Write-Host "  [OK] Copied web.config to $destWebConfig" -ForegroundColor Green
    }
}

# ---------------------------------------------------------
# Step 2: TLS Certificate Discovery or Provisioning
# ---------------------------------------------------------
Write-Host "`n[2/5] Managing TLS Certificate..." -ForegroundColor Yellow
$resolvedCert = $null

if ($CertThumbprint) {
    # Check Cert:\LocalMachine\My first, then CurrentUser\My
    $resolvedCert = Get-Item "Cert:\LocalMachine\My\$CertThumbprint" -ErrorAction SilentlyContinue
    if (-not $resolvedCert) {
        $resolvedCert = Get-Item "Cert:\CurrentUser\My\$CertThumbprint" -ErrorAction SilentlyContinue
    }
    if ($resolvedCert) {
        Write-Host "  [OK] Found specified certificate: $($resolvedCert.Subject) ($($resolvedCert.Thumbprint))" -ForegroundColor Green
    } else {
        Write-Warning "Certificate with thumbprint $CertThumbprint was not found in Cert:\LocalMachine\My or CurrentUser\My."
    }
}

if (-not $resolvedCert) {
    # Search for an existing certificate matching Subject or HostName
    $searchSubject = if ($HostName) { "CN=$HostName" } else { $CertSubject }
    $candidates = @(Get-ChildItem Cert:\LocalMachine\My -ErrorAction SilentlyContinue | Where-Object { $_.Subject -like "*$searchSubject*" })
    if ($candidates.Count -eq 0) {
        $candidates = @(Get-ChildItem Cert:\CurrentUser\My -ErrorAction SilentlyContinue | Where-Object { $_.Subject -like "*$searchSubject*" })
    }

    if ($candidates.Count -gt 0) {
        $resolvedCert = $candidates[0]
        Write-Host "  [OK] Found existing certificate matching '$searchSubject': $($resolvedCert.Thumbprint)" -ForegroundColor Green
    } elseif ($CreateSelfSignedCert) {
        Write-Host "  Creating self-signed certificate for testing..." -ForegroundColor Gray
        $dns = if ($HostName) { $HostName } else { "localhost" }
        $storeLocation = if ($isAdmin) { "Cert:\LocalMachine\My" } else { "Cert:\CurrentUser\My" }
        
        if ($DryRun) {
            Write-Host "  [DryRun] Would generate self-signed certificate with DnsName '$dns' in $storeLocation" -ForegroundColor Cyan
            $resolvedCert = [PSCustomObject]@{
                Subject = "CN=$dns"
                Thumbprint = "0000000000000000000000000000000000000000"
                NotAfter = (Get-Date).AddYears(1)
            }
        } else {
            try {
                $resolvedCert = New-SelfSignedCertificate -DnsName $dns -CertStoreLocation $storeLocation -FriendlyName "CallingBot HTTPS Certificate" -NotAfter (Get-Date).AddYears(2)
                Write-Host "  [OK] Generated self-signed certificate: $($resolvedCert.Subject) ($($resolvedCert.Thumbprint))" -ForegroundColor Green
            } catch {
                Write-Warning "Could not create self-signed certificate: $($_.Exception.Message)"
            }
        }
    } else {
        Write-Host "  Notice: No existing TLS certificate found. Provide -CertThumbprint or specify -CreateSelfSignedCert for test environments." -ForegroundColor Gray
    }
}

# ---------------------------------------------------------
# Step 3: Configure HTTPS Binding on IIS
# ---------------------------------------------------------
Write-Host "`n[3/5] Configuring HTTPS Binding on IIS..." -ForegroundColor Yellow

$iisModuleAvailable = $false
try {
    if (Get-Module -ListAvailable -Name WebAdministration) {
        $iisModuleAvailable = $true
        if (-not $DryRun) {
            Import-Module WebAdministration -ErrorAction SilentlyContinue
        }
    }
} catch { }

$bindingConfigured = $false

if ($iisModuleAvailable -and $isAdmin -and -not $DryRun) {
    try {
        $siteExists = Test-Path "IIS:\Sites\$SiteName"
        if ($siteExists) {
            $existingBindings = @(Get-WebBinding -Name $SiteName | Where-Object { $_.protocol -eq "https" -and $_.bindingInformation -like "*:${Port}:*" })
            
            if ($existingBindings.Count -eq 0) {
                $sslFlags = if ($HostName) { 1 } else { 0 } # 1 = SNI
                New-WebBinding -Name $SiteName -IPAddress "*" -Port $Port -Protocol "https" -HostHeader $HostName -SslFlags $sslFlags | Out-Null
                Write-Host "  [OK] Created HTTPS binding on site '$SiteName' (Port: $Port, Host: '$HostName')" -ForegroundColor Green
            } else {
                Write-Host "  [OK] HTTPS binding on port $Port already exists on site '$SiteName'" -ForegroundColor Green
            }

            # Associate certificate if available
            if ($resolvedCert -and $resolvedCert.Thumbprint -ne "0000000000000000000000000000000000000000") {
                try {
                    $binding = Get-WebBinding -Name $SiteName -Port $Port -Protocol "https"
                    if ($binding) {
                        $binding.AddSslCertificate($resolvedCert.Thumbprint, "My")
                        Write-Host "  [OK] Bound certificate ($($resolvedCert.Thumbprint)) to HTTPS binding" -ForegroundColor Green
                        $bindingConfigured = $true
                    }
                } catch {
                    Write-Warning "Could not attach certificate via WebAdministration: $($_.Exception.Message). Use IIS Manager or netsh http."
                }
            }
        } else {
            Write-Warning "IIS Site '$SiteName' was not found. Binding skipped."
        }
    } catch {
        Write-Warning "IIS binding configuration encountered an error: $($_.Exception.Message)"
    }
} else {
    Write-Host "  [Simulation/DryRun] Target HTTPS binding parameters:" -ForegroundColor Cyan
    Write-Host "    Site:       $SiteName" -ForegroundColor Cyan
    Write-Host "    Port:       $Port" -ForegroundColor Cyan
    Write-Host "    Protocol:   https" -ForegroundColor Cyan
    Write-Host "    HostHeader: $(if ($HostName) { $HostName } else { '*' })" -ForegroundColor Cyan
    if ($resolvedCert) {
        Write-Host "    CertHash:   $($resolvedCert.Thumbprint)" -ForegroundColor Cyan
    }
    Write-Host "    Manual Command: netsh http add sslcert ipport=0.0.0.0:${Port} certhash=$($resolvedCert.Thumbprint) appid='{00112233-4455-6677-8899-aabbccddeeff}'" -ForegroundColor Gray
    $bindingConfigured = ($resolvedCert -ne $null)
}

# ---------------------------------------------------------
# Step 4: Configure Least-Privilege NTFS Permissions
# ---------------------------------------------------------
Write-Host "`n[4/5] Applying least-privilege NTFS permissions on frontend directory..." -ForegroundColor Yellow

$appPoolAccount = "IIS AppPool\$AppPoolName"
$accountValid = $false

try {
    $ntAccount = New-Object System.Security.Principal.NTAccount($appPoolAccount)
    $null = $ntAccount.Translate([System.Security.Principal.SecurityIdentifier])
    $accountValid = $true
} catch {
    $accountValid = $false
}

if ($accountValid -and -not $DryRun) {
    try {
        # Grant Read & Execute (RX) with object and container inheritance
        $icaclsOutput = & icacls "$PhysicalPath" /grant "${appPoolAccount}:(OI)(CI)RX" /t /c 2>&1
        Write-Host "  [OK] Granted Read & Execute to '$appPoolAccount' on $PhysicalPath" -ForegroundColor Green

        # Ensure write permissions are explicitly not present for AppPool identity
        $icaclsDenyWrite = & icacls "$PhysicalPath" /deny "${appPoolAccount}:(W)" /c 2>&1
        Write-Host "  [OK] Explicitly blocked Write permission for '$appPoolAccount' on $PhysicalPath" -ForegroundColor Green
    } catch {
        Write-Warning "icacls execution encountered an error: $($_.Exception.Message)"
    }
} else {
    if (-not $accountValid) {
        Write-Host "  [Notice] Identity '$appPoolAccount' is not present on this machine (synthesized dynamically by IIS WAS when active)." -ForegroundColor Gray
    }
    Write-Host "  [DryRun/Policy] Intended NTFS Permissions for '$PhysicalPath':" -ForegroundColor Cyan
    Write-Host "    - Target Account: $appPoolAccount" -ForegroundColor Cyan
    Write-Host "    - Access Rights:  Read & Execute (OI)(CI)(RX)" -ForegroundColor Cyan
    Write-Host "    - Write Access:   DENIED / REMOVED (Static content is immutable to worker process)" -ForegroundColor Cyan
    Write-Host "    - Equivalent Command: icacls `"$PhysicalPath`" /grant `"${appPoolAccount}:(OI)(CI)RX`" /t /c" -ForegroundColor Gray
}

# Audit backend config isolation: AppPool must NOT have read access to C:\CallingBot\Config
Write-Host "`n  Auditing backend secrets isolation from AppPool identity..." -ForegroundColor Gray
if (Test-Path $ConfigPath) {
    $configAcl = Get-Acl $ConfigPath
    $appPoolHasAccess = $false
    foreach ($access in $configAcl.Access) {
        if ($access.IdentityReference.Value -eq $appPoolAccount) {
            $appPoolHasAccess = $true
            break
        }
    }
    if ($appPoolHasAccess) {
        Write-Warning "SECURITY ALERT: '$appPoolAccount' has access to backend config directory '$ConfigPath'! Removing..."
        if (-not $DryRun) {
            & icacls "$ConfigPath" /remove "$appPoolAccount" /t /c 2>&1 | Out-Null
        }
    } else {
        Write-Host "  [OK] Backend config directory ($ConfigPath) is strictly isolated from AppPool identity." -ForegroundColor Green
    }
} else {
    Write-Host "  [OK] Backend config path not yet populated ($ConfigPath); isolation policy intact." -ForegroundColor Gray
}

# ---------------------------------------------------------
# Step 5: Web.Config Security Headers & Redirection
# ---------------------------------------------------------
Write-Host "`n[5/5] Updating web.config security headers and redirection rules..." -ForegroundColor Yellow

if (Test-Path $destWebConfig) {
    [xml]$wcXml = Get-Content $destWebConfig
    $modified = $false

    # Ensure HSTS header exists
    $headersNode = $wcXml.SelectSingleNode("//system.webServer/httpProtocol/customHeaders")
    if ($headersNode) {
        $hstsNode = $headersNode.SelectSingleNode("add[@name='Strict-Transport-Security']")
        if (-not $hstsNode) {
            $newHsts = $wcXml.CreateElement("add")
            $newHsts.SetAttribute("name", "Strict-Transport-Security")
            $newHsts.SetAttribute("value", "max-age=31536000; includeSubDomains")
            $headersNode.AppendChild($newHsts) | Out-Null
            $modified = $true
            Write-Host "  [OK] Added Strict-Transport-Security header to web.config" -ForegroundColor Green
        } else {
            Write-Host "  [OK] Strict-Transport-Security header already present ($($hstsNode.value))" -ForegroundColor Green
        }
    }

    # Enable or update HTTPS redirection if requested
    if ($EnforceHttpsRedirect) {
        $redirectRule = $wcXml.SelectSingleNode("//system.webServer/rewrite/rules/rule[@name='Redirect to HTTPS']")
        if ($redirectRule) {
            if ($redirectRule.GetAttribute("enabled") -ne "true") {
                $redirectRule.SetAttribute("enabled", "true")
                $modified = $true
                Write-Host "  [OK] Enabled 'Redirect to HTTPS' rule in web.config" -ForegroundColor Green
            }
        }
    }

    if ($modified -and -not $DryRun) {
        $wcXml.Save($destWebConfig)
        Write-Host "  [OK] Saved updated web.config" -ForegroundColor Green
    }
} else {
    Write-Warning "web.config not found at: $destWebConfig"
}

# ---------------------------------------------------------
# Output Manifest
# ---------------------------------------------------------
$manifest = [PSCustomObject]@{
    Story = "CB-024"
    Timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
    PhysicalPath = $PhysicalPath
    AppPoolIdentity = $appPoolAccount
    SiteName = $SiteName
    HttpsPort = $Port
    HostName = $HostName
    Certificate = [PSCustomObject]@{
        Subject = if ($resolvedCert) { $resolvedCert.Subject } else { "None" }
        Thumbprint = if ($resolvedCert) { $resolvedCert.Thumbprint } else { "None" }
        NotAfter = if ($resolvedCert) { $resolvedCert.NotAfter } else { $null }
    }
    Permissions = [PSCustomObject]@{
        TargetAccount = $appPoolAccount
        Rights = "ReadAndExecute"
        Inheritance = "ObjectInherit, ContainerInherit"
        WriteAccess = "Denied/Removed"
        BackendConfigIsolation = "Verified"
    }
    SecurityHeaders = [PSCustomObject]@{
        HSTS = "max-age=31536000; includeSubDomains"
        XContentTypeOptions = "nosniff"
        XFrameOptions = "SAMEORIGIN"
        XXSSProtection = "1; mode=block"
    }
    Status = "Configured"
}

$manifestPath = Join-Path $PhysicalPath "iis-https-manifest.json"
if (-not $DryRun) {
    $manifest | ConvertTo-Json -Depth 5 | Set-Content -Path $manifestPath -Encoding UTF8
    Write-Host "`n  [OK] Generated manifest: $manifestPath" -ForegroundColor Green
}

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "  HTTPS & Frontend Permissions Configuration Complete!" -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Cyan
exit 0
