import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createContactHandler, validateContact } from "./contact-inquiries.mjs";

const input = {
  name: "Form Test", email: "test@example.invalid",
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
assert.deepEqual(validateContact({ ...input, firm: "", notes: "" }).fields, {}, "removed fields are not required");
const saved = [];
let failSave = false;
const server = createServer(createContactHandler({
  save: async (record) => {
    if (failSave) throw new Error("Simulated storage failure.");
    saved.push(record);
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
  assert.equal(saved[0].id, result.id);
  assert.equal(saved[0].phone, "");
  assert.equal(saved[0].name, input.name);
  assert.equal(saved[0].email, input.email);
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
  failSave = false;
  for (let i = 0; i < 3; i++) assert.equal((await send(input)).status, 201);
  response = await send(input);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "600");
  console.log("PASS name/email-only contact validation, legacy optional fields, durable-save acknowledgement, errors, request limits, and spam limits");
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
