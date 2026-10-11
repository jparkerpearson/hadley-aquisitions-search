import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = await mkdtemp(join(tmpdir(), "hadley-mockups-"));
const browser = spawn("chromium", [
  "--headless", "--no-sandbox", "--disable-dev-shm-usage",
  "--remote-debugging-port=9231", `--user-data-dir=${profile}`, "about:blank",
], { stdio: "ignore" });
let socket;
try {
  let targets;
  for (let attempt = 0; attempt < 300; attempt++) {
    try { targets = await (await fetch("http://127.0.0.1:9231/json")).json(); break; }
    catch { await pause(100); }
  }
  assert.ok(targets, "Chromium starts");
  socket = new WebSocket(targets.find(target => target.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map();
  const errors = [];
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
    } else if (message.method === "Runtime.exceptionThrown") {
      errors.push(message.params.exceptionDetails.text);
    }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const call = ++id;
    pending.set(call, { resolve, reject });
    socket.send(JSON.stringify({ id: call, method, params }));
  });
  const evaluate = async expression => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  await send("Page.enable");
  await send("Runtime.enable");
  const navigate = async name => {
    await send("Page.navigate", { url: `http://127.0.0.1:23636/__mockup/preview/hadley-offerings/${name}` });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate("document.querySelectorAll('h3').length === 5")) break;
      await pause(100);
    }
    await pause(1300);
  };
  const names = ["Buyside advisory", "Market mapping", "Expert sourcing", "Agentic sales", "Sourcing software"];
  const variants = process.argv.slice(2).length ? process.argv.slice(2) : ["Current", "Connected", "Asymmetric"];
  for (const width of [1280, 768, 390, 320]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 940, deviceScaleFactor: 1, mobile: width < 600 });
    for (const name of variants) {
      await navigate(name);
      assert.deepEqual(await evaluate("[...document.querySelectorAll('h3')].map(h=>h.textContent)"), names);
      assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth"), `${name} ${width}px fits`);
      if (name === "Current") {
        for (let page = 0; page < 5; page++) {
          await evaluate(`document.querySelectorAll('.product-book-page')[${page}].scrollIntoView({behavior:'instant',block:'center'})`);
          await pause(1000);
          assert.equal(await evaluate(`getComputedStyle(document.querySelectorAll('.product-book-page')[${page}]).opacity`), "1", "book page reveals on scroll");
        }
        continue;
      }
      assert.equal(await evaluate("document.querySelectorAll('svg, p, a').length"), 0, "no icons, descriptions or fake links");
      const connected = name.startsWith("Connected");
      const prefix = `hadley-${connected ? "connected" : "asymmetric"}${name.endsWith("Scroll") ? "-scroll" : ""}`;
      const selector = connected ? `.${prefix}__cell` : `.${prefix}__item`;
      for (let index = 0; index < (connected ? 6 : 5); index++) {
        await evaluate(`document.querySelectorAll('${selector}')[${index}].scrollIntoView({behavior:'instant',block:'center'})`);
        await pause(1100);
        assert.equal(await evaluate(`getComputedStyle(document.querySelectorAll('${selector}')[${index}]).opacity`), "1", "scrolled tile reveals");
      }
      assert.ok(await evaluate("[...document.querySelectorAll('h3')].every(h=>{const r=h.getBoundingClientRect(),p=h.parentElement.getBoundingClientRect();return r.left>=p.left && r.right<=p.right && h.scrollWidth<=h.clientWidth+1;})"), "all names fit their cells");
      await evaluate("scrollTo({top:0,behavior:'instant'})");
      await pause(100);
      await evaluate("document.querySelector('button').click()");
      await pause(70);
      assert.ok(await evaluate(`getComputedStyle(document.querySelector('${selector}')).opacity < 1`), "replay restarts motion");
      await pause(1500);
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('${selector}')).opacity`), "1", "replay settles");
      if (width === 1280) {
        console.log(name, "section height", await evaluate("Math.ceil(document.querySelector('section').getBoundingClientRect().height)"));
        if (connected) {
          assert.ok(await evaluate(`(()=>{const r=document.querySelector('${selector}').getBoundingClientRect();return Math.abs(r.width-r.height)<2;})()`), "connected desktop tiles are square");
        } else {
          assert.ok(await evaluate(`(()=>{const r=document.querySelectorAll('${selector}')[1].getBoundingClientRect();return Math.abs(r.width-r.height)<2;})()`), "secondary desktop tiles are square");
        }
      }
    }
  }
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  for (const name of variants) {
    await navigate(name);
    assert.ok(await evaluate("[...document.querySelectorAll('li')].every(li=>getComputedStyle(li).opacity==='1')"), "reduced motion shows every tile");
  }
  await send("Emulation.setEmulatedMedia", { features: [] });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: "delete window.IntersectionObserver;" });
  for (const name of variants) {
    await navigate(name);
    assert.ok(await evaluate("[...document.querySelectorAll('li')].every(li=>getComputedStyle(li).opacity==='1')"), "missing observer never hides content");
  }
  assert.deepEqual(errors, [], "no browser exceptions");
  console.log("PASS exact content, desktop/tablet/phone layouts, square geometry, scroll reveals, replay and reduced motion");
} finally {
  socket?.close();
  browser.kill("SIGTERM");
  await pause(300);
  await rm(profile, { recursive: true, force: true });
}
