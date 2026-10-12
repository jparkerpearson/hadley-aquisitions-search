(() => {
  // The website stays on GitHub Pages; only media and contact use Replit.
  const origin = "https://hadley-aquisitions-search.replit.app";
  const githubWebsite = ["https://gethadley.com", "https://www.gethadley.com"].includes(window.location.origin);
  window.HadleyBackend = Object.freeze({
    url: (path) => githubWebsite ? new URL(path, origin).href : path,
  });
})();
