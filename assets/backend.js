(() => {
  // GitHub Pages now serves media directly. Keep the legacy API helper separate
  // from the current contact form's Google Cloud endpoint.
  const origin = "https://hadley-aquisitions-search.replit.app";
  const githubWebsite = ["https://gethadley.com", "https://www.gethadley.com"].includes(window.location.origin);
  window.HadleyBackend = Object.freeze({
    url: (path) => githubWebsite && path === "/api/contact" ? new URL(path, origin).href : path,
  });
})();
