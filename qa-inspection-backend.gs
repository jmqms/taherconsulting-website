/**
 * J.M. FABRICS LIMITED — QA Inspection Module Backend
 * ---------------------------------------------------------------------
 * Covers 6 inspection types: 1st Bundle, Sewing Inline, Finishing
 * Inline, 1st Carton, Pre-Final Inspection, Final Inspection.
 * Stores the checklist + result as a row in a Sheet, stores any
 * uploaded photos (Pre-Final / Final only) and the generated PDF
 * report in Google Drive, and supports searching past reports.
 *
 * SETUP:
 * 1. Create a new Google Sheet, e.g. "JM Fabrics QA Inspection".
 * 2. Create a tab named exactly: Inspections
 *    (auto-created with the right header the first time you save —
 *    no need to set it up by hand.)
 * 3. Extensions -> Apps Script, paste this file in, Save.
 * 4. Deploy -> New deployment -> Web app -> Execute as: Me ->
 *    Who has access: Anyone -> Deploy -> authorize -> copy the /exec URL.
 * 5. Paste that URL into qa-inspection.html wherever QAI_API_URL is
 *    defined.
 *
 * Drive folders ("JM Fabrics QA Inspection Reports" with one
 * subfolder per inspection type) are created automatically the
 * first time a report is saved.
 */

const INSPECTIONS_SHEET = "Inspections";
const QAI_ROOT_FOLDER = "JM Fabrics QA Inspection Reports";

const INSPECTIONS_HEADERS = [
  "InspectionId","Type","SBU","Buyer","IR","StyleName","InspectionDate","Inspector",
  "OverallResult","ChecklistJSON","PhotoUrlsJSON","PdfFileId","PdfUrl","Notes","CreatedAt"
];

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const action = body.action;

  if (action === "saveInspection") return saveInspection_(body.report);
  if (action === "searchInspections") return jsonResponse_({ ok: true, reports: searchInspections_(body.filters || {}) });

  return jsonResponse_({ ok: false, error: "Unrecognized request" });
}

// ---------- Save (uploads photos + PDF to Drive, writes one Sheet row) ----------

function saveInspection_(r) {
  if (!r.type || !r.styleName) {
    return jsonResponse_({ ok: false, error: "Inspection type and Style are required." });
  }

  const typeFolder = getTypeFolder_(r.type);

  // Photos (Pre-Final / Final only, but harmless to support everywhere)
  const photoUrls = [];
  (r.photos || []).forEach((p, i) => {
    try {
      const bytes = Utilities.base64Decode(p.dataBase64);
      const blob = Utilities.newBlob(bytes, p.mimeType || "image/jpeg", p.fileName || ("photo_" + i + ".jpg"));
      const file = typeFolder.createFile(blob);
      photoUrls.push(file.getUrl());
    } catch (err) {
      // Skip a photo that fails to decode rather than failing the whole save.
    }
  });

  // PDF report (generated client-side, uploaded here for permanent storage)
  let pdfFileId = "", pdfUrl = "";
  if (r.pdfBase64) {
    const pdfBytes = Utilities.base64Decode(r.pdfBase64);
    const pdfBlob = Utilities.newBlob(pdfBytes, "application/pdf", r.pdfFileName || (r.type + "_" + r.styleName + ".pdf"));
    const pdfFile = typeFolder.createFile(pdfBlob);
    pdfFileId = pdfFile.getId();
    pdfUrl = pdfFile.getUrl();
  }

  const sheet = getSheet_(INSPECTIONS_SHEET, INSPECTIONS_HEADERS);
  const inspectionId = Utilities.getUuid();
  sheet.appendRow([
    inspectionId, r.type, r.sbu || "", r.buyer || "", r.ir || "", r.styleName || "",
    r.inspectionDate || "", r.inspector || "", r.overallResult || "",
    JSON.stringify(r.checklist || []), JSON.stringify(photoUrls),
    pdfFileId, pdfUrl, r.notes || "", new Date()
  ]);

  return jsonResponse_({ ok: true, inspectionId: inspectionId, pdfUrl: pdfUrl, photoUrls: photoUrls });
}

function getTypeFolder_(type) {
  const root = getOrCreateFolder_(DriveApp.getRootFolder(), QAI_ROOT_FOLDER);
  return getOrCreateFolder_(root, type);
}

function getOrCreateFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parent.createFolder(name);
}

// ---------- Search ----------

function searchInspections_(filters) {
  const sheet = getSheet_(INSPECTIONS_SHEET, INSPECTIONS_HEADERS);
  const rows = sheet.getDataRange().getValues();
  const out = [];

  const wantType = (filters.type || "").trim();
  const wantSbu = (filters.sbu || "").trim().toLowerCase();
  const wantBuyer = (filters.buyer || "").trim().toLowerCase();
  const wantIr = (filters.ir || "").trim().toLowerCase();
  const wantStyle = (filters.styleName || "").trim().toLowerCase();
  const start = filters.start ? new Date(filters.start) : null;
  const end = filters.end ? new Date(filters.end + "T23:59:59") : null;
  if (start) start.setHours(0, 0, 0, 0);

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row[0]) continue;
    if (wantType && row[1] !== wantType) continue;
    if (wantSbu && String(row[2]).toLowerCase().indexOf(wantSbu) === -1) continue;
    if (wantBuyer && String(row[3]).toLowerCase().indexOf(wantBuyer) === -1) continue;
    if (wantIr && String(row[4]).toLowerCase().indexOf(wantIr) === -1) continue;
    if (wantStyle && String(row[5]).toLowerCase().indexOf(wantStyle) === -1) continue;
    const created = new Date(row[14]);
    if (start && created < start) continue;
    if (end && created > end) continue;

    let checklist = [], photoUrls = [];
    try { checklist = JSON.parse(row[9] || "[]"); } catch (e) {}
    try { photoUrls = JSON.parse(row[10] || "[]"); } catch (e) {}

    out.push({
      inspectionId: row[0], type: row[1], sbu: row[2], buyer: row[3], ir: row[4],
      styleName: row[5], inspectionDate: row[6], inspector: row[7], overallResult: row[8],
      checklist: checklist, photoUrls: photoUrls, pdfUrl: row[12], notes: row[13], createdAt: row[14]
    });
  }
  return out.reverse();
}

// ---------- Shared helpers ----------

function getSheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
  }
  return sheet;
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
