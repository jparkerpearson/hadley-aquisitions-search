// Graduated from the approved AsymmetricScroll prototype: a centered, layered
// book of offerings, using native horizontal scrolling rather than capturing
// the visitor's vertical wheel. The page remains freely scrollable.
const offeringBook = document.querySelector(".offerings-book");
if (offeringBook) {
  const rail = offeringBook.querySelector(".offerings-rail");
  const pages = Array.from(rail.children);
  const controls = offeringBook.querySelector(".offerings-controls");
  const previous = controls.querySelector(".offering-previous");
  const next = controls.querySelector(".offering-next");
  const status = offeringBook.querySelector(".offering-status");
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let activeIndex = 0;
  let frame = 0;
  let settleTimer = 0;

  const renderActive = (index) => {
    activeIndex = index;
    pages.forEach((page, position) => {
      page.dataset.active = String(position === index);
      page.dataset.distance = String(Math.abs(position - index));
      if (position === index) page.setAttribute("aria-current", "true");
      else page.removeAttribute("aria-current");
    });
    previous.disabled = index === 0;
    next.disabled = index === pages.length - 1;
  };

  const announceActive = () => {
    status.textContent = `${pages[activeIndex].querySelector("h3").textContent}, ${activeIndex + 1} of ${pages.length}`;
  };

  const readActive = () => {
    frame = 0;
    const bounds = rail.getBoundingClientRect();
    const center = bounds.left + bounds.width / 2;
    let closest = 0;
    let distance = Infinity;
    pages.forEach((page, index) => {
      const pageBounds = page.getBoundingClientRect();
      const offset = Math.abs(pageBounds.left + pageBounds.width / 2 - center);
      if (offset < distance) {
        distance = offset;
        closest = index;
      }
    });
    renderActive(closest);
  };

  const moveTo = (index, instant = false) => {
    const target = Math.max(0, Math.min(index, pages.length - 1));
    const bounds = rail.getBoundingClientRect();
    const pageBounds = pages[target].getBoundingClientRect();
    const offset = pageBounds.left + pageBounds.width / 2 - bounds.left - bounds.width / 2;
    rail.scrollTo({
      left: rail.scrollLeft + offset,
      behavior: instant || motion.matches ? "instant" : "smooth",
    });
    if (instant || motion.matches) {
      renderActive(target);
      announceActive();
    }
  };

  rail.addEventListener("scroll", () => {
    if (!frame) frame = requestAnimationFrame(readActive);
    clearTimeout(settleTimer);
    settleTimer = setTimeout(announceActive, 180);
  }, { passive: true });
  previous.addEventListener("click", () => moveTo(activeIndex - 1));
  next.addEventListener("click", () => moveTo(activeIndex + 1));
  rail.addEventListener("keydown", (event) => {
    if (event.target !== rail) return;
    const destinations = {
      ArrowLeft: activeIndex - 1,
      ArrowRight: activeIndex + 1,
      Home: 0,
      End: pages.length - 1,
    };
    if (!(event.key in destinations)) return;
    event.preventDefault();
    moveTo(destinations[event.key]);
  });
  const resize = () => moveTo(activeIndex, true);
  window.addEventListener("resize", resize);
  if ("ResizeObserver" in window) new ResizeObserver(resize).observe(rail);
  const finishMotion = (event) => {
    if (event.matches) moveTo(activeIndex, true);
  };
  if (motion.addEventListener) motion.addEventListener("change", finishMotion);
  else motion.addListener(finishMotion);

  renderActive(0);
  offeringBook.classList.add("is-enhanced");
  controls.hidden = false;
  moveTo(0, true);
}
