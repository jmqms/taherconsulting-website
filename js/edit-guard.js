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


  /* ---------- "Report a mistake" widget (QA Process, and any page whose entries cannot be edited in place) ----------
     A user describes what is wrong and what the correct value is. The request goes to the same EditRequests list;
     the administrator corrects the entry himself (Mark Done) or approves the user to correct it (Approve). */
  function correctionWidget(opts) {
    if (document.getElementById("eg-fab")) return;
    const key = opts.moduleKey, areas = opts.areas || [];
    const st = document.createElement("style");
    st.textContent = "#eg-fab{position:fixed;right:18px;bottom:18px;z-index:9990;background:#1B211D;color:#F1F0EA;border:none;border-radius:999px;padding:11px 18px;font:600 13px system-ui,Arial;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.3)}" +
      "#eg-modal{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9995;display:none;align-items:center;justify-content:center;padding:14px}#eg-modal.show{display:flex}" +
      "#eg-box{background:#fff;color:#1B211D;border-radius:12px;max-width:520px;width:100%;max-height:92vh;overflow:auto;padding:20px;font:14px system-ui,Arial}" +
      "#eg-box h3{margin:0 0 4px;font-size:17px}#eg-box label{display:block;font-weight:600;font-size:12.5px;margin:10px 0 4px}" +
      "#eg-box input,#eg-box select,#eg-box textarea{width:100%;box-sizing:border-box;padding:9px 10px;border:1.5px solid #d4d6de;border-radius:8px;font:inherit}" +
      "#eg-box .row{display:flex;gap:8px;margin-top:14px}#eg-box button{font:600 13px system-ui,Arial;padding:10px 16px;border-radius:8px;border:1.5px solid #1B211D;background:#fff;cursor:pointer}" +
      "#eg-box button.p{background:#1B211D;color:#fff}#eg-box .my{margin-top:16px;border-top:1px solid #ddd;padding-top:10px;font-size:12.5px}" +
      "#eg-box .my div{padding:5px 0;border-bottom:1px solid #eee}#eg-box .pill{display:inline-block;padding:1px 8px;border-radius:99px;font-size:11.5px;font-weight:700;background:#eee}" +
      "#eg-box .Pending{background:#fdf3dc;color:#8a5a00}#eg-box .Approved{background:#e1f3e8;color:#1E6B4A}#eg-box .Done{background:#e1f3e8;color:#1E6B4A}#eg-box .Rejected{background:#fdecea;color:#b3261e}";
    document.head.appendChild(st);
    const fab = document.createElement("button"); fab.id = "eg-fab"; document.body.appendChild(fab);
    const modal = document.createElement("div"); modal.id = "eg-modal"; document.body.appendChild(modal);
    const today = new Date().toISOString().slice(0, 10);
    function draw() {
      const admin = isAdmin();
      fab.textContent = admin ? "✎ Edit Requests (admin)" : "✎ Report a mistake in an entry";
      fab.title = admin ? "Open the administrator's request list" : "Ask an administrator to correct an entry";
    }
    draw(); window.addEventListener("tc-module-session", draw);
    async function mine() {
      const who = userName(); if (!who) return "";
      try {
        const d = await call({ action: "myEditRequests", module: key, requestedBy: who });
        const rows = (d.requests || []).slice().reverse().slice(0, 8);
        if (!rows.length) return "";
        return '<div class="my"><b>Your requests</b>' + rows.map(r => `<div><span class="pill ${esc(r.status)}">${r.status === "Done" ? "Corrected" : esc(r.status)}</span> ${esc(r.report)}<br><span style="color:#667">${esc(r.reason)}</span>${r.status === "Approved" ? '<br><b style="color:#1E6B4A">Approved &mdash; you may now correct this entry yourself.</b>' : ""}</div>`).join("") + "</div>";
      } catch (e) { return ""; }
    }
    async function open() {
      modal.innerHTML = `<div id="eg-box"><h3>Report a mistake in an entry</h3><div style="color:#667;font-size:12.5px">Tell the administrator what is wrong and what it should be. He will correct it, or let you correct it.</div>
        <label>Where is the entry?</label><select id="eg-area">${areas.map(a => `<option value="${esc(a.id)}">${esc(a.label)}</option>`).join("")}</select>
        <label>IR No / Style</label><input id="eg-ir" placeholder="e.g. 508/2614">
        <label>Entry date (approx.)</label><input id="eg-date" type="date" value="${today}">
        <label>What is wrong?</label><textarea id="eg-wrong" rows="2" placeholder="e.g. Color entered as BLACK, should be NAVY"></textarea>
        <label>What is the correct information?</label><textarea id="eg-right" rows="2"></textarea>
        <div class="row"><button class="p" id="eg-send">Send request</button><button id="eg-close">Close</button></div>
        <div id="eg-msg" style="margin-top:8px;font-size:12.5px"></div><div id="eg-mine"></div></div>`;
      modal.classList.add("show");
      modal.querySelector("#eg-close").onclick = () => modal.classList.remove("show");
      modal.querySelector("#eg-send").onclick = send;
      modal.querySelector("#eg-mine").innerHTML = await mine();
    }
    async function send() {
      const q = id => modal.querySelector("#" + id), msg = q("eg-msg");
      const who = userName(), ir = q("eg-ir").value.trim(), wrong = q("eg-wrong").value.trim(), right = q("eg-right").value.trim();
      const area = q("eg-area").selectedOptions[0].textContent;
      if (!who) { msg.textContent = "Please sign in first."; return; }
      if (!ir || !wrong) { msg.textContent = "Enter the IR No and what is wrong."; msg.style.color = "#b3261e"; return; }
      const btn = q("eg-send"); btn.disabled = true; msg.style.color = "#667"; msg.textContent = "Sending…";
      try {
        const label = area + " · IR " + ir + " · " + q("eg-date").value;
        const d = await call({ action: "requestEdit", module: key, reportId: q("eg-area").value + "|" + ir + "|" + q("eg-date").value + "|" + Date.now(), label: label,
          requestedBy: who, reason: "WRONG: " + wrong + (right ? "  |  CORRECT: " + right : "") });
        if (!d.ok) throw new Error(d.error || "Request failed");
        msg.style.color = "#1E6B4A"; msg.textContent = "Request sent to the administrator.";
        q("eg-wrong").value = ""; q("eg-right").value = ""; q("eg-mine").innerHTML = await mine();
      } catch (e) { msg.style.color = "#b3261e"; msg.textContent = "Could not send: " + e.message; }
      btn.disabled = false;
    }
    fab.onclick = () => { if (isAdmin()) { location.href = "edit-requests.html"; return; } if (window.TC_IS_GUEST) { alert("Guest accounts are view only."); return; } open(); };
  }

  window.TCEG = {
    correctionWidget: correctionWidget,
    init: function (moduleKey, onChange) { G.module = moduleKey; G.cb = onChange || null; refresh(); },
    isAdmin: isAdmin, status: status, canEdit: canEdit, request: request, consume: consume, requestButton: requestButton, refresh: refresh
  };
  window.addEventListener("focus", refresh);
  window.addEventListener("tc-module-session", function () { refresh(); if (G.cb) G.cb(); });
  setInterval(function () { if (!isAdmin()) refresh(); }, 60000);
})();
