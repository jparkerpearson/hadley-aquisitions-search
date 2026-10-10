import { Client } from "@replit/object-storage";
import { createHash, randomUUID } from "node:crypto";

const MAX_BYTES = 32768;
const WINDOW_MS = 10 * 60 * 1000;
const limits = { name: 160, email: 254, phone: 80, firm: 200, notes: 5000 };
class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function validateContact(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { fields: { name: "Please enter your contact details." }, values: {} };
  }
  const values = {};
  const fields = {};
  for (const [key, max] of Object.entries(limits)) {
    const value = input[key] ?? "";
    if (typeof value !== "string") {
      fields[key] = "Enter text in this field.";
      values[key] = "";
      continue;
    }
    values[key] = value.trim();
    if (values[key].length > max) fields[key] = `Use ${max} characters or fewer.`;
    else if (key !== "phone" && !values[key]) fields[key] = "This field is required.";
    else if (key !== "notes" && /[\r\n\0]/.test(values[key])) fields[key] = "Enter a single line of text.";
  }
  if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(values.email)) {
    fields.email = "Enter a valid email address.";
  }
  if (values.phone && (!/^[+0-9 ().x#-]+$/i.test(values.phone) ||
    (values.phone.match(/\d/g)?.length ?? 0) < 7 ||
    (values.phone.match(/\d/g)?.length ?? 0) > 20)) {
    fields.phone = "Enter a valid phone number, or leave it blank.";
  }
  return { values, fields };
}

export async function saveContactInquiry(inquiry) {
  const result = await new Client().uploadFromText(
    `hadley/contact-inquiries/${inquiry.id}.json`, JSON.stringify(inquiry),
  );
  if (!result.ok) throw new Error("Storage write failed.");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let oversized = false;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BYTES) {
        oversized = true;
        chunks.length = 0;
        reject(new RequestError(413, "Your message is too large. Please shorten it."));
      } else if (!oversized) chunks.push(chunk);
    });
    req.once("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.once("aborted", () => reject(new RequestError(400, "The request was interrupted.")));
    req.once("error", () => reject(new RequestError(400, "The request could not be read.")));
  });
}

export function createContactHandler({ save = saveContactInquiry } = {}) {
  const attempts = new Map();
  const takeAttempt = (key, limit) => {
    const now = Date.now();
    for (const [oldKey, entry] of attempts) {
      if (now - entry.start >= WINDOW_MS) attempts.delete(oldKey);
    }
    const entry = attempts.get(key) ?? { start: now, count: 0 };
    entry.count++;
    attempts.set(key, entry);
    return entry.count <= limit;
  };
  return async (req, res) => {
    const reply = (status, data) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
        ...(status === 405 ? { Allow: "POST" } : {}),
        ...(status === 429 ? { "Retry-After": "600" } : {}),
      });
      res.end(JSON.stringify(data));
    };
    if (req.method !== "POST") return reply(405, { error: "Use POST to send a contact inquiry." });
    try {
      if (req.headers["sec-fetch-site"] === "cross-site") {
        return reply(403, { error: "Please submit the form from this website." });
      }
      if (req.headers.origin) {
        let originHost;
        try { originHost = new URL(req.headers.origin).host; }
        catch { return reply(403, { error: "Please submit the form from this website." }); }
        if (originHost !== req.headers.host) {
          return reply(403, { error: "Please submit the form from this website." });
        }
      }
      if (req.headers["content-type"]?.split(";")[0].trim() !== "application/json") {
        return reply(415, { error: "Send the form as JSON." });
      }
      const address = createHash("sha256").update(req.socket.remoteAddress ?? "unknown").digest("hex");
      if (!takeAttempt(`address:${address}`, 60)) {
        return reply(429, { error: "Too many attempts. Please try again in ten minutes." });
      }
      const body = await readBody(req);
      let input;
      try { input = JSON.parse(body); }
      catch { return reply(400, { error: "The form could not be read. Please try again." }); }
      const { values, fields } = validateContact(input);
      if (Object.keys(fields).length) {
        return reply(400, { error: "Please check the highlighted fields.", fields });
      }
      const email = createHash("sha256").update(values.email.toLowerCase()).digest("hex");
      if (!takeAttempt(`email:${email}`, 5)) {
        return reply(429, { error: "Too many messages. Please try again in ten minutes." });
      }
      const id = randomUUID();
      await save({ id, createdAt: new Date().toISOString(), ...values });
      reply(201, { ok: true, id });
    } catch (error) {
      if (error instanceof RequestError) return reply(error.status, { error: error.message });
      // Never log contact details or storage-provider error objects.
      console.error("Contact inquiry could not be saved.");
      reply(503, { error: "Your message could not be saved. Please try again shortly." });
    }
  };
}
