---
name: Video preview compatibility
description: Different browser environments can disagree about H.264 playback.
---

The Replit screenshot browser failed to decode an H.264 background clip that played successfully in workspace Chromium. A VP9 WebM alternative resolved playback in the screenshot browser.

**Why:** A poster image or successful media response alone does not prove the background video is playing; browser codec support varies.

**How to apply:** Keep a compatible alternate encoding and real poster fallback. Verify that playback time advances in a browser, and do not infer that a clip is broken everywhere solely from the screenshot browser.
