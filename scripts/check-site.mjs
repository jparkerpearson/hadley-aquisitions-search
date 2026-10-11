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
], { stdio: ["ignore", "ignore", "pipe"] });
let browserErrors = "";
browser.stderr.setEncoding("utf8");
browser.stderr.on("data", chunk => { browserErrors = (browserErrors + chunk).slice(-8000); });
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

  for (const path of ["/", "/careers.html", "/assets/site.css", "/assets/site.js", "/assets/offerings.css", "/assets/offerings.js", "/assets/hadley-logo-blue.webp", "/assets/hadley-logo-white.webp", "/assets/market-map.webp"]) {
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
    assert.doesNotMatch(html, /<footer\b|footer-copy|© 2026 Hadley AI/, `${route} has no copyright footer`);
    const nav = html.match(/<nav\b[\s\S]*?<\/nav>/)?.[0] ?? "";
    assert.match(nav, /class="logo"/, `${route} keeps the header logo`);
    if (route === "/careers.html") {
      assert.match(nav, /<a href="\.\/" class="nav-link">Home<\/a>/, "careers navigation returns home");
      assert.doesNotMatch(nav, /href="careers\.html"/, "careers page has no self-link");
    } else {
      assert.match(nav, /href="careers\.html"/, `${route} keeps the header Careers link`);
    }
  }
  const current = await readFile("careers.html", "utf8");
  const appScript = (html) => html.match(/<script>\s*const APPLY_ENDPOINT[\s\S]*?<\/script>/)?.[0];
  assert.equal(appScript(current), appScript(original), "careers submission behavior unchanged");
  console.log("PASS HTTP assets, security boundaries, audio ranges, and preserved careers application behavior");

  let targets;
  for (let retry = 0; retry < 300; retry++) {
    try { targets = await (await fetch("http://127.0.0.1:9229/json")).json(); break; }
    catch { await pause(100); }
  }
  assert.ok(targets?.length, `Chromium started${browserErrors ? `\n${browserErrors}` : ""}`);
  socket = new WebSocket(targets.find((target) => target.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map();
  const exceptions = [];
  let mockedStatus = 422;
  let intercepted = 0;
  let contactRequests = 0;
  let contactReply = { status: 400, body: { error: "Check your email.", fields: { email: "Test email error" } } };
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
    await waitForPageLoad();
  }
  async function waitForPageLoad() {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate("document.readyState === 'complete'")) {
        await pause(100);
        return;
      }
      await pause(100);
    }
    throw new Error("Page did not finish loading");
  }
  async function waitForReveal(selector) {
    for (let attempt = 0; attempt < 80; attempt++) {
      if (await evaluate(`(() => {const target=document.querySelector(${JSON.stringify(selector)});return target.classList.contains("is-visible") && getComputedStyle(target).opacity === "1";})()`)) return;
      await pause(50);
    }
    throw new Error(`Reveal did not finish: ${selector}`);
  }
  async function width(value) {
    await send("Emulation.setDeviceMetricsOverride", { width: value, height: 900, deviceScaleFactor: 1, mobile: value < 600 });
    await send("Emulation.setTouchEmulationEnabled", { enabled:value < 600, maxTouchPoints:1 });
  }
  async function waitForOffering(index) {
    let stableFrames = 0;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate(`(() => {
        const rail = document.querySelector('.offerings-rail').getBoundingClientRect();
        const page = document.querySelectorAll('.offering-page')[${index}];
        const bounds = page.getBoundingClientRect();
        return page.dataset.active === 'true'
          && page.getAttribute('aria-current') === 'true'
          && Math.abs(bounds.left + bounds.width / 2 - rail.left - rail.width / 2) < 2;
      })()`)) {
        // A swipe can briefly pass through a centered slide while momentum is
        // still running. Wait for stable geometry before the next interaction.
        if (++stableFrames >= 5) return;
      } else stableFrames = 0;
      await pause(40);
    }
    const state = await evaluate("(()=>{const rail=document.querySelector('.offerings-rail');return {width:innerWidth,left:rail.scrollLeft,max:rail.scrollWidth-rail.clientWidth,active:[...rail.children].map(page=>page.dataset.active)}})()");
    throw new Error(`Offering ${index + 1} did not settle in the center: ${JSON.stringify(state)}`);
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
        const sectionHeadings = await evaluate(`[
          ...document.querySelectorAll('.identity-title, #who-we-work-with-title, #product-offerings-title')
        ].map(title => {
          const style = getComputedStyle(title);
          return {size: parseFloat(style.fontSize), weight: Number(style.fontWeight),
            fits: title.scrollWidth <= title.clientWidth + 1};
        })`);
        assert.ok(sectionHeadings.every(title => title.fits && title.weight >= 400), `${value}px headings are confident and unclipped`);
        assert.ok(sectionHeadings.every(title => title.size >= (value > 800 ? 64 : value <= 560 ? 36 : 48)
          && title.size <= 84), `${value}px section heading scale: ${JSON.stringify(sectionHeadings)}`);
        assert.equal(await evaluate("getComputedStyle(document.querySelector('.identity-section')).backgroundColor"),
          await evaluate("getComputedStyle(document.getElementById('stats')).backgroundColor"), "logos and stats form one coherent proof field");
        assert.notEqual(await evaluate("getComputedStyle(document.getElementById('stats')).backgroundColor"),
          await evaluate("getComputedStyle(document.getElementById('who-we-work-with')).backgroundColor"), "audiences have a distinct color field");
        assert.notEqual(await evaluate("getComputedStyle(document.getElementById('who-we-work-with')).backgroundColor"),
          await evaluate("getComputedStyle(document.getElementById('product-offerings')).backgroundColor"), "offerings have a distinct color field");
        assert.equal(await evaluate("getComputedStyle(document.documentElement).scrollSnapType"), "none", "ordinary scrolling is not snapped");
        assert.equal(await evaluate("getComputedStyle(document.querySelector('.identity-section')).animationName"), "none", "large proof section is not animated as a whole");
        assert.deepEqual(await evaluate("[...document.querySelectorAll('.identity-grid img')].map(image=>image.alt)"),
          ["J.P. Morgan", "Blackstone", "Flybridge", "RBC", "Citadel", "Goldman Sachs", "Morgan Stanley", "Galaxy Service Partners"],
          "only the eight requested logos appear, in order");
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
        assert.equal(await evaluate("document.getElementById('stats').nextElementSibling.id"), "who-we-work-with", "audiences follow the stats");
        assert.equal(await evaluate("document.getElementById('who-we-work-with').nextElementSibling.id"), "product-offerings", "offerings follow the audiences");
        assert.equal(await evaluate("document.getElementById('who-we-work-with-title').textContent"), "Who we work with");
        assert.deepEqual(await evaluate("[...document.querySelectorAll('.who-we-work-with-list h3')].map(heading=>heading.textContent)"), [
          "AI roll-ups & high growth AI platforms", "Corporate development teams",
          "Private equity funds", "Private equity portfolio companies",
        ], "exact requested customer groups and order");
        assert.equal(await evaluate("document.querySelectorAll('#who-we-work-with a, #who-we-work-with button, #who-we-work-with p').length"), 0, "audiences have no extra descriptions or actions");
        await evaluate("document.getElementById('who-we-work-with').scrollIntoView({behavior:'instant'})");
        await waitForReveal("#who-we-work-with");
        assert.ok(await evaluate("[...document.querySelectorAll('.who-we-work-with-list h3')].every(heading=>{const title=heading.getBoundingClientRect(),item=heading.closest('li').getBoundingClientRect();return title.left>=item.left-1 && title.right<=item.right+1;})"), `${value}px audience titles fit their rows`);
        assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth"), `${value}px audience section fits the viewport`);
        assert.equal(await evaluate("document.getElementById('product-offerings').nextElementSibling.id"), "get-in-touch", "contact follows the offerings");
        assert.equal(await evaluate("document.getElementById('product-offerings-title').textContent"), "What we do");
        assert.deepEqual(await evaluate("[...document.querySelectorAll('.product-card-title')].map(item=>item.textContent.trim())"), [
          "Buyside advisory", "Market mapping", "Expert sourcing", "Agentic sales", "Sourcing software",
        ], "all five offerings appear in the requested order");
        await evaluate("document.getElementById('product-offerings').scrollIntoView({behavior:'instant'})");
        await waitForReveal("#product-offerings");
        assert.equal(await evaluate("getComputedStyle(document.getElementById('product-offerings')).opacity"), "1", "offerings reveal on scroll");
        assert.equal(await evaluate("document.querySelectorAll('.offering-page p, .offering-page details, .offering-page a, .offering-page button, .product-card-icon').length"), 0, "covers have no descriptions, Learn more buttons or generic product icons");
        assert.equal(await evaluate("document.querySelectorAll('.offering-page').length"), 5);
        assert.ok(await evaluate("[...document.querySelectorAll('.offering-page')].every(card=>card.children.length===2 && card.querySelector('[aria-hidden=\"true\"].offering-art') && card.querySelector('h3'))"), "covers contain only decorative artwork and offering names");
        await waitForOffering(0);
        assert.equal(await evaluate("document.querySelector('.offering-previous').disabled"), true);
        assert.equal(await evaluate("document.querySelector('.offering-next').disabled"), false);
        assert.equal(await evaluate("document.querySelectorAll('.offerings-controls button').length"), 2, "only the two side arrows remain");
        assert.equal(await evaluate("document.querySelector('.offering-pagination, [data-offering-index]')"), null, "numbered navigation is removed");
        assert.ok(await evaluate("(()=>{const status=document.querySelector('.offering-status'),s=getComputedStyle(status);return status.getAttribute('aria-live')==='polite' && s.position==='absolute' && s.clipPath==='inset(50%)' && s.width==='1px' && s.height==='1px';})()"), "current offering is announced without adding visible copy");
        assert.ok(await evaluate("[...document.querySelectorAll('.offerings-controls button')].every(button=>{const r=button.getBoundingClientRect();return r.width>=44 && r.height>=44 && r.left>=0 && r.right<=innerWidth;})"), `${value}px offering controls are usable and unclipped`);
        assert.ok(await evaluate("(()=>{const rail=document.querySelector('.offerings-rail').getBoundingClientRect(),center=rail.top+rail.height/2;return [...document.querySelectorAll('.offerings-controls button')].every(button=>{const r=button.getBoundingClientRect();return Math.abs(r.top+r.height/2-center)<2;});})()"), `${value}px arrows are vertically centered beside the cards`);
        await evaluate("document.querySelector('.offering-next').click()");
        await waitForOffering(1);
        await evaluate("document.querySelector('.offerings-rail').focus({preventScroll:true})");
        await send("Input.dispatchKeyEvent", { type:"keyDown", key:"End", code:"End" });
        await send("Input.dispatchKeyEvent", { type:"keyUp", key:"End", code:"End" });
        await waitForOffering(4);
        assert.equal(await evaluate("document.querySelector('.offering-next').disabled"), true);
        await evaluate("document.querySelector('.offering-previous').click()");
        await waitForOffering(3);
        await evaluate("document.querySelector('.offerings-rail').focus({preventScroll:true})");
        await send("Input.dispatchKeyEvent", { type:"keyDown", key:"Home", code:"Home" });
        await send("Input.dispatchKeyEvent", { type:"keyUp", key:"Home", code:"Home" });
        await waitForOffering(0);
        await send("Input.dispatchKeyEvent", { type:"keyDown", key:"ArrowRight", code:"ArrowRight" });
        await send("Input.dispatchKeyEvent", { type:"keyUp", key:"ArrowRight", code:"ArrowRight" });
        await waitForOffering(1);
        await evaluate("document.querySelector('.offering-next').click()");
        await waitForOffering(2);
        await evaluate("document.querySelector('.offerings-rail').scrollTo({left:0,behavior:'instant'})");
        await waitForOffering(0);
        if (value < 600) {
          const start = await evaluate("(()=>{const r=document.querySelector('.offerings-rail').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+100}})()");
          await send("Input.dispatchTouchEvent", { type:"touchStart", touchPoints:[start] });
          for (let step = 1; step <= 5; step++) {
            await send("Input.dispatchTouchEvent", { type:"touchMove", touchPoints:[{x:start.x-step*30,y:start.y}] });
            await pause(50);
          }
          await send("Input.dispatchTouchEvent", { type:"touchEnd", touchPoints:[] });
          await waitForOffering(1);
          await evaluate("document.querySelector('.offering-previous').click()");
          await waitForOffering(0);
        }
        assert.equal(await evaluate("getComputedStyle(document.getElementById('product-offerings')).backgroundColor"), "rgb(11, 31, 59)", "offerings use the Hadley midnight background");
        assert.ok(await evaluate(`(() => {
          const luminance = color => {
            const channels = color.match(/[0-9.]+/g).slice(0,3).map(value => {
              const s = Number(value)/255;
              return s <= .04045 ? s/12.92 : ((s+.055)/1.055)**2.4;
            });
            return channels[0]*.2126 + channels[1]*.7152 + channels[2]*.0722;
          };
          const section = luminance(getComputedStyle(document.getElementById('product-offerings')).backgroundColor);
          return [...document.querySelectorAll('.offering-page')].every(card => {
            const title = card.querySelector('h3');
            const background = luminance(getComputedStyle(card).backgroundColor);
            const foreground = luminance(getComputedStyle(title).color);
            return background > section && (Math.max(background,foreground)+.05)/(Math.min(background,foreground)+.05) >= 4.5;
          });
        })()`), "lighter blue cards retain accessible title contrast");
        assert.ok(await evaluate("[...document.querySelectorAll('.offering-page')].every(card=> {const title=card.querySelector('h3'); const t=title.getBoundingClientRect(),r=card.getBoundingClientRect(); return title.scrollWidth<=title.clientWidth+1 && t.left>=r.left-1 && t.right<=r.right+1 && t.bottom<=r.bottom+1;})"), `${value}px titles fit inside every cover`);
        // Give the page room to scroll even when the entire compact section
        // already fits near the bottom of a tall, narrow test viewport.
        await evaluate("document.body.insertAdjacentHTML('beforeend','<div data-wheel-spacer aria-hidden=\"true\" style=\"height:300px\"></div>')");
        const wheelPosition = await evaluate("(()=>{const rail=document.querySelector('.offerings-rail'),r=rail.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+100),scroll:scrollY,left:rail.scrollLeft}})()");
        await send("Input.dispatchMouseEvent", { type:"mouseWheel", x:wheelPosition.x, y:wheelPosition.y, deltaX:0, deltaY:160 });
        await pause(200);
        assert.ok(await evaluate(`scrollY > ${wheelPosition.scroll} + 20`), "vertical wheel continues down the page rather than cycling cards");
        assert.ok(await evaluate(`Math.abs(document.querySelector('.offerings-rail').scrollLeft - ${wheelPosition.left}) < 2`), "vertical wheel does not move the horizontal rail");
        await evaluate("document.querySelector('[data-wheel-spacer]').remove()");
        assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth"), `${value}px offerings fit without overflow`);
        assert.equal(await evaluate("document.querySelector('#get-in-touch h2').textContent"), "Get in touch");
        assert.equal(await evaluate("document.querySelector('.contact-cta-button')"), null, "standalone contact button is removed");
        assert.equal(await evaluate("document.querySelector('body > nav .nav-cta').getAttribute('href')"), "#get-in-touch", "homepage Contact scrolls to the inline form");
        assert.equal(await evaluate("getComputedStyle(document.querySelector('#get-in-touch')).backgroundColor"), "rgb(11, 31, 59)", "contact continues the dark offerings background");
        assert.deepEqual(await evaluate("[...document.querySelectorAll('#contact-form input, #contact-form textarea')].map(field=>[field.name,field.required])"),
          [["name",true],["email",true]], "inline form has only name and work email");
        assert.equal(await evaluate("document.querySelector('label[for=\"contact-email\"]').textContent"), "Work Email");
        await evaluate("document.getElementById('get-in-touch').scrollIntoView({behavior:'instant'})");
        await waitForReveal("#get-in-touch");
        assert.equal(await evaluate("getComputedStyle(document.getElementById('get-in-touch')).opacity"), "1", "contact CTA is visible on scroll");
        assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('#contact-form input, #contact-form textarea, #contact-submit')].every(field=>{const r=field.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth;})"), `${value}px inline form fits`);
        assert.equal(await evaluate("document.querySelector('#how-it-works, #offerings, .offer-card')"), null, "process section and service cards are removed");
        assert.equal(await evaluate("document.querySelector('main > section:last-child').id"), "get-in-touch", "contact CTA finishes the page");
        await evaluate("scrollTo({top:0,behavior:'instant'})");
        await pause(250);
        assert.equal(await evaluate("document.querySelector('.home-nav').classList.contains('is-scrolled')"), false, "header restores on scrolling up");
        await evaluate("document.getElementById('identity-title').scrollIntoView({behavior:'instant'})");
        await pause(250);
        assert.ok(await evaluate("scrollY > 300"), "reload starts from a scrolled page");
        await send("Page.reload", { ignoreCache: true });
        await pause(1400);
        await waitForPageLoad();
        assert.equal(await evaluate("scrollY"), 0, `${value}px homepage reload starts at top`);
        assert.equal(await evaluate("document.querySelector('.home-nav').classList.contains('is-scrolled')"), false, "reload restores over-video header");
      } else {
        assert.match(await evaluate("getComputedStyle(document.querySelector('body > nav')).backgroundColor"), /^rgba?\(250, 251, 253/, "careers keeps light header");
        assert.equal(await evaluate("getComputedStyle(document.querySelector('body > nav .nav-cta')).backgroundColor"), "rgba(0, 0, 0, 0)", "careers page contact link is unfilled");
        assert.equal(await evaluate("document.querySelector('.careers-hero')"), null, "careers intro is removed");
        assert.equal(await evaluate("document.querySelector('#main > :first-child').className"), "roles", "careers begins with open roles");
        assert.ok(await evaluate("document.querySelector('.roles-header').getBoundingClientRect().top >= document.querySelector('body > nav').getBoundingClientRect().bottom"), "roles start below the fixed navigation");
        assert.equal(await evaluate("document.querySelectorAll('.role-aside, .role-facts').length"), 0, "role side panels removed");
        assert.equal(await evaluate("document.querySelectorAll('details.role').length"), 2);
        assert.ok(await evaluate("[...document.querySelectorAll('details.role')].every(role=>!role.open)"), "job descriptions begin collapsed");
        await evaluate("document.querySelector('#origination-lead > summary').click()");
        assert.equal(await evaluate("document.querySelector('#origination-lead').open"), true);
        assert.equal(await evaluate("document.querySelector('#origination-lead .role-row-title').textContent"), "Founding Origination Lead");
        assert.deepEqual(await evaluate("[...document.querySelectorAll('#origination-lead .role-body h3')].map(heading=>heading.textContent)"), ["Location", "Responsibilities", "Profile", "Comp"]);
        assert.deepEqual(await evaluate("[...document.querySelectorAll('#origination-lead .role-body p')].map(paragraph=>paragraph.textContent)"), [
          "SF, in office 5 days / week",
          "High ownership sales role focused on helping clients source M&A deals",
          "Looking for ex-SaaS sales or experience with outbound deal sourcing at a PE fund / buyside bank. Hardworking, outcome-motivated, hungry, moves fast. Thinks tech natively. Wants to be a founder or own their own business one day. Startup experience is a big plus",
          "$300K+",
        ]);
        assert.ok(await evaluate("document.querySelector('#origination-lead [data-apply]').checkVisibility()"), "expanded role has a visible Apply button");
        assert.equal(await evaluate("document.querySelector('#founding-applied-ai-engineer').open"), false, "opening a role leaves the other collapsed");
        await evaluate("document.querySelector('#founding-applied-ai-engineer > summary').focus()");
        await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r", unmodifiedText: "\r" });
        await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
        assert.equal(await evaluate("document.querySelector('#founding-applied-ai-engineer').open"), true, "roles expand with the keyboard");
        assert.deepEqual(await evaluate("[...document.querySelectorAll('#founding-applied-ai-engineer .role-body h3')].map(heading=>heading.textContent)"), ["Location", "Responsibilities", "Profile", "Comp"], "engineering role uses the matching four-section structure");
        assert.deepEqual(await evaluate("[...document.querySelectorAll('#founding-applied-ai-engineer .role-body p')].map(paragraph=>paragraph.textContent)"), [
          "SF, in office 5 days / week",
          "Improve our SOTA research agents. Iterate on the voice model and reduce its mistake rate. Increase coverage of the capital allocation reasoning model.",
          "Familiar with how a computer works, from assembly to high-level languages. Comfortable working with cloud infrastructure, or able to learn it quickly. Elite use of coding agents.",
          "In line with best-in-class AI startups",
        ]);
        assert.equal(await evaluate("document.querySelector('#founding-applied-ai-engineer').textContent.includes('$300K')"), false, "origination compensation does not appear in the engineering role");
        assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth"), `${value}px expanded roles fit`);
        await evaluate("document.querySelectorAll('details.role > summary').forEach(summary=>summary.click())");
        assert.ok(await evaluate("[...document.querySelectorAll('details.role')].every(role=>!role.open)"), "each role collapses again");
        assert.ok(await evaluate("(()=>{const r=document.querySelector('body > nav .logo').getBoundingClientRect();return Math.abs((r.left+r.right)/2-document.documentElement.clientWidth/2)<2})()"), "careers logo is centered like the homepage");
        assert.equal(await evaluate("document.querySelector('body > nav .nav-cta').getAttribute('href')"), "contact.html");
        await navigate("/contact.html");
        assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth"), `${value}px contact has no overflow`);
        assert.equal(await evaluate("document.querySelector('#contact-form').hidden"), false);
        assert.deepEqual(await evaluate("[...document.querySelectorAll('#contact-form input, #contact-form textarea')].map(field=>[field.name,field.required])"), [
          ["name", true], ["email", true],
        ], "contact fields and required/optional states match the request");
        assert.equal(await evaluate("document.querySelector('label[for=\"contact-email\"]').textContent"), "Work Email");
      }
    }
  }
  await width(1280);
  await navigate("/careers.html#founding-applied-ai-engineer");
  assert.equal(await evaluate("document.querySelector('#founding-applied-ai-engineer').open"), true, "direct engineer links expand the role");
  await evaluate("location.hash='#origination-lead'");
  await pause(200);
  assert.equal(await evaluate("document.querySelector('#origination-lead').open"), true, "hash changes open the matching role");
  await navigate("/careers.html#head-of-origination");
  assert.equal(await evaluate("location.hash"), "#origination-lead", "legacy role links remain canonical");
  assert.equal(await evaluate("document.querySelector('#origination-lead').open"), true, "legacy role links expand the role");
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
  assert.ok(await evaluate(`[
    ...document.querySelectorAll('.identity-title, .identity-mark, .who-we-work-with h2, .who-we-work-with-list li, .product-offerings h2, .offering-page, .home-contact .contact-title')
  ].every(item => getComputedStyle(item).opacity === '1' && getComputedStyle(item).transform === 'none')`),
  "reduced motion immediately shows every heading, logo, audience and offering");
  await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: noStatsObserver.identifier });
  await navigate("/#get-in-touch");
  assert.ok(await evaluate("scrollY > 300"), "direct section links still reach their target");
  await evaluate("document.querySelector('.home-nav .nav-cta').click()");
  await pause(900);
  assert.equal(await evaluate("location.pathname"), "/", "homepage Contact keeps visitors on the homepage");
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
  await evaluate("document.body.insertAdjacentHTML('beforeend','<div data-test-spacer style=\"height:1000px\"></div>'); document.querySelector('[data-test-spacer]').scrollIntoView({behavior:'instant'})");
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
  await evaluate("document.querySelector('#origination-lead > summary').click()");
  await evaluate("document.querySelector('[data-apply]').click()");
  assert.ok(await evaluate("document.querySelector('dialog').open"), "apply opens");
  assert.equal(await evaluate("document.querySelector('#apply-title').textContent"), "Founding Origination Lead");
  assert.equal(await evaluate("document.querySelector('#apply-form').elements.role.value"), "Founding Origination Lead", "application identifies the renamed opening");
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await pause(100);
  assert.equal(await evaluate("document.querySelector('dialog').open"), false, "Escape closes native dialog");
  await evaluate("document.querySelector('[data-apply]').focus(); document.querySelector('[data-apply]').click()");
  await evaluate("document.querySelector('[data-close]').click()");
  assert.equal(await evaluate("document.querySelector('dialog').open"), false);
  assert.equal(await evaluate("document.activeElement.matches('[data-apply]')"), true, "focus returns to apply button");
  await evaluate("document.querySelector('#founding-applied-ai-engineer > summary').click(); document.querySelectorAll('[data-apply]')[1].click()");
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

  for (const contactRoute of ["/#get-in-touch", "/contact.html"]) {
    contactRequests = 0;
    contactReply = { status: 400, body: { error: "Check your email.", fields: { email: "Test email error" } } };
    await navigate(contactRoute);
    await evaluate("document.querySelector('#contact-form').requestSubmit()");
    assert.equal(contactRequests, 0, "invalid contact form is not submitted");
    assert.equal(await evaluate("document.activeElement.name"), "name");
    await evaluate("(()=>{const f=document.querySelector('#contact-form');f.elements.name.value='Test Contact';f.elements.email.value='test@example.invalid';f.requestSubmit()})()");
    await pause(500);
    assert.equal(contactRequests, 1);
    assert.deepEqual(Object.keys(lastContactPayload).sort(), ["email", "name"], "only name and work email are submitted");
    assert.equal(await evaluate("document.activeElement.name"), "email", "server field error receives focus");
    assert.equal(await evaluate("document.querySelector('#contact-email').getAttribute('aria-invalid')"), "true");
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
  }

  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await navigate("/");
  assert.equal(await evaluate("document.querySelector('.hero-video').hasAttribute('src')"), false, "reduced motion does not fetch video");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.home-nav')).transitionDuration"), "0s", "reduced motion disables header transition");
  assert.ok(await evaluate("document.querySelector('[data-video-toggle]').hidden"), "no pointless pause control for static poster");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-video-toggle]')).display"), "none");
  assert.equal(await evaluate("getComputedStyle(document.getElementById('get-in-touch')).opacity"), "1", "contact CTA is visible with reduced motion");
  assert.equal(await evaluate("getComputedStyle(document.getElementById('product-offerings')).opacity"), "1", "offerings are visible with reduced motion");
  assert.equal(await evaluate("getComputedStyle(document.getElementById('who-we-work-with')).opacity"), "1", "audiences are visible with reduced motion");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-count-to]')].map(item=>item.textContent)"), finalStats, "reduced motion shows final stats immediately");
  assert.ok(await evaluate("[...document.querySelectorAll('[data-count-to]')].every(item=>item.dataset.counterState==='complete')"));
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.hero-content')).animationDuration"), "1e-05s");
  await send("Emulation.setScriptExecutionDisabled", { value: true });
  await navigate("/");
  assert.equal(await evaluate("document.querySelectorAll('.offerings-rail > li').length"), 5, "all offerings remain available without JavaScript");
  assert.equal(await evaluate("document.querySelector('.offerings-controls').hidden"), true, "inactive carousel buttons are hidden without JavaScript");
  assert.ok(await evaluate("[...document.querySelectorAll('.offering-page')].every(page=>getComputedStyle(page).opacity==='1')"), "all covers are readable without JavaScript");
  assert.equal(await evaluate("document.querySelectorAll('.who-we-work-with-list > li').length"), 4, "all customer groups remain available without JavaScript");
  assert.equal(await evaluate("getComputedStyle(document.getElementById('who-we-work-with')).opacity"), "1", "audiences remain visible without JavaScript");
  assert.equal(await evaluate("getComputedStyle(document.getElementById('product-offerings')).opacity"), "1");
  await navigate("/careers.html");
  assert.ok(await evaluate("[...document.querySelectorAll('details.role')].every(role=>!role.open)"));
  await evaluate("document.querySelector('#origination-lead > summary').click()");
  assert.equal(await evaluate("document.querySelector('#origination-lead').open"), true, "native job descriptions expand without JavaScript");
  await navigate("/");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-count-to]')].map(item=>item.textContent)"), finalStats, "all stats remain readable without JavaScript");
  assert.equal(await evaluate("document.querySelector('.home-nav .nav-cta').getAttribute('href')"), "#get-in-touch", "contact section link works without JavaScript");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('#contact-form')).display"), "none", "no-JS inline form cannot leak details through a GET submission");
  assert.ok(await evaluate("document.querySelector('noscript').textContent.includes('requires JavaScript')"), "no-JS inline form limitation is explicit");
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
