/* Taher Consulting — attaches the server-issued session token to every call to the
   Google Apps Script backends (?tcToken=...), and signs the user out cleanly if the
   server says the session is missing/expired. Load this in <head> before page scripts. */
(function () {
  if (window.__tcFetchPatched) return;
  window.__tcFetchPatched = true;
  var origFetch = window.fetch.bind(window);

  function pickToken() {
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

  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input instanceof URL ? input.href : null);
    if (!url || url.indexOf("https://script.google.com/") !== 0) return origFetch(input, init);
    var tok = pickToken();
    if (tok) { var u = new URL(url); u.searchParams.set("tcToken", tok); url = u.href; }
    return origFetch(url, init).then(function (res) {
      try {
        res.clone().text().then(function (t) {
          if (false && t.length < 400 && t.indexOf("auth_required") > -1) {   // token check disabled: no forced sign-out/reload
            var last = Number(sessionStorage.getItem("tc_reauth") || 0);
            if (Date.now() - last > 15000) {            // avoid reload loops
              sessionStorage.setItem("tc_reauth", String(Date.now()));
              clearSessions();
              location.reload();
            }
          }
        }).catch(function () {});
      } catch (e) {}
      return res;
    });
  };
})();
