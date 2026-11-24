// Word-by-word reveal for [data-split] headings on industry pages.
(() => {
  const headings = document.querySelectorAll("[data-split]");
  if (!headings.length || !("IntersectionObserver" in window)) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  headings.forEach((heading) => {
    heading.setAttribute("aria-label", heading.textContent.replace(/\s+/g, " ").trim());
    let index = 0;
    const parts = [];
    heading.childNodes.forEach((node) => {
      if (node.nodeName === "BR") { parts.push(document.createElement("br")); return; }
      node.textContent.trim().split(/\s+/).filter(Boolean).forEach((word) => {
        const mask = document.createElement("span");
        mask.className = "ind-split-word";
        mask.setAttribute("aria-hidden", "true");
        const inner = document.createElement("span");
        inner.style.setProperty("--w", index++);
        inner.textContent = word;
        mask.append(inner);
        if (parts.length && parts[parts.length - 1].nodeName !== "BR") parts.push(document.createTextNode(" "));
        parts.push(mask);
      });
    });
    heading.replaceChildren(...parts);
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-split-in");
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });
  headings.forEach((heading) => observer.observe(heading));
})();

// Floating "Schedule a call" button: visible only while no in-page booking CTA is on screen.
(() => {
  const fab = document.querySelector("[data-book-fab]");
  const ctas = [...document.querySelectorAll("[data-book-cta]")];
  if (!fab || !ctas.length) return;
  let visible = null;
  let queued = false;
  const update = () => {
    queued = false;
    const height = window.innerHeight;
    const ctaOnScreen = ctas.some((cta) => {
      const box = cta.getBoundingClientRect();
      return box.bottom > 0 && box.top < height;
    });
    const show = !ctaOnScreen;
    if (show === visible) return;
    visible = show;
    fab.classList.toggle("is-visible", show);
    fab.setAttribute("aria-hidden", String(!show));
    fab.tabIndex = show ? 0 : -1;
  };
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(update);
  };
  window.addEventListener("scroll", queue, { passive: true });
  window.addEventListener("resize", queue);
  update();
})();
