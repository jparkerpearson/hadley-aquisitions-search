// Keep shared role links working while job descriptions are collapsed by default.
(() => {
  const legacyAnchors = { "head-of-origination": "origination-lead" };
  const openLinkedRole = () => {
    let roleId = location.hash.slice(1);
    if (Object.hasOwn(legacyAnchors, roleId)) {
      roleId = legacyAnchors[roleId];
      history.replaceState(null, "", `#${roleId}`);
    }
    const target = document.getElementById(roleId);
    if (!(target instanceof HTMLDetailsElement) || !target.classList.contains("role")) return;
    target.open = true;
    requestAnimationFrame(() => target.scrollIntoView({ behavior: "instant", block: "start" }));
  };

  openLinkedRole();
  window.addEventListener("hashchange", openLinkedRole);
})();
