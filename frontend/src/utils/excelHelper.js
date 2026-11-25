let _exceljsModule = null;
async function getExcelJS() {
  if (!_exceljsModule) {
    const mod = await import('exceljs');
    _exceljsModule = mod.default || mod;
  }
  return _exceljsModule;
}

/**
 * Formula Injection Sanitizer (SEC-07)
 * Neutralizes Excel formula triggers (=, +, -, @, \t, \r) in text values
 * to prevent command execution or DDE attacks when opening exported files.
 */
export function sanitizeCellValue(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

/**
 * Reads and parses an uploaded Excel (.xlsx) or CSV file in the browser (SEC-04, SEC-09).
 * Enforces safety limits on rows and columns to prevent memory exhaustion DOS.
 *
 * @param {File} file 
 * @param {Object} options 
 * @returns {Promise<Array<Array<string>>>} 2D array of rows
 */
export async function readSpreadsheetFile(file, options = {}) {
  const maxRows = options.maxRows || 25000;
  const maxCols = options.maxCols || 100;

  if (!file) throw new Error('No file provided');

  const isCsv = file.name.toLowerCase().endsWith('.csv');
  const buffer = await file.arrayBuffer();

  if (isCsv) {
    const text = new TextDecoder('utf-8').decode(buffer);
    const rows = parseCsvText(text, maxRows, maxCols);
    return rows;
  }

  const ExcelJS = await getExcelJS();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('Workbook contains no worksheets.');
  }

  const jsonData = [];
  let rowCount = 0;

  worksheet.eachRow({ includeEmpty: false }, (row) => {
    rowCount++;
    if (rowCount > maxRows) return;

    // ExcelJS row.values is 1-indexed (index 0 is undefined)
    const rawValues = Array.isArray(row.values) ? row.values.slice(1) : [];
    const sanitizedRow = rawValues.slice(0, maxCols).map(cell => {
      if (cell === null || cell === undefined) return '';
      if (typeof cell === 'object') {
        if (cell.text !== undefined) return String(cell.text).trim();
        if (cell.result !== undefined) return String(cell.result).trim();
        if (cell instanceof Date) return cell.toISOString().slice(0, 19).replace('T', ' ');
      }
      return String(cell).trim();
    });

    jsonData.push(sanitizedRow);
  });

  return jsonData;
}

/**
 * Parses raw CSV text safely with row and column limits
 */
function parseCsvText(text, maxRows, maxCols) {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  const result = [];
  const limit = Math.min(lines.length, maxRows);

  for (let i = 0; i < limit; i++) {
    const row = [];
    let cur = '';
    let inQuotes = false;
    const line = lines[i];

    for (let j = 0; j < line.length; j++) {
      const c = line[j];
      if (c === '"') {
        if (inQuotes && line[j + 1] === '"') {
          cur += '"';
          j++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === ',' && !inQuotes) {
        row.push(cur.trim());
        cur = '';
        if (row.length >= maxCols) break;
      } else {
        cur += c;
      }
    }
    if (row.length < maxCols) {
      row.push(cur.trim());
    }
    result.push(row);
  }
  return result;
}

/**
 * Dynamically computes column widths for aesthetic Excel export
 */
function calculateColumnWidths(rows) {
  if (!rows || rows.length === 0) return [];
  const keys = Object.keys(rows[0]);
  return keys.map(key => {
    let maxLen = String(key).length;
    for (let i = 0; i < Math.min(rows.length, 200); i++) {
      const val = rows[i][key];
      if (val !== undefined && val !== null) {
        maxLen = Math.max(maxLen, String(val).length);
      }
    }
    return { width: Math.min(Math.max(maxLen + 4, 12), 48) };
  });
}

/**
 * Exports multiple sheets into an Excel workbook and triggers browser download.
 * Sanitizes all values to prevent formula injection (SEC-07).
 *
 * @param {Array<{ title: string, rows: Array<Object> }>} sheetsConfig 
 * @param {string} filename 
 */
export async function downloadExcelWorkbook(sheetsConfig, filename) {
  const ExcelJS = await getExcelJS();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'VidyaVision AI System';
  workbook.created = new Date();

  for (const sheet of sheetsConfig) {
    const title = sheet.title.slice(0, 31).replace(/[\\/*?:[\]]/g, '_');
    const ws = workbook.addWorksheet(title);

    const rows = sheet.rows || [];
    if (rows.length === 0) {
      ws.addRow(['Status']);
      ws.addRow(['No records match the requested criteria.']);
      continue;
    }

    // Union of all row keys in first-appearance order — uploaded Excel
    // columns differ per row (empty cells are skipped at upload), so using
    // only rows[0] would clip columns. Missing values render as '—'.
    const headers = [];
    const seen = new Set();
    for (const r of rows) {
      for (const h of Object.keys(r || {})) {
        if (!seen.has(h)) {
          seen.add(h);
          headers.push(h);
        }
      }
    }
    ws.columns = headers.map(header => ({
      header,
      key: header
    }));

    // Add rows with SEC-07 formula injection neutralization
    rows.forEach(r => {
      const safeRow = {};
      headers.forEach(h => {
        safeRow[h] = sanitizeCellValue(r[h]);
      });
      ws.addRow(safeRow);
    });

    // Style headers
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E293B' }
    };
    headerRow.alignment = { vertical: 'middle', wrapText: true };

    // Lead Status pill fills — visible even when the emoji icon itself
    // doesn't render (missing color-emoji font). Matches the dashboard's
    // Interested (green) / Not Interested (red) / Not Answered (gray) cues.
    const leadIdx = headers.indexOf('Lead Status');
    if (leadIdx !== -1) {
      for (let r = 2; r <= rows.length + 1; r++) {
        const cell = ws.getCell(r, leadIdx + 1);
        const val = String(cell.value || '').toLowerCase();
        if (val.includes('not interested')) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
          cell.font = { color: { argb: 'FF991B1B' }, bold: true };
        } else if (val.includes('interested')) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
          cell.font = { color: { argb: 'FF166534' }, bold: true };
        } else if (val.includes('not answered') || val.includes('queued')) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
          cell.font = { color: { argb: 'FF64748B' } };
        } else if (val.includes('application sent')) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } };
          cell.font = { color: { argb: 'FF075985' } };
        } else if (val.includes('callback')) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } };
          cell.font = { color: { argb: 'FF854D0E' } };
        }
        cell.alignment = { vertical: 'middle', wrapText: true };
      }
    }

    // Auto width
    const widths = calculateColumnWidths(rows);
    widths.forEach((w, idx) => {
      ws.getColumn(idx + 1).width = w.width;
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  triggerBrowserDownload(blob, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

/**
 * Exports data to CSV with UTF-8 BOM and formula sanitization (SEC-07).
 */
export function downloadCsvFile(rows, filename) {
  if (!rows || rows.length === 0) return;
  const headers = [];
  const seen = new Set();
  for (const r of rows) {
    for (const h of Object.keys(r || {})) {
      if (!seen.has(h)) {
        seen.add(h);
        headers.push(h);
      }
    }
  }

  const csvRows = [];
  // Header row
  csvRows.push(headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','));

  // Data rows
  rows.forEach(r => {
    const line = headers.map(h => {
      const safe = sanitizeCellValue(r[h]);
      return `"${String(safe).replace(/"/g, '""')}"`;
    }).join(',');
    csvRows.push(line);
  });

  const csvContent = '\uFEFF' + csvRows.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  triggerBrowserDownload(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);
}

function triggerBrowserDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

