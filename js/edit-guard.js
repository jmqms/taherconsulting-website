/* Edit / Delete guard for every Report Log.
 *  - Administrator : can open (edit) and delete any report.
 *  - Everyone else : no Delete. A submitted report can only be edited after an administrator approves an
 *                    "Edit Request"; the approval works once - after the user re-submits, the report is locked again.
 * Requests are stored by js/../users-backend.gs ("EditRequests" tab) and approved on edit-requests.html.
 * NOTE: this is enforced in the browser; the report data itself is still reachable by anyone who can call the
 * module's Apps Script directly. */
(function () {
  const API = "https://script.google.com/macros/s/AKfycbx7Cwnp8hoKuxcQ57TlllwBaA7zr9S2bcFVi9-mzyyY8RhRL3YiUpbJMFohLmQZkf1a/exec";
  const G = { module: "", cb: null, map: {}, fetched: false, busy: false, lastUser: "" };

  function parse(k, st) { try { return JSON.parse((st || localStorage).getItem(k) || "null"); } catch (e) { return null; } }
  function mainSession() { return parse("tc_session") || parse("tc_session", sessionStorage) || {}; }
  function moduleSessions() {
    const out = [];
    try { for (let i = 0; i < sessionStorage.length; i++) { const k = sessionStorage.key(i); if (k && k.indexOf("tc_module_") === 0) { const s = parse(k, sessionStorage); if (s) out.push(s); } } } catch (e) {}
    return out;
  }
  function isAdmin() {
    const roleOf = s => String((s && (s.role || "")) + " " + (s && (s.designation || "")));
    if (/admin/i.test(roleOf(mainSession()))) return true;
    return moduleSessions().some(s => /admin/i.test(roleOf(s)));
  }
  function userName() {
    const m = moduleSessions().filter(s => s && s.name && !/guest|visitor/i.test(String(s.role || "") + String(s.designation || "")))[0];
    return (m && m.name) || mainSession().name || "";
  }
  async function call(payload) {
    const res = await fetch(API, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
    return JSON.parse(await res.text());
  }
  async function refresh() {
    const who = userName();
    if (!G.module || !who || G.busy) return;
    G.busy = true;
    try {
      const d = await call({ action: "myEditRequests", module: G.module, requestedBy: who });
      if (d && d.ok) {
        const map = {}; (d.requests || []).forEach(r => { const prev = map[r.reportId]; if (!prev || r.status === "Approved") map[r.reportId] = r; });
        const changed = JSON.stringify(Object.keys(map).map(k => [k, map[k].status])) !== JSON.stringify(Object.keys(G.map).map(k => [k, G.map[k].status]));
        G.map = map; G.fetched = true; G.lastUser = who;
        if (changed && G.cb) G.cb();
      }
    } catch (e) {}
    G.busy = false;
  }
  function status(reportId) {
    if (isAdmin()) return "admin";
    if (!G.fetched || G.lastUser !== userName()) refresh();
    const r = G.map[reportId];
    if (!r) return "none";
    return r.status === "Approved" ? "approved" : r.status === "Pending" ? "pending" : r.status === "Rejected" ? "rejected" : "none";
  }
  function canEdit(reportId) { const s = status(reportId); return s === "admin" || s === "approved"; }

  async function request(reportId, label) {
    const who = userName();
    if (!who) { alert("Please sign in first."); return; }
    const reason = (prompt("Why do you need to edit this report?\n(An administrator will review your request.)\n\n" + (label || "")) || "").trim();
    if (!reason) return;
    try {
      const d = await call({ action: "requestEdit", module: G.module, reportId: reportId, label: label || "", requestedBy: who, reason: reason });
      if (!d.ok) throw new Error(d.error || "Request failed");
      G.map[reportId] = d.request; G.fetched = true;
      alert(d.existing ? "You already have a request for this report (" + d.request.status + ")." : "Edit request sent. You can edit once an administrator approves it.");
      if (G.cb) G.cb();
    } catch (e) { alert("Could not send the request: " + e.message); }
  }
  // call right after the edited report was saved - the approval is used up and the report locks again
  async function consume(reportId) {
    if (isAdmin()) return;
    const r = G.map[reportId];
    if (!r || r.status !== "Approved") return;
    try { await call({ action: "useEditRequest", id: r.id }); } catch (e) {}
    delete G.map[reportId];
    if (G.cb) G.cb();
  }
  // small HTML helper for log rows: the Edit / Request button of a report
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function requestButton(reportId, label, cls) {
    const s = status(reportId), c = cls || "btn ghost small";
    if (s === "pending") return `<button type="button" class="${c}" disabled title="Waiting for administrator approval">Edit requested &#9203;</button>`;
    return `<button type="button" class="${c}" data-eg-request="${esc(reportId)}" data-eg-label="${esc(label || "")}" title="${s === "rejected" ? "Your last request was rejected - you can ask again" : "Ask an administrator to allow an edit"}">${s === "rejected" ? "Request Edit again" : "Request Edit"}</button>`;
  }

  document.addEventListener("click", function (e) {
    const b = e.target.closest && e.target.closest("[data-eg-request]");
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    request(b.dataset.egRequest, b.dataset.egLabel);
  }, true);

  window.TCEG = {
    init: function (moduleKey, onChange) { G.module = moduleKey; G.cb = onChange || null; refresh(); },
    isAdmin: isAdmin, status: status, canEdit: canEdit, request: request, consume: consume, requestButton: requestButton, refresh: refresh
  };
  window.addEventListener("focus", refresh);
  window.addEventListener("tc-module-session", function () { refresh(); if (G.cb) G.cb(); });
  setInterval(function () { if (!isAdmin()) refresh(); }, 60000);
})();
