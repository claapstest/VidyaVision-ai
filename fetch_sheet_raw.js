import dotenv from 'dotenv';

dotenv.config();

const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
const sheetName = process.env.GOOGLE_SHEET_NAME || 'Sheet1';

async function fetchPublicGoogleSheet(spreadsheetId) {
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?${sheetName ? 'sheet=' + encodeURIComponent(sheetName) + '&' : ''}tqx=out:json`;
  console.log(`Fetching from: ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Google Sheets public endpoint returned status ${response.status}`);
  }
  const text = await response.text();
  const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);/);
  if (!match) {
    throw new Error('Failed to parse Google Sheets public response.');
  }
  const data = JSON.parse(match[1]);
  if (data.status === 'error') {
    throw new Error(`Google Sheets returned error: ${JSON.stringify(data.errors)}`);
  }
  return data.table;
}

async function test() {
  try {
    const table = await fetchPublicGoogleSheet(spreadsheetId);
    console.log('Columns:', JSON.stringify(table.cols));
    console.log('Rows count:', table.rows.length);
    console.log('Sample rows:', JSON.stringify(table.rows.slice(0, 3), null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
}

test();
