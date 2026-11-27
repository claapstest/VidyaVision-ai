# CB-020: Configure Service Identity and Recovery

## Summary
Configured the CallingBot Windows service to run under a dedicated least-privilege virtual service account with bounded restart-on-failure recovery policy.

## Service Account

### Account: `NT SERVICE\CallingBot`
This is a Windows **virtual service account** — it is created automatically when the service is installed. No password management is required.

### Why Not LocalSystem
- LocalSystem has unrestricted access to the entire machine
- A compromised service running as LocalSystem can escalate to full domain compromise
- Virtual service accounts are scoped to only the resources explicitly granted

### Required Permissions
| Resource | Permission | Purpose |
|----------|-----------|---------|
| `C:\CallingBot\Backend\` | Read & Execute | Run CallingBot.exe |
| `C:\CallingBot\Config\` | Read | Load callingbot.json |
| `C:\CallingBot\Logs\` | Modify (Write) | Write stdout/stderr logs |
| `C:\CallingBot\Service\` | Read & Execute | WinSW wrapper operation |
| SQL Server | db_datareader, db_datawriter | Application database access |
| Network | Outbound TCP 443 | OmniDimension API, Google APIs |
| Network | Listen TCP 5000 | Backend HTTP/WebSocket server |

Permissions on the filesystem are set by `scripts/init-windows-layout.ps1` (from EPIC-03 CB-018). SQL Server and network access must be configured by the client infrastructure team.

## Recovery Policy

| Failure # | Action | Delay |
|-----------|--------|-------|
| 1st | Restart service | 10 seconds |
| 2nd | Restart service | 30 seconds |
| 3rd+ | Restart service | 60 seconds |
| Reset counter | After 1 hour of continuous uptime |

This prevents infinite rapid-restart loops while ensuring the service recovers from transient failures (port conflicts, brief DB outages).

### Configured via
- WinSW XML: `<onfailure>` elements
- sc.exe: `sc.exe failure CallingBot reset= 3600 actions= restart/10000/restart/30000/restart/60000`

## Startup Behavior
- **Type**: Automatic (Delayed Start) — starts after core Windows services are ready
- **Stop timeout**: 30 seconds — allows in-flight HTTP requests and WebSocket connections to drain
