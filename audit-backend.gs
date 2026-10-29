/**
 * QMS Audit Portal - Combined Backend (data + login) in ONE script
 *
 * Works from ANY Google account / Drive:
 *  - Container-bound (script opened from the Sheet via Extensions > Apps Script):
 *      leave SPREADSHEET_ID empty.
 *  - Standalone script: paste the Sheet ID in SPREADSHEET_ID.
 *
 * Sheet tabs used:
 *  - "AuditData"  -> audit rows (auto-created with headers if missing)
 *  - "AuditUsers" -> logins. Header row needs columns like: User ID | Password | Name
 */

var SPREADSHEET_ID = "";          // e.g. "1AbC...xyz" (from the Sheet URL). Empty = use the bound sheet.
var DATA_SHEET_NAME = "AuditData";
var USERS_SHEET_NAME = "AuditUsers";

var DATA_HEADERS = ["Date", "Auditor", "SBU", "Line / Area", "Section",
                    "Sub Section / Process", "Checkpoint Question", "Status", "Findings / Comments"];

function getSS_() {
  return SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID)
                        : SpreadsheetApp.getActiveSpreadsheet();
}

function getDataSheet_(ss) {
  var sh = ss.getSheetByName(DATA_SHEET_NAME);
  if (sh) return sh;
  // Backward compatible: use the first tab that is not the users tab
  var all = ss.getSheets();
  for (var i = 0; i < all.length; i++) {
    if (all[i].getName() !== USERS_SHEET_NAME) { sh = all[i]; break; }
  }
  if (!sh) sh = ss.insertSheet(DATA_SHEET_NAME);
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
                       .setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------- POST
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    // LOGIN request: { action:'login', userId, password }
    if (body && !Array.isArray(body) && body.action === "login") {
      return handleLogin_(body);
    }

    // AUDIT SUBMISSION: array of rows
    var rows = Array.isArray(body) ? body : [body];
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var ss = getSS_();
      var sheet = getDataSheet_(ss);
      if (sheet.getLastRow() === 0) sheet.appendRow(DATA_HEADERS);

      var values = rows.map(function (r) {
        return [r.date, r.auditor, r.sbu, r.line, r.section,
                r.subcategory, r.question, r.status, r.comment];
      });
      sheet.getRange(sheet.getLastRow() + 1, 1, values.length, DATA_HEADERS.length)
           .setValues(values);
    } finally {
      lock.releaseLock();
    }
    return json_({ status: "success", message: rows.length + " rows compiled successfully." });

  } catch (error) {
    return json_({ status: "error", message: error.toString() });
  }
}

// ---------------------------------------------------------------- LOGIN
function handleLogin_(req) {
  var ss = getSS_();
  var sh = ss.getSheetByName(req.sheet || USERS_SHEET_NAME);
  if (!sh || sh.getLastRow() < 2) return json_({ ok: false, error: "User list is empty or the AuditUsers tab was not found." });

  var data = sh.getDataRange().getValues();
  var head = data[0].map(function (h) { return String(h).toLowerCase().replace(/[^a-z0-9]/g, ""); });

  function findCol(candidates) {
    for (var c = 0; c < candidates.length; c++) {
      var idx = head.indexOf(candidates[c]);
      if (idx > -1) return idx;
    }
    return -1;
  }
  var idCol = findCol(["userid", "id", "username", "user"]);
  var pwCol = findCol(["password", "pass", "pwd"]);
  var nameCol = findCol(["name", "fullname", "auditorname", "auditor"]);
  if (idCol < 0 || pwCol < 0) return json_({ ok: false, error: "AuditUsers tab needs 'User ID' and 'Password' columns." });

  var uid = String(req.userId || "").trim().toLowerCase();
  var pw = String(req.password || "").trim();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idCol]).trim().toLowerCase() === uid && String(data[i][pwCol]).trim() === pw && uid !== "") {
      return json_({ ok: true, name: nameCol > -1 && data[i][nameCol] ? String(data[i][nameCol]) : String(data[i][idCol]) });
    }
  }
  return json_({ ok: false, error: "User ID or password not recognized. Please check with your administrator." });
}

// ---------------------------------------------------------------- GET
function doGet(e) {
  try {
    var ss = getSS_();
    var sheet = getDataSheet_(ss);

    if (sheet.getLastRow() < 2) return json_([]);

    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var tz = ss.getSpreadsheetTimeZone();
    var out = [];

    for (var i = 1; i < data.length; i++) {
      var obj = {};
      for (var j = 0; j < headers.length; j++) {
        var key = headers[j].toString().toLowerCase().replace(/[^a-z0-9]/g, "");
        var val = data[i][j];

        if (key === "date") {
          obj["date"] = (val instanceof Date) ? Utilities.formatDate(val, tz, "yyyy-MM-dd") : val;
        } else if (key === "linearea" || key === "line") {
          obj["line"] = val;
        } else if (key === "subsectionprocess" || key === "subcategory" || key === "subsection") {
          obj["subcategory"] = val;
        } else if (key === "checkpointquestion" || key === "question") {
          obj["question"] = val;
        } else if (key === "findingscomments" || key === "comment") {
          obj["comment"] = val;
        } else if (key) {
          obj[key] = val;
        }
      }
      out.push(obj);
    }
    return json_(out);

  } catch (error) {
    return json_({ status: "error", message: error.toString() });
  }
}
