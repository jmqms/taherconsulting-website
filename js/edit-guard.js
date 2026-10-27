/* Edit / Delete guard for every Report Log.
 *  - Administrator : can open (edit) and delete any report.
 *  - Everyone else : no Delete. A submitted report can only be edited after an administrator approves an
 *                    "Edit Request"; the approval works once - after the user re-submits, the report is locked again.
 * Requests are stored by js/../users-backend.gs ("EditRequests" tab) and approved on edit-requests.html.
 * NOTE: this is enforced in the browser; the report data itself is still reachable by anyone who can call the
 * module's Apps Script directly. */
(function () {
  const API = "https://script.google.com/macros/s/AKfycbx7Cwnp8hoKuxcQ57TlllwBaA7zr9S2bcFVi9-mzyyY8RhRL3YiUpbJMFohLmQZkf1a/exec";
  const G = { module: "", cb: null, openFn: null, adminEdit: null, adminDel: null, map: {}, fetched: false, busy: false, lastUser: "" };

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
        notifyApproved(false);
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
    notifyApproved(false);
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


  /* ---------- "Request Edit" inside a record's details (QA Process) ----------
     fixButton({area, ir, date, extra}) returns the HTML of a button for the details header. Clicking it opens a small form:
     what is wrong / what is correct. The administrator then corrects the entry himself (Mark Done) or approves the user
     to correct it (Approve). Admins get a link to the request list instead. */
  function fixStyles() {
    if (document.getElementById("eg-style")) return;
    const st = document.createElement("style"); st.id = "eg-style";
    st.textContent = "#eg-modal{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9995;display:none;align-items:center;justify-content:center;padding:14px}#eg-modal.show{display:flex}" +
      "#eg-box{background:#fff;color:#1B211D;border-radius:12px;max-width:520px;width:100%;max-height:92vh;overflow:auto;padding:20px;font:14px system-ui,Arial}" +
      "#eg-box h3{margin:0 0 4px;font-size:17px}#eg-box label{display:block;font-weight:600;font-size:12.5px;margin:10px 0 4px}" +
      "#eg-box input,#eg-box textarea{width:100%;box-sizing:border-box;padding:9px 10px;border:1.5px solid #d4d6de;border-radius:8px;font:inherit}" +
      "#eg-box .row{display:flex;gap:8px;margin-top:14px}#eg-box button{font:600 13px system-ui,Arial;padding:10px 16px;border-radius:8px;border:1.5px solid #1B211D;background:#fff;cursor:pointer}" +
      "#eg-box button.p{background:#1B211D;color:#fff}#eg-box .ctx{background:#f4f3ee;border-radius:8px;padding:8px 10px;margin:8px 0;font-size:13px}" +
      "#eg-box .my{margin-top:16px;border-top:1px solid #ddd;padding-top:10px;font-size:12.5px}#eg-box .my div{padding:5px 0;border-bottom:1px solid #eee}" +
      "#eg-box .pill{display:inline-block;padding:1px 8px;border-radius:99px;font-size:11.5px;font-weight:700;background:#eee}" +
      "#eg-box .Pending{background:#fdf3dc;color:#8a5a00}#eg-box .Approved,#eg-box .Done{background:#e1f3e8;color:#1E6B4A}#eg-box .Rejected{background:#fdecea;color:#b3261e}";
    document.head.appendChild(st);
  }
  function fixButton(ctx) {
    const cls = "btn btn-ghost", sty = "padding:4px 10px;font-size:11.5px";
    if (isAdmin()) {
      const can = G.adminEdit && ctx && (ctx.id || /\[[^\]]+\]/.test(String(ctx.extra || "")));
      const ad = can ? ` <button type="button" class="${cls}" style="${sty}" data-eg-admin="edit" data-eg-ctx="${esc(JSON.stringify(ctx || {}))}">&#9998; Edit</button> <button type="button" class="${cls}" style="${sty};color:#b3261e;border-color:#b3261e" data-eg-admin="del" data-eg-ctx="${esc(JSON.stringify(ctx || {}))}">&#128465; Delete</button>` : "";
      return `<a class="${cls}" style="${sty};text-decoration:none" href="edit-requests.html" target="_blank" rel="noopener">&#9998; Edit Requests</a>` + ad;
    }
    return `<button type="button" class="${cls}" style="${sty}" data-eg-fix="${esc(JSON.stringify(ctx || {}))}" title="Something is wrong in this entry? Ask the administrator to correct it">&#9998; Request Edit</button>`;
  }
  async function openFix(ctx) {
    fixStyles();
    if (window.TC_IS_GUEST) { alert("Guest accounts are view only."); return; }
    let modal = document.getElementById("eg-modal");
    if (!modal) { modal = document.createElement("div"); modal.id = "eg-modal"; document.body.appendChild(modal); }
    const key = G.module || "qaprocess", who = userName();
    const head = [ctx.area, ctx.ir ? "IR " + ctx.ir : "", ctx.date ? String(ctx.date).slice(0, 10) : ""].filter(Boolean).join(" · ");
    modal.innerHTML = `<div id="eg-box"><h3>Request Edit</h3><div style="color:#667;font-size:12.5px">Tell the administrator what is wrong and what it should be. He will correct it, or let you correct it.</div>
      <div class="ctx"><b>${esc(head)}</b>${ctx.extra ? "<br>" + esc(ctx.extra) : ""}</div>
      <label>What is wrong?</label><textarea id="eg-wrong" rows="2" placeholder="e.g. Color entered as BLACK, should be NAVY"></textarea>
      <label>What is the correct information?</label><textarea id="eg-right" rows="2"></textarea>
      <div class="row"><button class="p" id="eg-send">Send request</button><button id="eg-close">Close</button></div>
      <div id="eg-msg" style="margin-top:8px;font-size:12.5px"></div><div id="eg-mine"></div></div>`;
    modal.classList.add("show");
    const q = id => modal.querySelector("#" + id);
    q("eg-close").onclick = () => modal.classList.remove("show");
    async function mine() {
      if (!who) return "";
      try {
        const d = await call({ action: "myEditRequests", module: key, requestedBy: who });
        const rows = (d.requests || []).filter(r => !ctx.ir || String(r.report).indexOf("IR " + ctx.ir) >= 0).slice().reverse().slice(0, 6);
        if (!rows.length) return "";
        return '<div class="my"><b>Your earlier requests for this IR</b>' + rows.map(r => `<div><span class="pill ${esc(r.status)}">${r.status === "Done" ? "Corrected" : esc(r.status)}</span> ${esc(r.report)}<br><span style="color:#667">${esc(r.reason)}</span>${r.status === "Approved" ? '<br><b style="color:#1E6B4A">Approved &mdash; you may now correct this entry yourself.</b>' : ""}</div>`).join("") + "</div>";
      } catch (e) { return ""; }
    }
    q("eg-send").onclick = async () => {
      const msg = q("eg-msg"), wrong = q("eg-wrong").value.trim(), right = q("eg-right").value.trim();
      if (!who) { msg.style.color = "#b3261e"; msg.textContent = "Please sign in first."; return; }
      if (!wrong) { msg.style.color = "#b3261e"; msg.textContent = "Please write what is wrong."; return; }
      const btn = q("eg-send"); btn.disabled = true; msg.style.color = "#667"; msg.textContent = "Sending…";
      try {
        const label = head + (ctx.extra ? " · " + ctx.extra : "");
        const d = await call({ action: "requestEdit", module: key, reportId: [ctx.area, ctx.ir, ctx.date, ctx.id, Date.now()].join("|"), label: label,
          requestedBy: who, reason: "WRONG: " + wrong + (right ? "  |  CORRECT: " + right : "") });
        if (!d.ok) throw new Error(d.error || "Request failed");
        msg.style.color = "#1E6B4A"; msg.textContent = "Request sent to the administrator.";
        q("eg-wrong").value = ""; q("eg-right").value = ""; q("eg-mine").innerHTML = await mine();
      } catch (e) { msg.style.color = "#b3261e"; msg.textContent = "Could not send: " + e.message; }
      btn.disabled = false;
    };
    q("eg-mine").innerHTML = await mine();
  }
  document.addEventListener("click", function (e) {
    const b = e.target.closest && e.target.closest("[data-eg-admin]");
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    if (!isAdmin()) return;
    let ctx = {}; try { ctx = JSON.parse(b.getAttribute("data-eg-ctx")); } catch (x) {}
    const fn = b.getAttribute("data-eg-admin") === "del" ? G.adminDel : G.adminEdit;
    if (fn) fn(ctx);
  }, true);
  document.addEventListener("click", function (e) {
    const b = e.target.closest && e.target.closest("[data-eg-fix]");
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    let ctx = {}; try { ctx = JSON.parse(b.getAttribute("data-eg-fix")); } catch (x) {}
    openFix(ctx);
  }, true);


  /* ---------- Approval popup: when an administrator approves, the requester sees a pop-up with "Edit now" ----------
     Shown once per approval in this browser session (and the green badge stays until the edit is saved). */
  function approvedList() { return isAdmin() ? [] : Object.keys(G.map).map(k => G.map[k]).filter(r => r && r.status === "Approved"); }
  function seenIds() { try { return JSON.parse(sessionStorage.getItem("tc_eg_seen") || "[]"); } catch (e) { return []; } }
  function markSeen(ids) { try { sessionStorage.setItem("tc_eg_seen", JSON.stringify(seenIds().concat(ids))); } catch (e) {} }
  function reqTitle(r) { return String(r.report || r.label || r.reportId || "").replace(/\|\d{10,}$/, ""); }
  function notifyApproved(force) {
    if (!G.openFn) return;
    fixStyles();
    const list = approvedList();
    let badge = document.getElementById("eg-badge");
    if (!list.length) { if (badge) badge.remove(); const m = document.getElementById("eg-appr"); if (m) m.classList.remove("show"); return; }
    if (!badge) {
      badge = document.createElement("button"); badge.id = "eg-badge"; badge.type = "button";
      badge.style.cssText = "position:fixed;right:14px;bottom:14px;z-index:9990;background:#1E6B4A;color:#fff;border:0;border-radius:999px;padding:10px 16px;font:700 13px system-ui,Arial;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer";
      badge.onclick = () => showApproved();
      document.body.appendChild(badge);
    }
    badge.textContent = "✅ " + list.length + " edit approved — open";
    const seen = seenIds(), fresh = list.filter(r => seen.indexOf(r.id) < 0);
    if (force || fresh.length) { showApproved(); markSeen(list.map(r => r.id)); }
  }
  function showApproved() {
    fixStyles();
    const list = approvedList(); if (!list.length) return;
    let modal = document.getElementById("eg-appr");
    if (!modal) { modal = document.createElement("div"); modal.id = "eg-appr"; modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9996;display:none;align-items:center;justify-content:center;padding:14px"; document.body.appendChild(modal); }
    modal.innerHTML = '<div id="eg-box" style="border-top:5px solid #1E6B4A"><h3>✅ Edit approved</h3><div style="color:#667;font-size:12.5px">The administrator approved your edit request. You can edit once now — after you save, the report locks again.</div>' +
      list.map(r => '<div class="ctx"><b>' + esc(reqTitle(r)) + '</b>' + (r.reason ? '<br><span style="color:#667">' + esc(r.reason) + '</span>' : '') +
        '<div class="row" style="margin-top:8px"><button class="p" data-eg-open="' + esc(r.id) + '">Edit now</button></div></div>').join("") +
      '<div class="row"><button id="eg-appr-close">Later</button></div></div>';
    modal.style.display = "flex";
    modal.querySelector("#eg-appr-close").onclick = () => { modal.style.display = "none"; };
    modal.querySelectorAll("[data-eg-open]").forEach(b => b.onclick = () => {
      const r = list.filter(x => x.id === b.getAttribute("data-eg-open"))[0]; if (!r) return;
      modal.style.display = "none";
      let ok = false; try { ok = G.openFn && G.openFn(r); } catch (e) { console.error(e); }
      if (ok === false) alert("Please open this entry from its page and correct it. If the entry cannot be edited there, ask the administrator to correct it.");
    });
  }
  // for custom edit screens (QA Process): the approval is used up after the corrected entry was saved
  async function useRequest(r) {
    if (!r || isAdmin()) return;
    try { await call({ action: "useEditRequest", id: r.id }); } catch (e) {}
    Object.keys(G.map).forEach(k => { if (G.map[k] && G.map[k].id === r.id) delete G.map[k]; });
    notifyApproved(false); if (G.cb) G.cb();
  }

  window.TCEG = {
    fixButton: fixButton, openFix: openFix,
    init: function (moduleKey, onChange, openFn) { G.module = moduleKey; G.cb = onChange || null; G.openFn = openFn || null; refresh(); },
    useRequest: useRequest, showApproved: showApproved,
    setAdmin: function (editFn, delFn) { G.adminEdit = editFn; G.adminDel = delFn; },
    isAdmin: isAdmin, status: status, canEdit: canEdit, request: request, consume: consume, requestButton: requestButton, refresh: refresh
  };
  window.addEventListener("focus", refresh);
  window.addEventListener("tc-module-session", function () { refresh(); if (G.cb) G.cb(); });
  setInterval(function () { if (!isAdmin()) refresh(); }, 60000);
})();
