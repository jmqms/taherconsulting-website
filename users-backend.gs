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
 *      A1: UserID   B1: Password   C1: Name   D1: Role
 * 4. From row 2 onward, add one user per row, e.g.:
 *      admin    | Taher@2140   | Abu Taher      | Administrator
 *      auditor1 | Milton@16614 | Milton Hossain | Auditor
 *      guest    | Guest        | Visitor        | visitor
 *    To add a new person later: just add a new row here — no code
 *    edit needed. To remove someone: delete their row. To change a
 *    password: edit their Password cell.
 *
 *    IMPORTANT — the Role column controls permissions on the site:
 *    any role containing the word "guest" or "visitor" (case doesn't
 *    matter) is treated as VIEW ONLY across every module — that
 *    account can open Audit, QC Inspection, and Training, but every
 *    submit/save/print action is blocked with a message. Any other
 *    role (Administrator, Auditor, etc.) has full access.
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
 */

const USERS_SHEET_NAME = "Users";

function doPost(e) {
  const body = JSON.parse(e.postData.contents);

  if (body.action === "login") {
    const user = findUser_(body.userId, body.password);
    if (user) {
      return jsonResponse_({ ok: true, name: user.name, role: user.role });
    }
    return jsonResponse_({ ok: false, error: "Invalid User ID or password" });
  }

  return jsonResponse_({ ok: false, error: "Unrecognized request" });
}

function findUser_(userId, password) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(USERS_SHEET_NAME);
  if (!sheet) return null;

  const rows = sheet.getDataRange().getValues();
  // rows[0] is the header row: UserID, Password, Name, Role
  for (let i = 1; i < rows.length; i++) {
    const [rowId, rowPass, rowName, rowRole] = rows[i];
    if (!rowId) continue;
    if (
      String(rowId).trim().toLowerCase() === String(userId).trim().toLowerCase() &&
      String(rowPass) === String(password)
    ) {
      return { name: rowName || rowId, role: rowRole || "Team Member" };
    }
  }
  return null;
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
