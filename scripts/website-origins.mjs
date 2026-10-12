// Only the GitHub Pages custom domain may call the Replit backend cross-origin.
export const websiteOrigins = new Set([
  "https://gethadley.com",
  "https://www.gethadley.com",
]);

export function allowWebsiteCors(req, res, methods) {
  res.setHeader("Vary", "Origin");
  const origin = req.headers.origin;
  if (!websiteOrigins.has(origin)) return false;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Range");
  res.setHeader("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");
  return true;
}
