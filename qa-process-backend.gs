/**
 * J.M. FABRICS LIMITED — QA Process Module Backend
 * ---------------------------------------------------------------------
 * Powers the Quality Assurance Process module: Order/style complexity
 * intake, Size-Set entries, Testing entries (6 sub test-types), and
 * per-stage QA entries across the remaining process/QA stages (PDC,
 * RA, RM, Pilot Run, PP Meeting, Cutting, Print, Embroidery, Sewing,
 * Wash, Finishing, Packing Accuracy, 1st Bundle, Sewing Inline,
 * Finishing Inline, 1st Carton, Pre-Final Inspection, Final Inspection).
 *
 * SETUP:
 * 1. Create a new Google Sheet, e.g. "JM Fabrics QA Process".
 * 2. Create these tabs (exact names) — each is auto-created with the
 *    correct headers the first time data is saved, but you can also
 *    create them empty ahead of time if you prefer:
 *      Orders   — order intake + style complexity requirements
 *      SizeSet  — Size-Set / Pattern Verify entries
 *      Testing  — all 6 testing sub-types (Print, Embroidery,
 *                 Heat Seal, Home Laundry, Print & Embroidery,
 *                 Physical Testing), differentiated by a TestType column
 *      Entries  — generic entries for the remaining process/QA stages
 *      QAUsers  — this module's own login (UserID, Password, Name, Role)
 * 3. Extensions -> Apps Script, paste this file in, Save.
 * 4. Deploy -> New deployment -> Web app -> Execute as: Me ->
 *    Who has access: Anyone -> Deploy -> authorize -> copy the /exec URL.
 * 5. Paste that URL into qa-process.html wherever QA_API_URL is defined.
 */

const ORDERS_SHEET = "Orders";
const SIZESET_SHEET = "SizeSet";
const TESTING_SHEET = "Testing";
const ENTRIES_SHEET = "Entries";
const QA_USERS_SHEET = "QAUsers";
// Reference-only tabs for Style Tracking — a copy of the same OrderInfo /
// RARecords data used by the RA Process module, imported straight into
// THIS spreadsheet so the QA Process module runs fully on its own,
// with no call out to the RA module's Apps Script deployment.
const ORDERINFO_SHEET = "OrderInfo";
const RARECORDS_SHEET = "RARecords";
// This Quality Process module's own Risk Assessment stage form
// (matches Quality_Process_Data_Entry.xlsx) — separate from the
// RARECORDS_SHEET reference copy above, and separate from the
// standalone RA Process module.
const QARA_SHEET = "QualityRA";
const QARA_HEADERS = ["Timestamp","SBU","Buyer","IR","StyleNo","RADate","RAby","OrderType","ChangesJSON","RiskDecision","ActionComments"];
const QARA_CHANGE_ROWS = ["Fabric","Pattern (Measurements)","Construction","Print","Embroidery","Wash","Additional Changes (If Any)"];

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  const action = body.action;

  if (action === "login") {
    const user = findUser_(body.sheet || QA_USERS_SHEET, body.userId, body.password);
    return user
      ? jsonResponse_({ ok: true, name: user.name, role: user.role })
      : jsonResponse_({ ok: false, error: "Invalid User ID or password" });
  }

  if (action === "saveOrder") return saveOrder_(body.order);
  if (action === "listOrders") return jsonResponse_({ ok: true, orders: listOrders_() });

  if (action === "saveSizeSet") return saveSizeSet_(body.entry);
  if (action === "listSizeSet") return jsonResponse_({ ok: true, entries: listSizeSet_() });

  if (action === "saveTesting") return saveTesting_(body.entry);
  if (action === "listTesting") return jsonResponse_({ ok: true, entries: listTesting_(body.testType) });

  if (action === "saveEntry") return saveEntry_(body.entry);
  if (action === "listEntries") return jsonResponse_({ ok: true, entries: listEntries_(body.stage) });

  if (action === "overview") return jsonResponse_({ ok: true, summary: buildOverview_(body.start, body.end) });

  if (action === "styleStatus") return jsonResponse_({ ok: true, byStage: buildStyleStatus_(body.irNo, body.styleNo) });

  if (action === "listSbus") return jsonResponse_({ ok: true, sbus: listDistinct_(0) });
  if (action === "listBuyers") return jsonResponse_({ ok: true, buyers: listDistinctFiltered_(1, { 0: body.sbu }) });
  if (action === "listIrs") return jsonResponse_({ ok: true, irs: listDistinctFiltered_(2, { 0: body.sbu, 1: body.buyer }) });
  if (action === "getOrderDetail") return jsonResponse_({ ok: true, detail: getOrderDetail_(body.sbu, body.buyer, body.ir) });
  if (action === "getRA") return jsonResponse_({ ok: true, record: getRAForIr_(body.sbu, body.buyer, body.ir) });

  if (action === "saveQualityRA") return saveQualityRA_(body.entry);
  if (action === "listQualityRA") return jsonResponse_({ ok: true, entries: listQualityRA_() });

  return jsonResponse_({ ok: false, error: "Unrecognized request" });
}

// ---------- Orders (matches Data_Entry_Sheet.xlsx "Order Entry" tab) ----------

const ORDERS_HEADERS = ["SBU","Buyer","StyleNo","Season","IrNo","Item","PO","Color","OrderQty","DeliveryDate","OrderTypeJSON","OverallComplexity","ComplexityJSON","ComplexityReasonsJSON","CreatedAt"];

function saveOrder_(o) {
  const sheet = getSheet_(ORDERS_SHEET, ORDERS_HEADERS);
  sheet.appendRow([
    o.sbu || "", o.buyer || "", o.styleNo || "", o.season || "", o.irNo || "",
    o.item || "", o.po || "", o.color || "", o.orderQty || "", o.deliveryDate || "",
    JSON.stringify(o.orderType || {}), o.overallComplexity || "",
    JSON.stringify(o.complexity || {}), JSON.stringify(o.complexityReasons || {}),
    new Date()
  ]);
  return jsonResponse_({ ok: true });
}

function listOrders_() {
  const sheet = getSheet_(ORDERS_SHEET, ORDERS_HEADERS);
  const rows = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[2]) continue; // StyleNo required
    let complexity = {}, orderType = {}, complexityReasons = {};
    try { orderType = JSON.parse(r[10] || "{}"); } catch (e) {}
    try { complexity = JSON.parse(r[12] || "{}"); } catch (e) {}
    try { complexityReasons = JSON.parse(r[13] || "{}"); } catch (e) {}
    out.push({
      sbu: r[0], buyer: r[1], styleNo: r[2], season: r[3], irNo: r[4], item: r[5], po: r[6],
      color: r[7], orderQty: r[8], deliveryDate: r[9], orderType: orderType,
      overallComplexity: r[11], complexity: complexity, complexityReasons: complexityReasons,
      createdAt: r[14]
    });
  }
  return out;
}

// ---------- Size-Set (matches Data_Entry_Sheet.xlsx "Size-Set" tab) ----------

const SIZESET_HEADERS = ["Date","SBU","Buyer","StyleNo","IR","Season","Item","EmbellishmentType","ProductType","OrderType","ColorCount","PlannedQty","Status","CorrectionType","Remarks","CreatedAt"];

function saveSizeSet_(e2) {
  const sheet = getSheet_(SIZESET_SHEET, SIZESET_HEADERS);
  sheet.appendRow([
    e2.date || "", e2.sbu || "", e2.buyer || "", e2.styleNo || "", e2.ir || "", e2.season || "",
    e2.item || "", e2.embellishmentType || "", e2.productType || "", e2.orderType || "",
    e2.colorCount || "", e2.plannedQty || "", e2.status || "", e2.correctionType || "",
    e2.remarks || "", new Date()
  ]);
  return jsonResponse_({ ok: true });
}

function listSizeSet_() {
  const sheet = getSheet_(SIZESET_SHEET, SIZESET_HEADERS);
  const rows = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[3]) continue; // StyleNo required
    out.push({
      date: r[0], sbu: r[1], buyer: r[2], styleNo: r[3], ir: r[4], season: r[5], item: r[6],
      embellishmentType: r[7], productType: r[8], orderType: r[9], colorCount: r[10],
      plannedQty: r[11], status: r[12], correctionType: r[13], remarks: r[14], createdAt: r[15]
    });
  }
  return out;
}

// ---------- Testing (matches Data_Entry_Sheet.xlsx "Testing" tab, 6 sub-types) ----------

const TESTING_HEADERS = ["TestType","SBU","Buyer","StyleNo","IR","Season","Color","ItemDescription","EmbellishmentType","AdditionalTrims","LogInDate","TestedParty","TrfNo","Result","LogOutDate","Remarks","CreatedAt"];

function saveTesting_(e3) {
  const sheet = getSheet_(TESTING_SHEET, TESTING_HEADERS);
  sheet.appendRow([
    e3.testType || "", e3.sbu || "", e3.buyer || "", e3.styleNo || "", e3.ir || "", e3.season || "",
    e3.color || "", e3.itemDescription || "", e3.embellishmentType || "", e3.additionalTrims || "",
    e3.logInDate || "", e3.testedParty || "", e3.trfNo || "", e3.result || "", e3.logOutDate || "",
    e3.remarks || "", new Date()
  ]);
  return jsonResponse_({ ok: true });
}

function listTesting_(testType) {
  const sheet = getSheet_(TESTING_SHEET, TESTING_HEADERS);
  const rows = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[3]) continue; // StyleNo required
    if (testType && r[0] !== testType) continue;
    out.push({
      testType: r[0], sbu: r[1], buyer: r[2], styleNo: r[3], ir: r[4], season: r[5], color: r[6],
      itemDescription: r[7], embellishmentType: r[8], additionalTrims: r[9], logInDate: r[10],
      testedParty: r[11], trfNo: r[12], result: r[13], logOutDate: r[14], remarks: r[15], createdAt: r[16]
    });
  }
  return out.reverse();
}

// ---------- Entries (remaining generic process/QA stages) ----------

const ENTRIES_HEADERS = ["Timestamp", "Stage", "OrderNo", "StyleNo", "IrNo", "Inspector", "Status", "Score", "Notes"];

function saveEntry_(entry) {
  const sheet = getSheet_(ENTRIES_SHEET, ENTRIES_HEADERS);
  sheet.appendRow([
    new Date(),
    entry.stage || "",
    entry.orderNo || "",
    entry.styleNo || "",
    entry.irNo || "",
    entry.inspector || "",
    entry.status || "Open",
    entry.score || "",
    entry.notes || ""
  ]);
  return jsonResponse_({ ok: true });
}

function listEntries_(stage) {
  const sheet = getSheet_(ENTRIES_SHEET, ENTRIES_HEADERS);
  const rows = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[1]) continue;
    if (stage && r[1] !== stage) continue;
    out.push({ timestamp: r[0], stage: r[1], orderNo: r[2], styleNo: r[3], irNo: r[4], inspector: r[5], status: r[6], score: r[7], notes: r[8] });
  }
  return out.reverse();
}

// ---------- Style Tracking (rolls up every stage's Entries for one IR/Style) ----------

function buildStyleStatus_(irNo, styleNo) {
  const wantIr = normVal2_(irNo);
  const wantStyle = normVal2_(styleNo);
  const all = listEntries_(null).filter(e => {
    if (wantIr && normVal2_(e.irNo) === wantIr) return true;
    if (!wantIr && wantStyle && normVal2_(e.styleNo) === wantStyle) return true;
    return false;
  });
  const byStage = {};
  all.forEach(e => {
    if (!byStage[e.stage]) byStage[e.stage] = [];
    byStage[e.stage].push({ timestamp: e.timestamp, status: e.status, score: e.score, inspector: e.inspector, notes: e.notes });
  });
  return byStage;
}

function normVal2_(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

// ---------- OrderInfo / RARecords lookups (Style Tracking, self-contained) ----------
// Import your "Order information" export into a tab named exactly
// OrderInfo in THIS spreadsheet, header row as-is:
//   SBU | Buyer | IR No | Style Name | Style Description | Season |
//   Item | Product Dept | Color | Embellishment Category | Ship Date | Total
// Optionally also import a RARecords tab (same layout the RA module
// writes) if you want the Risk Assessment summary to show here too —
// otherwise that panel just says no RA data found, and the rest of
// Style Tracking (style details + stage progress) still works fine.

function normValOI_(v) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd");
  return String(v).trim();
}

function getOrderInfoRows_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ORDERINFO_SHEET);
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  return rows.slice(1).filter(r => r[0]);
}

function listDistinct_(colIdx) {
  const rows = getOrderInfoRows_();
  const set = {};
  rows.forEach(r => { const v = normValOI_(r[colIdx]); if (v) set[v] = true; });
  return Object.keys(set).sort();
}

function listDistinctFiltered_(colIdx, filters) {
  const rows = getOrderInfoRows_();
  const set = {};
  rows.forEach(r => {
    for (const idx in filters) {
      const want = normValOI_(filters[idx]);
      if (want && normValOI_(r[idx]) !== want) return;
    }
    const v = normValOI_(r[colIdx]);
    if (v) set[v] = true;
  });
  return Object.keys(set).sort();
}

function getOrderDetail_(sbu, buyer, ir) {
  const wantSbu = normValOI_(sbu), wantBuyer = normValOI_(buyer), wantIr = normValOI_(ir);
  const rows = getOrderInfoRows_().filter(r =>
    normValOI_(r[0]) === wantSbu && normValOI_(r[1]) === wantBuyer && normValOI_(r[2]) === wantIr
  );
  if (!rows.length) return null;
  const first = rows[0];
  const colorMap = {};
  let total = 0;
  rows.forEach(r => {
    const color = normValOI_(r[8]) || "—";
    const qty = Number(r[11]) || 0;
    colorMap[color] = (colorMap[color] || 0) + qty;
    total += qty;
  });
  return {
    styleName: first[3], styleDescription: first[4], season: first[5],
    item: first[6], productDept: first[7], embellishmentCategory: first[9],
    colors: Object.keys(colorMap).map(c => ({ color: c, qty: colorMap[c] })),
    totalQty: total
  };
}

function getRAForIr_(sbu, buyer, ir) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RARECORDS_SHEET);
  if (!sheet) return null;
  const wantSbu = normValOI_(sbu), wantBuyer = normValOI_(buyer), wantIr = normValOI_(ir);
  const rows = sheet.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) {
    const r = rows[i];
    if (normValOI_(r[0]) === wantSbu && normValOI_(r[1]) === wantBuyer && normValOI_(r[2]) === wantIr) {
      let complexity = {}, reasons = {};
      try { complexity = JSON.parse(r[8] || "{}"); } catch (e) {}
      try { reasons = JSON.parse(r[9] || "{}"); } catch (e) {}
      return { sbu: r[0], buyer: r[1], ir: r[2], styleName: r[3], overallComplexity: r[10], complexity: complexity, reasons: reasons };
    }
  }
  return null;
}

// ---------- Quality Process's own Risk Assessment (RA) stage ----------
// Saves the full Changes-Summary form, AND drops a matching row into
// Entries (stage "ra") so Style Tracking's stage rollup picks it up
// same as every other stage.

function saveQualityRA_(entry) {
  entry = entry || {};
  const sheet = getSheet_(QARA_SHEET, QARA_HEADERS);
  sheet.appendRow([
    new Date(),
    entry.sbu || "", entry.buyer || "", entry.ir || "", entry.styleNo || "",
    entry.raDate || "", entry.raBy || "", entry.orderType || "",
    JSON.stringify(entry.changes || {}),
    entry.riskDecision || "",
    entry.actionComments || ""
  ]);

  // Mirror a summary row into Entries so Style Tracking's per-stage
  // rollup (buildStyleStatus_) sees this RA submission too.
  const statusMap = { "Accept": "Done", "Accept with Conditions": "In Progress", "Reject": "Open" };
  saveEntry_({
    stage: "ra",
    orderNo: "",
    styleNo: entry.styleNo || "",
    irNo: entry.ir || "",
    inspector: entry.raBy || "",
    status: statusMap[entry.riskDecision] || "Open",
    score: "",
    notes: entry.actionComments || ""
  });

  return jsonResponse_({ ok: true });
}

function listQualityRA_() {
  const sheet = getSheet_(QARA_SHEET, QARA_HEADERS);
  const rows = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    let changes = {};
    try { changes = JSON.parse(r[8] || "{}"); } catch (e) {}
    out.push({
      timestamp: r[0], sbu: r[1], buyer: r[2], ir: r[3], styleNo: r[4],
      raDate: r[5], raBy: r[6], orderType: r[7], changes: changes,
      riskDecision: r[9], actionComments: r[10]
    });
  }
  return out.reverse();
}

// ---------- Overview aggregation ----------

function buildOverview_(startStr, endStr) {
  const start = startStr ? new Date(startStr) : null;
  const end = endStr ? new Date(endStr + "T23:59:59") : null;
  if (start) start.setHours(0, 0, 0, 0);

  function inRange(dateVal) {
    if (!start && !end) return true;
    const d = new Date(dateVal);
    if (isNaN(d)) return true; // don't drop rows with unparsable dates
    if (start && d < start) return false;
    if (end && d > end) return false;
    return true;
  }

  const orders = listOrders_().filter(o => inRange(o.createdAt));
  const entries = listEntries_(null).filter(e => inRange(e.timestamp));

  let basic = 0, complex = 0, strategic = 0;
  orders.forEach(o => {
    Object.values(o.complexity || {}).forEach(level => {
      if (level === "Strategic Complex") strategic++;
      else if (level === "Complex") complex++;
      else if (level === "Basic") basic++;
    });
  });

  const byStage = {};
  entries.forEach(e => {
    if (!byStage[e.stage]) byStage[e.stage] = { total: 0, open: 0, inProgress: 0, done: 0 };
    byStage[e.stage].total++;
    if (e.status === "Open") byStage[e.stage].open++;
    else if (e.status === "In Progress") byStage[e.stage].inProgress++;
    else if (e.status === "Done") byStage[e.stage].done++;
  });

  return {
    totalOrders: orders.length,
    totalEntries: entries.length,
    basic: basic,
    complex: complex,
    strategic: strategic,
    byStage: byStage
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
