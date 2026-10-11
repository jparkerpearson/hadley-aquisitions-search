import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const source = await readFile(new URL("../assets/stats.js", import.meta.url), "utf8");
const final = ["100+", "$500B+", "$1B+"];

function setup() {
  const elements = [100, 500, 1].map((target, index) => ({
    dataset: { countTo:String(target), countPrefix:index ? "$" : "", countSuffix:index ? "B+" : "+" },
    textContent:final[index],
    closest() { return this; },
  }));
  const frames = new Map();
  let nextFrame = 0;
  let observer;
  let motionChange;
  const motion = { matches:false, addEventListener(_name, callback) { motionChange = callback; } };
  runInNewContext(source, {
    document: { querySelectorAll:() => elements },
    performance: { now:() => 0 },
    window: {
      matchMedia:() => motion,
      IntersectionObserver:true,
      requestAnimationFrame(callback) { frames.set(++nextFrame, callback); return nextFrame; },
      cancelAnimationFrame(id) { frames.delete(id); },
    },
    IntersectionObserver:class {
      constructor(callback) { this.callback = callback; observer = this; }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  });
  const enter = () => observer.callback(elements.map(target => ({ target, isIntersecting:true })));
  const tick = (now) => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach(callback => callback(now));
  };
  return { elements, frames, enter, tick, reduceMotion() { motion.matches = true; motionChange(); } };
}

for (const fps of [30, 60, 120]) {
  const test = setup();
  assert.deepEqual(test.elements.map(element => element.textContent), final, "static values stay intact before scrolling");
  test.enter();
  const samples = [];
  for (let frame = 1; frame <= fps * 2; frame++) {
    const now = frame * 1000 / fps;
    test.tick(now);
    samples.push({ now, values:test.elements.map(element => element.textContent) });
  }
  for (const [index, penultimate] of ["99+", "$499B+", "$0.9B+"].entries()) {
    const first = samples.find(sample => sample.values[index] === penultimate);
    const complete = samples.find(sample => sample.values[index] === final[index]);
    assert.ok(complete, `${fps}fps counter ${index} completes`);
    if (first) assert.ok(complete.now - first.now <= 210, `${fps}fps ${penultimate} does not linger`);
  }
  assert.deepEqual(test.elements.map(element => element.textContent), final);
  assert.ok(test.elements.every(element => element.dataset.counterState === "complete"));
  test.enter();
  assert.equal(test.frames.size, 0, "counters do not restart");
}

const reduced = setup();
reduced.enter();
reduced.tick(800);
reduced.reduceMotion();
assert.deepEqual(reduced.elements.map(element => element.textContent), final, "runtime reduced motion finishes every counter");
assert.equal(reduced.frames.size, 0, "no animation frames remain");
console.log("PASS counters at 30/60/120fps: no final-step stalls, exact totals, no restart, and reduced motion");
