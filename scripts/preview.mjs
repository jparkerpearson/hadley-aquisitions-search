import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { getMountainVideo } from "./mountain-media.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const types = {
  ".html": "text/html; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  let requestPath;
  try { requestPath = new URL(req.url, "http://preview").pathname; }
  catch {
    res.writeHead(400);
    res.end("Invalid URL");
    return;
  }
  if (requestPath === "/api/contact") {
    res.writeHead(410, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "The contact form has been replaced. Please email info@gethadley.com." }));
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" });
    res.end("Method not allowed");
    return;
  }

  try {
    const pathname = decodeURIComponent(requestPath);
    const filename = pathname === "/" ? "index.html" : pathname.slice(1);
    const extension = extname(filename);
    // Root pages/images and public assets only; never source or configuration.
    const rootFile = /^[a-zA-Z0-9_-]+\.(html|png)$/.test(filename);
    const publicAsset = /^assets\/[a-zA-Z0-9_-]+\.(png|webp|jpg|svg|css|js|mp3|wav|ogg|m4a)$/.test(filename);
    const publicMountain = filename === "media/mountain-hero.mp4" || filename === "media/mountain-hero.webm";
    if ((!rootFile && !publicAsset && !publicMountain) || !types[extension]) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const file = publicMountain ? await getMountainVideo(extension.slice(1)) : await realpath(resolve(root, filename));
    const allowedRoot = publicAsset ? resolve(root, "assets") + sep : root + sep;
    if (!publicMountain && !file.startsWith(allowedRoot)) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const info = await stat(file);
    if (!info.isFile()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    let start = 0;
    let end = info.size - 1;
    let status = 200;
    const headers = {
      "Content-Type": types[extension],
      "Content-Length": info.size,
      "Accept-Ranges": "bytes",
    };
    // Native media players use byte ranges to seek without reloading a clip.
    if (req.headers.range && req.method === "GET") {
      const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      const suffix = match && !match[1] && match[2];
      start = suffix ? Math.max(0, info.size - Number(match[2])) : Number(match?.[1] || 0);
      end = suffix || !match?.[2] ? info.size - 1 : Math.min(Number(match[2]), info.size - 1);
      if (!match || (!match[1] && !match[2]) || start > end || start >= info.size || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
        res.writeHead(416, { "Content-Range": `bytes */${info.size}` });
        res.end();
        return;
      }
      status = 206;
      headers["Content-Length"] = end - start + 1;
      headers["Content-Range"] = `bytes ${start}-${end}/${info.size}`;
    }
    res.writeHead(status, headers);
    if (req.method === "HEAD" || info.size === 0) {
      res.end();
      return;
    }
    const stream = createReadStream(file, { start, end });
    stream.on("error", (error) => {
      console.error(error);
      res.destroy();
    });
    res.on("close", () => stream.destroy());
    stream.pipe(res);
  } catch (error) {
    const status = error.code === "ENOENT" ? 404 : error instanceof URIError ? 400 : 500;
    if (status === 500) console.error(error);
    res.writeHead(status);
    res.end(status === 404 ? "Not found" : status === 400 ? "Invalid URL" : "Server error");
  }
}).listen(5000, "0.0.0.0", () => {
  console.log("Website preview listening on port 5000");
});
