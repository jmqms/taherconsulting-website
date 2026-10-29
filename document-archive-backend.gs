/**
 * J.M. FABRICS LIMITED — Quality Manual & SOP Archive Backend
 * ---------------------------------------------------------------------
 * Stores uploaded PDFs in a dedicated Google Drive folder and keeps a
 * version history in a Google Sheet. Uploading a new PDF under the
 * same document title creates a new version (old versions stay
 * accessible) rather than silently overwriting anything.
 *
 * SETUP:
 * 1. Create a new Google Sheet, e.g. "JM Fabrics Document Archive".
 * 2. Create a tab named exactly: Documents
 *    (auto-created with the right header the first time you upload —
 *    no need to set it up by hand.)
 * 3. Extensions -> Apps Script, paste this file in, Save.
 * 4. Deploy -> New deployment -> Web app -> Execute as: Me ->
 *    Who has access: Anyone -> Deploy -> authorize -> copy the /exec URL.
 * 5. Paste that URL into document-archive.html wherever DOC_API_URL
 *    is defined.
 *
 * The first time you upload a document, this script automatically
 * creates a Drive folder called "JM Fabrics QMS Documents" (with
 * "Quality Manual" and "SOP" subfolders inside) to store the PDFs —
 * you don't need to create these yourself.
 */

const DOCS_SHEET = "Documents";
const ROOT_FOLDER_NAME = "JM Fabrics QMS Documents";

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const action = body.action;

  if (action === "uploadDocument") return uploadDocument_(body.doc);
  if (action === "listDocuments") return jsonResponse_({ ok: true, documents: listDocuments_() });

  return jsonResponse_({ ok: false, error: "Unrecognized request" });
}

// ---------- Upload (creates a new version row + Drive file) ----------

const DOC_HEADERS = ["DocId","Title","Category","Section","DocNo","DocumentSL","EffectiveDate","RevisionDate","VersionNo","Version","FileId","FileUrl","FileName","UploadedBy","Notes","CreatedAt"];

function uploadDocument_(doc) {
  if (!doc.title || !doc.category || !doc.fileBase64) {
    return jsonResponse_({ ok: false, error: "Title, category, and a PDF file are required." });
  }

  const folder = getCategoryFolder_(doc.category);
  const bytes = Utilities.base64Decode(doc.fileBase64);
  const blob = Utilities.newBlob(bytes, "application/pdf", doc.fileName || (doc.title + ".pdf"));
  const file = folder.createFile(blob);
  file.setDescription(doc.title + " — uploaded via QMS Document Archive");

  const sheet = getSheet_(DOCS_SHEET, DOC_HEADERS);
  const docId = doc.docId && doc.docId.trim() ? doc.docId.trim() : Utilities.getUuid();
  const existingVersions = listDocuments_().filter(d => d.docId === docId).length;
  const version = existingVersions + 1;

  sheet.appendRow([
    docId, doc.title, doc.category, doc.section || "", doc.docNo || "", doc.documentSl || "",
    doc.effectiveDate || "", doc.revisionDate || "", doc.versionNo || "", version,
    file.getId(), file.getUrl(), file.getName(), doc.uploadedBy || "", doc.notes || "", new Date()
  ]);

  return jsonResponse_({ ok: true, docId: docId, version: version, fileUrl: file.getUrl() });
}

function getCategoryFolder_(category) {
  const root = getOrCreateFolder_(DriveApp.getRootFolder(), ROOT_FOLDER_NAME);
  return getOrCreateFolder_(root, category);
}

function getOrCreateFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parent.createFolder(name);
}

// ---------- List (all versions, newest first per document) ----------

function listDocuments_() {
  const sheet = getSheet_(DOCS_SHEET, DOC_HEADERS);
  const rows = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    out.push({
      docId: r[0], title: r[1], category: r[2], section: r[3] || "", docNo: r[4],
      documentSl: r[5] || "", effectiveDate: r[6] || "", revisionDate: r[7] || "", versionNo: r[8] || "",
      version: r[9], fileId: r[10], fileUrl: r[11], fileName: r[12], uploadedBy: r[13], notes: r[14], createdAt: r[15]
    });
  }
  return out;
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
