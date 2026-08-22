/* ===========================================================
   TAHER CONSULTING — Authentication
   -----------------------------------------------------------
   User ID / password checks are sent to a Google Apps Script
   backend, which reads them from a "Users" tab in a Google
   Sheet. To add, remove, or change a login, just edit that
   Sheet — no code changes or re-upload needed for user changes.

   See users-backend.gs for the one-time setup instructions.
   =========================================================== */

const USERS_API_URL = "https://script.google.com/macros/s/AKfycbwUHhuey3xss614nJPgXQwl449URBPX-SRgldd28JWLFrFSkRcJreYqDDK_hbIpr3Qi/exec";

async function handleLogin(event) {
  event.preventDefault();
  const idInput = document.getElementById("userId");
  const pwInput = document.getElementById("password");
  const msg = document.getElementById("loginMsg");
  const remember = document.getElementById("rememberMe").checked;
  const submitBtn = event.target.querySelector('button[type="submit"]');

  if (USERS_API_URL.indexOf("PASTE_YOUR") === 0) {
    msg.textContent = "Login backend not connected yet — see users-backend.gs for setup steps.";
    msg.className = "form-msg err show";
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Checking…";
  msg.className = "form-msg";

  try {
    const res = await fetch(USERS_API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "login",
        userId: idInput.value,
        password: pwInput.value,
      }),
    });
    const data = await res.json();

    if (!data.ok) {
      msg.textContent = data.error || "Incorrect user ID or password. Please try again.";
      msg.className = "form-msg err show";
      submitBtn.disabled = false;
      submitBtn.textContent = "Sign In →";
      return;
    }

    const session = { name: data.name, role: data.role, loggedInAt: Date.now() };
    const store = remember ? localStorage : sessionStorage;
    store.setItem("tc_session", JSON.stringify(session));

    msg.textContent = "Login successful — redirecting…";
    msg.className = "form-msg ok show";

    setTimeout(() => { window.location.href = "dashboard.html"; }, 400);
  } catch (err) {
    msg.textContent = "Could not reach the login server. Check your internet connection and try again.";
    msg.className = "form-msg err show";
    submitBtn.disabled = false;
    submitBtn.textContent = "Sign In →";
  }
}

function getSession() {
  const raw = localStorage.getItem("tc_session") || sessionStorage.getItem("tc_session");
  return raw ? JSON.parse(raw) : null;
}

function requireLogin() {
  const session = getSession();
  if (!session) {
    window.location.href = "login.html";
    return null;
  }
  return session;
}

function logout() {
  localStorage.removeItem("tc_session");
  sessionStorage.removeItem("tc_session");
  window.location.href = "login.html";
}
