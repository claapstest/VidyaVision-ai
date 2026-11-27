# VidyaVision — Setup Guide

This guide walks you through setting up and running VidyaVision on your server or local machine.

---

## Prerequisites

Before you begin, make sure the following are installed and available:

| Requirement        | Version  | Notes                                                      |
|--------------------|----------|------------------------------------------------------------|
| **Node.js**        | 18+      | Download from https://nodejs.org                           |
| **SQL Server**     | 2019+    | Local instance, Azure SQL, or any accessible MSSQL server  |
| **OmniDimension**  | —        | Active account with an API key and at least one voice agent |

Optional:
- **Google Cloud Service Account** — only if using private Google Sheets integration
- **Docker** — if you prefer containerised deployment

---

## Step 1: Extract the Package

Unzip the delivered package into a folder on your server:

```
VidyaVision/
├── dist/                    # Frontend (pre-built)
├── dist-server/             # Backend (server.js, db.js)
├── backend/scripts/         # Database initialisation script
├── data/                    # Runtime data & cache (auto-created)
├── package.json             # Production dependencies
├── .env.example             # Configuration template
├── GOOGLE_SHEETS_APPS_SCRIPT.md
└── SETUP_GUIDE.md           # This file
```

---

## Step 2: Install Dependencies

Open a terminal in the project root and run:

```bash
npm install --production
```

This installs only the runtime dependencies (Express, mssql, googleapis, etc.).

---

## Step 3: Configure Environment Variables

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

Then open `.env` in a text editor and configure each variable:

### Required

| Variable            | Description                                          | Example                          |
|---------------------|------------------------------------------------------|----------------------------------|
| `OMNIDIM_API_KEY`   | Your OmniDimension API key                           | `od_live_abc123...`              |
| `AGENT_ID`          | Your OmniDimension voice agent ID                    | `98765`                          |
| `PORT`              | Port the backend server listens on                   | `5000`                           |
| `MSSQL_HOST`        | SQL Server hostname or IP address                    | `localhost` or `mydb.database.windows.net` |
| `MSSQL_PORT`        | SQL Server port                                      | `1433`                           |
| `MSSQL_USER`        | SQL Server username                                  | `sa`                             |
| `MSSQL_PASSWORD`    | SQL Server password                                  | `YourStrongPassword!`            |
| `MSSQL_DATABASE`    | Database name                                        | `vidyavision`                    |
| `MSSQL_ENCRYPT`     | Use encrypted connection (`true` for Azure SQL)      | `true` or `false`                |
| `JWT_SECRET`        | A random secret string for authentication tokens     | `a9f2k3...` (32+ characters)    |

### Optional — Google Sheets Integration

| Variable                    | Description                                      | Example                              |
|-----------------------------|--------------------------------------------------|--------------------------------------|
| `GOOGLE_SPREADSHEET_ID`     | The ID from your Google Sheet URL                | `1BxiMVs0XRA5nFMdKvBd...`           |
| `GOOGLE_SHEET_NAME`         | Tab/sheet name inside the spreadsheet            | `Sheet1`                             |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Full JSON string of service account credentials (alternative to file) | `{"type":"service_account",...}` |

> **Tip:** To find your Spreadsheet ID, open the Google Sheet in a browser. The URL looks like:
> `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID_HERE/edit`

---

## Step 4: Create the Database

Make sure your SQL Server is running and the database specified in `MSSQL_DATABASE` exists. Create it if needed:

```sql
CREATE DATABASE vidyavision;
```

Then run the initialisation script to create all tables and seed the default admin account:

```bash
node backend/scripts/init_db.js
```

You should see output like:

```
--- Setting up SQL Server Database ---
Connected to SQL Server: localhost/vidyavision
✔ Table 'users' verified
✔ Super Admin 'admin@vidyavision.com' seeded
✔ Table 'colleges' verified
✔ Table 'campaigns' verified
✔ Table 'campaign_contacts' verified
✔ Table 'call_records' verified
✔ Table 'webhook_events' verified

SQL SERVER SCHEMA INITIALIZED SUCCESSFULLY!
```

---

## Step 5: Google Sheets Setup (Optional)

VidyaVision can pull call data from a Google Sheet that OmniDimension writes to. There are two modes:

### Option A: Public Sheet (Simplest)

1. Open your Google Sheet.
2. Click **Share** → **Anyone with the link** → set to **Viewer**.
3. Set `GOOGLE_SPREADSHEET_ID` in your `.env`. That's it — no credentials needed.

### Option B: Private Sheet (Recommended for production)

1. Go to [Google Cloud Console](https://console.cloud.google.com).
2. Create a project (or use an existing one).
3. Enable the **Google Sheets API**.
4. Create a **Service Account** and download the JSON key file.
5. Place the key file as `service-account.json` in the project root or `data/` folder.
6. Share your Google Sheet with the service account email (the `client_email` from the JSON file) as a **Viewer**.

### Option C: Instant Push via Apps Script (Zero-delay)

For real-time updates instead of polling, install the webhook trigger in your Google Sheet:

1. Open your Google Sheet → **Extensions** → **Apps Script**.
2. Paste the code from `GOOGLE_SHEETS_APPS_SCRIPT.md`.
3. Update `WEBHOOK_URL` in the script to point to your server: `http://YOUR_SERVER:5000/api/webhook/sheets`
4. Add a trigger: function `onRowChange`, event source `From spreadsheet`, event type `On change`.

---

## Step 6: Start the Server

### Production (recommended)

```bash
node dist-server/server.js
```

The server starts on the port configured in `.env` (default: `5000`).

You should see:

```
OmniDimension Backend running on port 5000
WebSocket endpoint: ws://localhost:5000/api/stream
```

The built frontend in `dist/` is served automatically by the backend at the root URL.

### Development (if you have the source code)

```bash
npm run dev
```

This starts both the Vite dev server (port 5174) and the backend (port 5000) with hot-reload.

---

## Step 7: Log In

Open your browser and navigate to:

```
http://YOUR_SERVER:5000
```

Log in with the default admin credentials:

| Field    | Value                     |
|----------|---------------------------|
| Email    | `admin@vidyavision.com`   |
| Password | `VidyaVision@2026`        |

> **Important:** Change the admin password immediately after your first login.

---

## Running as a Background Service

### Linux (systemd)

Create `/etc/systemd/system/vidyavision.service`:

```ini
[Unit]
Description=VidyaVision Dashboard
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/vidyavision
ExecStart=/usr/bin/node dist-server/server.js
Restart=on-failure
RestartSec=10
EnvironmentFile=/opt/vidyavision/.env

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl enable vidyavision
sudo systemctl start vidyavision
```

### Windows (PM2)

```bash
npm install -g pm2
pm2 start dist-server/server.js --name vidyavision
pm2 save
pm2 startup
```

---

## Firewall & Network

Ensure the following ports are accessible:

| Port   | Purpose                    | Who needs access              |
|--------|----------------------------|-------------------------------|
| `5000` | Backend API + Dashboard UI | Users (browsers)              |
| `1433` | SQL Server                 | Backend server only (private) |

If the server is behind a reverse proxy (Nginx, IIS), proxy all traffic to `http://localhost:5000`.

---

## Troubleshooting

| Issue                             | Solution                                                                 |
|-----------------------------------|--------------------------------------------------------------------------|
| `MSSQL connection failed`         | Verify SQL Server is running, credentials are correct, and TCP/IP is enabled in SQL Server Configuration Manager |
| `OMNIDIM_API_KEY is missing`      | Check your `.env` file has the key set and the server was restarted      |
| `Google Sheets polling failed`    | Verify `GOOGLE_SPREADSHEET_ID` is correct and the sheet is shared/public |
| `Port already in use`             | Change `PORT` in `.env` or stop the other process using that port        |
| Dashboard shows no call data      | Check that OmniDimension is configured to write to your Google Sheet, or that the OmniDim API key is valid |
| `JWT_SECRET` error                | Make sure `JWT_SECRET` is set in `.env` (any random string, 32+ chars)  |

---

## Support

For questions or issues, contact the VidyaVision development team.
