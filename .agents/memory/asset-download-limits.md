---
name: Asset download limits
description: Size limit encountered when delivering original video archives through Library downloads.
---

Keep each file presented through the Library at or below 104,857,600 bytes (100 MiB).

**Why:** A valid original-video ZIP larger than this was rejected with TOO_LARGE, even though smaller ZIP downloads worked.

**How to apply:** Check file sizes before delivery. Offer web-sized assets when appropriate. For larger original archives, split into numbered parts below the limit, verify that concatenating them reproduces the original checksum, and provide reassembly instructions. Clearly distinguish archive parts from independently usable ZIPs.
