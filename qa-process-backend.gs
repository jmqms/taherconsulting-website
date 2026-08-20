/**
 * TAHER CONSULTING — QA Process Module Backend
 * ---------------------------------------------------------------------
 * Powers the Quality Assurance Process module: Order/style complexity
 * intake, and per-stage QA entries across all process stages (PDC, RA,
 * RM, Size-Set, Pilot Run, PP Meeting, Cutting, Print, Embroidery,
 * Sewing, Wash, Testing, Finishing, Packing Accuracy, 1st Bundle,
 * Sewing Inline, Finishing Inline, 1st Carton, Pre-Final Inspection,
 * Final Inspection).
 *
 * DESIGN: rather than one sheet per stage (20+ tabs to maintain), all
 * stage entries are stored in ONE "Entries" tab with a "Stage" column
 * — this keeps the Sheet manageable and makes the Overview dashboard's
 * aggregation (counts per stage, complexity mix, etc.) simple.
 *
 * SETUP:
 * 1. Create a new Google Sheet, e.g. "Taher Consulting QA Process".
 * 2. Create a tab named exactly: Orders
 *    Header row (A1:H1): OrderNo, Buyer, StyleNo, Season, OrderQty,
 *      DeliveryDate, ComplexityJSON, CreatedAt
 * 3. Create a second tab named exactly: Entries
 *    Header row (A1:H1): Timestamp, Stage, OrderNo, StyleNo, Inspector,
 *      Status, Score, Notes
 * 4. Create a third tab named exactly: QAUsers (for this module's own
 *    login, same 4-column format as the other Users tabs):
 *      UserID, Password, Name, Role
 * 5. Extensions -> Apps Script, paste this file in, Save.
 * 6. Deploy -> New deployment -> Web app -> Execute as: Me ->
 *    Who has access: Anyone -> Deploy -> authorize -> copy the /exec URL.
 * 7. Paste that URL into qa-process.html wherever QA_API_URL is defined.
 */

const ORDERS_SHEET = "Orders";
const ENTRIES_SHEET = "Entries";
const QA_USERS_SHEET = "QAUsers";

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
  if (action === "saveEntry") return saveEntry_(body.entry);
  if (action === "listEntries") return jsonResponse_({ ok: true, entries: listEntries_(body.stage) });
  if (action === "overview") return jsonResponse_({ ok: true, summary: buildOverview_() });

  return jsonResponse_({ ok: false, error: "Unrecognized request" });
}

// ---------- Orders ----------

function saveOrder_(order) {
  const sheet = getSheet_(ORDERS_SHEET, ["OrderNo", "Buyer", "StyleNo", "Season", "OrderQty", "DeliveryDate", "ComplexityJSON", "CreatedAt"]);
  sheet.appendRow([
    order.orderNo || "",
    order.buyer || "",
    order.styleNo || "",
    order.season || "",
    order.orderQty || "",
    order.deliveryDate || "",
    JSON.stringify(order.complexity || {}),
    new Date()
  ]);
  return jsonResponse_({ ok: true });
}

function listOrders_() {
  const sheet = getSheet_(ORDERS_SHEET, ["OrderNo", "Buyer", "StyleNo", "Season", "OrderQty", "DeliveryDate", "ComplexityJSON", "CreatedAt"]);
  const rows = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    let complexity = {};
    try { complexity = JSON.parse(r[6] || "{}"); } catch (e) {}
    out.push({ orderNo: r[0], buyer: r[1], styleNo: r[2], season: r[3], orderQty: r[4], deliveryDate: r[5], complexity: complexity, createdAt: r[7] });
  }
  return out;
}

// ---------- Entries (all 20 process/QA stages) ----------

function saveEntry_(entry) {
  const sheet = getSheet_(ENTRIES_SHEET, ["Timestamp", "Stage", "OrderNo", "StyleNo", "Inspector", "Status", "Score", "Notes"]);
  sheet.appendRow([
    new Date(),
    entry.stage || "",
    entry.orderNo || "",
    entry.styleNo || "",
    entry.inspector || "",
    entry.status || "Open",
    entry.score || "",
    entry.notes || ""
  ]);
  return jsonResponse_({ ok: true });
}

function listEntries_(stage) {
  const sheet = getSheet_(ENTRIES_SHEET, ["Timestamp", "Stage", "OrderNo", "StyleNo", "Inspector", "Status", "Score", "Notes"]);
  const rows = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[1]) continue;
    if (stage && r[1] !== stage) continue;
    out.push({ timestamp: r[0], stage: r[1], orderNo: r[2], styleNo: r[3], inspector: r[4], status: r[5], score: r[6], notes: r[7] });
  }
  return out.reverse();
}

// ---------- Overview aggregation ----------

function buildOverview_() {
  const orders = listOrders_();
  const entries = listEntries_(null);

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
