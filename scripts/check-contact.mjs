import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createContactHandler, validateContact } from "./contact-inquiries.mjs";

const input = {
  name: "Form Test", email: "test@example.invalid", interest: "Buyside advisory",
};
assert.deepEqual(validateContact(input).fields, {});
assert.deepEqual(validateContact({ ...input, phone: "+1 (415) 555-0100" }).fields, {});
for (const field of ["name", "email"]) {
  assert.ok(validateContact({ ...input, [field]: "" }).fields[field], `${field} is required`);
}
assert.ok(validateContact({ ...input, phone: "abc" }).fields.phone);
assert.ok(validateContact({ ...input, email: "bad-address" }).fields.email);
assert.ok(validateContact({ ...input, notes: "x".repeat(5001) }).fields.notes);
assert.ok(validateContact({ ...input, name: {} }).fields.name);
assert.ok(validateContact(null).fields.name);
assert.deepEqual(validateContact({ ...input, interest: "" }).fields, {}, "interest is optional");
assert.ok(validateContact({ ...input, interest: "x".repeat(501) }).fields.interest);
assert.ok(validateContact({ ...input, interest: {} }).fields.interest);
assert.ok(validateContact({ ...input, interest: "two\nlines" }).fields.interest);
assert.deepEqual(validateContact({ ...input, firm: "", notes: "" }).fields, {}, "removed fields are not required");
const saved = [];
const notified = [];
let failSave = false;
let failNotify = false;
let failStatusSave = false;
const server = createServer(createContactHandler({
  save: async (record) => {
    if (failSave) throw new Error("Simulated storage failure.");
    if (failStatusSave && record.emailNotification.status !== "pending") throw new Error("Simulated status write failure.");
    const index = saved.findIndex((item) => item.id === record.id);
    if (index === -1) saved.push(record);
    else saved[index] = record;
  },
  notify: async (record) => {
    assert.ok(saved.some((item) => item.id === record.id), "save precedes email");
    if (failNotify) throw new Error("Simulated email failure.");
    notified.push(record.id);
    return { status: "accepted", messageId: `mock-${record.id}` };
  },
}));
server.listen(0, "127.0.0.1");
await once(server, "listening");
const base = `http://127.0.0.1:${server.address().port}`;
const send = (body, options = {}) => fetch(base, {
  method: "POST", headers: { "Content-Type": "application/json", Origin: base },
  body: JSON.stringify(body), ...options,
});
try {
  let response = await send(input);
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.ok, true);
  assert.equal(result.notification, "accepted");
  assert.equal(saved[0].emailNotification.status, "accepted");
  assert.equal(saved[0].id, result.id);
  assert.equal(saved[0].phone, "");
  assert.equal(saved[0].name, input.name);
  assert.equal(saved[0].email, input.email);
  assert.equal(saved[0].interest, input.interest, "area of interest is saved privately");
  assert.equal(saved[0].firm, "");
  assert.equal(saved[0].notes, "");
  assert.ok(saved[0].createdAt);
  response = await send({ ...input, phone: "+1 (415) 555-0100" });
  assert.equal(response.status, 201);
  assert.equal(saved[1].phone, "+1 (415) 555-0100");
  assert.equal((await send({ ...input, name: "" })).status, 400);
  assert.equal((await send(input, { body: "{" })).status, 400);
  assert.equal((await send(input, { headers: { "Content-Type": "text/plain" } })).status, 415);
  assert.equal((await send(input, { headers: { "Content-Type": "application/json", Origin: "https://unrelated.example" } })).status, 403);
  assert.equal((await send(input, { body: JSON.stringify({ ...input, notes: "x".repeat(33000) }) })).status, 413);
  assert.equal((await fetch(base)).status, 405);
  assert.equal(saved.length, 2, "rejected requests are never saved");
  failSave = true;
  assert.equal((await send({ ...input, email: "failure@example.invalid" })).status, 503);
  assert.equal(saved.length, 2, "storage failures never acknowledge success");
  assert.equal(notified.length, 2, "storage failures do not send an email");
  failSave = false;
  failNotify = true;
  response = await send({ ...input, email: "notification-failure@example.invalid" });
  assert.equal(response.status, 201, "email failure does not lose a saved inquiry");
  assert.equal((await response.json()).notification, "unconfirmed");
  assert.equal(saved[2].emailNotification.status, "unconfirmed", "email failure is recorded privately");
  failNotify = false;
  failStatusSave = true;
  response = await send({ ...input, email: "status-failure@example.invalid" });
  assert.equal(response.status, 201, "metadata failure does not ask the visitor to resend an accepted email");
  assert.equal((await response.json()).notification, "accepted");
  failStatusSave = false;
  for (let i = 0; i < 3; i++) assert.equal((await send(input)).status, 201);
  response = await send(input);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "600");
  const savedBeforePreflight = saved.length;
  for (const origin of ["https://gethadley.com", "https://www.gethadley.com"]) {
    response = await fetch(base, {
      method: "OPTIONS",
      headers: { Origin: origin, "Sec-Fetch-Site": "cross-site",
        "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" },
    });
    assert.equal(response.status, 204, "GitHub-hosted form passes browser preflight");
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
    assert.equal(response.headers.get("vary"), "Origin");
  }
  assert.equal(saved.length, savedBeforePreflight, "preflight never saves or emails");
  response = await send({ ...input, email: "github-form@example.invalid" }, {
    headers: { "Content-Type": "application/json", Origin: "https://gethadley.com", "Sec-Fetch-Site": "cross-site" },
  });
  assert.equal(response.status, 201, "GitHub-hosted form saves and notifies through Replit");
  assert.equal(response.headers.get("access-control-allow-origin"), "https://gethadley.com");
  for (const origin of ["https://untrusted.invalid", "https://gethadley.com.untrusted.invalid"]) {
    response = await send(input, { headers: { "Content-Type": "application/json", Origin: origin, "Sec-Fetch-Site": "cross-site" } });
    assert.equal(response.status, 403, "other sites cannot submit the contact form");
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  }
  response = await fetch(base, { method: "OPTIONS", headers: {
    Origin: "https://gethadley.com", "Access-Control-Request-Method": "DELETE",
  } });
  assert.equal(response.status, 403, "preflight does not authorize other methods");
  console.log("PASS restricted cross-origin form requests and preflight; all notifications mocked");
  console.log("PASS contact validation, save-before-email, notification failures, request limits, and spam limits");
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
