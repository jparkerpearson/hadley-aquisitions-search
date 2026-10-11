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
  for (const route of ["/", "/careers.html", "/contact.html"]) {
    const html = await (await fetch(base + route)).text();
    const footer = html.match(/<footer>[\s\S]*?<\/footer>/)?.[0];
    assert.ok(footer, `${route} retains its footer`);
    assert.doesNotMatch(footer, /<img|footer-logo|href="careers\.html"/, `${route} has no repeated footer logo or Careers link`);
    const nav = html.match(/<nav\b[\s\S]*?<\/nav>/)?.[0] ?? "";
    assert.match(nav, /class="logo"/, `${route} keeps the header logo`);
    assert.match(nav, /href="careers\.html"/, `${route} keeps the header Careers link`);
  }
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
  let mockedStatus = 422;
  let intercepted = 0;
  let contactRequests = 0;
  let contactReply = { status: 400, body: { error: "Check your firm.", fields: { firm: "Test firm error" } } };
  let lastContactPayload;
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
      } else if (new URL(event.request.url).pathname === "/api/contact") {
        contactRequests++;
        lastContactPayload = JSON.parse(event.request.postData);
        await pause(150);
        await send("Fetch.fulfillRequest", {
          requestId: event.requestId, responseCode: contactReply.status,
          responseHeaders: [{ name: "Content-Type", value: "application/json" }],
          body: Buffer.from(JSON.stringify(contactReply.body)).toString("base64"),
        });
      }
    }
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Fetch.enable", { patterns: [{ urlPattern: "*careers-intake-*" }, { urlPattern: "*/api/contact" }] });
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
  for (const value of [1280, 768, 390, 320]) {
    await width(value);
    for (const path of ["/", "/careers.html"]) {
      await navigate(path);
      assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth"), `${value}px ${path} fits`);
      assert.ok(await evaluate("[...document.images].filter(i=>!i.loading || i.loading !== 'lazy').every(i=>i.complete && i.naturalWidth>0)"), "visible images load");
      assert.equal(await evaluate("getComputedStyle(document.body).fontFamily.includes('Helvetica')"), true);
      assert.equal(await evaluate("getComputedStyle(document.body).backgroundColor"), "rgb(250, 251, 253)");
      if (path === "/") {
        const navAppearance = "()=>{const nav=document.querySelector('.home-nav');const styles=['color','backgroundColor','fontSize','fontWeight','letterSpacing','textTransform','paddingLeft','paddingRight'];const read=(selector)=>{const computed=getComputedStyle(nav.querySelector(selector));return Object.fromEntries(styles.map(key=>[key,computed[key]]))};return {careers:read('.nav-link'),contact:read('.nav-cta')}}";
        await evaluate("scrollTo({top:0,behavior:'instant'})");
        await pause(250);
        assert.equal(await evaluate("getComputedStyle(document.querySelector('.home-nav')).backgroundColor"), "rgba(0, 0, 0, 0)", "homepage header transparent over video");
        const overVideo = await evaluate(`(${navAppearance})()`);
        assert.deepEqual(overVideo.contact, overVideo.careers, "over-video Careers and Contact use the same unfilled formatting");
        assert.equal(overVideo.contact.backgroundColor, "rgba(0, 0, 0, 0)");
        assert.ok(await evaluate("document.querySelector('.home-nav .logo img').src.includes('white-transparent')"), "white logo over video");
        assert.equal(await evaluate("Math.round(document.querySelector('.hero').getBoundingClientRect().top)"), 0, "video reaches page top");
        assert.ok(await evaluate("Math.abs(document.querySelector('.hero').getBoundingClientRect().height - innerHeight) < 1"), `${value}px hero fills the full viewport height`);
        assert.ok(await evaluate("document.querySelector('.identity-section').getBoundingClientRect().top >= innerHeight - 1"), "logos begin below the full-screen video");
        const header = await evaluate("(()=>{const nav=document.querySelector('.home-nav');const bounds=(s)=>{const r=nav.querySelector(s).getBoundingClientRect();return {left:r.left,right:r.right,centerY:(r.top+r.bottom)/2}};return {logo:bounds('.logo'),left:bounds('.nav-link'),right:bounds('.nav-cta'),width:document.documentElement.clientWidth}})()");
        assert.ok(Math.abs((header.logo.left + header.logo.right) / 2 - header.width / 2) < 2
          && header.left.right <= header.logo.left && header.logo.right <= header.right.left
          && Math.abs(header.left.centerY - header.logo.centerY) < 2
          && Math.abs(header.right.centerY - header.logo.centerY) < 2,
        `centered header shares one row without overlap: ${JSON.stringify(header)}`);
        await evaluate("document.getElementById('identity-title').scrollIntoView({behavior:'instant'})");
        await pause(1000);
        assert.ok(await evaluate("document.querySelector('.home-nav').classList.contains('is-scrolled')"), "header changes below video");
        assert.ok(await evaluate("document.querySelector('.home-nav .logo img').src.includes('blue-transparent')"), "blue logo below hero");
        assert.match(await evaluate("getComputedStyle(document.querySelector('.home-nav')).backgroundColor"), /^rgba?\(250, 251, 253/, "light header remains readable");
        const belowVideo = await evaluate(`(${navAppearance})()`);
        assert.deepEqual(belowVideo.contact, belowVideo.careers, "scrolled Careers and Contact use the same unfilled formatting");
        assert.equal(belowVideo.contact.backgroundColor, "rgba(0, 0, 0, 0)");
        assert.equal(await evaluate("document.getElementById('identity-title').textContent"), "We are the best, trusted by the best");
        assert.equal(await evaluate("document.querySelectorAll('.identity-grid img').length"), 12, "remaining requested logos included");
        assert.equal(await evaluate("document.querySelector('.identity-grid img[alt=\"Y Combinator\"]')"), null, "Y Combinator logo removed");
        assert.ok(await evaluate("[...document.querySelectorAll('.identity-grid img')].every(i=>i.complete && i.naturalWidth>0 && i.alt.trim())"), "identity logos load with accessible names");
        assert.ok(await evaluate("[...document.querySelectorAll('.identity-mark')].every(mark=>getComputedStyle(mark).backgroundColor==='rgba(0, 0, 0, 0)')"), "logos have no colored background cards");
        assert.ok(await evaluate("[...document.querySelectorAll('.identity-grid img')].every(image=>{const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const context=canvas.getContext('2d');context.drawImage(image,0,0);return context.getImageData(0,0,1,1).data[3]===0})"), "each logo image has real transparent outer pixels");
        assert.ok(await evaluate("(()=>{const cells=[...document.querySelectorAll('.identity-mark')].map(mark=>mark.getBoundingClientRect());return cells.every(cell=>Math.abs(cell.width-cells[0].width)<1 && Math.abs(cell.height-cells[0].height)<1)})()"), "logo cells use consistent sizes");
        assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth"), `${value}px logo grid fits`);
        assert.equal(await evaluate("getComputedStyle(document.querySelector('.identity-section')).opacity"), "1", "scroll entrance finishes visibly");
        assert.deepEqual(await evaluate("[...document.querySelectorAll('.stat-label')].map(item=>item.textContent)"), [
          "transactions supported", "partner AUM", "enterprise value created",
        ], "stats use the requested labels");
        assert.equal(await evaluate("document.getElementById('stats').previousElementSibling.classList.contains('identity-section')"), true, "stats follow the trust logos");
        assert.equal(await evaluate("document.getElementById('stats').nextElementSibling.id"), "product-offerings", "offerings follow the stats");
        assert.equal(await evaluate("document.getElementById('product-offerings').nextElementSibling.id"), "get-in-touch", "contact follows the offerings");
        assert.equal(await evaluate("document.getElementById('product-offerings-title').textContent"), "Product offerings");
        assert.deepEqual(await evaluate("[...document.querySelectorAll('.product-card-title')].map(item=>item.textContent.trim())"), [
          "Buyside advisory", "Market mapping", "Expert sourcing", "Agentic sales", "Sourcing software",
        ], "all five offerings appear in the requested order");
        await evaluate("document.getElementById('product-offerings').scrollIntoView({behavior:'instant'})");
        await pause(900);
        assert.equal(await evaluate("getComputedStyle(document.getElementById('product-offerings')).opacity"), "1", "offerings reveal on scroll");
        assert.equal(await evaluate("document.querySelectorAll('.product-card p, .product-card details, .product-card a, .product-card button').length"), 0, "product descriptions and controls are removed");
        assert.ok(await evaluate("[...document.querySelectorAll('.product-card')].every(card=>card.children.length===2 && card.querySelector('svg') && card.querySelector('h3'))"), "cards contain only icons and offering names");
        assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth"), `${value}px offerings fit without overflow`);
        assert.equal(await evaluate("document.getElementById('get-in-touch-title').textContent"), "Get in touch");
        assert.equal(await evaluate("document.querySelector('.contact-cta-button').getAttribute('href')"), "contact.html", "bottom CTA opens the contact form");
        assert.equal(await evaluate("document.querySelector('.contact-cta-button').textContent"), "Contact");
        assert.equal(await evaluate("document.querySelector('#who-we-work-with')"), null, "audiences are replaced by the simple contact CTA");
        await evaluate("document.getElementById('get-in-touch').scrollIntoView({behavior:'instant'})");
        await pause(900);
        assert.equal(await evaluate("getComputedStyle(document.getElementById('get-in-touch')).opacity"), "1", "contact CTA is visible on scroll");
        assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth"), `${value}px contact CTA fits`);
        assert.equal(await evaluate("document.querySelector('#how-it-works, #offerings, .offer-card')"), null, "process section and service cards are removed");
        assert.equal(await evaluate("document.querySelector('main > section:last-child').id"), "get-in-touch", "contact CTA leads directly to the footer");
        await evaluate("scrollTo({top:0,behavior:'instant'})");
        await pause(250);
        assert.equal(await evaluate("document.querySelector('.home-nav').classList.contains('is-scrolled')"), false, "header restores on scrolling up");
        await evaluate("document.getElementById('identity-title').scrollIntoView({behavior:'instant'})");
        await pause(250);
        assert.ok(await evaluate("scrollY > 300"), "reload starts from a scrolled page");
        await send("Page.reload", { ignoreCache: true });
        await pause(1400);
        assert.equal(await evaluate("scrollY"), 0, `${value}px homepage reload starts at top`);
        assert.equal(await evaluate("document.querySelector('.home-nav').classList.contains('is-scrolled')"), false, "reload restores over-video header");
      } else {
        assert.match(await evaluate("getComputedStyle(document.querySelector('body > nav')).backgroundColor"), /^rgba?\(250, 251, 253/, "careers keeps light header");
        assert.equal(await evaluate("getComputedStyle(document.querySelector('body > nav .nav-cta')).backgroundColor"), "rgba(0, 0, 0, 0)", "careers page contact link is unfilled");
        assert.equal(await evaluate("document.querySelector('.careers-hero')"), null, "careers intro is removed");
        assert.equal(await evaluate("document.querySelector('#main > :first-child').className"), "roles", "careers begins with open roles");
        assert.ok(await evaluate("document.querySelector('.roles-header').getBoundingClientRect().top >= document.querySelector('body > nav').getBoundingClientRect().bottom"), "roles start below the fixed navigation");
        assert.ok(await evaluate("(()=>{const r=document.querySelector('body > nav .logo').getBoundingClientRect();return Math.abs((r.left+r.right)/2-document.documentElement.clientWidth/2)<2})()"), "careers logo is centered like the homepage");
        assert.equal(await evaluate("document.querySelector('body > nav .nav-cta').getAttribute('href')"), "contact.html");
        await navigate("/contact.html");
        assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth"), `${value}px contact has no overflow`);
        assert.equal(await evaluate("document.querySelector('#contact-form').hidden"), false);
        assert.deepEqual(await evaluate("[...document.querySelectorAll('#contact-form input, #contact-form textarea')].map(field=>[field.name,field.required])"), [
          ["name", true], ["email", true], ["phone", false], ["firm", true], ["notes", true],
        ], "contact fields and required/optional states match the request");
        assert.equal(await evaluate("document.querySelector('label[for=\"contact-notes\"]').textContent"), "Any notes for our conversation");
        assert.ok(await evaluate("document.querySelector('label[for=\"contact-phone\"]').textContent.includes('optional')"));
      }
    }
  }
  await width(1280);
  await navigate("/");
  const finalStats = ["100+", "$500B+", "$1B+"];
  assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-count-to]')].map(item=>item.textContent)"), finalStats, "final stats exist before scrolling");
  assert.ok(await evaluate("[...document.querySelectorAll('[data-count-to]')].every(item=>!item.dataset.counterState)"), "counters wait until they are visible");
  await evaluate("document.getElementById('stats').scrollIntoView({behavior:'instant'})");
  await pause(150);
  assert.ok(await evaluate("[...document.querySelectorAll('[data-count-to]')].every(item=>item.dataset.counterState==='running')"), "all visible stats begin counting");
  assert.notDeepEqual(await evaluate("[...document.querySelectorAll('[data-count-to]')].map(item=>item.textContent)"), finalStats, "intermediate counts are rendered");
  assert.match(await evaluate("document.querySelector('[data-count-to=\"1\"]').textContent"), /^\$0\.\dB\+$/, "$1B visibly animates using fractional billions");
  await pause(1800);
  assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-count-to]')].map(item=>item.textContent)"), finalStats, "counters land on exact requested values");
  await evaluate("scrollTo({top:0,behavior:'instant'})");
  await pause(100);
  await evaluate("document.getElementById('stats').scrollIntoView({behavior:'instant'})");
  await pause(100);
  assert.ok(await evaluate("[...document.querySelectorAll('[data-count-to]')].every(item=>item.dataset.counterState==='complete')"), "counters do not restart on repeat scrolling");
  await navigate("/");
  await evaluate("document.getElementById('stats').scrollIntoView({behavior:'instant'})");
  await pause(100);
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await pause(100);
  assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-count-to]')].map(item=>item.textContent)"), finalStats, "enabling reduced motion finishes active counters");
  await send("Emulation.setEmulatedMedia", { features: [] });
  const noStatsObserver = await send("Page.addScriptToEvaluateOnNewDocument", { source: "delete window.IntersectionObserver;" });
  await navigate("/");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-count-to]')].map(item=>item.textContent)"), finalStats, "unsupported observers retain the final stats");
  assert.ok(await evaluate("[...document.querySelectorAll('[data-count-to]')].every(item=>item.dataset.counterState==='complete')"));
  await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: noStatsObserver.identifier });
  await navigate("/#get-in-touch");
  assert.ok(await evaluate("scrollY > 300"), "direct section links still reach their target");
  await evaluate("document.querySelector('.contact-cta-button').click()");
  await pause(900);
  assert.equal(await evaluate("location.pathname"), "/contact.html", "bottom Contact button opens the form page");
  assert.equal(await evaluate("document.querySelector('#contact-form').hidden"), false);
  await navigate("/");
  await evaluate("document.getElementById('identity-title').scrollIntoView({behavior:'instant'})");
  await pause(250);
  const savedScroll = await evaluate("scrollY");
  await navigate("/careers.html");
  const navigationHistory = await send("Page.getNavigationHistory");
  await send("Page.navigateToHistoryEntry", { entryId: navigationHistory.entries[navigationHistory.currentIndex - 1].id });
  await pause(1400);
  assert.ok(Math.abs((await evaluate("scrollY")) - savedScroll) < 5, "browser Back still restores the previous homepage position");
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
  assert.ok(await evaluate("document.querySelector('.hero-video').disablePictureInPicture && !document.querySelector('.hero-video').controls"), "background video has no picture-in-picture pop-out or native controls");
  assert.ok(await evaluate("(()=>{const b=document.querySelector('[data-video-toggle]');const s=getComputedStyle(b);return b.textContent==='' && b.getAttribute('aria-label')==='Pause background video' && b.dataset.state==='playing' && s.backgroundColor==='rgba(0, 0, 0, 0)' && s.borderTopWidth==='0px' && b.getBoundingClientRect().width>=44})()"), "subtle accessible pause icon with usable tap target");
  assert.ok(await evaluate("Math.abs(document.querySelector('.hero-video').duration - 48) < .3"), "four full scenes use straight cuts with no transition overlap");
  const sampleVideoFrame = (time) => evaluate(`new Promise((resolve, reject) => {
      const video = document.querySelector('.hero-video');
      const timeout = setTimeout(() => reject(new Error('Scene seeking timed out')), 5000);
      video.addEventListener('seeked', () => {
        clearTimeout(timeout);
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 36;
        const context = canvas.getContext('2d');
        context.drawImage(video, 0, 0, 64, 36);
        const pixels = context.getImageData(0, 0, 64, 36).data;
        resolve({
          hash: pixels.reduce((hash, byte) => Math.imul(hash ^ byte, 16777619) >>> 0, 2166136261),
          brightness: pixels.reduce((total, byte, index) => total + (index % 4 === 3 ? 0 : byte), 0) / (64 * 36 * 3),
        });
      }, {once: true});
      video.currentTime = ${time};
    })`);
  const scenes = [];
  for (const time of [3, 14, 26, 38]) {
    scenes.push((await sampleVideoFrame(time)).hash);
  }
  assert.equal(new Set(scenes).size, 4, "four different supplied scenes decode in the rotation");
  for (const time of [12, 24, 36]) {
    assert.ok((await sampleVideoFrame(time)).brightness > 40, `cut at ${time}s starts directly on footage, not a black opening`);
  }
  await evaluate("document.querySelector('.hero-video').currentTime = document.querySelector('.hero-video').duration - .2");
  await pause(900);
  assert.ok(await evaluate("document.querySelector('.hero-video').currentTime < 2 && !document.querySelector('.hero-video').paused"), "rotation wraps back to opening footage automatically");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.hero h1')).color"), "rgb(250, 251, 253)");
  await evaluate("document.querySelector('[data-video-toggle]').click()");
  assert.ok(await evaluate("document.querySelector('.hero-video').paused"), "pause control works");
  assert.ok(await evaluate("(()=>{const b=document.querySelector('[data-video-toggle]');return b.dataset.state==='paused' && b.getAttribute('aria-label')==='Play background video'})()"), "paused control becomes accessible play icon");
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
  assert.equal(await evaluate("document.querySelector('h1').textContent"), "The next generation of buyside M&A advisory is here");
  assert.equal(await evaluate("document.querySelector('.hero-positioning')"), null);
  assert.equal(await evaluate("document.querySelector('audio, .audio-section, #voicemail-heading')"), null, "voicemail listening section was removed");
  assert.equal(await evaluate("document.body.textContent.includes('Voicemail sample coming soon.')"), false, "no voicemail placeholder remains");
  for (const id of ["get-in-touch"]) {
    await evaluate(`document.getElementById(${JSON.stringify(id)}).scrollIntoView()`);
    await pause(1000);
    assert.ok(await evaluate(`getComputedStyle(document.getElementById(${JSON.stringify(id)}).closest('section')).opacity !== '0'`));
  }

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

  await navigate("/contact.html");
  await evaluate("document.querySelector('#contact-form').requestSubmit()");
  assert.equal(contactRequests, 0, "invalid contact form is not submitted");
  assert.equal(await evaluate("document.activeElement.name"), "name");
  await evaluate("(()=>{const f=document.querySelector('#contact-form');f.elements.name.value='Test Contact';f.elements.email.value='test@example.invalid';f.elements.firm.value='Test Firm';f.elements.notes.value='Intercepted browser test, not a real inquiry.';f.requestSubmit()})()");
  await pause(500);
  assert.equal(contactRequests, 1);
  assert.equal(lastContactPayload.phone, "", "blank optional phone is submitted");
  assert.equal(await evaluate("document.activeElement.name"), "firm", "server field error receives focus");
  assert.equal(await evaluate("document.querySelector('#contact-firm').getAttribute('aria-invalid')"), "true");
  contactReply = { status: 503, body: { error: "Temporary test failure" } };
  await evaluate("document.querySelector('#contact-form').requestSubmit()");
  await pause(500);
  assert.equal(await evaluate("document.querySelector('#contact-status').textContent"), "Temporary test failure");
  assert.equal(await evaluate("document.querySelector('#contact-name').value"), "Test Contact", "server failures preserve values");
  await evaluate("(async()=>{const original=window.fetch;window.fetch=async()=>{throw Error('offline test')};document.querySelector('#contact-form').requestSubmit();await new Promise(resolve=>setTimeout(resolve,200));window.fetch=original})()");
  assert.ok(await evaluate("document.querySelector('#contact-status').textContent.length>0"), "network failures are explicit");
  assert.equal(await evaluate("document.querySelector('#contact-name').value"), "Test Contact");
  contactReply = { status: 201, body: { ok: true, id: "mocked-test-only" } };
  await evaluate("document.querySelector('#contact-form').requestSubmit();document.querySelector('#contact-form').requestSubmit()");
  assert.equal(await evaluate("document.querySelector('#contact-submit').disabled"), true, "pending form cannot be double submitted");
  await pause(500);
  assert.equal(contactRequests, 3, "duplicate submission is suppressed");
  assert.equal(await evaluate("document.querySelector('#contact-success').hidden"), false);
  assert.equal(await evaluate("document.querySelector('#contact-form').hidden"), true);
  assert.equal(await evaluate("document.activeElement.id"), "contact-success");

  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await navigate("/");
  assert.equal(await evaluate("document.querySelector('.hero-video').hasAttribute('src')"), false, "reduced motion does not fetch video");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.home-nav')).transitionDuration"), "0s", "reduced motion disables header transition");
  assert.ok(await evaluate("document.querySelector('[data-video-toggle]').hidden"), "no pointless pause control for static poster");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-video-toggle]')).display"), "none");
  assert.equal(await evaluate("getComputedStyle(document.getElementById('get-in-touch')).opacity"), "1", "contact CTA is visible with reduced motion");
  assert.equal(await evaluate("getComputedStyle(document.getElementById('product-offerings')).opacity"), "1", "offerings are visible with reduced motion");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-count-to]')].map(item=>item.textContent)"), finalStats, "reduced motion shows final stats immediately");
  assert.ok(await evaluate("[...document.querySelectorAll('[data-count-to]')].every(item=>item.dataset.counterState==='complete')"));
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.hero-content')).animationDuration"), "1e-05s");
  await send("Emulation.setScriptExecutionDisabled", { value: true });
  await navigate("/");
  assert.equal(await evaluate("document.querySelectorAll('.offerings-list > li').length"), 5, "all offerings remain available without JavaScript");
  assert.equal(await evaluate("getComputedStyle(document.getElementById('product-offerings')).opacity"), "1");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-count-to]')].map(item=>item.textContent)"), finalStats, "all stats remain readable without JavaScript");
  assert.equal(await evaluate("document.querySelector('.contact-cta-button').getAttribute('href')"), "contact.html", "contact CTA works without JavaScript");
  assert.equal(await evaluate("getComputedStyle(document.getElementById('get-in-touch')).opacity"), "1", "contact CTA is readable without JavaScript");
  assert.equal(await evaluate("document.querySelector('#how-it-works, #offerings, .offer-card')"), null, "removed sections do not return without JavaScript");
  assert.ok(await evaluate("getComputedStyle(document.querySelector('.identity-section')).opacity === '1'"), "identity section readable without JavaScript");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.home-nav')).position"), "absolute", "no-JS header stays with hero rather than becoming unreadable over lower content");
  assert.equal(await evaluate("document.querySelector('.hero-video').hasAttribute('src')"), false, "no-JS uses poster only");
  await navigate("/contact.html");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('#contact-form')).display"), "none", "no-JS form cannot leak details through a GET submission");
  assert.ok(await evaluate("document.querySelector('noscript').textContent.includes('requires JavaScript')"), "no-JS contact limitation is explicit");
  assert.equal(exceptions.length, 0, "no runtime exceptions");
  console.log("PASS desktop/tablet/mobile layouts, shared careers/contact branding, video rotation, motion fallbacks, voicemail removal, and mocked careers/contact submissions");
} finally {
  socket?.close();
  browser.kill("SIGTERM");
  await unlink(fixture).catch(() => {});
  await pause(200);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
