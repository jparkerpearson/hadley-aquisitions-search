// Public intake endpoint for careers applications from gethadley.com/careers.
// Validates submissions and writes them to Firestore.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { Firestore } from "@google-cloud/firestore";

const PORT = Number(process.env.PORT) || 8080;
const DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || "hadley-firestore";
const COLLECTION = process.env.FIRESTORE_COLLECTION || "job_application_submissions";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "https://gethadley.com,https://www.gethadley.com")
  .split(",").map((o) => o.trim()).filter(Boolean);

const ROLES = ["Origination Lead", "Founding Applied AI Engineer"];
const MAX_WHY_WORDS = 200;
const MAX_BODY_BYTES = 20_000;

const firestore = new Firestore({ databaseId: DATABASE_ID });

function text(value, maxLength) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  return trimmed;
}

function countWords(value) {
  return value.split(/\s+/).filter(Boolean).length;
}

function normalizeLinkedIn(value) {
  const raw = text(value, 300);
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function validate(body) {
  const errors = {};
  const fullName = text(body.fullName, 200);
  const email = text(body.email, 320);
  const phone = text(body.phone, 40);
  const linkedin = normalizeLinkedIn(body.linkedin);
  const whyHire = text(body.whyHire, 3000);
  const role = ROLES.includes(body.role) ? body.role : null;

  if (!fullName) errors.fullName = "Please enter your name.";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Please enter a valid email.";
  if (!phone || phone.replace(/\D/g, "").length < 7) errors.phone = "Please enter a valid phone number.";
  if (!linkedin) errors.linkedin = "Please enter a LinkedIn profile URL.";
  if (!whyHire) errors.whyHire = "Please tell us why we should hire you.";
  else if (countWords(whyHire) > MAX_WHY_WORDS) errors.whyHire = `Please keep this to ${MAX_WHY_WORDS} words or fewer.`;
  if (!role) errors.role = "Unknown role.";

  return { errors, submission: { role, fullName, email: email?.toLowerCase() ?? null, phone, linkedin, whyHire } };
}

function send(res, status, payload, origin) {
  const headers = { "Content-Type": "application/json" };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  res.writeHead(status, headers);
  res.end(payload === null ? "" : JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("too_large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

createServer(async (req, res) => {
  const origin = req.headers.origin || null;
  const path = new URL(req.url, "http://localhost").pathname;

  if (origin && !ALLOWED_ORIGINS.includes(origin)) return send(res, 403, { error: "Origin not allowed." });

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": origin || "",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    });
    return res.end();
  }

  if (req.method === "GET" && path === "/healthz") return send(res, 200, { ok: true }, origin);
  if (req.method !== "POST" || path !== "/applications") return send(res, 404, { error: "Not found." }, origin);

  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (err) {
    const status = err.message === "too_large" ? 413 : 400;
    return send(res, status, { error: "Invalid request body." }, origin);
  }
  if (!body || typeof body !== "object") return send(res, 400, { error: "Invalid request body." }, origin);

  // Honeypot: bots fill hidden fields. Pretend success, store nothing.
  if (typeof body.website === "string" && body.website.trim()) return send(res, 201, { ok: true }, origin);

  const { errors, submission } = validate(body);
  if (Object.keys(errors).length) return send(res, 422, { error: "Please fix the highlighted fields.", fields: errors }, origin);

  const requestId = randomUUID();
  const forwardedFor = req.headers["x-forwarded-for"];
  try {
    await firestore.collection(COLLECTION).doc(requestId).set({
      ...submission,
      submittedAt: new Date().toISOString(),
      requestId,
      origin,
      userAgent: req.headers["user-agent"] || null,
      ipAddress: (typeof forwardedFor === "string" ? forwardedFor.split(",")[0].trim() : null) || req.socket.remoteAddress || null,
    });
  } catch (err) {
    console.error(JSON.stringify({ severity: "ERROR", message: "Failed to save application", requestId, error: String(err) }));
    return send(res, 500, { error: "Something went wrong. Please try again." }, origin);
  }

  console.log(JSON.stringify({ severity: "INFO", message: "Application saved", requestId, role: submission.role }));
  send(res, 201, { ok: true }, origin);
}).listen(PORT, () => console.log(`careers-intake listening on ${PORT}`));
