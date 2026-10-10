// Dependency-free smoke checks against the running preview. Never send live applications.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, unlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.env.REPLIT_DEV_DOMAIN
  ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "http://127.0.0.1:5000";
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const profile = await mkdtemp(join(tmpdir(), "hadley-browser-"));
const fixture = "assets/check-voicemail.wav";
const browser = spawn("chromium", [
  "--headless", "--no-sandbox", "--disable-dev-shm-usage",
  "--remote-debugging-port=9229", `--user-data-dir=${profile}`, "about:blank",
], { stdio: "ignore" });
let socket;
try {
  // An unbranded synthetic tone is a test fixture, never a shipped voicemail.
  const wav = Buffer.alloc(44 + 16000);
  wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write("data", 36); wav.writeUInt32LE(16000, 40);
  for (let n = 0; n < 8000; n++) wav.writeInt16LE(Math.sin(n * .15) * 1000, 44 + n * 2);
  await writeFile(fixture, wav);

  for (const path of ["/", "/careers.html", "/assets/site.css", "/assets/site.js", "/assets/hadley-logo-blue.webp", "/assets/hadley-logo-white.webp", "/assets/market-map.webp"]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  for (const path of ["/.replit", "/careers-intake/server.js", "/attached_assets/image_1791656079724.png", "/assets/../.replit", "/assets/%2e%2e%2f.replit", "/missing.html"]) {
    assert.equal((await fetch(base + path)).status, 404, path);
  }
  const range = await fetch(base + "/" + fixture, { headers: { Range: "bytes=44-143" } });
  assert.equal(range.status, 206);
  assert.equal((await range.arrayBuffer()).byteLength, 100);
  assert.match(range.headers.get("content-range"), /^bytes 44-143\//);
  assert.equal((await fetch(base + "/" + fixture, { headers: { Range: "bytes=999999-" } })).status, 416);
  assert.equal((await fetch(base + "/", { method: "POST" })).status, 405);
  const videoRange = await fetch(base + "/media/mountain-hero.mp4", { headers: { Range: "bytes=0-1023" } });
  assert.equal(videoRange.status, 206);
  assert.equal(videoRange.headers.get("content-type"), "video/mp4");
  assert.equal((await videoRange.arrayBuffer()).byteLength, 1024);
  assert.equal((await fetch(base + "/generated-artifacts/mountain-original.mp4")).status, 404);
  assert.equal((await fetch(base + "/media/other.mp4")).status, 404);
  const original = execFileSync("git", ["show", "HEAD:careers.html"], { encoding: "utf8" });
  const current = await readFile("careers.html", "utf8");
  const appScript = (html) => html.match(/<script>\s*const APPLY_ENDPOINT[\s\S]*?<\/script>/)?.[0];
  assert.equal(appScript(current), appScript(original), "careers submission behavior unchanged");
  for (const role of ["origination-lead", "founding-applied-ai-engineer"]) {
    const section = (html) => html.match(new RegExp(`<section class="role" id="${role}">[\\s\\S]*?<\\/section>`))?.[0];
    assert.equal(section(current), section(original), "job copy unchanged");
  }
  console.log("PASS HTTP assets, security boundaries, audio ranges, and preserved careers content");

  let targets;
  for (let retry = 0; retry < 40; retry++) {
    try { targets = await (await fetch("http://127.0.0.1:9229/json")).json(); break; }
    catch { await pause(100); }
  }
  assert.ok(targets?.length, "Chromium started");
  socket = new WebSocket(targets.find((target) => target.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map();
  const exceptions = [];
  let audioSource = "";
  let mockedStatus = 422;
  let intercepted = 0;
  const siteScript = await readFile("assets/site.js", "utf8");
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const call = ++id; pending.set(call, { resolve, reject });
      socket.send(JSON.stringify({ id: call, method, params }));
    });
  }
  socket.onmessage = async ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
    } else if (message.method === "Runtime.exceptionThrown") {
      exceptions.push(message.params.exceptionDetails.text);
    } else if (message.method === "Fetch.requestPaused") {
      const event = message.params;
      if (event.request.url.includes("careers-intake-")) {
        if (event.request.method === "POST") intercepted++;
        const preflight = event.request.method === "OPTIONS";
        const body = mockedStatus === 201 ? { ok: true } : { error: "Test validation response", fields: { email: "Test email error" } };
        await send("Fetch.fulfillRequest", {
          requestId: event.requestId, responseCode: preflight ? 204 : mockedStatus,
          responseHeaders: [
            { name: "Content-Type", value: "application/json" },
            { name: "Access-Control-Allow-Origin", value: new URL(base).origin },
            { name: "Access-Control-Allow-Methods", value: "POST, OPTIONS" },
            { name: "Access-Control-Allow-Headers", value: "Content-Type" },
          ],
          body: Buffer.from(preflight ? "" : JSON.stringify(body)).toString("base64"),
        });
      } else {
        await send("Fetch.fulfillRequest", {
          requestId: event.requestId, responseCode: 200,
          responseHeaders: [{ name: "Content-Type", value: "text/javascript" }],
          body: Buffer.from(siteScript.replace('const HADLEY_VOICEMAIL_SOURCE = "";', `const HADLEY_VOICEMAIL_SOURCE = ${JSON.stringify(audioSource)};`)).toString("base64"),
        });
      }
    }
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Fetch.enable", { patterns: [{ urlPattern: "*careers-intake-*"}, { urlPattern: "*/assets/site.js" }] });
  async function evaluate(expression) {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }
  async function navigate(path) {
    await send("Page.navigate", { url: base + path });
    await pause(1400);
  }
  async function width(value) {
    await send("Emulation.setDeviceMetricsOverride", { width: value, height: 900, deviceScaleFactor: 1, mobile: value < 600 });
  }
  for (const value of [1280, 390, 320]) {
    await width(value);
    for (const path of ["/", "/careers.html"]) {
      await navigate(path);
      assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth"), `${value}px ${path} fits`);
      assert.ok(await evaluate("[...document.images].filter(i=>!i.loading || i.loading !== 'lazy').every(i=>i.complete && i.naturalWidth>0)"), "visible images load");
      assert.equal(await evaluate("getComputedStyle(document.body).fontFamily.includes('Helvetica')"), true);
      assert.equal(await evaluate("getComputedStyle(document.body).backgroundColor"), "rgb(250, 251, 253)");
    }
  }
  await width(1280);
  await navigate("/");
  // Confirm actual decoding and advancing playback, not merely a video-shaped image.
  for (let retry = 0; retry < 30; retry++) {
    if (await evaluate("document.querySelector('.hero-video').readyState >= 3 && !document.querySelector('.hero-video').paused")) break;
    await pause(200);
  }
  assert.ok(await evaluate("document.querySelector('.hero-video').readyState >= 3 && !document.querySelector('.hero-video').paused"), "mountain video decodes and autoplays");
  const startingTime = await evaluate("document.querySelector('.hero-video').currentTime");
  await pause(300);
  assert.notEqual(await evaluate("document.querySelector('.hero-video').currentTime"), startingTime, "video frames advance");
  assert.ok(await evaluate("document.querySelector('.hero-video').muted && document.querySelector('.hero-video').loop && document.querySelector('.hero-video').playsInline"), "silent inline loop");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.hero h1')).color"), "rgb(250, 251, 253)");
  await evaluate("document.querySelector('[data-video-toggle]').click()");
  assert.ok(await evaluate("document.querySelector('.hero-video').paused"), "pause control works");
  await evaluate("document.querySelector('[data-video-toggle]').click()");
  await pause(200);
  assert.equal(await evaluate("document.querySelector('.hero-video').paused"), false, "play control resumes");
  await evaluate("document.body.insertAdjacentHTML('beforeend','<div data-test-spacer style=\"height:1000px\"></div>'); document.querySelector('footer').scrollIntoView({behavior:'instant'})");
  await pause(300);
  assert.equal(await evaluate("document.querySelector('.hero-video').paused"), true, "offscreen video pauses");
  await evaluate("scrollTo({top:0,behavior:'instant'})");
  await pause(300);
  assert.equal(await evaluate("document.querySelector('.hero-video').paused"), false, "visible video resumes");
  await evaluate("document.querySelector('[data-test-spacer]').remove()");
  assert.equal(await evaluate("document.querySelector('h1').textContent"), "The next generation of buyside M&A sourcing is here");
  assert.equal(await evaluate("document.querySelector('.hero-positioning')"), null);
  assert.ok(await evaluate("document.querySelector('[data-hadley-audio]').hidden"));
  for (const id of ["offerings", "voicemail-heading"]) {
    await evaluate(`document.getElementById(${JSON.stringify(id)}).scrollIntoView()`);
    await pause(1000);
    assert.ok(await evaluate(`getComputedStyle(document.getElementById(${JSON.stringify(id)}).closest('section')).opacity !== '0'`));
  }
  audioSource = fixture;
  await navigate("/");
  assert.equal(await evaluate("document.querySelector('audio').hidden"), false);
  assert.ok(await evaluate("document.querySelector('audio').readyState >= 1 && document.querySelector('audio').controls"), "real audio metadata and controls");
  await evaluate("document.querySelector('audio').currentTime = .4");
  await pause(150);
  assert.ok(await evaluate("document.querySelector('audio').currentTime >= .3"), "audio seeking");
  audioSource = "assets/not-a-recording.mp3";
  await navigate("/");
  assert.equal(await evaluate("document.querySelector('[data-audio-status]').dataset.state"), "error");
  audioSource = "";

  await navigate("/careers.html");
  await evaluate("document.querySelector('[data-apply]').click()");
  assert.ok(await evaluate("document.querySelector('dialog').open"), "apply opens");
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await pause(100);
  assert.equal(await evaluate("document.querySelector('dialog').open"), false, "Escape closes native dialog");
  await evaluate("document.querySelector('[data-apply]').focus(); document.querySelector('[data-apply]').click()");
  await evaluate("document.querySelector('[data-close]').click()");
  assert.equal(await evaluate("document.querySelector('dialog').open"), false);
  assert.equal(await evaluate("document.activeElement.matches('[data-apply]')"), true, "focus returns to apply button");
  await evaluate("document.querySelectorAll('[data-apply]')[1].click()");
  assert.equal(await evaluate("document.querySelector('#apply-title').textContent"), "Founding Applied AI Engineer");
  await evaluate("document.querySelector('#apply-form').requestSubmit()");
  assert.equal(intercepted, 0, "invalid form stays local");
  await evaluate(`(() => {
    const f=document.querySelector('#apply-form');
    f.elements.fullName.value='Test Applicant'; f.elements.email.value='test@example.com';
    f.elements.phone.value='5551234567'; f.elements.linkedin.value='https://linkedin.com/in/test';
    f.elements.whyHire.value='Test only, intercepted locally.'; f.requestSubmit();
  })()`);
  await pause(500);
  assert.equal(await evaluate("document.querySelector('#form-status').textContent"), "Test validation response");
  mockedStatus = 201;
  await evaluate("document.querySelector('#apply-form').requestSubmit()");
  await pause(500);
  assert.equal(await evaluate("document.querySelector('#apply-success').hidden"), false);
  assert.equal(intercepted, 2, "two mocked submissions, none sent to live service");

  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await navigate("/");
  assert.equal(await evaluate("document.querySelector('.hero-video').hasAttribute('src')"), false, "reduced motion does not fetch video");
  assert.ok(await evaluate("document.querySelector('[data-video-toggle]').hidden"), "no pointless pause control for static poster");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.hero-content')).animationDuration"), "1e-05s");
  await send("Emulation.setScriptExecutionDisabled", { value: true });
  await navigate("/");
  assert.ok(await evaluate("getComputedStyle(document.querySelector('.offer-card')).opacity === '1'"), "content readable without JavaScript");
  assert.equal(await evaluate("document.querySelector('.hero-video').hasAttribute('src')"), false, "no-JS uses poster only");
  assert.equal(exceptions.length, 0, "no runtime exceptions");
  console.log("PASS desktop/mobile, branding, motion fallbacks, real audio seeking/error states, and mocked careers dialogs/submissions");
} finally {
  socket?.close();
  browser.kill("SIGTERM");
  await unlink(fixture).catch(() => {});
  await pause(200);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
