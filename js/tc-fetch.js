/* Taher Consulting — attaches the server-issued session token to every call to the
   Google Apps Script backends (?tcToken=...), and signs the user out cleanly if the
   server says the session is missing/expired. Load this in <head> before page scripts. */
(function () {
  if (window.__tcFetchPatched) return;
  window.__tcFetchPatched = true;
  var origFetch = window.fetch.bind(window);

  function pickToken() {
    try { // this page's own module session first (never another module's token)
      if (window.__tcModuleKey) {
        var own = JSON.parse(sessionStorage.getItem("tc_module_" + window.__tcModuleKey));
        if (own && own.token) return own.token;
      }
    } catch (e) {}
    try { // a module's own session first (so a Guest module session stays read-only on the server)
      for (var i = 0; i < sessionStorage.length; i++) {
        var k = sessionStorage.key(i);
        if (k && k.indexOf("tc_module_") === 0) {
          var m = JSON.parse(sessionStorage.getItem(k));
          if (m && m.token) return m.token;
        }
      }
    } catch (e) {}
    try {
      var raw = localStorage.getItem("tc_session") || sessionStorage.getItem("tc_session");
      var s = raw && JSON.parse(raw);
      if (s && s.token) return s.token;
    } catch (e) {}
    return "";
  }

  window.tcPickToken = pickToken;

  function clearSessions() {
    try { localStorage.removeItem("tc_session"); } catch (e) {}
    try {
      sessionStorage.removeItem("tc_session");
      for (var i = sessionStorage.length - 1; i >= 0; i--) {
        var k = sessionStorage.key(i);
        if (k && k.indexOf("tc_module_") === 0) sessionStorage.removeItem(k);
      }
    } catch (e) {}
  }

  function clearModuleSessions() {
    var found = false;
    try {
      for (var i = sessionStorage.length - 1; i >= 0; i--) {
        var k = sessionStorage.key(i);
        if (k && k.indexOf("tc_module_") === 0) { sessionStorage.removeItem(k); found = true; }
      }
    } catch (e) {}
    return found;
  }

  function showBanner() {
    if (document.getElementById("tc-auth-banner") || !document.body) return;
    var d = document.createElement("div");
    d.id = "tc-auth-banner";
    d.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:99999;background:#b3261e;color:#fff;padding:10px 14px;font:13px sans-serif;text-align:center";
    d.textContent = "The server could not verify your login. Please sign out and sign in again. If this keeps happening, tell the administrator (backend not authorized / not deployed).";
    document.body.appendChild(d);
  }

  function onAuthRequired() {
    var last = Number(sessionStorage.getItem("tc_reauth") || 0);
    if (Date.now() - last < 60000) { showBanner(); return; }   // second time within a minute: stop, show message (no loop)
    sessionStorage.setItem("tc_reauth", String(Date.now()));
    // Prefer to drop only the module login so the person stays signed in to the main portal.
    if (!clearModuleSessions()) clearSessions();
    location.reload();
  }

  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input instanceof URL ? input.href : null);
    if (!url || url.indexOf("https://script.google.com/") !== 0) return origFetch(input, init);
    var tok = pickToken();
    if (tok) { var u = new URL(url); u.searchParams.set("tcToken", tok); url = u.href; }
    return origFetch(url, init).then(function (res) {
      try {
        res.clone().text().then(function (t) {
          if (t.length < 400 && t.indexOf("auth_required") > -1) onAuthRequired();
        }).catch(function () {});
      } catch (e) {}
      return res;
    });
  };

  /* ---- Presence: tell the server (users-backend) which page this signed-in tab is on, so an
     administrator can see who is active in which module (Active Status page). ---- */
  var PRESENCE_API = "https://script.google.com/macros/s/AKfycbx7Cwnp8hoKuxcQ57TlllwBaA7zr9S2bcFVi9-mzyyY8RhRL3YiUpbJMFohLmQZkf1a/exec";
  var PAGE_MODULES = {
    "dashboard.html": "Main Portal", "combined-dashboard.html": "Combined Dashboard",
    "audit.html": "Daily QMS Floor Audit", "qc-inspection.html": "QC Inspection", "training.html": "Training and Competency",
    "qa-process.html": "QA Process", "ra-process.html": "Risk Assessment", "document-archive.html": "Document Archive",
    "qa-inspection.html": "QA Inspection", "1st-bundle-inspection.html": "QA Inspection — 1st Bundle",
    "sewing-inline-inspection.html": "QA Inspection — Sewing Inline", "finishing-inline-inspection.html": "QA Inspection — Finishing Inline",
    "1st-carton-inspection.html": "QA Inspection — 1st Carton", "pre-final-inspection.html": "QA Inspection — Pre-Final",
    "final-inspection.html": "QA Inspection — Final", "login-history.html": "Admin pages", "edit-requests.html": "Admin pages", "active-status.html": "Admin pages"
  };
  var tabId = "";
  try { tabId = sessionStorage.getItem("tc_tab") || ""; if (!tabId) { tabId = Math.random().toString(36).slice(2, 10); sessionStorage.setItem("tc_tab", tabId); } } catch (e) { tabId = "t" + Math.random().toString(36).slice(2, 8); }
  var pageFile = (location.pathname.split("/").pop() || "index.html").toLowerCase();

  function presencePayload(action) {
    var tok = pickToken();
    if (!tok) return null;
    return JSON.stringify({ action: action, __token: tok, tab: tabId, page: pageFile, module: PAGE_MODULES[pageFile] || (document.title || pageFile).slice(0, 50) });
  }
  function beat() {
    if (document.visibilityState === "hidden") return;      // background tab = not active
    var body = presencePayload("heartbeat");
    if (!body) return;
    try { origFetch(PRESENCE_API, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: body, keepalive: true }).catch(function () {}); } catch (e) {}
  }
  function leave() {
    var body = presencePayload("leave");
    if (!body) return;
    try { if (navigator.sendBeacon) navigator.sendBeacon(PRESENCE_API, new Blob([body], { type: "text/plain;charset=utf-8" })); } catch (e) {}
  }
  setTimeout(beat, 1500);
  setInterval(beat, 45000);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") beat(); });
  window.addEventListener("pagehide", leave);
})();
