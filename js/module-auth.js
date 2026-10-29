/* ===========================================================
   TAHER CONSULTING — Per-Module Login Gate
   -----------------------------------------------------------
   Adds a SECOND, independent login screen on top of a module
   page, separate from the main site login. Each module checks
   credentials against its own tab in the User_Management Google
   Sheet (see users-backend.gs). Every tab uses the same columns:
        UserID | Password | Name | Designation

   Usage (place at the end of the module's <body>):

     <script src="js/module-auth.js"><\/script>
     <script>
       tcInitModuleAuth({
         moduleKey: "qa",              // session storage key suffix
         sheetName: "QAUsers",         // tab name in the Google Sheet
         displayLabel: "QA Process",
         theme: { icon: "📋", accent: "#2F6E52", iconBg: "#E5F0E9", bg: "#0F1F18" }
       });
     </script>

   Session lives in sessionStorage under "tc_module_<moduleKey>"
   ({name, designation, role}). After login (or Guest),
   window.TC_IS_GUEST / window.TC_MODULE_SESSION are set and a
   MODULE LOGOUT control is added to #tc-guard-bar if present.
   =========================================================== */

// Login server (users-backend.gs deployment). If it cannot be reached, the request is retried
// a few times; a real "wrong password" answer is final.
const MODULE_AUTH_API_URLS = [
  "https://script.google.com/macros/s/AKfycbx7Cwnp8hoKuxcQ57TlllwBaA7zr9S2bcFVi9-mzyyY8RhRL3YiUpbJMFohLmQZkf1a/exec"
];

function tcInitModuleAuth(opts) {
  const sessionKey = "tc_module_" + opts.moduleKey;
  window.TC_IS_GUEST = false;
  window.TC_MODULE_SESSION = null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function getModuleSession() {
    try {
      const raw = sessionStorage.getItem(sessionKey);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function injectStyles() {
    if (document.getElementById("tc-module-auth-style")) return;
    const style = document.createElement("style");
    style.id = "tc-module-auth-style";
    style.textContent = `
      #tc-module-overlay{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;overflow-y:auto;font-family:'Segoe UI',system-ui,-apple-system,'Helvetica Neue',Arial,sans-serif;}
      #tc-module-overlay *{box-sizing:border-box;}
      #tc-module-overlay .tc-card{background:#fff;border-radius:18px;padding:34px 32px 28px;width:100%;max-width:420px;position:relative;box-shadow:0 24px 60px rgba(0,0,0,.35);}
      #tc-module-overlay .tc-tag{position:absolute;top:16px;right:20px;font-size:10.5px;letter-spacing:.09em;color:#8a8f98;text-transform:uppercase;font-weight:600;}
      #tc-module-overlay .tc-icon{width:54px;height:54px;border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:26px;margin-bottom:16px;}
      #tc-module-overlay h1{font-size:23px;font-weight:700;color:#1a1d21;margin:0 0 6px;letter-spacing:-.01em;}
      #tc-module-overlay p.sub{font-size:13.5px;color:#5f6670;margin:0 0 22px;line-height:1.55;}
      #tc-module-overlay label{display:block;font-size:14px;font-weight:600;color:#1a1d21;margin-bottom:8px;}
      #tc-module-overlay .tc-field{position:relative;margin-bottom:20px;}
      #tc-module-overlay input{width:100%;height:50px;padding:0 16px;border:1.5px solid #d9dbe3;border-radius:14px;background:#fff;font-size:16px;color:#1a1d21;font-family:inherit;transition:border-color .15s,box-shadow .15s;}
      #tc-module-overlay input::placeholder{color:#9aa0aa;}
      #tc-module-overlay input:focus{outline:none;border-color:var(--tc-accent,#1B211D);box-shadow:0 0 0 3px color-mix(in srgb,var(--tc-accent,#1B211D) 18%,transparent);}
      #tc-module-overlay .tc-field.has-toggle input{padding-right:78px;}
      #tc-module-overlay .tc-toggle{position:absolute;right:6px;top:50%;transform:translateY(-50%);width:auto;height:auto;background:none;border:none;color:#5f6670;font-size:12.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:8px 10px;cursor:pointer;border-radius:8px;font-family:inherit;}
      #tc-module-overlay .tc-toggle:hover{color:var(--tc-accent,#1B211D);background:#f2f3f6;}
      #tc-module-overlay .tc-err{display:none;background:#fdecea;color:#b3261e;border:1px solid #f3b8b3;padding:10px 12px;border-radius:10px;font-size:13px;margin-bottom:16px;line-height:1.45;}
      #tc-module-overlay .tc-btn{width:100%;height:50px;border:none;border-radius:14px;font-size:14px;font-weight:700;letter-spacing:.03em;cursor:pointer;font-family:inherit;}
      #tc-module-overlay .tc-signin{background:var(--tc-accent,#1B211D);color:#fff;margin-bottom:10px;}
      #tc-module-overlay .tc-signin:hover{filter:brightness(1.1);}
      #tc-module-overlay .tc-signin:disabled{opacity:.6;cursor:default;}
      #tc-module-overlay .tc-guest{background:#fff;border:1.5px solid #d9dbe3;color:#3a4048;}
      #tc-module-overlay .tc-guest:hover{background:#f6f7f9;}
      #tc-module-overlay .tc-foot{margin-top:16px;font-size:12px;color:#8a8f98;text-align:center;line-height:1.5;}
    `;
    document.head.appendChild(style);
  }

  function showOverlay() {
    injectStyles();
    const allowGuest = opts.allowGuest !== false;
    const theme = opts.theme || { icon: "🔒", accent: "#1B211D", iconBg: "#F1F0EA", bg: "#1B211D" };
    const el = document.createElement("div");
    el.id = "tc-module-overlay";
    el.style.background = theme.bg;
    el.innerHTML = `
      <form class="tc-card" id="tc-module-form" style="--tc-accent:${esc(theme.accent)}" autocomplete="off" novalidate>
        <span class="tc-tag">Taher Consulting</span>
        <div class="tc-icon" style="background:${esc(theme.iconBg)};color:${esc(theme.accent)}">${theme.icon}</div>
        <h1>${esc(opts.displayLabel)}</h1>
        <p class="sub">This module has its own sign-in, separate from your main site login. Enter the User ID and password issued for ${esc(opts.displayLabel)}.</p>
        <div class="tc-err" id="tc-module-err" role="alert"></div>
        <div class="tc-field">
          <label for="tc-module-userid">User ID</label>
          <input type="text" id="tc-module-userid" placeholder="Enter ID" autocomplete="off" autocapitalize="off" spellcheck="false">
        </div>
        <div class="tc-field has-toggle">
          <label for="tc-module-password">Password</label>
          <input type="password" id="tc-module-password" placeholder="Enter password" autocomplete="off">
          <button type="button" class="tc-toggle" id="tc-module-pw-toggle" aria-label="Show password" aria-pressed="false">Show</button>
        </div>
        <button type="submit" class="tc-btn tc-signin" id="tc-module-signin">Sign In →</button>
        ${allowGuest ? '<button type="button" class="tc-btn tc-guest" id="tc-module-guest">Continue as Guest (View Only)</button>' : ''}
        <div class="tc-foot">Forgot your password? Ask your administrator.</div>
      </form>
    `;
    document.body.appendChild(el);

    // The toggle sits inside the password field; align it with the input, not the label.
    const toggle = document.getElementById("tc-module-pw-toggle");
    const pwEl = document.getElementById("tc-module-password");
    toggle.style.top = "auto";
    toggle.style.bottom = "6px";
    toggle.style.transform = "none";

    document.getElementById("tc-module-form").addEventListener("submit", e => { e.preventDefault(); doLogin(); });
    toggle.addEventListener("click", () => {
      const showing = pwEl.type === "text";
      pwEl.type = showing ? "password" : "text";
      toggle.textContent = showing ? "Show" : "Hide";
      toggle.setAttribute("aria-label", showing ? "Show password" : "Hide password");
      toggle.setAttribute("aria-pressed", showing ? "false" : "true");
      pwEl.focus();
    });
    if (allowGuest) {
      document.getElementById("tc-module-guest").addEventListener("click", async () => {
        // logs the guest visit and gets a view-only token (the server refuses every write for it)
        let token = "";
        try {
          const r = await fetch(MODULE_AUTH_API_URLS[0], { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ action: "logGuest", sheet: opts.sheetName, ua: navigator.userAgent }) });
          const d = JSON.parse(await r.text());
          if (d && d.token) token = d.token;
        } catch (e) {}
        applySession({ name: "Guest", designation: "Guest", role: "guest", token: token });
      });
    }
    setTimeout(() => { const u = document.getElementById("tc-module-userid"); if (u) u.focus(); }, 50);
  }

  function hideOverlay() {
    const el = document.getElementById("tc-module-overlay");
    if (el) el.remove();
  }

  // Ask one login server. Returns the parsed JSON, or null if the server could
  // not be reached / did not answer with JSON (after a few tries).
  async function askServer(url, payload, btn) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (attempt > 1 && btn) btn.textContent = "Checking… (retry " + attempt + ")";
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);
        let res;
        try {
          res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload),
            signal: controller.signal
          });
        } finally {
          clearTimeout(timeoutId);
        }
        const rawText = await res.text();
        try { return JSON.parse(rawText); }
        catch (parseErr) { throw new Error("non_json_response: " + rawText.slice(0, 200)); }
      } catch (err) {
        console.error("[module-auth] attempt " + attempt + " failed:", err);
        if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 900));
      }
    }
    return null;
  }

  async function doLogin() {
    const userId = document.getElementById("tc-module-userid").value;
    const password = document.getElementById("tc-module-password").value;
    const errBox = document.getElementById("tc-module-err");
    const btn = document.getElementById("tc-module-signin");

    function fail(msg) {
      errBox.textContent = msg;
      errBox.style.display = "block";
      btn.disabled = false;
      btn.textContent = "Sign In →";
    }

    errBox.style.display = "none";
    if (!String(userId).trim() || !password) { fail("Please enter both User ID and password."); return; }
    btn.disabled = true;
    btn.textContent = "Checking…";

    const payload = { action: "login", userId, password, sheet: opts.sheetName, ua: navigator.userAgent };
    let data = null;
    for (const url of MODULE_AUTH_API_URLS) {
      data = await askServer(url, payload, btn);
      if (data) break;
    }

    if (!data) { fail("Could not reach the login server after several tries. Check your connection and try again."); return; }
    if (!data.ok) { fail(data.error || "Incorrect User ID or password."); return; }
    applySession({
      name: data.name,
      designation: data.designation || data.role || "",
      role: data.role || data.designation || "",
      token: data.token || ""
    });
  }

  function applySession(session) {
    try { sessionStorage.setItem(sessionKey, JSON.stringify(session)); } catch (e) {}
    window.TC_MODULE_SESSION = session;
    try { window.dispatchEvent(new Event("tc-module-session")); } catch (e) {}
    window.TC_IS_GUEST = window.TC_IS_GUEST || /guest|visitor/i.test((session.role || "") + " " + (session.designation || ""));
    hideOverlay();
    addLogoutControl(session);
  }

  function addLogoutControl(session) {
    const bar = document.getElementById("tc-guard-bar");
    if (!bar || document.getElementById("tc-module-logout")) return;
    const wrap = document.createElement("span");
    wrap.style.marginLeft = "14px";
    const who = esc(session.name);
    wrap.innerHTML = `<span style="color:#A9832F">${who}</span> <button id="tc-module-logout" style="font-family:inherit;font-size:11px;background:none;border:1px solid #F1F0EA;color:#F1F0EA;padding:4px 10px;border-radius:2px;margin-left:8px;cursor:pointer;">MODULE LOGOUT</button>`;
    bar.appendChild(wrap);
    document.getElementById("tc-module-logout").addEventListener("click", () => {
      try { sessionStorage.removeItem(sessionKey); } catch (e) {}
      window.location.reload();
    });
  }

  const existing = getModuleSession();
  if (existing) {
    applySession(existing);
  } else {
    showOverlay();
  }
}
