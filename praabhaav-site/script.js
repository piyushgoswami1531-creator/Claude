// Praabhaav site: mobile menu, scroll reveal, contact form role toggle.
document.documentElement.classList.add("js");

const menuBtn = document.querySelector(".menu-btn");
const menu = document.getElementById("menu");
menuBtn.addEventListener("click", () => {
  const open = menu.classList.toggle("open");
  menuBtn.setAttribute("aria-expanded", String(open));
  menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
});
menu.addEventListener("click", (e) => {
  if (e.target.closest("a")) {
    menu.classList.remove("open");
    menuBtn.setAttribute("aria-expanded", "false");
    menuBtn.setAttribute("aria-label", "Open menu");
  }
});

// Fade sections in as they scroll into view.
const items = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        io.unobserve(entry.target);
      }
    }
  }, { threshold: 0.12 });
  items.forEach((el) => io.observe(el));
} else {
  items.forEach((el) => el.classList.add("in"));
}

// Contact form: show client or creator fields.
const form = document.querySelector("form[name=contact]");
const clientFields = form.querySelector(".for-client");
const creatorFields = form.querySelector(".for-creator");
function setRole(isCreator) {
  form.querySelector(`input[name=role][value="${isCreator ? "Creator" : "Artist / label / agency"}"]`).checked = true;
  clientFields.hidden = isCreator;
  creatorFields.hidden = !isCreator;
}
form.addEventListener("change", (e) => {
  if (e.target.name === "role") setRole(e.target.value === "Creator");
});
// "Work with us" in the creators section preselects the creator form.
document.querySelectorAll('a[data-role="creator"]').forEach((a) =>
  a.addEventListener("click", () => setRole(true)));

document.getElementById("year").textContent = new Date().getFullYear();
