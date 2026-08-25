/**
 * J.M. FABRICS LIMITED — Risk Assessment (RA) Module Backend
 * ---------------------------------------------------------------------
 * Same structure as the QA Process module: an Overview dashboard and
 * an RA Analysis intake where selecting SBU → Buyer → IR auto-fills
 * style details and color-wise order quantities from an OrderInfo
 * reference sheet, then lets you set complexity (Basic / Complex /
 * Strategic Complex) per process: Fabric, Cutting, Printing,
 * Embroidery, Sewing, Wash, Finishing.
 *
 * SETUP:
 * 1. Create a new Google Sheet, e.g. "JM Fabrics RA Process".
 * 2. Create a tab named exactly: OrderInfo
 *    Import the "Order information.xlsx" file you already have into
 *    this tab AS-IS — keep the original header row exactly:
 *      SBU | Buyer | IR No | Style Name | Style Description | Season |
 *      Item | Product Dept | Color | Embellishment Category | Ship Date | Total
 *    (File > Import > Insert new sheet, or copy/paste the data in.)
 * 3. Create a tab named exactly: RARecords
 *    (auto-created with headers the first time an RA is saved)
 * 4. Create a tab named exactly: RAUsers (optional, only if you want
 *    a separate login for this module — 4 columns: UserID, Password,
 *    Name, Role)
 * 5. Extensions -> Apps Script, paste this file in, Save.
 * 6. Deploy -> New deployment -> Web app -> Execute as: Me ->
 *    Who has access: Anyone -> Deploy -> authorize -> copy the /exec URL.
 * 7. Paste that URL into ra-process.html wherever RA_API_URL is defined.
 */

const ORDERINFO_SHEET = "OrderInfo";
const RARECORDS_SHEET = "RARecords";
const RA_USERS_SHEET = "RAUsers";

const RA_EVENTS = ["Fabric", "Cutting", "Printing", "Embroidery", "Sewing", "Wash", "Finishing"];

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const action = body.action;

  if (action === "login") {
    const user = findUser_(body.sheet || RA_USERS_SHEET, body.userId, body.password);
    return user
      ? jsonResponse_({ ok: true, name: user.name, role: user.role })
      : jsonResponse_({ ok: false, error: "Invalid User ID or password" });
  }

  if (action === "listSbus") return jsonResponse_({ ok: true, sbus: listDistinct_(0) });
  if (action === "listBuyers") return jsonResponse_({ ok: true, buyers: listDistinctFiltered_(1, { 0: body.sbu }) });
  if (action === "listIrs") return jsonResponse_({ ok: true, irs: listDistinctFiltered_(2, { 0: body.sbu, 1: body.buyer }) });
  if (action === "getOrderDetail") return jsonResponse_({ ok: true, detail: getOrderDetail_(body.sbu, body.buyer, body.ir) });

  if (action === "saveRA") return saveRA_(body.record);
  if (action === "listRA") return jsonResponse_({ ok: true, records: listRA_() });
  if (action === "overview") return jsonResponse_({ ok: true, summary: buildOverview_(body.start, body.end) });

  return jsonResponse_({ ok: false, error: "Unrecognized request" });
}

// ---------- OrderInfo lookups ----------

function getOrderInfoRows_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORDERINFO_SHEET);
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  return rows.slice(1).filter(r => r[0]); // skip header, skip blank rows
}

function listDistinct_(colIdx) {
  const rows = getOrderInfoRows_();
  const set = {};
  rows.forEach(r => { if (r[colIdx]) set[r[colIdx]] = true; });
  return Object.keys(set).sort();
}

function listDistinctFiltered_(colIdx, filters) {
  const rows = getOrderInfoRows_();
  const set = {};
  rows.forEach(r => {
    for (const idx in filters) {
      if (filters[idx] && r[idx] !== filters[idx]) return;
    }
    if (r[colIdx]) set[r[colIdx]] = true;
  });
  return Object.keys(set).sort();
}

function getOrderDetail_(sbu, buyer, ir) {
  const rows = getOrderInfoRows_().filter(r => r[0] === sbu && r[1] === buyer && r[2] === ir);
  if (!rows.length) return null;
  const first = rows[0];
  const colorMap = {};
  let total = 0;
  rows.forEach(r => {
    const color = r[8] || "—";
    const qty = Number(r[11]) || 0;
    colorMap[color] = (colorMap[color] || 0) + qty;
    total += qty;
  });
  const colors = Object.keys(colorMap).map(c => ({ color: c, qty: colorMap[c] }));
  return {
    styleName: first[3], styleDescription: first[4], season: first[5],
    item: first[6], productDept: first[7], embellishmentCategory: first[9],
    colors: colors, totalQty: total
  };
}

// ---------- RA Records ----------

const RA_HEADERS = ["SBU","Buyer","IR","StyleName","Item","ProductDept","Season","TotalQty","ComplexityJSON","ReasonsJSON","OverallComplexity","Notes","CreatedAt"];

function saveRA_(rec) {
  const sheet = getSheet_(RARECORDS_SHEET, RA_HEADERS);
  sheet.appendRow([
    rec.sbu || "", rec.buyer || "", rec.ir || "", rec.styleName || "", rec.item || "",
    rec.productDept || "", rec.season || "", rec.totalQty || "",
    JSON.stringify(rec.complexity || {}), JSON.stringify(rec.reasons || {}), rec.overallComplexity || "", rec.notes || "",
    new Date()
  ]);
  return jsonResponse_({ ok: true });
}

function listRA_() {
  const sheet = getSheet_(RARECORDS_SHEET, RA_HEADERS);
  const rows = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[3]) continue;
    let complexity = {}, reasons = {};
    try { complexity = JSON.parse(r[8] || "{}"); } catch (e) {}
    try { reasons = JSON.parse(r[9] || "{}"); } catch (e) {}
    out.push({
      sbu: r[0], buyer: r[1], ir: r[2], styleName: r[3], item: r[4], productDept: r[5],
      season: r[6], totalQty: r[7], complexity: complexity, reasons: reasons, overallComplexity: r[10],
      notes: r[11], createdAt: r[12]
    });
  }
  return out;
}

// ---------- Overview aggregation (matches the Operational Complexity Analysis layout) ----------

function buildOverview_(startStr, endStr) {
  const start = startStr ? new Date(startStr) : null;
  const end = endStr ? new Date(endStr + "T23:59:59") : null;
  if (start) start.setHours(0, 0, 0, 0);

  function inRange(dateVal) {
    if (!start && !end) return true;
    const d = new Date(dateVal);
    if (isNaN(d)) return true;
    if (start && d < start) return false;
    if (end && d > end) return false;
    return true;
  }

  const records = listRA_().filter(r => inRange(r.createdAt));

  let totalBasic = 0, totalComplex = 0, totalStrategic = 0;
  const byEvent = {};
  RA_EVENTS.forEach(ev => { byEvent[ev] = { basic: 0, complex: 0, strategic: 0 }; });

  records.forEach(r => {
    RA_EVENTS.forEach(ev => {
      const level = (r.complexity || {})[ev];
      if (level === "Strategic Complex") { byEvent[ev].strategic++; totalStrategic++; }
      else if (level === "Complex") { byEvent[ev].complex++; totalComplex++; }
      else if (level === "Basic") { byEvent[ev].basic++; totalBasic++; }
    });
  });

  return {
    totalStyles: records.length,
    totalCoreEvents: RA_EVENTS.length,
    totalBasic: totalBasic,
    totalComplex: totalComplex,
    totalStrategic: totalStrategic,
    byEvent: byEvent
  };
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

function findUser_(sheetName, userId, password) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) return null;
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const [rowId, rowPass, rowName, rowRole] = rows[i];
    if (!rowId) continue;
    if (String(rowId).trim().toLowerCase() === String(userId).trim().toLowerCase() && String(rowPass) === String(password)) {
      return { name: rowName || rowId, role: rowRole || "Team Member" };
    }
  }
  return null;
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
