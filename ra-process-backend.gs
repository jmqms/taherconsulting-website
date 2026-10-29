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
 * SETUP (Taherconsultingbd Portal — Module 05 folder):
 * 1. This module's own Google Sheet lives in the "Module 05 - Risk
 *    Assessment" Drive folder (e.g. "RA_Process_Data").
 * 2. OrderInfo is NO LONGER a local tab — it lives in the shared
 *    "Master_Order_Information" Sheet at the Portal's Drive root
 *    (MASTER_ORDER_SHEET_ID below).
 * 3. RARecords is ALSO NO LONGER local — this module still OWNS and
 *    writes it, but it now lives as a tab inside that same shared
 *    "Master_Order_Information" Sheet, so QA Process's Style Tracking
 *    panel reads the exact same copy instead of an imported duplicate.
 * 4. RAUsers login now runs centrally through users-backend.gs (see
 *    js/module-auth.js, sheetName: "RAUsers") reading from the shared
 *    "User_Management" Sheet — no separate login tab needed here.
 * 5. Extensions -> Apps Script, paste this file in, Save. Run any
 *    function once and accept the Drive permission prompts (this
 *    module's own Sheet AND the shared Master_Order_Information Sheet).
 * 6. Deploy -> New deployment -> Web app -> Execute as: Me ->
 *    Who has access: Anyone -> Deploy -> authorize -> copy the /exec URL.
 * 7. Paste that URL into ra-process.html wherever RA_API_URL is defined.
 */

// ---- Centralized cross-module Sheets (Taherconsultingbd Portal / Drive root) ----
const MASTER_ORDER_SHEET_ID = "1DE8KrlS6LLTDdhKIg4YgM3ZSsdZmxyzAR7BBAZJ5--U"; // Master_Order_Information
const USER_MANAGEMENT_SHEET_ID = "1s0i82BmF6T5C7_yNf970cK2Gb3qJ3-7tKqAWM-0vzbw"; // User_Management
const ORDERINFO_SHEET = "OrderInfo";   // tab inside Master_Order_Information
const RARECORDS_SHEET = "RARecords";   // tab inside Master_Order_Information — this module OWNS/writes it
const RA_USERS_SHEET = "RAUsers";      // tab inside User_Management (login now handled centrally by users-backend.gs)

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
  if (action === "listEmbCats") return jsonResponse_({ ok: true, embCats: listDistinctFiltered_(9, { 0: body.sbu, 1: body.buyer, 2: body.ir }) });
  if (action === "getOrderDetail") return jsonResponse_({ ok: true, detail: getOrderDetail_(body.sbu, body.buyer, body.ir, body.embCat) });

  if (action === "saveRA") return saveRA_(body.record);
  if (action === "listRA") return jsonResponse_({ ok: true, records: listRA_() });
  if (action === "overview") return jsonResponse_({ ok: true, summary: buildOverview_(body.start, body.end) });
  if (action === "eventAnalysis") return jsonResponse_({ ok: true, result: buildEventAnalysis_(body.event, body.sbu, body.buyer, body.start, body.end) });

  return jsonResponse_({ ok: false, error: "Unrecognized request" });
}

// ---------- OrderInfo lookups ----------

function getOrderInfoRows_() {
  const sheet = getMasterSheet_().getSheetByName(ORDERINFO_SHEET);
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  return rows.slice(1).filter(r => r[0]); // skip header, skip blank rows
}

// Sheets often hands back IR No / SBU / Buyer as Number, Date, or a string with
// stray spaces. The dropdowns always send plain trimmed strings, so every
// comparison below must normalize both sides the same way or the filters
// silently match nothing (Buyer/IR stay empty after picking SBU).
function normVal_(v) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd");
  return String(v).trim();
}

function listDistinct_(colIdx) {
  const rows = getOrderInfoRows_();
  const set = {};
  rows.forEach(r => { const v = normVal_(r[colIdx]); if (v) set[v] = true; });
  return Object.keys(set).sort();
}

function listDistinctFiltered_(colIdx, filters) {
  const rows = getOrderInfoRows_();
  const set = {};
  rows.forEach(r => {
    for (const idx in filters) {
      const want = normVal_(filters[idx]);
      if (want && normVal_(r[idx]) !== want) return;
    }
    const v = normVal_(r[colIdx]);
    if (v) set[v] = true;
  });
  return Object.keys(set).sort();
}

function getOrderDetail_(sbu, buyer, ir, embCat) {
  const wantSbu = normVal_(sbu), wantBuyer = normVal_(buyer), wantIr = normVal_(ir), wantEmb = normVal_(embCat);
  let rows = getOrderInfoRows_().filter(r =>
    normVal_(r[0]) === wantSbu && normVal_(r[1]) === wantBuyer && normVal_(r[2]) === wantIr
  );
  if (!rows.length) return null;
  if (wantEmb) rows = rows.filter(r => normVal_(r[9]) === wantEmb);
  if (!rows.length) return null;
  const first = rows[0];
  const colorMap = {};
  let total = 0;
  const embSet = {};
  rows.forEach(r => {
    const color = normVal_(r[8]) || "—";
    const qty = Number(r[11]) || 0;
    colorMap[color] = (colorMap[color] || 0) + qty;
    total += qty;
    const emb = normVal_(r[9]);
    if (emb) embSet[emb] = true;
  });
  const colors = Object.keys(colorMap).map(c => ({ color: c, qty: colorMap[c] }));
  const embCats = Object.keys(embSet).sort();
  return {
    styleName: first[3], styleDescription: first[4], season: first[5],
    item: first[6], productDept: first[7],
    embellishmentCategory: wantEmb || embCats.join(", "),
    embCats: embCats,
    colors: colors, totalQty: total
  };
}

// ---------- RA Records ----------

const RA_HEADERS = ["SBU","Buyer","IR","StyleName","Item","ProductDept","Season","TotalQty","ComplexityJSON","ReasonsJSON","OverallComplexity","Notes","CreatedAt","EmbellishmentCategory","RaDate"];

function saveRA_(rec) {
  const sheet = getMasterSheetTab_(RARECORDS_SHEET, RA_HEADERS);
  const newRow = [
    rec.sbu || "", rec.buyer || "", rec.ir || "", rec.styleName || "", rec.item || "",
    rec.productDept || "", rec.season || "", rec.totalQty || "",
    JSON.stringify(rec.complexity || {}), JSON.stringify(rec.reasons || {}), rec.overallComplexity || "", rec.notes || "",
    new Date(), rec.embellishmentCategory || "", rec.raDate || ""
  ];

  // Upsert: re-assessing a style that already has a record replaces that
  // row in place, instead of piling up duplicate rows for the same
  // SBU+Buyer+IR — otherwise stale old assessments keep skewing the
  // dashboard/process-wise charts alongside the new one.
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (
      normVal_(r[0]) === normVal_(rec.sbu) &&
      normVal_(r[1]) === normVal_(rec.buyer) &&
      normVal_(r[2]) === normVal_(rec.ir)
    ) {
      sheet.getRange(i + 1, 1, 1, newRow.length).setValues([newRow]);
      return jsonResponse_({ ok: true, updated: true });
    }
  }

  sheet.appendRow(newRow);
  return jsonResponse_({ ok: true, updated: false });
}

function listRA_() {
  const sheet = getMasterSheetTab_(RARECORDS_SHEET, RA_HEADERS);
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
      notes: r[11], createdAt: r[12], embellishmentCategory: r[13] || "", raDate: r[14] || ""
    });
  }
  return out;
}

// ---------- Overview aggregation (matches the Operational Complexity Analysis layout) ----------

function makeDateRangeFilter_(startStr, endStr) {
  const start = startStr ? new Date(startStr) : null;
  const end = endStr ? new Date(endStr + "T23:59:59") : null;
  if (start) start.setHours(0, 0, 0, 0);
  return function inRange(dateVal) {
    if (!start && !end) return true;
    const d = new Date(dateVal);
    if (isNaN(d)) return true;
    if (start && d < start) return false;
    if (end && d > end) return false;
    return true;
  };
}

function buildOverview_(startStr, endStr) {
  const inRange = makeDateRangeFilter_(startStr, endStr);
  const records = listRA_().filter(r => inRange(r.raDate || r.createdAt));

  // Event-level: summed across all 7 process events per style (one style
  // can contribute to several buckets — a style can be Basic in Fabric but
  // Complex in Sewing). This naturally can exceed totalStyles.
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

  // Style-level: exactly one bucket per style, from the single "Overall
  // Style Complexity" field set at save time — always sums to totalStyles.
  let styleBasic = 0, styleComplex = 0, styleStrategic = 0;
  records.forEach(r => {
    if (r.overallComplexity === "Strategic Complex") styleStrategic++;
    else if (r.overallComplexity === "Complex") styleComplex++;
    else if (r.overallComplexity === "Basic") styleBasic++;
  });

  return {
    totalStyles: records.length,
    totalCoreEvents: RA_EVENTS.length,
    totalBasic: totalBasic,
    totalComplex: totalComplex,
    totalStrategic: totalStrategic,
    styleBasic: styleBasic,
    styleComplex: styleComplex,
    styleStrategic: styleStrategic,
    byEvent: byEvent
  };
}

// ---------- Per-process analysis (Fabric / Cutting / Printing / Embroidery / Sewing / Wash / Finishing tabs) ----------

function buildEventAnalysis_(event, sbu, buyer, startStr, endStr) {
  const inRange = makeDateRangeFilter_(startStr, endStr);
  const wantSbu = normVal_(sbu), wantBuyer = normVal_(buyer);

  const records = listRA_().filter(r => {
    if (!inRange(r.raDate || r.createdAt)) return false;
    if (wantSbu && normVal_(r.sbu) !== wantSbu) return false;
    if (wantBuyer && normVal_(r.buyer) !== wantBuyer) return false;
    return true;
  });

  let basic = 0, complex = 0, strategic = 0;
  const styles = [];
  records.forEach(r => {
    const level = (r.complexity || {})[event] || "";
    if (level === "Strategic Complex") strategic++;
    else if (level === "Complex") complex++;
    else if (level === "Basic") basic++;
    styles.push({
      sbu: r.sbu, buyer: r.buyer, ir: r.ir, styleName: r.styleName, totalQty: r.totalQty,
      complexity: level, reason: (r.reasons || {})[event] || "", createdAt: r.createdAt, raDate: r.raDate || ""
    });
  });

  return {
    event: event,
    totalStyles: records.length,
    basic: basic, complex: complex, strategic: strategic,
    styles: styles
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

// Shared Master_Order_Information Sheet (OrderInfo + RARecords tabs) — same
// file the QA Process module also reads from.
function getMasterSheet_() {
  return SpreadsheetApp.openById(MASTER_ORDER_SHEET_ID);
}

function getMasterSheetTab_(name, headers) {
  const ss = getMasterSheet_();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
  }
  return sheet;
}

// Note: login actually runs through the centralized users-backend.gs
// deployment (see js/module-auth.js, sheetName: "RAUsers"), not this
// function — kept here, pointed at the shared Sheet, in case this
// module's own "login" action ever gets called directly.
function findUser_(sheetName, userId, password) {
  const sheet = SpreadsheetApp.openById(USER_MANAGEMENT_SHEET_ID).getSheetByName(sheetName);
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
