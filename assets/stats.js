(() => {
  const counters = [...document.querySelectorAll("[data-count-to]")].map((element) => ({
    element,
    target: Number(element.dataset.countTo),
    prefix: element.dataset.countPrefix || "",
    suffix: element.dataset.countSuffix || "",
    finalText: element.textContent,
    frame: null,
    started: false,
  }));
  if (!counters.length) return;

  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const integerFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  const decimalFormat = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const duration = 1600;

  const finish = (counter) => {
    if (counter.frame !== null) window.cancelAnimationFrame(counter.frame);
    counter.frame = null;
    counter.started = true;
    counter.element.textContent = counter.finalText;
    counter.element.dataset.counterState = "complete";
  };

  // Keep the real figures in HTML for no-JS, assistive technology, and reduced motion.
  if (motion.matches || !("IntersectionObserver" in window)) {
    counters.forEach(finish);
    return;
  }

  const animate = (counter) => {
    if (counter.started) return;
    counter.started = true;
    counter.element.dataset.counterState = "running";
    counter.element.textContent = `${counter.prefix}${counter.target < 10 ? "0.0" : "0"}${counter.suffix}`;
    const start = performance.now();

    const tick = (now) => {
      const progress = Math.min(1, Math.max(0, (now - start) / duration));
      if (progress === 1 || motion.matches) {
        finish(counter);
        return;
      }
      const value = counter.target * (1 - (1 - progress) ** 3);
      // Fractional billions let the $1B figure visibly count up, too.
      const number = counter.target < 10
        ? decimalFormat.format(Math.floor(value * 10) / 10)
        : integerFormat.format(Math.floor(value));
      counter.element.textContent = `${counter.prefix}${number}${counter.suffix}`;
      counter.frame = window.requestAnimationFrame(tick);
    };
    counter.frame = window.requestAnimationFrame(tick);
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const counter = counters.find((item) => item.element.closest("li") === entry.target);
      if (counter) animate(counter);
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.35, rootMargin: "0px 0px -48px 0px" });
  counters.forEach((counter) => observer.observe(counter.element.closest("li")));

  motion.addEventListener("change", () => {
    if (!motion.matches) return;
    observer.disconnect();
    counters.forEach(finish);
  });
})();
