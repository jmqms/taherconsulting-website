/* ===========================================================
   TAHER CONSULTING — Demo Authentication
   -----------------------------------------------------------
   This is a FRONT-END ONLY demo so the login screen is usable
   immediately. It checks against a small hard-coded user list
   stored in this file and remembers the session in the browser
   (localStorage) — nothing is sent to a server.

   IMPORTANT — before real staff/client accounts are used:
   Replace this file's checkCredentials() function with a real
   call to a backend (Google Apps Script + Sheet, or Airtable,
   the same pattern already used for the JM Fabrics QMS portal)
   that verifies a hashed password server-side. Never ship
   plain-text passwords like the demo list below to production.
   =========================================================== */

const DEMO_USERS = [
  { id: "admin",  password: "taher@2026",  name: "Abu Taher",     role: "Administrator" },
  { id: "demo",   password: "demo1234",    name: "Demo User",     role: "Team Member" }
];

function checkCredentials(userId, password) {
  return DEMO_USERS.find(
    (u) => u.id.toLowerCase() === userId.trim().toLowerCase() && u.password === password
  ) || null;
}

function handleLogin(event) {
  event.preventDefault();
  const idInput = document.getElementById("userId");
  const pwInput = document.getElementById("password");
  const msg = document.getElementById("loginMsg");
  const remember = document.getElementById("rememberMe").checked;

  const user = checkCredentials(idInput.value, pwInput.value);

  if (!user) {
    msg.textContent = "Incorrect user ID or password. Please try again.";
    msg.className = "form-msg err show";
    return;
  }

  const session = { name: user.name, role: user.role, loggedInAt: Date.now() };
  const store = remember ? localStorage : sessionStorage;
  store.setItem("tc_session", JSON.stringify(session));

  msg.textContent = "Login successful — redirecting…";
  msg.className = "form-msg ok show";

  setTimeout(() => { window.location.href = "dashboard.html"; }, 500);
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
