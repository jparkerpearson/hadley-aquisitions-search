import assert from "node:assert/strict";
import { sendContactNotification } from "./contact-email.mjs";

const inquiry = {
  id: "test-inquiry", createdAt: "2026-10-11T23:00:00.000Z",
  name: "<script>synthetic fixture</script>", email: "test@example.invalid",
  interest: "Market mapping — café",
};
const response = (status, body) => new Response(JSON.stringify(body), { status });
const profilePath = "/gmail/v1/users/me/profile";
const sendPath = "/gmail/v1/users/me/messages/send";
const profile = () => response(200, { emailAddress: "sender@example.invalid" });
const calls = [];
assert.deepEqual(await sendContactNotification(inquiry, {
  proxy: async (path, options) => {
    calls.push({ path, options });
    return path === profilePath ? profile() : response(200, { id: "test-message" });
  },
}), { status: "accepted", messageId: "test-message" });
assert.equal(calls[0].path, profilePath);
const { path, options } = calls[1];
assert.equal(path, sendPath);
assert.equal(options.method, "POST");
assert.equal(options.headers.Authorization, undefined, "credentials stay in connector");
const mime = Buffer.from(options.body.raw, "base64url").toString("utf8");
const [headers, encoded] = mime.split("\r\n\r\n");
assert.ok(headers.includes("From: Hadley AI <sender@example.invalid>"), "use authenticated sender");
assert.ok(headers.includes("To: info@gethadley.com"));
assert.ok(headers.includes(`Reply-To: ${inquiry.email}`));
assert.ok(!headers.split("\r\n").includes(`To: ${inquiry.email}`), "no automatic reply to submitter");
assert.ok(headers.includes("Message-ID: <hadley-contact-test-inquiry@gethadley.com>"));
assert.ok(headers.includes("Content-Type: text/plain; charset=UTF-8"));
const text = Buffer.from(encoded, "base64").toString("utf8");
for (const value of [inquiry.name, inquiry.email, inquiry.interest]) assert.ok(text.includes(value));
await sendContactNotification({ ...inquiry, interest: "" }, {
  proxy: async (path, request) => {
    if (path === profilePath) return profile();
    const raw = Buffer.from(request.body.raw, "base64url").toString("utf8");
    assert.ok(Buffer.from(raw.split("\r\n\r\n")[1], "base64").toString().includes("Not provided"));
    return response(200, { id: "optional-interest-test" });
  },
});
let sends = 0;
await sendContactNotification(inquiry, {
  wait: async () => {},
  proxy: async (path) => {
    if (path === profilePath) return profile();
    sends++;
    return sends === 1 ? response(429, {}) : response(200, { id: "retry-message" });
  },
});
assert.equal(sends, 2, "retry only explicit rate-limit rejection");
for (const failure of ["network", "timeout", "missing-id", 503]) {
  let posts = 0;
  let searches = 0;
  const result = await sendContactNotification(inquiry, {
    timeout: 5,
    proxy: async (path) => {
      if (path === profilePath) return profile();
      if (path === sendPath) {
        posts++;
        if (failure === "network") throw new Error("synthetic failure");
        if (failure === "timeout") return new Promise(() => {});
        return response(failure === "missing-id" ? 200 : failure, {});
      }
      searches++;
      assert.ok(decodeURIComponent(path).includes("in:sent rfc822msgid:hadley-contact-test-inquiry@gethadley.com"));
      return response(200, { messages: [{ id: "recovered-message" }] });
    },
  });
  assert.deepEqual(result, { status: "accepted", messageId: "recovered-message" });
  assert.equal(posts, 1, "never blindly resend an ambiguous Gmail write");
  assert.equal(searches, 1);
}
for (const status of [400, 401, 403, 422, 429, 503]) {
  let posts = 0;
  await assert.rejects(sendContactNotification(inquiry, {
    wait: async () => {},
    proxy: async (path) => {
      if (path === profilePath) return profile();
      if (path === sendPath) { posts++; return response(status, {}); }
      return response(200, {});
    },
  }), /could not be confirmed/);
  assert.equal(posts, status === 429 ? 2 : 1);
}
for (const key of ["email", "id"]) {
  await assert.rejects(sendContactNotification({ ...inquiry, [key]: "value\r\nBcc: injected@example.invalid" }, {
    proxy: async () => { assert.fail("invalid headers must not reach Gmail"); },
  }), /Invalid notification headers/);
}
await assert.rejects(sendContactNotification(inquiry, {
  proxy: async (path) => {
    assert.equal(path, profilePath, "cannot send without authenticated sender");
    return response(403, {});
  },
}), /sender could not be confirmed/);
console.log("PASS Gmail notification recipient, authenticated sender, reply-to, UTF-8 plain text, safe rate-limit retry, ambiguous-send readback, and header safety");
