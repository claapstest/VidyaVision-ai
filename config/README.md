# CallingBot Configuration Guide

This directory contains the deployment configuration templates for CallingBot.

## Files
- `callingbot.template.json`: Master JSON configuration template for Windows Service and standalone EXE deployment. Copy to `callingbot.json` and populate values before starting the application.

## Quick Start
1. Copy `callingbot.template.json` to your deployment config directory:
   ```powershell
   Copy-Item .\config\callingbot.template.json C:\CallingBot\config\callingbot.json
   ```
2. Edit `C:\CallingBot\config\callingbot.json` with production endpoints, ports, and credentials.
3. Configure the `CALLINGBOT_CONFIG` environment variable or Windows Service parameter:
   ```powershell
   [System.Environment]::SetEnvironmentVariable("CALLINGBOT_CONFIG", "C:\CallingBot\config\callingbot.json", [System.EnvironmentVariableTarget]::Machine)
   ```
4. Start the Windows Service or executable:
   ```powershell
   .\release\CallingBot.exe
   ```

## Security Best Practices
- Never commit actual credentials, passwords, or JWT secrets to source control.
- Restrict read access on `callingbot.json` to the Windows Service account and Administrators using NTFS ACLs.
- Generate strong, random secrets for `JWT_SECRET` (at least 32 bytes / 256 bits):
  ```powershell
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
