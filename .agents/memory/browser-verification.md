---
name: Browser verification timing
description: Avoid timing-only browser-test failures under concurrent preview captures.
---

Do not treat a fixed wall-clock delay as proof that a browser, page, or visual transition has finished.

**Why:** Concurrent preview screenshots and Chromium tests have produced timing-only failures in this workspace even when the visible UI was working.

**How to apply:** Wait for the debugging endpoint, document loading, and animation state under bounded deadlines. Distinguish browser-startup or test-timing problems from application errors before changing working UI.

For off-screen playback checks, measure the hero's actual viewport bounds rather than assuming that scrolling the footer into view hides the hero.

**Why:** Native scrolling respects the document's scroll padding for the fixed header. On a hero-only homepage, scrolling the footer into view still leaves part of the hero visible.

**How to apply:** Scroll to an absolute position past the hero and confirm its bounds are outside the viewport before expecting off-screen playback behavior.
