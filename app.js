// Nav state, reveal-on-scroll and small helpers for the landing page.

const nav = document.getElementById("nav");
const navLinks = document.getElementById("navLinks");
const navToggle = document.getElementById("navToggle");

const onScroll = () => {
  nav.classList.toggle("is-scrolled", window.scrollY > 12);
};
onScroll();
window.addEventListener("scroll", onScroll, { passive: true });

navToggle.addEventListener("click", () => {
  const open = navLinks.classList.toggle("is-open");
  navToggle.setAttribute("aria-expanded", String(open));
});

navLinks.addEventListener("click", (event) => {
  if (event.target.closest("a")) {
    navLinks.classList.remove("is-open");
    navToggle.setAttribute("aria-expanded", "false");
  }
});

const revealables = document.querySelectorAll("[data-reveal]");

if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
  );
  revealables.forEach((element) => observer.observe(element));
} else {
  revealables.forEach((element) => element.classList.add("is-in"));
}

const year = document.getElementById("year");
if (year) year.textContent = String(new Date().getFullYear());
