import assert from "node:assert/strict";
import { sendContactNotification } from "./contact-email.mjs";

const inquiry = {
  id: "test-inquiry", createdAt: "2026-10-11T23:00:00.000Z",
  name: "<script>synthetic fixture</script>", email: "test@example.invalid",
  interest: "Market mapping",
};
const calls = [];
const response = (status, body) => new Response(JSON.stringify(body), { status });
const proxy = async (path, options) => {
  calls.push({ path, options });
  return response(200, { id: "test-message" });
};
assert.deepEqual(await sendContactNotification(inquiry, { proxy }), {
  status: "accepted", messageId: "test-message",
});
const { path, options } = calls[0];
assert.equal(path, "/emails");
assert.equal(options.method, "POST");
assert.deepEqual(options.body.to, ["info@gethadley.com"]);
assert.equal(options.body.from, "Hadley AI <info@gethadley.com>");
assert.equal(options.body.reply_to, inquiry.email);
assert.ok(options.body.text.includes(`Name: ${inquiry.name}`));
assert.ok(options.body.text.includes(`Work Email: ${inquiry.email}`));
assert.ok(options.body.text.includes(`Area of Interest: ${inquiry.interest}`));
assert.equal(options.body.html, undefined, "plain text prevents contact names injecting HTML");
assert.equal(options.headers["Idempotency-Key"], "hadley-contact-test-inquiry");
assert.equal(options.headers.Authorization, undefined, "credentials stay in the connector");
await sendContactNotification({ ...inquiry, interest: "" }, {
  proxy: async (_, request) => {
    assert.ok(request.body.text.includes("Area of Interest: Not provided"));
    return response(200, { id: "optional-interest-test" });
  },
});

for (const initial of ["network", 429, 503]) {
  const retryCalls = [];
  const result = await sendContactNotification(inquiry, {
    wait: async () => {},
    proxy: async (path, options) => {
      retryCalls.push({ path, options });
      if (retryCalls.length === 1) {
        if (initial === "network") throw new Error("Network fixture");
        return response(initial, {});
      }
      return response(200, { id: "retry-message" });
    },
  });
  assert.equal(result.status, "accepted");
  assert.equal(retryCalls.length, 2);
  assert.deepEqual(retryCalls[0], retryCalls[1], "retry uses identical body and idempotency key");
}
for (const status of [400, 401, 403, 422, 503]) {
  let attempts = 0;
  await assert.rejects(sendContactNotification(inquiry, {
    wait: async () => {},
    proxy: async () => { attempts++; return response(status, {}); },
  }), /could not be confirmed/);
  assert.equal(attempts, status === 503 ? 3 : 1, "bounded retries, no retry for invalid credentials or sender");
}
let timeouts = 0;
await assert.rejects(sendContactNotification(inquiry, {
  timeout: 5, wait: async () => {},
  proxy: () => { timeouts++; return new Promise(() => {}); },
}), /could not be confirmed/);
assert.equal(timeouts, 3, "hanging requests have bounded deadlines");
await assert.rejects(sendContactNotification(inquiry, {
  proxy: async () => response(200, {}), wait: async () => {},
}), /could not be confirmed/, "missing provider acceptance is not a successful notification");
console.log("PASS notification recipient, reply-to, plain-text payload, idempotent bounded retries, timeouts, and honest acceptance");
