import { ReplitConnectors } from "@replit/connectors-sdk";

const recipient = "info@gethadley.com";

function deadline(operation, milliseconds) {
  let timer;
  return Promise.race([
    operation(),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Email request timed out.")), milliseconds);
    }),
  ]).finally(() => clearTimeout(timer));
}

// Authentication and token refresh stay inside the connector SDK.
// Gmail sends are non-idempotent: only retry an explicit rate-limit rejection.
export async function sendContactNotification(inquiry, {
  proxy = (path, options) => new ReplitConnectors().proxy("google-mail", path, options),
  wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  timeout = 3000,
} = {}) {
  const request = (path, options) => deadline(async () => {
    const response = await proxy(path, options);
    // Failed responses must not expose provider errors or inquiry data in logs.
    if (!response.ok) return { status: response.status, ok: false, body: {} };
    return { status: response.status, ok: true, body: await response.json() };
  }, timeout);
  const validAddress = (address) => typeof address === "string" &&
    /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(address) && !/[\r\n\0]/.test(address);
  if (!validAddress(inquiry.email) || !/^[a-zA-Z0-9-]+$/.test(inquiry.id)) {
    throw new Error("Invalid notification headers.");
  }
  const profile = await request("/gmail/v1/users/me/profile", { method: "GET" });
  if (!profile.ok || !validAddress(profile.body.emailAddress)) {
    throw new Error("Email sender could not be confirmed.");
  }
  const messageId = `hadley-contact-${inquiry.id}@gethadley.com`;
  const text = `New website contact\n\nName: ${inquiry.name}\nWork Email: ${inquiry.email}\nArea of Interest: ${inquiry.interest || "Not provided"}\n\nSubmitted: ${inquiry.createdAt}\nReference: ${inquiry.id}`;
  const encodedText = Buffer.from(text, "utf8").toString("base64").match(/.{1,76}/g).join("\r\n");
  const mime = [
    `From: Hadley AI <${profile.body.emailAddress}>`,
    `To: ${recipient}`,
    `Reply-To: ${inquiry.email}`,
    "Subject: New Hadley AI website contact",
    `Message-ID: <${messageId}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "", encodedText, "",
  ].join("\r\n");
  const options = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: { raw: Buffer.from(mime, "utf8").toString("base64url") },
  };
  let uncertain = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await request("/gmail/v1/users/me/messages/send", options);
      if (result.ok && typeof result.body.id === "string" && result.body.id) {
        return { status: "accepted", messageId: result.body.id };
      }
      if (result.status === 429 && attempt === 0) {
        await wait(500);
        continue;
      }
      uncertain = result.ok || result.status >= 500;
    } catch {
      uncertain = true;
    }
    break;
  }
  if (uncertain) {
    // Gmail can replace our RFC Message-ID. Search the unique reference in
    // the body instead; never resend if search fails or has not indexed it yet.
    try {
      const query = encodeURIComponent(`in:sent to:${recipient} subject:"New Hadley AI website contact" "${inquiry.id}"`);
      const result = await request(`/gmail/v1/users/me/messages?q=${query}&maxResults=1`, { method: "GET" });
      const found = result.ok && result.body.messages?.[0]?.id;
      if (typeof found === "string" && found) return { status: "accepted", messageId: found };
    } catch {
      // Preserve the private inquiry and report an unconfirmed notification.
    }
  }
  throw new Error("Email notification could not be confirmed.");
}
