import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const types = {
  ".html": "text/html; charset=utf-8",
  ".png": "image/png",
};

createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" });
    res.end("Method not allowed");
    return;
  }

  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://preview").pathname);
    const filename = pathname === "/" ? "index.html" : pathname.slice(1);
    const extension = filename.slice(filename.lastIndexOf("."));
    // Serve only the site's root HTML and images, never repository internals.
    if (!/^[a-zA-Z0-9_-]+\.(html|png)$/.test(filename) || !types[extension]) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const content = await readFile(resolve(root, filename));
    res.writeHead(200, {
      "Content-Type": types[extension],
      "Content-Length": content.length,
    });
    res.end(req.method === "HEAD" ? undefined : content);
  } catch (error) {
    const status = error.code === "ENOENT" ? 404 : error instanceof URIError ? 400 : 500;
    if (status === 500) console.error(error);
    res.writeHead(status);
    res.end(status === 404 ? "Not found" : status === 400 ? "Invalid URL" : "Server error");
  }
}).listen(5000, "0.0.0.0", () => {
  console.log("Website preview listening on port 5000");
});
