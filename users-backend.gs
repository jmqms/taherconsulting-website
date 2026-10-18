/**
 * TAHER CONSULTING — Login / User Management Backend
 * ---------------------------------------------------------------------
 * Lets you add, remove, or change staff/client logins by editing a
 * Google Sheet — no code changes needed for new users.
 *
 * SETUP:
 * 1. Go to sheets.google.com, create a new blank Google Sheet.
 *    Name it something like "Taher Consulting Users".
 * 2. Rename the first tab (bottom-left) to exactly: Users
 * 3. In row 1, add these exact headers, one per column:
 *      A1: UserID   B1: Password   C1: Name   D1: Designation
 *    (The columns are found by their header names, so extra columns or a
 *    different order are fine. An older "Role" header still works as an
 *    alias for "Designation".)
 * 4. From row 2 onward, add one user per row, e.g.:
 *      admin    | Taher@2140   | Abu Taher      | Administrator
 *      auditor1 | Milton@16614 | Milton Hossain | Auditor
 *      guest    | Guest        | Visitor        | visitor
 *    To add a new person later: just add a new row here — no code
 *    edit needed. To remove someone: delete their row. To change a
 *    password: edit their Password cell.
 *
 *    IMPORTANT — the Designation column controls permissions on the site:
 *    any designation containing the word "guest" or "visitor" (case doesn't
 *    matter) is treated as VIEW ONLY across every module — that
 *    account can open Audit, QC Inspection, and Training, but every
 *    submit/save/print action is blocked with a message. Any other
 *    role (Administrator, Auditor, etc.) has full access.
 *
 * MULTIPLE LOGIN PANELS (main site + one per module):
 * This same script also powers 3 separate, independent logins for
 * the Daily QMS Floor Audit, QC Inspection, and Training modules —
 * each checked against its own tab in this same Google Sheet, so
 * one Sheet manages every login on the site. Add these extra tabs
 * (bottom-left, "+" button) with the exact names and same 4-column
 * header (UserID, Password, Name, Designation) as the Users tab above:
 *      AuditUsers      — logins for the Daily QMS Floor Audit module
 *      QCUsers         — logins for the QC Inspection module
 *      TrainingUsers   — logins for the Training and Competency module
 * Each tab is completely independent — a person can have different
 * credentials (or no access at all) on different tabs.
 * 5. Extensions -> Apps Script. Delete the starter code, paste this
 *    whole file in, and Save.
 * 6. Deploy -> New deployment -> Type: "Web app"
 *      Execute as: Me | Who has access: Anyone
 * 7. Deploy, authorize the permissions, copy the Web app URL (/exec).
 * 8. Paste that URL into js/auth.js, replacing:
 *      const USERS_API_URL = "PASTE_YOUR_GOOGLE_APPS_SCRIPT_EXEC_URL_HERE";
 * 9. Re-upload js/auth.js to GitHub. Done — logins now come from
 *    this Sheet on every sign-in attempt.
 *
 * SECURITY NOTE: passwords are stored as plain text in the Sheet for
 * simplicity, matching how the other backends in this project work.
 * Keep this Sheet private (do not share it), and treat it the same
 * way you'd treat a password list — because that is what it is.
 *
 * ---- Taherconsultingbd Portal update ----
 * This script now reads from the shared "User_Management" Sheet at the
 * Portal's Drive root (USER_MANAGEMENT_SHEET_ID below) instead of its own
 * bound Sheet, so every module's login lives in one place. Every module
 * on the site already calls THIS SAME deployment with its own tab name
 * (sheetName: "AuditUsers" | "QCUsers" | "TrainingUsers" | "QAUsers" |
 * "RAUsers" | "DocUsers" | "QAInspectionUsers") via js/module-auth.js, or
 * "Users" for the main site login via js/auth.js — so no other file needs
 * to change, just create those tabs in User_Management and redeploy this
 * script as a New version (same /exec URL).
 */

const USERS_SHEET_NAME = "Users";
const USER_MANAGEMENT_SHEET_ID = "1s0i82BmF6T5C7_yNf970cK2Gb3qJ3-7tKqAWM-0vzbw"; // User_Management

const LOGIN_LOG_SHEET = "LoginHistory";
const LOGIN_LOG_HEADERS = ["Time (Bangladesh)", "UserID", "Name", "Role", "Module", "Result", "Device"];
const MODULE_LABELS = {
  "Users": "Main Portal",
  "AuditUsers": "Daily QMS Floor Audit",
  "QCUsers": "QC Inspection",
  "TrainingUsers": "Training and Competency",
  "QAUsers": "QA Process",
  "RAUsers": "Risk Assessment",
  "DocUsers": "Document Archive",
  "QAInspectionUsers": "QA Inspection",
  "PreFinalUsers": "Pre-Final Inspection"
};

function doPost(e) {
  const body = JSON.parse(e.postData.contents);

  if (body.action === "login") {
    const sheetName = body.sheet || USERS_SHEET_NAME;
    const user = findUser_(sheetName, body.userId, body.password);
    if (user) {
      logLogin_(sheetName, body.userId, user.name, user.designation, "Success", body.ua);
      // "role" is kept for the existing guest/visitor (view-only) check on the site.
      return jsonResponse_({ ok: true, name: user.name, designation: user.designation, role: user.designation });
    }
    logLogin_(sheetName, body.userId, "", "", "Failed", body.ua);
    return jsonResponse_({ ok: false, error: "Invalid User ID or password" });
  }

  // "Continue as Guest" on a module login screen (no password is checked for guests)
  if (body.action === "logGuest") {
    logLogin_(body.sheet || USERS_SHEET_NAME, "guest", "Guest", "guest", "Guest", body.ua);
    return jsonResponse_({ ok: true });
  }

  // Login history — administrators only (checked against the main Users tab).
  if (body.action === "loginHistory") {
    const admin = findUser_(USERS_SHEET_NAME, body.userId, body.password);
    if (!admin || !/admin/i.test(String(admin.designation))) {
      return jsonResponse_({ ok: false, error: "Only an administrator can view the login history." });
    }
    return jsonResponse_({ ok: true, rows: readLoginLog_(Number(body.limit) || 5000) });
  }

  return jsonResponse_({ ok: false, error: "Unrecognized request" });
}

// Appends one line to the LoginHistory tab (created automatically). Never lets a logging
// problem stop a login: any error is swallowed.
function logLogin_(sheetName, userId, name, role, result, ua) {
  try {
    const ss = SpreadsheetApp.openById(USER_MANAGEMENT_SHEET_ID);
    let sh = ss.getSheetByName(LOGIN_LOG_SHEET);
    if (!sh) { sh = ss.insertSheet(LOGIN_LOG_SHEET); sh.appendRow(LOGIN_LOG_HEADERS); sh.setFrozenRows(1); }
    const when = Utilities.formatDate(new Date(), "Asia/Dhaka", "yyyy-MM-dd HH:mm:ss");
    sh.appendRow([when, String(userId || "").trim(), name || "", role || "", MODULE_LABELS[sheetName] || sheetName, result, String(ua || "").slice(0, 250)]);
  } catch (err) {}
}

function readLoginLog_(limit) {
  const sh = SpreadsheetApp.openById(USER_MANAGEMENT_SHEET_ID).getSheetByName(LOGIN_LOG_SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  const last = sh.getLastRow();
  const first = Math.max(2, last - limit + 1);
  const vals = sh.getRange(first, 1, last - first + 1, LOGIN_LOG_HEADERS.length).getValues();
  return vals.map(function (r) {
    const t = (r[0] instanceof Date) ? Utilities.formatDate(r[0], "Asia/Dhaka", "yyyy-MM-dd HH:mm:ss") : String(r[0]);
    return { time: t, userId: r[1], name: r[2], role: r[3], module: r[4], result: r[5], device: r[6] };
  }).reverse(); // newest first
}

// Finds a column by header name (case-insensitive); returns -1 if missing.
function colIndex_(headers, names) {
  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i]).trim().toLowerCase().replace(/[\s_]+/g, "");
    if (names.indexOf(h) !== -1) return i;
  }
  return -1;
}

function findUser_(sheetName, userId, password) {
  const sheet = SpreadsheetApp.openById(USER_MANAGEMENT_SHEET_ID).getSheetByName(sheetName);
  if (!sheet) return null;

  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return null;
  // Header row: UserID, Password, Name, Designation (older "Role" header also accepted).
  // If a header is not found, fall back to the old fixed positions A, B, C, D.
  const h = rows[0];
  let iId = colIndex_(h, ["userid", "id", "username"]);
  let iPw = colIndex_(h, ["password", "pass", "pwd"]);
  let iName = colIndex_(h, ["name", "fullname"]);
  let iDes = colIndex_(h, ["designation", "role", "title"]);
  if (iId < 0) iId = 0;
  if (iPw < 0) iPw = 1;
  if (iName < 0) iName = 2;
  if (iDes < 0) iDes = 3;

  const wantId = String(userId).trim().toLowerCase();
  for (let i = 1; i < rows.length; i++) {
    const rowId = rows[i][iId];
    if (!rowId) continue;
    if (String(rowId).trim().toLowerCase() === wantId && String(rows[i][iPw]) === String(password)) {
      const name = rows[i][iName];
      const designation = rows[i][iDes];
      return { name: name || rowId, designation: designation || "Team Member" };
    }
  }
  return null;
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
