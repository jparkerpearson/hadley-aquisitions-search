import { ReplitConnectors } from "@replit/connectors-sdk";

const recipient = "info@gethadley.com";
const sender = `Hadley AI <${recipient}>`;

function deadline(operation, milliseconds) {
  let timer;
  return Promise.race([
    operation(),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Email request timed out.")), milliseconds);
    }),
  ]).finally(() => clearTimeout(timer));
}

// Recreate the client for each attempt; authentication and token refresh stay
// inside the connector SDK. Never expose provider errors or contact data in logs.
export async function sendContactNotification(inquiry, {
  proxy = (path, options) => new ReplitConnectors().proxy("resend", path, options),
  wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  timeout = 3000,
} = {}) {
  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": `hadley-contact-${inquiry.id}`,
    },
    body: {
      from: sender,
      to: [recipient],
      reply_to: inquiry.email,
      subject: "New Hadley AI website contact",
      text: `New website contact\n\nName: ${inquiry.name}\nWork Email: ${inquiry.email}\nArea of Interest: ${inquiry.interest || "Not provided"}\n\nSubmitted: ${inquiry.createdAt}\nReference: ${inquiry.id}`,
    },
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    let retryable = true;
    try {
      const result = await deadline(async () => {
        const response = await proxy("/emails", options);
        const body = await response.json().catch(() => ({}));
        return { status: response.status, ok: response.ok, body };
      }, timeout);
      if (result.ok && typeof result.body.id === "string" && result.body.id) {
        return { status: "accepted", messageId: result.body.id };
      }
      retryable = result.status === 429 || result.status >= 500;
    } catch {
      // A timeout can occur after acceptance. The same idempotency key is used
      // for all retries so an ambiguous network result cannot duplicate email.
    }
    if (!retryable || attempt === 2) break;
    await wait(500 * (attempt + 1));
  }
  throw new Error("Email notification could not be confirmed.");
}
