import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const source = await readFile(new URL("../assets/backend.js", import.meta.url), "utf8");
for (const origin of ["https://gethadley.com", "https://www.gethadley.com", "https://preview.replit.dev", "https://hadley-aquisitions-search.replit.app"]) {
  const window = { location: { origin } };
  runInNewContext(source, { window, URL });
  for (const path of ["/media/mountain-hero.mp4?clip=uploaded-rotation", "/media/mountain-hero.webm?clip=uploaded-rotation", "/api/contact"]) {
    const expected = origin.includes("gethadley.com")
      ? `https://hadley-aquisitions-search.replit.app${path}` : path;
    assert.equal(window.HadleyBackend.url(path), expected);
  }
}
for (const page of ["index.html", "contact.html"]) {
  const html = await readFile(new URL(`../${page}`, import.meta.url), "utf8");
  assert.ok(html.indexOf('src="assets/backend.js"') < html.indexOf('src="assets/site.js"'), "backend configuration loads before consumers");
}
console.log("PASS GitHub video/contact backend URLs, both video formats, and same-origin preview");
