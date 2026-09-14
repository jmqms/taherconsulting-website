/**
 * QA INSPECTION (1st Bundle / Sewing Inline / Finishing Inline / 1st Carton)
 * Backend — Google Apps Script + Google Sheets
 * ------------------------------------------------------------------
 * This is a completely SEPARATE spreadsheet and Apps Script project
 * from the main QA Process module (qa-process-backend.gs) and from
 * the dedicated Pre-Final / Final Inspection tools. Nothing here is
 * shared with those — qa-inspection.html's 4 generic checklist types
 * live entirely in their own Google Sheet.
 *
 * SETUP:
 * 1. Go to https://sheets.google.com and create a new blank spreadsheet.
 *    Name it something like "QA Inspection Data".
 * 2. Extensions > Apps Script. Delete the starter code, paste this
 *    entire file in.
 * 3. Deploy > New deployment > Type: "Web app".
 *    - Execute as: "Me"
 *    - Who has access: "Anyone"
 *    Deploy, authorize the permissions Google asks for.
 * 4. Copy the resulting /exec URL and paste it into qa-inspection.html,
 *    replacing:
 *      const QAI_API_URL = "PASTE_YOUR_GOOGLE_APPS_SCRIPT_EXEC_URL_HERE";
 *
 * That's it — this tool now reads/writes to its own "Inspections"
 * sheet, and uploads photos + the generated PDF to two Drive folders
 * it creates automatically the first time you save a report.
 * ------------------------------------------------------------------
 */

const SHEET_NAME = "Inspections";
const HEADERS = ["Id","Type","SBU","Buyer","IR","StyleName","InspectionDate","Inspector","OverallResult","Notes","ChecklistJSON","PhotoUrlsJSON","PdfUrl","CreatedAt"];
const PHOTOS_FOLDER = "QA Inspection - Photos";
const PDF_FOLDER = "QA Inspection - Reports (PDF)";

function getSheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) { return jsonResponse_({ ok: false, error: "Bad request body" }); }
  const action = body.action;

  try {
    if (action === "saveInspection") return saveInspection_(body.report);
    if (action === "searchInspections") return jsonResponse_({ ok: true, reports: searchInspections_(body.filters) });
    return jsonResponse_({ ok: false, error: "Unknown action: " + action });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err) });
  }
}

// Uploads one base64 file to a named Drive folder (created if it
// doesn't exist yet) and returns a shareable view URL.
function uploadFileToDrive_(base64, filename, mimeType, folderName) {
  if (!base64) return "";
  const folders = DriveApp.getFoldersByName(folderName);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
  const bytes = Utilities.base64Decode(base64);
  const blob = Utilities.newBlob(bytes, mimeType || "application/octet-stream", filename || ("file_" + Date.now()));
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return "https://drive.google.com/file/d/" + file.getId() + "/view";
}

function saveInspection_(report) {
  report = report || {};
  if (!report.styleName) return jsonResponse_({ ok: false, error: "Style is required" });

  const photoUrls = [];
  (report.photos || []).forEach(function (p) {
    try {
      const url = uploadFileToDrive_(p.dataBase64, p.fileName, p.mimeType, PHOTOS_FOLDER);
      if (url) photoUrls.push(url);
    } catch (err) { /* one bad photo shouldn't fail the whole save */ }
  });

  let pdfUrl = "";
  if (report.pdfBase64) {
    try {
      pdfUrl = uploadFileToDrive_(report.pdfBase64, report.pdfFileName || (Utilities.getUuid() + ".pdf"), "application/pdf", PDF_FOLDER);
    } catch (err) { /* PDF upload failing shouldn't block saving the report data */ }
  }

  const id = Utilities.getUuid();
  const sheet = getSheet_(SHEET_NAME, HEADERS);
  sheet.appendRow([
    id, report.type || "", report.sbu || "", report.buyer || "", report.ir || "",
    report.styleName || "", report.inspectionDate || "", report.inspector || "",
    report.overallResult || "", report.notes || "",
    JSON.stringify(report.checklist || []), JSON.stringify(photoUrls), pdfUrl,
    new Date().toISOString()
  ]);
  return jsonResponse_({ ok: true, id: id, pdfUrl: pdfUrl });
}

function searchInspections_(filters) {
  filters = filters || {};
  const sheet = getSheet_(SHEET_NAME, HEADERS);
  const rows = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    const rec = {
      id: r[0], type: r[1], sbu: r[2], buyer: r[3], ir: r[4], styleName: r[5],
      inspectionDate: r[6], inspector: r[7], overallResult: r[8], notes: r[9],
      checklist: safeParse_(r[10], []), photoUrls: safeParse_(r[11], []),
      pdfUrl: r[12], createdAt: r[13]
    };
    if (matchesFilters_(rec, filters)) out.push(rec);
  }
  return out.reverse();
}

function matchesFilters_(r, f) {
  if (f.type && r.type !== f.type) return false;
  if (f.sbu && String(r.sbu).toLowerCase().indexOf(String(f.sbu).toLowerCase()) === -1) return false;
  if (f.buyer && String(r.buyer).toLowerCase().indexOf(String(f.buyer).toLowerCase()) === -1) return false;
  if (f.ir && String(r.ir).toLowerCase().indexOf(String(f.ir).toLowerCase()) === -1) return false;
  if (f.styleName && String(r.styleName).toLowerCase().indexOf(String(f.styleName).toLowerCase()) === -1) return false;
  if (f.start && r.inspectionDate && r.inspectionDate < f.start) return false;
  if (f.end && r.inspectionDate && r.inspectionDate > f.end) return false;
  return true;
}

function safeParse_(str, fallback) {
  try { return JSON.parse(str || ""); } catch (e) { return fallback; }
}
