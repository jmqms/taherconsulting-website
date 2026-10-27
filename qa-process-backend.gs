// ---- Bangladesh time (Asia/Dhaka, UTC+6) ----
// Stored as plain text so it never shifts with sheet/script timezone.
function nowBD_() {
  return Utilities.formatDate(new Date(), "Asia/Dhaka", "yyyy-MM-dd HH:mm:ss");
}

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
 * SETUP (Taherconsultingbd Portal — Module 04 folder):
 * 1. This module's own Google Sheet lives in the "Module 04 - QA Process"
 *    Drive folder (e.g. "QA_Process_Data" / "PreFinal_Final_Inspection_Data").
 *    Create these tabs in it (exact names) — each is auto-created with the
 *    correct headers the first time data is saved, but you can also
 *    create them empty ahead of time if you prefer:
 *      Orders   — order intake + style complexity requirements
 *      SizeSet  — Size-Set / Pattern Verify entries
 *      Testing  — all 6 testing sub-types (Print, Embroidery,
 *                 Heat Seal, Home Laundry, Print & Embroidery,
 *                 Physical Testing), differentiated by a TestType column
 *      Entries  — generic entries for the remaining process/QA stages
 *      QualityRA — this module's own Risk Assessment stage form
 *      PreFinalReports / FinalReports — Module 7 Pre-Final and Final
 *                 Inspection reports, one row per report. These two tabs are
 *                 deliberately separate so neither dashboard can pick up the
 *                 other's inspections.
 *      FirstBundleReports / SewingInlineReports / FinishingInlineReports /
 *                 FirstCartonReports — same one-row-per-report pattern, for
 *                 the 1st Bundle, Sewing Inline, Finishing Inline and 1st
 *                 Carton standalone inspection pages (each dashboard stays
 *                 separate too).
 * 2. OrderInfo is NO LONGER a local tab — it now lives in the shared
 *    "Master_Order_Information" Sheet at the Portal's Drive root
 *    (see MASTER_ORDER_SHEET_ID below), so every module reads the
 *    same copy instead of an imported duplicate.
 * 3. QAUsers is NO LONGER a local tab either — logins now live in the
 *    shared "User_Management" Sheet at the Portal's Drive root, in a
 *    "QAUsers" tab (see USER_MANAGEMENT_SHEET_ID below).
 * NOTE: Module 04 (QA Process) and Module 05 (Risk Assessment) are fully
 *       independent modules — this script has no reference to Module 05's
 *       Sheet or its RARecords at all. This module's OWN Risk Assessment
 *       stage (the "QualityRA" tab, part of Style Tracking) is a separate,
 *       unrelated form.
 * NOTE: Module 7 also stores inspection photos in a Drive folder called
 *       "JM Fabrics Inspection Photos", created automatically on first
 *       upload. After pasting this file in, run any function once and
 *       accept the Drive permission prompts (this module's own Sheet AND
 *       the two shared Sheets), then RE-DEPLOY the web app (Deploy ->
 *       Manage deployments -> edit -> New version) so the new actions go
 *       live at the same /exec URL.
 * NOTE: Inspection report saves (Pre-Final, Final, 1st Bundle, Sewing
 *       Inline, Finishing Inline, 1st Carton) are now MERGED by report id
 *       under a script lock — see saveInspectionReports_() — so two
 *       inspectors saving at the same time can no longer overwrite each
 *       other's reports.
 * 4. Extensions -> Apps Script, paste this file in, Save.
 * 5. Deploy -> New deployment -> Web app -> Execute as: Me ->
 *    Who has access: Anyone -> Deploy -> authorize -> copy the /exec URL.
 * 6. Paste that URL into qa-process.html, final-inspection.html, AND
 *    pre-final-inspection.html wherever QA_API_URL is defined — all three
 *    files must point at the SAME /exec URL from THIS deployment.
 */

const ORDERS_SHEET = "Orders";
const SIZESET_SHEET = "SizeSet";
const PPMEETING_SHEET = "PPMeeting";
const PPMEETING_HEADERS = ["Date","SBU","Buyer","IR","StyleNo","Season","Item","PPby","OrderType","EmbellishmentType","ProductType","PlannedQty","ColorsJSON","RequirementsReview","CommentsJSON","CreatedAt","ReportJSON"];
const PHYSICALFUNCTIONAL_SHEET = "PhysicalFunctional";
const PHYSICALFUNCTIONAL_HEADERS = ["Date","Time","AuditBy","Line","SBU","Buyer","IR","StyleNo","Color","CheckpointsJSON","SampleChecked","PassQty","FailQty","DefectPct","DefectType","Comments","CorrectiveAction","CreatedAt"];
const AQLPROCESS_SHEET = "AqlProcessChecks";
const AQLPROCESS_HEADERS = ["Process","ProcessLabel","Mode","CheckContext","Date","InspectedBy","Line","SBU","Buyer","IR","StyleNo","Size","Color","CompareWith","CheckPointsJSON","InspectionLevel","CodeLetter","AqlCritical","AqlMajor","AqlMinor","LotQty","SampleSize","AllowedCritical","AllowedMajor","AllowedMinor","FoundCritical","FoundMajor","FoundMinor","NoDefectFound","FindingsJSON","Comments","Result","CreatedAt"];
const TESTING_SHEET = "Testing";
const ENTRIES_SHEET = "Entries";
const QA_USERS_SHEET = "QAUsers";

// ---- Centralized cross-module Sheets (Taherconsultingbd Portal / Drive root) ----
// OrderInfo and every module's login now live OUTSIDE this spreadsheet, in
// two shared Sheets so every module reads the same copy instead of keeping
// its own duplicate. (RARecords stays fully inside Module 05 — no link here.)
const MASTER_ORDER_SHEET_ID = "1DE8KrlS6LLTDdhKIg4YgM3ZSsdZmxyzAR7BBAZJ5--U"; // Master_Order_Information
const USER_MANAGEMENT_SHEET_ID = "1s0i82BmF6T5C7_yNf970cK2Gb3qJ3-7tKqAWM-0vzbw"; // User_Management
const ORDERINFO_SHEET = "OrderInfo";   // tab inside Master_Order_Information
// This Quality Process module's own Risk Assessment stage form
// (matches Quality_Process_Data_Entry.xlsx) — fully separate from, and
// with no code link to, the standalone Module 05 RA Process module.
const QARA_SHEET = "QualityRA";
const QARA_HEADERS = ["Timestamp","SBU","Buyer","IR","StyleNo","RADate","RAby","OrderType","ChangesJSON","RiskDecision","ActionComments"];
const QARA_CHANGE_ROWS = ["Fabric","Pattern (Measurements)","Construction","Print","Embroidery","Wash","Additional Changes (If Any)"];

// ---- Module 7: Pre-Final / Final Inspection ------------------------------
// Each module gets its OWN tab so the two dashboards can never show each
// other's reports. Photos go to one shared Drive folder.
const PREFINAL_SHEET = "PreFinalReports";
const FINAL_SHEET    = "FinalReports";
const FIRSTBUNDLE_SHEET     = "FirstBundleReports";
const SEWINGINLINE_SHEET    = "SewingInlineReports";
const FINISHINGINLINE_SHEET = "FinishingInlineReports";
const FIRSTCARTON_SHEET     = "FirstCartonReports";
const INSPECTION_PHOTO_FOLDER = "JM Fabrics Inspection Photos";
// A full inspection report is a single JSON blob. A Sheets cell tops out at
// 50,000 characters, so the blob is split across several columns and glued
// back together on read.
const INSP_JSON_COLS = 8;
const INSP_CHUNK = 45000;
const INSPECTION_HEADERS = [
  "Id","Type","SBU","Buyer","IR","StyleName","Date","Inspector","Result","Status","SampleSize","SavedAt",
  "J1","J2","J3","J4","J5","J6","J7","J8"
];

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

  if (action === "savePPMeeting") return savePPMeeting_(body.entry);
  if (action === "listPPMeeting") return jsonResponse_({ ok: true, entries: listPPMeeting_() });
  if (action === "getPPTemplate") return getPPTemplate_(body);
  if (action === "savePPTemplate") return savePPTemplate_(body);
  if (action === "translateBn") return translateBn_(body.texts);

  if (action === "savePhysicalFunctional") return savePhysicalFunctional_(body.entry);
  if (action === "listPhysicalFunctional") return jsonResponse_({ ok: true, entries: listPhysicalFunctional_() });

  if (action === "saveAqlProcess") return saveAqlProcess_(body.entry);
  if (action === "listAqlProcess") return jsonResponse_({ ok: true, entries: listAqlProcess_(body.process) });

  if (action === "saveTesting") return saveTesting_(body.entry);
  if (action === "listTesting") return jsonResponse_({ ok: true, entries: testRequestsAsTesting_().concat(listTesting_(body.testType)) });
  if (action === "saveTestRequest") return saveTestRequest_(body.entry);
  if (action === "listTestRequests") return jsonResponse_({ ok: true, entries: listTestRequests_() });
  if (action === "closeTestRequest") return closeTestRequest_(body);
  if (action === "patchTestRequest") return patchTestRequest_(body);
  if (action === "patchRow") return patchRow_(body);
  if (action === "deleteTestRequest") return deleteTestRequest_(body);
  if (action === "deleteRow") return deleteRow_(body);

  if (action === "saveEntry") return saveEntry_(body.entry);
  if (action === "listEntries") return jsonResponse_({ ok: true, entries: listEntries_(body.stage) });

  if (action === "overview") return jsonResponse_({ ok: true, summary: buildOverview_(body.start, body.end) });

  if (action === "styleStatus") return jsonResponse_({ ok: true, byStage: buildStyleStatus_(body.irNo, body.styleNo) });

  if (action === "listSbus") return jsonResponse_({ ok: true, sbus: listDistinct_(0) });
  if (action === "listBuyers") return jsonResponse_({ ok: true, buyers: listDistinctFiltered_(1, { 0: body.sbu }) });
  if (action === "listIrs") return jsonResponse_({ ok: true, irs: listDistinctFiltered_(2, { 0: body.sbu, 1: body.buyer }) });
  if (action === "getOrderDetail") return jsonResponse_({ ok: true, detail: getOrderDetail_(body.sbu, body.buyer, body.ir) });

  // ---- Module 7: Pre-Final / Final Inspection + inline/bundle/carton inspections ----
  // body.deletedIds (optional) = report ids the user deleted on screen; the
  // save MERGES by id, so only those ids are removed from the tab.
  if (action === "listPreFinal") return jsonResponse_({ ok: true, reports: listInspectionReports_(PREFINAL_SHEET) });
  if (action === "savePreFinal") return saveInspectionReports_(PREFINAL_SHEET, body.reports, body.deletedIds);
  if (action === "listFinal")    return jsonResponse_({ ok: true, reports: listInspectionReports_(FINAL_SHEET) });
  if (action === "saveFinal")    return saveInspectionReports_(FINAL_SHEET, body.reports, body.deletedIds);
  if (action === "list1stBundle")     return jsonResponse_({ ok: true, reports: listInspectionReports_(invSheet_(FIRSTBUNDLE_SHEET, body)) });
  if (action === "save1stBundle")     return saveInspectionReports_(invSheet_(FIRSTBUNDLE_SHEET, body), body.reports, body.deletedIds);
  if (action === "listSewingInline")  return jsonResponse_({ ok: true, reports: listInspectionReports_(invSheet_(SEWINGINLINE_SHEET, body)) });
  if (action === "saveSewingInline")  return saveInspectionReports_(invSheet_(SEWINGINLINE_SHEET, body), body.reports, body.deletedIds);
  if (action === "listFinishingInline") return jsonResponse_({ ok: true, reports: listInspectionReports_(invSheet_(FINISHINGINLINE_SHEET, body)) });
  if (action === "saveFinishingInline") return saveInspectionReports_(invSheet_(FINISHINGINLINE_SHEET, body), body.reports, body.deletedIds);
  if (action === "list1stCarton")     return jsonResponse_({ ok: true, reports: listInspectionReports_(invSheet_(FIRSTCARTON_SHEET, body)) });
  if (action === "save1stCarton")     return saveInspectionReports_(invSheet_(FIRSTCARTON_SHEET, body), body.reports, body.deletedIds);
  if (action === "uploadImage")  return uploadInspectionImage_(body);
  if (action === "fetchImageBase64") return fetchInspectionImage_(body.fileId);

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
    nowBD_()
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
    e2.remarks || "", nowBD_()
  ]);

  // Mirror a summary row into Entries so Style Tracking's per-stage rollup
  // (buildStyleStatus_) and the Overview see this Size-Set entry too.
  saveEntry_({
    stage: "sizeset",
    orderNo: "",
    styleNo: e2.styleNo || "",
    irNo: e2.ir || "",
    inspector: e2.sizeSetBy || "",
    status: "Done",
    score: "",
    notes: "Size-Set — " + (e2.status || "")
  });
  return jsonResponse_({ ok: true });
}

/**
 * ONE-TIME BACKFILL — run manually from the Apps Script editor (pick this
 * function in the dropdown, click Run). Size-Set entries saved before the
 * mirror above existed have no row in Entries, so the Overview does not count
 * them. This adds one Entries row per missing Size-Set record. Safe to re-run:
 * it only adds rows that are missing.
 */
function backfillSizeSetEntries_() {
  const have = {};
  listEntries_("sizeset").forEach(function (e) { const k = normVal2_(e.irNo); have[k] = (have[k] || 0) + 1; });
  const sheet = getSheet_(ENTRIES_SHEET, ENTRIES_HEADERS);
  let added = 0;
  listSizeSet_().forEach(function (r) {
    const k = normVal2_(r.ir);
    if (have[k] > 0) { have[k]--; return; }
    const d = new Date(r.createdAt || r.date || new Date());
    sheet.appendRow([isNaN(d) ? nowBD_() : Utilities.formatDate(d, "Asia/Dhaka", "yyyy-MM-dd HH:mm:ss"), "sizeset", "", r.styleNo || "", r.ir || "", "", "Done", "", "Size-Set — " + (r.status || "")]);
    added++;
  });
  Logger.log("Size-Set backfill: added " + added + " Entries row(s).");
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

// ---------- PP Meeting ----------

function savePPMeeting_(entry) {
  entry = entry || {};
  const sheet = getSheet_(PPMEETING_SHEET, PPMEETING_HEADERS);
  sheet.appendRow([
    entry.date || "", entry.sbu || "", entry.buyer || "", entry.ir || "", entry.styleNo || "",
    entry.season || "", entry.item || "", entry.ppBy || "", entry.orderType || "",
    entry.embellishmentType || "", entry.productType || "", entry.plannedQty || "",
    JSON.stringify(entry.colors || []), entry.requirementsReview || "",
    JSON.stringify(entry.comments || {}), nowBD_(),
    // Full PP Meeting report (checkpoints, action plan, attendance). Kept well under the 50k-char cell limit (no images).
    ppReportJson_(entry.report)
  ]);

  // Mirror a summary row into Entries so Style Tracking's per-stage
  // rollup (buildStyleStatus_) sees this PP Meeting submission too.
  const statusMap = { "Yes": "Done", "No": "Open", "N/A": "In Progress" };
  const dev = entry.report && entry.report.summary ? Number(entry.report.summary.deviation) || 0 : 0;
  saveEntry_({
    stage: "ppmeeting",
    orderNo: "",
    styleNo: entry.styleNo || "",
    irNo: entry.ir || "",
    inspector: entry.ppBy || "",
    status: dev > 0 ? "In Progress" : (statusMap[entry.requirementsReview] || "Open"),
    score: "",
    notes: "PP Meeting — " + (entry.orderType || "") + (dev ? " — " + dev + " deviation(s)" : "")
  });

  return jsonResponse_({ ok: true });
}

function listPPMeeting_() {
  const sheet = getSheet_(PPMEETING_SHEET, PPMEETING_HEADERS);
  const rows = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[4]) continue; // StyleNo required
    let colors = [], comments = {}, report = null;
    try { colors = JSON.parse(r[12] || "[]"); } catch (e) {}
    try { comments = JSON.parse(r[14] || "{}"); } catch (e) {}
    try { report = r[16] ? JSON.parse(r[16]) : null; } catch (e) {}
    const item = {
      date: r[0], sbu: r[1], buyer: r[2], ir: r[3], styleNo: r[4], season: r[5], item: r[6],
      ppBy: r[7], orderType: r[8], embellishmentType: r[9], productType: r[10], plannedQty: r[11],
      colors: colors, requirementsReview: r[13], comments: comments, createdAt: r[15]
    };
    if (report) item.report = report; // old entries (comments only) simply have no report
    out.push(item);
  }
  return out;
}

// ---------- Physical/Functional Test ----------
// Sits right after Wash in the pipeline (Physical__Functionality_
// Testing.xlsx). Checking Points + their Checking Method/Guideline are
// fixed on the frontend (PF_CHECKPOINT_METHODS); this just stores which
// points were checked, plus the pass/fail result.

function savePhysicalFunctional_(entry) {
  entry = entry || {};
  const sheet = getSheet_(PHYSICALFUNCTIONAL_SHEET, PHYSICALFUNCTIONAL_HEADERS);
  sheet.appendRow([
    entry.date || "", entry.time || "", entry.auditBy || "", entry.line || "",
    entry.sbu || "", entry.buyer || "", entry.ir || "", entry.styleNo || "", entry.color || "",
    JSON.stringify(entry.checkpoints || []), entry.sampleChecked || 0, entry.passQty || 0,
    entry.failQty || 0, entry.defectPct || "0.0", entry.defectType || "",
    entry.comments || "", entry.correctiveAction || "", nowBD_()
  ]);

  // Mirror a summary row into Entries so Style Tracking's per-stage
  // rollup (buildStyleStatus_) sees this Physical/Functional Test too.
  const fail = Number(entry.failQty || 0);
  saveEntry_({
    stage: "physicalfunctional",
    orderNo: "",
    styleNo: entry.styleNo || "",
    irNo: entry.ir || "",
    inspector: entry.auditBy || "",
    status: fail > 0 ? "Open" : "Done",
    score: entry.defectPct || "",
    notes: "Physical/Functional Test — " + (entry.defectType || "")
  });

  return jsonResponse_({ ok: true });
}

function listPhysicalFunctional_() {
  const sheet = getSheet_(PHYSICALFUNCTIONAL_SHEET, PHYSICALFUNCTIONAL_HEADERS);
  const rows = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[7]) continue; // StyleNo required
    let checkpoints = [];
    try { checkpoints = JSON.parse(r[9] || "[]"); } catch (e) {}
    out.push({
      date: r[0], time: r[1], auditBy: r[2], line: r[3], sbu: r[4], buyer: r[5], ir: r[6],
      styleNo: r[7], color: r[8], checkpoints: checkpoints, sampleChecked: r[10], passQty: r[11],
      failQty: r[12], defectPct: r[13], defectType: r[14], comments: r[15], correctiveAction: r[16],
      createdAt: r[17]
    });
  }
  return out;
}

// ---------- Printing / Embroidery / Wash / Heat-Seal (shared AQL form) ----------
// One sheet holds all four processes, distinguished by the Process
// column ("print" | "embroidery" | "wash" | "heatseal"), each further
// split by Mode ("RMG" sampling-based spot check, tagged with
// CheckContext = "1st Bundle" or "Inline Check"; or "FPU" = Main
// Process 100% Check, no sampling fields).

function saveAqlProcess_(entry) {
  entry = entry || {};
  const sheet = getSheet_(AQLPROCESS_SHEET, AQLPROCESS_HEADERS);
  sheet.appendRow([
    entry.process || "", entry.processLabel || "", entry.mode || "", entry.checkContext || "",
    entry.date || "", entry.inspectedBy || "", entry.line || "",
    entry.sbu || "", entry.buyer || "", entry.ir || "", entry.styleNo || "", entry.size || "",
    entry.color || "", entry.compareWith || "",
    JSON.stringify(entry.checkPoints || []),
    entry.inspectionLevel || "", entry.codeLetter || "",
    entry.aqlCritical || "", entry.aqlMajor || "", entry.aqlMinor || "",
    entry.lotQty || "", entry.sampleSize || "",
    entry.allowedCritical || "", entry.allowedMajor || "", entry.allowedMinor || "",
    entry.foundCritical || "", entry.foundMajor || "", entry.foundMinor || "",
    entry.noDefectFound ? "Yes" : "No",
    JSON.stringify(entry.findings || []),
    entry.comments || "", entry.result || "", nowBD_()
  ]);

  // Mirror a summary row into Entries so Style Tracking's per-stage
  // rollup (buildStyleStatus_) sees this check too — same stage id
  // ("print" | "embroidery" | "wash" | "heatseal") the sidebar uses.
  const statusMap = { "Pass": "Done", "Fail": "Open", "Hold": "In Progress" };
  saveEntry_({
    stage: entry.process || "",
    orderNo: "",
    styleNo: entry.styleNo || "",
    irNo: entry.ir || "",
    inspector: entry.inspectedBy || "",
    status: statusMap[entry.result] || "Open",
    score: "",
    notes: (entry.processLabel || "") + " — " + (entry.mode || "") + (entry.checkContext ? " (" + entry.checkContext + ")" : "")
  });

  return jsonResponse_({ ok: true });
}

function listAqlProcess_(process) {
  const sheet = getSheet_(AQLPROCESS_SHEET, AQLPROCESS_HEADERS);
  const rows = sheet.getDataRange().getValues();
  const wantProcess = process ? String(process).trim() : "";
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[10]) continue; // StyleNo required
    if (wantProcess && String(r[0]).trim() !== wantProcess) continue;
    let checkPoints = [], findings = [];
    try { checkPoints = JSON.parse(r[14] || "[]"); } catch (e) {}
    try { findings = JSON.parse(r[29] || "[]"); } catch (e) {}
    out.push({
      process: r[0], processLabel: r[1], mode: r[2], checkContext: r[3],
      date: r[4], inspectedBy: r[5], line: r[6], sbu: r[7], buyer: r[8], ir: r[9],
      styleNo: r[10], size: r[11], color: r[12], compareWith: r[13], checkPoints: checkPoints,
      inspectionLevel: r[15], codeLetter: r[16], aqlCritical: r[17], aqlMajor: r[18], aqlMinor: r[19],
      lotQty: r[20], sampleSize: r[21], allowedCritical: r[22], allowedMajor: r[23], allowedMinor: r[24],
      foundCritical: r[25], foundMajor: r[26], foundMinor: r[27], noDefectFound: r[28] === "Yes",
      findings: findings, comments: r[30], result: r[31], createdAt: r[32]
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
    e3.remarks || "", nowBD_()
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

// ---------- Testing requests (Testing.xlsx): submit -> Open, then close with report ----------
// New tab "TestingRequests". The older "Testing" tab is left untouched.
// Each request also mirrors one row into Entries (stage "testing", status Open);
// closing the request updates that same row (Pass -> Done, Fail -> Open).

const TESTREQ_SHEET = "TestingRequests";
const TESTREQ_HEADERS = ["Id","Status","Section","SBU","Buyer","IR","StyleNo","Season","Item","LogInDate","Color","Line","Size","Fiber","FabricType","TestOn","TestOption","RequirementsJSON","SubmittedBy","CreatedAt","ReportDate","TrfNo","Result","Comments","ClosedAt","TestCycle","PrintType","Gsm","Submission"];

function saveTestRequest_(e) {
  e = e || {};
  const id = "TR" + new Date().getTime().toString(36).toUpperCase();
  const lock = LockService.getScriptLock();
  try { lock.waitLock(25000); } catch (err) { return jsonResponse_({ ok: false, error: "Server busy, please press Submit again." }); }
  try {
    const sheet = getSheet_(TESTREQ_SHEET, TESTREQ_HEADERS);
    sheet.appendRow([
      id, "Open", e.section || "", e.sbu || "", e.buyer || "", e.ir || "", e.styleNo || "", e.season || "", e.item || "",
      e.logInDate || "", e.color || "", e.line || "", e.size || "", e.fiber || "", e.fabricType || "",
      e.testOn || "", e.testOption || "", JSON.stringify(e.requirements || []), e.submittedBy || "", nowBD_(),
      "", "", "", "", "", e.testCycle === undefined ? "" : e.testCycle, e.printType || "", e.gsm || "", e.submission || ""
    ]);
    saveEntry_({
      stage: "testing", orderNo: "", styleNo: e.styleNo || "", irNo: e.ir || "",
      inspector: e.submittedBy || "", status: "Open", score: "",
      notes: "Testing — " + (e.section || "") + " [" + id + "]"
    });
  } finally { lock.releaseLock(); }
  return jsonResponse_({ ok: true, id: id });
}

function testReqRow_(r) {
  let reqs = [];
  try { reqs = JSON.parse(r[17] || "[]"); } catch (x) {}
  return {
    id: r[0], status: r[1] || "Open", section: r[2], sbu: r[3], buyer: r[4], ir: r[5], styleNo: r[6], season: r[7], item: r[8],
    logInDate: normValOI_(r[9]), color: r[10], line: r[11], size: r[12], fiber: r[13], fabricType: r[14],
    testOn: r[15], testOption: r[16], requirements: reqs, submittedBy: r[18], createdAt: r[19],
    reportDate: normValOI_(r[20]), trpNo: r[21], result: r[22], comments: r[23], closedAt: r[24], testCycle: r[25] === undefined ? "" : r[25], printType: r[26] || "", gsm: r[27] || "", submission: r[28] || ""
  };
}

function listTestRequests_() {
  const sheet = getSheet_(TESTREQ_SHEET, TESTREQ_HEADERS);
  const rows = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) { if (rows[i][0]) out.push(testReqRow_(rows[i])); }
  return out.reverse();
}

// Lets the QA Inspection Style Tracking / older Testing readers see these too.
function testRequestsAsTesting_() {
  return listTestRequests_().map(function (r) {
    return { testType: r.section, sbu: r.sbu, buyer: r.buyer, styleNo: r.styleNo, ir: r.ir, season: r.season, color: r.color,
      itemDescription: r.testOn, embellishmentType: r.testOption, additionalTrims: "", logInDate: r.logInDate,
      testedParty: r.section, trfNo: r.trpNo, result: r.result, logOutDate: r.reportDate, remarks: r.comments, createdAt: r.createdAt };
  });
}

function closeTestRequest_(b) {
  if (!b.id) return jsonResponse_({ ok: false, error: "Missing request id" });
  const lock = LockService.getScriptLock();
  try { lock.waitLock(25000); } catch (err) { return jsonResponse_({ ok: false, error: "Server busy, please try again." }); }
  try {
    const sheet = getSheet_(TESTREQ_SHEET, TESTREQ_HEADERS);
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) !== String(b.id)) continue;
      if (rows[i][1] === "Closed") return jsonResponse_({ ok: false, error: "Already closed" });
      sheet.getRange(i + 1, 2).setValue("Closed");
      sheet.getRange(i + 1, 21, 1, 5).setValues([[b.reportDate || "", b.trpNo || "", b.result || "", b.comments || "", nowBD_()]]);
      // update the mirrored Entries row
      const es = getSheet_(ENTRIES_SHEET, ENTRIES_HEADERS);
      const er = es.getDataRange().getValues();
      for (let j = er.length - 1; j >= 1; j--) {
        if (er[j][1] === "testing" && String(er[j][8]).indexOf("[" + b.id + "]") >= 0) {
          es.getRange(j + 1, 7).setValue(b.result === "Pass" ? "Done" : "Open");
          es.getRange(j + 1, 9).setValue(String(er[j][8]) + " — " + (b.result || "") + (b.trpNo ? " (TRP " + b.trpNo + ")" : ""));
          break;
        }
      }
      return jsonResponse_({ ok: true });
    }
    return jsonResponse_({ ok: false, error: "Request not found" });
  } finally { lock.releaseLock(); }
}


// Correct fields of an existing Testing entry (used after an administrator approved an Edit Request, or by an admin).
// Only the listed fields can be changed; the row is found by Id.
function patchTestRequest_(b) {
  if (!b.id || !b.fields) return jsonResponse_({ ok: false, error: "Missing id or fields" });
  const MAP = { sbu: "SBU", buyer: "Buyer", ir: "IR", styleNo: "StyleNo", season: "Season", item: "Item", logInDate: "LogInDate", color: "Color",
    line: "Line", size: "Size", fiber: "Fiber", fabricType: "FabricType", testOn: "TestOn", testOption: "TestOption", testCycle: "TestCycle",
    printType: "PrintType", gsm: "Gsm", submission: "Submission", reportDate: "ReportDate", trpNo: "TrfNo", result: "Result", comments: "Comments" };
  const lock = LockService.getScriptLock();
  try { lock.waitLock(25000); } catch (err) { return jsonResponse_({ ok: false, error: "Server busy, please try again." }); }
  try {
    const sheet = getSheet_(TESTREQ_SHEET, TESTREQ_HEADERS);
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) !== String(b.id)) continue;
      let n = 0;
      Object.keys(b.fields).forEach(function (k) {
        const h = MAP[k]; if (!h) return;
        const col = TESTREQ_HEADERS.indexOf(h); if (col < 0) return;
        sheet.getRange(i + 1, col + 1).setValue(b.fields[k]); n++;
      });
      return jsonResponse_({ ok: true, changed: n });
    }
    return jsonResponse_({ ok: false, error: "Entry not found" });
  } finally { lock.releaseLock(); }
}

// Correct fields of an existing entry in the other QA Process sheets (after an administrator approved an Edit Request).
// The row is found by its creation stamp (+ IR check); only the listed columns can be changed.
function patchSpecs_() { return {
  sizeset: { sheet: SIZESET_SHEET, headers: SIZESET_HEADERS, stamp: "CreatedAt", ir: "IR",
    edit: ["Date","SBU","Buyer","StyleNo","IR","Season","Item","EmbellishmentType","ProductType","OrderType","ColorCount","PlannedQty","Status","CorrectionType","Remarks"] },
  ppmeeting: { sheet: PPMEETING_SHEET, headers: PPMEETING_HEADERS, stamp: "CreatedAt", ir: "IR",
    edit: ["Date","SBU","Buyer","IR","StyleNo","Season","Item","PPby","OrderType","EmbellishmentType","ProductType","PlannedQty","RequirementsReview"] },
  physicalfunctional: { sheet: PHYSICALFUNCTIONAL_SHEET, headers: PHYSICALFUNCTIONAL_HEADERS, stamp: "CreatedAt", ir: "IR",
    edit: ["Date","Time","AuditBy","Line","SBU","Buyer","IR","StyleNo","Color","SampleChecked","PassQty","FailQty","DefectPct","DefectType","Comments","CorrectiveAction"] },
  aql: { sheet: AQLPROCESS_SHEET, headers: AQLPROCESS_HEADERS, stamp: "CreatedAt", ir: "IR",
    edit: ["Date","InspectedBy","Line","SBU","Buyer","IR","StyleNo","Size","Color","CompareWith","LotQty","SampleSize","FoundCritical","FoundMajor","FoundMinor","Comments","Result"] },
  ra: { sheet: QARA_SHEET, headers: QARA_HEADERS, stamp: "Timestamp", ir: "IR",
    edit: ["SBU","Buyer","IR","StyleNo","RADate","RAby","OrderType","RiskDecision","ActionComments"] },
  entries: { sheet: ENTRIES_SHEET, headers: ENTRIES_HEADERS, stamp: "Timestamp", ir: "IrNo",
    edit: ["OrderNo","StyleNo","IrNo","Inspector","Status","Score","Notes"] }
}; }
function sameStamp_(cell, val) {
  if (String(cell) === String(val)) return true;
  if (cell instanceof Date) {
    if (cell.toISOString() === String(val)) return true;
    try { if (Utilities.formatDate(cell, "Asia/Dhaka", "yyyy-MM-dd HH:mm:ss") === String(val)) return true; } catch (e) {}
  }
  return false;
}
function patchRow_(b) {
  const spec = patchSpecs_()[b.sheet];
  if (!spec || !b.stamp || !b.fields) return jsonResponse_({ ok: false, error: "Bad request" });
  const lock = LockService.getScriptLock();
  try { lock.waitLock(25000); } catch (err) { return jsonResponse_({ ok: false, error: "Server busy, please try again." }); }
  try {
    const sheet = getSheet_(spec.sheet, spec.headers);
    const rows = sheet.getDataRange().getValues();
    const sc = spec.headers.indexOf(spec.stamp), ic = spec.headers.indexOf(spec.ir), pc = spec.headers.indexOf("Process");
    for (let i = 1; i < rows.length; i++) {
      if (!sameStamp_(rows[i][sc], b.stamp)) continue;
      if (b.ir !== undefined && String(rows[i][ic]).trim() !== String(b.ir).trim()) continue;
      if (b.process && pc >= 0 && String(rows[i][pc]).trim() !== String(b.process).trim()) continue;
      let n = 0;
      Object.keys(b.fields).forEach(function (h) {
        if (spec.edit.indexOf(h) < 0) return;
        const col = spec.headers.indexOf(h); if (col < 0) return;
        sheet.getRange(i + 1, col + 1).setValue(b.fields[h]); n++;
      });
      return jsonResponse_({ ok: true, changed: n });
    }
    return jsonResponse_({ ok: false, error: "Entry not found" });
  } finally { lock.releaseLock(); }
}

// Admin: delete an entry (e.g. a duplicate). The client only offers this to administrators.
function deleteTestRequest_(b) {
  if (!b.id) return jsonResponse_({ ok: false, error: "Missing id" });
  const lock = LockService.getScriptLock();
  try { lock.waitLock(25000); } catch (err) { return jsonResponse_({ ok: false, error: "Server busy, please try again." }); }
  try {
    const sheet = getSheet_(TESTREQ_SHEET, TESTREQ_HEADERS);
    const rows = sheet.getDataRange().getValues();
    for (let i = rows.length - 1; i >= 1; i--) {
      if (String(rows[i][0]) !== String(b.id)) continue;
      sheet.deleteRow(i + 1);
      // remove the mirrored Entries row ("... [id]")
      const es = getSheet_(ENTRIES_SHEET, ENTRIES_HEADERS), er = es.getDataRange().getValues();
      for (let j = er.length - 1; j >= 1; j--) {
        if (er[j][1] === "testing" && String(er[j][8]).indexOf("[" + b.id + "]") >= 0) { es.deleteRow(j + 1); break; }
      }
      return jsonResponse_({ ok: true });
    }
    return jsonResponse_({ ok: false, error: "Entry not found" });
  } finally { lock.releaseLock(); }
}
function deleteRow_(b) {
  const spec = patchSpecs_()[b.sheet];
  if (!spec || !b.stamp) return jsonResponse_({ ok: false, error: "Bad request" });
  const lock = LockService.getScriptLock();
  try { lock.waitLock(25000); } catch (err) { return jsonResponse_({ ok: false, error: "Server busy, please try again." }); }
  try {
    const sheet = getSheet_(spec.sheet, spec.headers);
    const rows = sheet.getDataRange().getValues();
    const sc = spec.headers.indexOf(spec.stamp), ic = spec.headers.indexOf(spec.ir), pc = spec.headers.indexOf("Process");
    for (let i = 1; i < rows.length; i++) {
      if (!sameStamp_(rows[i][sc], b.stamp)) continue;
      if (b.ir !== undefined && String(rows[i][ic]).trim() !== String(b.ir).trim()) continue;
      if (b.process && pc >= 0 && String(rows[i][pc]).trim() !== String(b.process).trim()) continue;
      sheet.deleteRow(i + 1);
      return jsonResponse_({ ok: true });
    }
    return jsonResponse_({ ok: false, error: "Entry not found" });
  } finally { lock.releaseLock(); }
}

// ---------- Entries (remaining generic process/QA stages) ----------

const ENTRIES_HEADERS = ["Timestamp", "Stage", "OrderNo", "StyleNo", "IrNo", "Inspector", "Status", "Score", "Notes"];

function saveEntry_(entry) {
  const sheet = getSheet_(ENTRIES_SHEET, ENTRIES_HEADERS);
  sheet.appendRow([
    nowBD_(),
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
  if (v instanceof Date) return Utilities.formatDate(v, "Asia/Dhaka", "yyyy-MM-dd");
  return String(v).trim();
}

function getOrderInfoRows_() {
  const sheet = getMasterSheet_().getSheetByName(ORDERINFO_SHEET);
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
    sbu: normValOI_(first[0]), buyer: normValOI_(first[1]), ir: normValOI_(first[2]),
    styleName: first[3], styleDescription: first[4], season: first[5],
    item: first[6], productDept: first[7], embellishmentCategory: first[9],
    shipDate: normValOI_(first[10]),
    colors: Object.keys(colorMap).map(c => ({ color: c, qty: colorMap[c] })),
    totalQty: total, lineCount: rows.length
  };
}

// ---------- Quality Process's own Risk Assessment (RA) stage ----------
// Saves the full Changes-Summary form, AND drops a matching row into
// Entries (stage "ra") so Style Tracking's stage rollup picks it up
// same as every other stage.

function saveQualityRA_(entry) {
  entry = entry || {};
  const sheet = getSheet_(QARA_SHEET, QARA_HEADERS);
  sheet.appendRow([
    nowBD_(),
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

// ---------- Module 7: Pre-Final / Final (+ inline/bundle/carton) inspection reports ----------
// The client POSTs the reports it has on screen (plus deletedIds for any it
// deleted). The save is MERGED by report id under a script lock:
//   - reports the client sent replace the stored copy (or are added),
//   - ids in deletedIds are removed,
//   - every other report already in the tab (e.g. saved by another inspector
//     at the same time) is kept.
// Before this, each save rewrote the whole tab from one client's list, so two
// inspectors saving close together could wipe each other's reports.

function saveInspectionReports_(sheetName, reports, deletedIds) {
  reports = reports || [];
  deletedIds = deletedIds || [];

  const lock = LockService.getScriptLock();
  try { lock.waitLock(25000); }
  catch (e) { return jsonResponse_({ ok: false, error: "Server busy, please press Save again in a few seconds." }); }

  try {
    const sheet = getSheet_(sheetName, INSPECTION_HEADERS);
    const order = [];
    const byId = {};
    const noId = [];

    listInspectionReports_(sheetName).forEach(function (r) {
      if (r && r.id) { if (!byId[r.id]) order.push(r.id); byId[r.id] = r; }
    });
    deletedIds.forEach(function (id) { delete byId[id]; });

    for (let i = 0; i < reports.length; i++) {
      const r = reports[i] || {};
      const json = JSON.stringify(r);
      if (json.length > INSP_JSON_COLS * INSP_CHUNK) {
        const h0 = r.header || {};
        return jsonResponse_({
          ok: false,
          error: "Report " + (h0.ir || r.id || i) + " is too large to store (" +
                 json.length + " characters). Remove a few photos and save again."
        });
      }
      if (r.id) { if (!byId[r.id] && order.indexOf(r.id) < 0) order.push(r.id); byId[r.id] = r; }
      else noId.push(r);
    }

    const all = order.filter(function (id) { return byId[id]; }).map(function (id) { return byId[id]; }).concat(noId);
    const rows = all.map(function (r) {
      const h = r.header || {};
      const json = JSON.stringify(r);
      const parts = [];
      for (let c = 0; c < INSP_JSON_COLS; c++) parts.push(json.substr(c * INSP_CHUNK, INSP_CHUNK));
      return [
        r.id || "", h.inspectionType || "", h.sbu || "", h.buyer || "", h.ir || "",
        h.styleName || "", h.date || "", h.inspectorName || "", r.result || "",
        r.status || "", r.sampleSize || "", r.savedAt || ""
      ].concat(parts);
    });

    const last = sheet.getLastRow();
    if (last > 1) sheet.getRange(2, 1, last - 1, INSPECTION_HEADERS.length).clearContent();
    if (rows.length) sheet.getRange(2, 1, rows.length, INSPECTION_HEADERS.length).setValues(rows);
    return jsonResponse_({ ok: true, count: rows.length });
  } finally {
    lock.releaseLock();
  }
}

function listInspectionReports_(sheetName) {
  const sheet = getSheet_(sheetName, INSPECTION_HEADERS);
  const rows = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    let json = "";
    for (let c = 12; c < 12 + INSP_JSON_COLS; c++) json += (r[c] === null || r[c] === undefined ? "" : String(r[c]));
    try { out.push(JSON.parse(json)); } catch (e) { /* skip an unreadable row rather than failing the load */ }
  }
  return out;
}

// QC Team entries (made from QA Process) are stored in their own "<sheet>_QC" tab so they
// never mix with QA Inspection reports. The page sends team:"qc" for those.
function invSheet_(base, body) {
  return body && String(body.team || "").toLowerCase() === "qc" ? base + "_QC" : base;
}

// ---------- Module 7: inspection photos ----------
// Photos are uploaded one at a time as base64 straight from the phone. The
// file is made link-viewable so the thumbnail renders in the form, and
// fetchImageBase64 reads it back for the PDF (Drive blocks direct canvas
// reads from the browser, which is why the PDF has to come through here).

function uploadInspectionImage_(body) {
  try {
    if (!body || !body.base64) return jsonResponse_({ ok: false, error: "No image data received" });
    const folder = getOrCreateInspectionFolder_();
    const bytes = Utilities.base64Decode(body.base64);
    const blob = Utilities.newBlob(bytes, body.mimeType || "image/jpeg",
                                   body.filename || ("photo_" + Date.now() + ".jpg"));
    const file = folder.createFile(blob);
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
    const id = file.getId();
    return jsonResponse_({
      ok: true,
      fileId: id,
      url: "https://drive.google.com/file/d/" + id + "/view",
      thumbUrl: "https://drive.google.com/thumbnail?id=" + id + "&sz=w600"
    });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err) });
  }
}

function fetchInspectionImage_(fileId) {
  try {
    if (!fileId) return jsonResponse_({ ok: false, error: "No file id given" });
    const blob = DriveApp.getFileById(fileId).getBlob();
    return jsonResponse_({
      ok: true,
      mimeType: blob.getContentType() || "image/jpeg",
      base64: Utilities.base64Encode(blob.getBytes())
    });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err) });
  }
}

function getOrCreateInspectionFolder_() {
  const parent = DriveApp.getRootFolder();
  const it = parent.getFoldersByName(INSPECTION_PHOTO_FOLDER);
  if (it.hasNext()) return it.next();
  return parent.createFolder(INSPECTION_PHOTO_FOLDER);
}

// ---------- Shared helpers ----------

function getSheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    return sheet;
  }
  // Keep row 1 in sync with `headers` so a sheet created before a column was
  // added to the code (e.g. AqlProcessChecks gaining InspectionLevel/CodeLetter/
  // AqlCritical/AqlMajor/AqlMinor) doesn't silently drift out of alignment with
  // the data being appended below it. This only ever rewrites row 1 text —
  // it never touches data rows.
  const existing = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  let matches = true;
  for (let i = 0; i < headers.length; i++) { if (existing[i] !== headers[i]) { matches = false; break; } }
  if (!matches) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  return sheet;
}

/**
 * ONE-TIME REPAIR — run manually from the Apps Script editor (select this
 * function in the dropdown next to Run, then click Run) if AqlProcessChecks
 * ever shows data under the wrong header again.
 *
 * What happened: AQLPROCESS_HEADERS gained 5 new columns (InspectionLevel,
 * CodeLetter, AqlCritical, AqlMajor, AqlMinor) after CheckPointsJSON, but the
 * sheet's row 1 (already created earlier) was never updated to match — so
 * every appendRow() after that point kept writing 33 values under the old
 * 28-column header, shifting everything from LotQty onward 5 columns to the
 * left of where its label said it was.
 *
 * This function re-detects each existing row's real shape from its CreatedAt
 * position (old rows: index 27, new rows: index 32 — both always a
 * timestamp), rebuilds every row into the current 33-column layout, and
 * rewrites the header. getSheet_() above now keeps row 1 in sync on its own
 * going forward, so this migration should only ever need to run once.
 */
function repairAqlProcessSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(AQLPROCESS_SHEET);
  const width = AQLPROCESS_HEADERS.length;
  if (!sheet) { Logger.log('AqlProcessChecks sheet not found — nothing to repair.'); return; }

  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) {
    sheet.getRange(1, 1, 1, width).setValues([AQLPROCESS_HEADERS]);
    Logger.log('No data rows found — header row written, nothing else to do.');
    return;
  }

  const isTimestamp_ = v => v instanceof Date || (typeof v === 'string' && v.trim() !== '');
  const fixed = [AQLPROCESS_HEADERS];
  let okCount = 0, migratedCount = 0, skippedCount = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0] && !r[10]) { fixed.push(r.slice(0, width).concat(Array(Math.max(0, width - r.length)).fill(''))); continue; } // fully blank row

    if (isTimestamp_(r[32])) {
      // Already in the current 33-column shape — nothing to move.
      okCount++;
      fixed.push(r.slice(0, width));
    } else if (isTimestamp_(r[27])) {
      // Old 28-column shape: Process..CheckPointsJSON (0-14) unchanged, then
      // LotQty..CreatedAt (15-27) needs to shift right to make room for the
      // 5 new AQL columns (which we can't reconstruct, so left blank).
      migratedCount++;
      const head = r.slice(0, 15);
      const blankAql = ['', '', '', '', ''];
      const tail = r.slice(15, 28);
      fixed.push(head.concat(blankAql).concat(tail));
    } else {
      // Shape couldn't be determined confidently — leave this row exactly as
      // read rather than risk moving data to the wrong place.
      skippedCount++;
      fixed.push(r.slice(0, width));
    }
  }

  const padded = fixed.map(row => {
    const a = row.slice(0, width);
    while (a.length < width) a.push('');
    return a;
  });
  sheet.getRange(1, 1, padded.length, width).setValues(padded);

  const maxCols = sheet.getMaxColumns();
  if (maxCols > width) sheet.getRange(1, width + 1, padded.length, maxCols - width).clearContent();

  Logger.log('AqlProcessChecks repair complete. Already correct: ' + okCount +
    ' | Migrated from old layout: ' + migratedCount +
    ' | Left untouched (shape unclear): ' + skippedCount);
}

// Shared Master_Order_Information Sheet (OrderInfo tab).
function getMasterSheet_() {
  return SpreadsheetApp.openById(MASTER_ORDER_SHEET_ID);
}

// Shared User_Management Sheet — one tab per module (QAUsers, RAUsers,
// AuditUsers, QCUsers, TrainingUsers, DocUsers, QAIUsers).
function getUserMgmtSheet_() {
  return SpreadsheetApp.openById(USER_MANAGEMENT_SHEET_ID);
}

function findUser_(sheetName, userId, password) {
  const sheet = getUserMgmtSheet_().getSheetByName(sheetName);
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


// ---------------------------------------------------------------
// PP Meeting: requirement templates (per Buyer or per Style) + Bangla translation
// ---------------------------------------------------------------
const PPTEMPLATE_SHEET = "PPTemplates";
const PPTEMPLATE_HEADERS = ["Scope", "Key", "Buyer", "Style", "TemplateJSON", "UpdatedAt"];

// A Sheets cell holds 50,000 characters max. If a report is too big, drop the (re-creatable) standard
// requirement text from each checkpoint instead of cutting the JSON in half.
function ppReportJson_(report) {
  if (!report) return "";
  let json = JSON.stringify(report);
  if (json.length <= 49000) return json;
  const slim = JSON.parse(json);
  Object.keys(slim.sections || {}).forEach(function (k) { slim.sections[k].forEach(function (r) { delete r.standard; }); });
  json = JSON.stringify(slim);
  return json.length <= 49000 ? json : "";
}
function ppTplKey_(scope, buyer, style) {
  const b = String(buyer || "").trim().toLowerCase();
  return scope === "style" ? b + "|" + String(style || "").trim().toLowerCase() : b;
}
function getPPTemplate_(body) {
  const sheet = getSheet_(PPTEMPLATE_SHEET, PPTEMPLATE_HEADERS);
  const rows = sheet.getDataRange().getValues();
  const bk = ppTplKey_("buyer", body.buyer), sk = ppTplKey_("style", body.buyer, body.style);
  let buyerTpl = null, styleTpl = null;
  for (let i = 1; i < rows.length; i++) {
    try {
      if (rows[i][0] === "buyer" && rows[i][1] === bk) buyerTpl = JSON.parse(rows[i][4]);
      if (body.style && rows[i][0] === "style" && rows[i][1] === sk) styleTpl = JSON.parse(rows[i][4]);
    } catch (e) {}
  }
  return jsonResponse_({ ok: true, buyerTpl: buyerTpl, styleTpl: styleTpl });
}
function savePPTemplate_(body) {
  const scope = body.scope === "style" ? "style" : "buyer";
  if (!body.buyer) return jsonResponse_({ ok: false, error: "Buyer is required." });
  if (scope === "style" && !body.style) return jsonResponse_({ ok: false, error: "Style is required for a style template." });
  const json = JSON.stringify(body.template || {});
  if (json.length > 49000) return jsonResponse_({ ok: false, error: "Template is too large to save (" + json.length + " characters)." });
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = getSheet_(PPTEMPLATE_SHEET, PPTEMPLATE_HEADERS);
    const key = ppTplKey_(scope, body.buyer, body.style);
    const rows = sheet.getDataRange().getValues();
    const rowData = [scope, key, body.buyer, scope === "style" ? body.style : "", json, nowBD_()];
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === scope && rows[i][1] === key) {
        sheet.getRange(i + 1, 1, 1, rowData.length).setValues([rowData]);
        return jsonResponse_({ ok: true, updated: true });
      }
    }
    sheet.appendRow(rowData);
    return jsonResponse_({ ok: true, updated: false });
  } finally { lock.releaseLock(); }
}
// English -> Bangla for the PDF (Apps Script's built-in LanguageApp; no API key needed).
function translateBn_(texts) {
  const out = (texts || []).slice(0, 30).map(function (t) {
    try { return LanguageApp.translate(String(t || ""), "en", "bn"); } catch (e) { return ""; }
  });
  return jsonResponse_({ ok: true, translations: out });
}