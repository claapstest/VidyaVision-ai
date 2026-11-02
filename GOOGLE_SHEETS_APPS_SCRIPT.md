# Real-Time Google Sheets Webhook Trigger (Apps Script)

If you want your Google Sheet to **instantly push new call rows to your VidyaVision dashboard** the moment OmniDimension or Zapier appends them (with 0 delay and 0 polling), follow these 3 simple steps:

---

### Step 1: Open Apps Script in your Google Sheet
1. Open your Google Sheet.
2. In the top menu, click **Extensions** > **Apps Script**.
3. Replace any code in the editor with the script below.

---

### Step 2: Paste this Code

```javascript
/**
 * VidyaVision Real-Time Push Trigger
 * Sends new/updated call rows instantly to the dashboard backend.
 */

// Replace with your backend URL (or ngrok / tunnel URL if testing locally)
const WEBHOOK_URL = "http://localhost:5000/api/webhook/sheets"; 
// Optional: match process.env.WEBHOOK_SECRET if configured
const WEBHOOK_SECRET = ""; 

function onRowChange(e) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return; // Only header exists

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const latestRowValues = sheet.getRange(lastRow, 1, 1, sheet.getLastColumn()).getValues()[0];

    const rowData = {};
    headers.forEach((h, idx) => {
      if (h) rowData[String(h).trim()] = latestRowValues[idx];
    });

    const payload = {
      event: "sheet_row_appended",
      timestamp: new Date().toISOString(),
      row: rowData
    };

    const options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    if (WEBHOOK_SECRET) {
      options.headers = { "x-webhook-secret": WEBHOOK_SECRET };
    }

    UrlFetchApp.fetch(WEBHOOK_URL, options);
  } catch (err) {
    Logger.log("Error posting to webhook: " + err.message);
  }
}
```

---

### Step 3: Add the Trigger
1. In the Apps Script left sidebar, click the **Triggers (alarm clock icon)**.
2. Click **+ Add Trigger** (bottom right).
3. Set the following options:
   * **Choose which function to run:** `onRowChange`
   * **Select event source:** `From spreadsheet`
   * **Select event type:** `On change`
4. Click **Save** and grant permissions if prompted.

Now, whenever a call finishes and a row is added to Google Sheets, it will notify your dashboard in milliseconds!

