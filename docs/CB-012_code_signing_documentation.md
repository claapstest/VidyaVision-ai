# CB-012: Code Signing Approach

## Summary
Documents the recommended approach for signing CallingBot.exe with a code signing certificate. The EXE is currently unsigned — signing requires an Authenticode certificate from the deployment team.

## Recommended Signing Process

### Prerequisites
- An Authenticode code signing certificate (EV or standard) from a trusted CA
- Windows SDK `signtool.exe` or equivalent signing tool
- Certificate installed in the Windows certificate store or available as a PFX file

### Signing Command
```powershell
# Using signtool (Windows SDK)
signtool sign /f "certificate.pfx" /p "password" /tr http://timestamp.digicert.com /td sha256 /fd sha256 release\CallingBot.exe

# Using a hardware token (EV certificate)
signtool sign /n "Company Name" /tr http://timestamp.digicert.com /td sha256 /fd sha256 release\CallingBot.exe
```

### Verification
```powershell
signtool verify /pa release\CallingBot.exe
```

## Important Notes
- The EXE must be signed AFTER postject injection (signing before injection invalidates the signature)
- Timestamping (`/tr`) ensures the signature remains valid after the certificate expires
- EV (Extended Validation) certificates provide immediate SmartScreen trust on Windows
- Standard certificates build SmartScreen reputation over time

## CI/CD Integration
Add signing as a post-build step after `npm run build:backend:all` completes. The certificate should be stored in a secure vault (Azure Key Vault, AWS Secrets Manager) and accessed during CI.
