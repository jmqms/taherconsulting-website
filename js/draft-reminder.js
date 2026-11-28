/* Draft reminder: once per QA Inspection login, tell the user which of THEIR reports are still incomplete drafts.
 * Loaded by the 6 inspection pages (add the same <script> line to qa-inspection.html to also show it on the hub). */
(function () {
  if (window.__tcDraftReminder) return; window.__tcDraftReminder = true;
  var API = "https://script.google.com/macros/s/AKfycbzZ2Kn-5XlYWyJL2x9eYwtuQwm9dWNX8okS47B4Bjh8OcMQkMhwuZEJapfPaW68ZVIZ/exec";
  var KEY = "tc_module_qainspection";
  var TYPES = [
    ["1st Bundle", "1st-bundle-inspection.html", "list1stBundle", "1st Bundle Inspection"],
    ["Sewing Inline", "sewing-inline-inspection.html", "listSewingInline", "Sewing Inline Inspection"],
    ["Finishing Inline", "finishing-inline-inspection.html", "listFinishingInline", "Finishing Inline Inspection"],
    ["1st Carton", "1st-carton-inspection.html", "list1stCarton", "1st Carton Inspection"],
    ["Pre-Final", "pre-final-inspection.html", "listPreFinal", "Pre-Final Inspection"],
    ["Final", "final-inspection.html", "listFinal", "Final Inspection"]
  ];
  function sess() { try { return JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch (e) { return null; } }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function norm(s) { return String(s == null ? "" : s).trim().toLowerCase(); }
  function post(p) {
    var c = new AbortController(), t = setTimeout(function () { c.abort(); }, 25000);
    return fetch(API, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(p), signal: c.signal })
      .then(function (r) { return r.json(); }).finally(function () { clearTimeout(t); });
  }
  function isMine(r, me) {
    var by = norm(r.draftBy);
    if (by) return by === me;
    return norm(r.header && r.header.inspectorName) === me;      // older drafts saved before the owner was recorded
  }
  function show(items, me) {
    var old = document.getElementById("tcDraftRemind"); if (old) old.remove();
    var byType = {}; items.forEach(function (x) { (byType[x.page] = byType[x.page] || []).push(x); });
    var rows = items.map(function (x) {
      return "<tr><td style='padding:6px 8px;border-bottom:1px solid #eee'>" + esc(x.type) + "</td><td style='padding:6px 8px;border-bottom:1px solid #eee'>" + esc(x.ir || "-") + "</td><td style='padding:6px 8px;border-bottom:1px solid #eee'>" + esc(x.buyer || "-") + "</td><td style='padding:6px 8px;border-bottom:1px solid #eee'>" + esc(x.saved) + "</td><td style='padding:6px 8px;border-bottom:1px solid #eee'><a href='" + x.page + "#drafts' style='color:#1E3364;font-weight:600'>Open</a></td></tr>";
    }).join("");
    var d = document.createElement("div"); d.id = "tcDraftRemind";
    d.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99998;display:flex;align-items:center;justify-content:center;padding:16px;font-family:'Segoe UI',system-ui,Arial,sans-serif;";
    d.innerHTML = "<div style='background:#fff;color:#1a1a1a;border-radius:14px;max-width:620px;width:100%;max-height:88vh;overflow:auto;padding:22px 24px;box-shadow:0 12px 44px rgba(0,0,0,.4);border-top:6px solid #d68c0a;'>"
      + "<div style='font-size:18px;font-weight:700;color:#9a5b00;margin-bottom:6px'>🔔 You have " + items.length + " incomplete draft report" + (items.length > 1 ? "s" : "") + "</div>"
      + "<div style='font-size:13.5px;line-height:1.5;margin-bottom:12px'>Hello " + esc(me) + ", these reports are saved as drafts under your ID and are not submitted yet. Please open them, complete the remaining points and submit.</div>"
      + "<table style='width:100%;border-collapse:collapse;font-size:12.5px'><thead><tr style='text-align:left;background:#F6F5F0'><th style='padding:6px 8px'>Inspection</th><th style='padding:6px 8px'>IR</th><th style='padding:6px 8px'>Buyer</th><th style='padding:6px 8px'>Last saved</th><th></th></tr></thead><tbody>" + rows + "</tbody></table>"
      + "<div style='text-align:right;margin-top:16px'><button type='button' id='tcDraftRemindOk' style='border:none;background:#1E3364;color:#fff;font-weight:700;padding:9px 22px;border-radius:8px;cursor:pointer;font-size:13px'>OK, remind me at next login</button></div></div>";
    document.body.appendChild(d);
    d.querySelector("#tcDraftRemindOk").onclick = function () { d.remove(); };
  }
  function run(s) {
    var me = norm(s.name);
    Promise.all(TYPES.map(function (t) {
      return post({ action: t[2] }).then(function (r) { return (r && r.ok ? r.reports || [] : []).map(function (x) { return { t: t, r: x }; }); }).catch(function () { return []; });
    })).then(function (all) {
      var items = [];
      all.forEach(function (list) {
        list.forEach(function (x) {
          var r = x.r;
          if (!(r && (r.draft || r.status === "Draft"))) return;
          if (r.header && r.header.inspectionType && r.header.inspectionType !== x.t[3]) return;
          if (!isMine(r, me)) return;
          var saved = r.draftSavedAt || r.savedAt || ""; try { saved = saved ? new Date(saved).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "-"; } catch (e) {}
          items.push({ type: x.t[0], page: x.t[1], ir: r.header && r.header.ir, buyer: r.header && r.header.buyer, saved: saved });
        });
      });
      if (items.length) show(items, s.name);
    });
  }
  var timer = setInterval(function () {
    var s = sess();
    if (!s || !s.name) return;
    if (/guest|visitor/i.test(String(s.role || "") + String(s.designation || ""))) { clearInterval(timer); return; }
    clearInterval(timer);
    if (s.draftRemindDone) return;                       // already shown for this login; a new login makes a fresh session object
    s.draftRemindDone = true; try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
    run(s);
  }, 1200);
})();
