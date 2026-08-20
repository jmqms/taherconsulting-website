/**
 * QC END-LINE INSPECTION — Backend (Google Apps Script + Google Sheets)
 * ------------------------------------------------------------------
 * SETUP:
 * 1. Go to https://sheets.google.com and create a new blank spreadsheet.
 *    Name it something like "QC Inspection Data". A sheet named
 *    "Reports" will be created automatically by this script the first
 *    time it runs — you don't need to build it manually.
 *
 * 2. In that spreadsheet, go to Extensions > Apps Script.
 *
 * 3. Delete any starter code in Code.gs and paste in this entire file.
 *
 * 4. Click Deploy > New deployment.
 *    - Type: "Web app"
 *    - Description: "QC Inspection API"
 *    - Execute as: "Me"
 *    - Who has access: "Anyone" (this keeps it simple; the front-end
 *      login screen is what gates access to the tool itself)
 *    Click Deploy, and authorize the permissions Google asks for.
 *
 * 5. Copy the resulting Web app URL (it ends in /exec).
 *
 * 6. Paste that URL into qc-inspection.html, replacing the line:
 *      const CLOUD_API_URL = "PASTE_YOUR_GOOGLE_APPS_SCRIPT_EXEC_URL_HERE";
 *
 * That's it — the QC Inspection tool will now read and write reports
 * to this Google Sheet, the same pattern as your Daily QMS Floor Audit.
 * ------------------------------------------------------------------
 */

const SHEET_NAME = "Reports";

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, 2).setValues([["id", "json"]]);
  }
  return sheet;
}

function doGet(e) {
  const sheet = getSheet_();
  const values = sheet.getDataRange().getValues();
  const reports = [];
  for (let i = 1; i < values.length; i++) {
    const jsonStr = values[i][1];
    if (jsonStr) {
      try { reports.push(JSON.parse(jsonStr)); } catch (err) { /* skip bad row */ }
    }
  }
  return jsonOutput_({ reports: reports });
}

function doPost(e) {
  const body = JSON.parse(e.postData.contents);

  if (body.action === "save") {
    const sheet = getSheet_();
    // Clear existing data rows (keep header) and rewrite the full report list.
    // Simple full-overwrite strategy — fine for the data volumes this tool handles.
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 1, lastRow - 1, 2).clearContent();
    }
    const reports = body.reports || [];
    if (reports.length > 0) {
      const rows = reports.map(function (r) {
        return [r.id || Utilities.getUuid(), JSON.stringify(r)];
      });
      sheet.getRange(2, 1, rows.length, 2).setValues(rows);
    }
    return jsonOutput_({ status: "ok", count: reports.length });
  }

  return jsonOutput_({ status: "error", message: "Unknown action" });
}

function jsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
