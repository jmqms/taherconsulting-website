document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.querySelector(".menu-toggle");
  const nav = document.querySelector("nav.main");
  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const isOpen = nav.style.display === "flex";
      nav.style.display = isOpen ? "none" : "flex";
      nav.style.flexDirection = "column";
      nav.style.position = "absolute";
      nav.style.top = "68px";
      nav.style.left = "0";
      nav.style.right = "0";
      nav.style.background = "var(--paper)";
      nav.style.borderBottom = "1px solid var(--line-strong)";
      nav.style.padding = "8px 20px 16px";
      toggle.textContent = isOpen ? "☰" : "✕";
    });
  }

  const contactForm = document.getElementById("contactForm");
  if (contactForm) {
    contactForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const msg = document.getElementById("contactMsg");
      msg.textContent = "Thank you — your message has been noted. We'll get back to you within 1–2 business days.";
      msg.className = "form-msg ok show";
      contactForm.reset();
    });
  }
});
