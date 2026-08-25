/* ===========================================================
   TAHER CONSULTING — Per-Module Login Gate
   -----------------------------------------------------------
   Adds a SECOND, independent login screen on top of a module
   page (Audit / QC Inspection / Training), separate from the
   main site login. Each module checks credentials against its
   own tab in the same Google Sheet (see users-backend.gs — the
   "sheet" field in the request picks which tab to check).

   Usage (place near the top of the module's <body>, after the
   existing site-wide guard-bar script):

     <script src="js/module-auth.js"></script>
     <script>
       tcInitModuleAuth({
         moduleKey: "audit",           // used for the session storage key
         sheetName: "AuditUsers",      // tab name in the Google Sheet
         displayLabel: "Daily QMS Floor Audit"
       });
     </script>

   Session is stored in sessionStorage (clears when the tab is
   closed, same as the site-wide session), under the key
   "tc_module_<moduleKey>", separately from the main site login.

   After a successful login (or Guest), window.TC_IS_GUEST and
   window.TC_MODULE_SESSION are set, and a small "MODULE LOGOUT"
   control is added into the existing #tc-guard-bar if present.
   =========================================================== */

const MODULE_AUTH_API_URL = "https://script.google.com/macros/s/AKfycbwUHhuey3xss614nJPgXQwl449URBPX-SRgldd28JWLFrFSkRcJreYqDDK_hbIpr3Qi/exec";

function tcInitModuleAuth(opts) {
  const sessionKey = "tc_module_" + opts.moduleKey;
  window.TC_IS_GUEST = false;
  window.TC_MODULE_SESSION = null;

  function getModuleSession() {
    const raw = sessionStorage.getItem(sessionKey);
    return raw ? JSON.parse(raw) : null;
  }

  function injectStyles() {
    if (document.getElementById("tc-module-auth-style")) return;
    const style = document.createElement("style");
    style.id = "tc-module-auth-style";
    style.textContent = `
      #tc-module-overlay{position:fixed;inset:0;background:#1B211D;z-index:99999;display:flex;align-items:center;justify-content:center;font-family:'IBM Plex Mono',monospace,'Courier New',monospace;}
      #tc-module-overlay .tc-card{background:#FBFAF6;border:1.5px solid #1B211D;border-radius:5px;padding:36px 34px;width:100%;max-width:380px;box-sizing:border-box;}
      #tc-module-overlay h1{font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;color:#1B211D;margin:0 0 6px;}
      #tc-module-overlay p.sub{font-size:12.5px;color:#4B5650;margin:0 0 22px;line-height:1.5;}
      #tc-module-overlay label{display:block;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:#4B5650;margin-bottom:6px;}
      #tc-module-overlay input{width:100%;padding:11px 13px;border:1.5px solid #BFBBA8;border-radius:2px;background:#F1F0EA;font-size:14px;color:#1B211D;box-sizing:border-box;margin-bottom:16px;font-family:inherit;}
      #tc-module-overlay input:focus{outline:none;border-color:#2F6E52;}
      #tc-module-overlay .tc-err{display:none;background:#F4E4DE;color:#B84226;border:1px solid #B84226;padding:10px 12px;border-radius:2px;font-size:12px;margin-bottom:16px;}
      #tc-module-overlay button{width:100%;padding:13px;border:none;border-radius:2px;font-size:12.5px;letter-spacing:.04em;text-transform:uppercase;cursor:pointer;font-family:inherit;}
      #tc-module-overlay .tc-signin{background:#1B211D;color:#F1F0EA;margin-bottom:10px;}
      #tc-module-overlay .tc-signin:disabled{opacity:.6;cursor:default;}
      #tc-module-overlay .tc-guest{background:transparent;border:1.5px solid #1B211D;color:#1B211D;}
    `;
    document.head.appendChild(style);
  }

  function showOverlay() {
    injectStyles();
    const el = document.createElement("div");
    el.id = "tc-module-overlay";
    el.innerHTML = `
      <div class="tc-card">
        <h1>${opts.displayLabel}</h1>
        <p class="sub">This module has its own sign-in, separate from your main site login. Enter the User ID and password issued for ${opts.displayLabel}.</p>
        <div class="tc-err" id="tc-module-err"></div>
        <label>User ID</label>
        <input type="text" id="tc-module-userid" autocomplete="off">
        <label>Password</label>
        <input type="password" id="tc-module-password" autocomplete="off">
        <button class="tc-signin" id="tc-module-signin">Sign In →</button>
        <button class="tc-guest" id="tc-module-guest">Continue as Guest (View Only)</button>
      </div>
    `;
    document.body.appendChild(el);

    document.getElementById("tc-module-signin").addEventListener("click", doLogin);
    document.getElementById("tc-module-password").addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); });
    document.getElementById("tc-module-guest").addEventListener("click", () => {
      applySession({ name: "Guest", role: "guest" });
    });
  }

  function hideOverlay() {
    const el = document.getElementById("tc-module-overlay");
    if (el) el.remove();
  }

  async function doLogin() {
    const userId = document.getElementById("tc-module-userid").value;
    const password = document.getElementById("tc-module-password").value;
    const errBox = document.getElementById("tc-module-err");
    const btn = document.getElementById("tc-module-signin");

    errBox.style.display = "none";
    btn.disabled = true;
    btn.textContent = "Checking…";

    try {
      const res = await fetch(MODULE_AUTH_API_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "login", userId, password, sheet: opts.sheetName }),
      });
      const data = await res.json();
      if (!data.ok) {
        errBox.textContent = data.error || "Incorrect User ID or password.";
        errBox.style.display = "block";
        btn.disabled = false;
        btn.textContent = "Sign In →";
        return;
      }
      applySession({ name: data.name, role: data.role });
    } catch (err) {
      errBox.textContent = "Could not reach the login server. Check your connection and try again.";
      errBox.style.display = "block";
      btn.disabled = false;
      btn.textContent = "Sign In →";
    }
  }

  function applySession(session) {
    sessionStorage.setItem(sessionKey, JSON.stringify(session));
    window.TC_MODULE_SESSION = session;
    window.TC_IS_GUEST = window.TC_IS_GUEST || /guest|visitor/i.test(session.role || "");
    hideOverlay();
    addLogoutControl(session);
  }

  function addLogoutControl(session) {
    const bar = document.getElementById("tc-guard-bar");
    if (!bar || document.getElementById("tc-module-logout")) return;
    const wrap = document.createElement("span");
    wrap.style.marginLeft = "14px";
    wrap.innerHTML = `<span style="color:#A9832F">${session.name}</span> <button id="tc-module-logout" style="font-family:inherit;font-size:11px;background:none;border:1px solid #F1F0EA;color:#F1F0EA;padding:4px 10px;border-radius:2px;margin-left:8px;cursor:pointer;">MODULE LOGOUT</button>`;
    bar.appendChild(wrap);
    document.getElementById("tc-module-logout").addEventListener("click", () => {
      sessionStorage.removeItem(sessionKey);
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
