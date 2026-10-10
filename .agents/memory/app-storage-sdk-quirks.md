---
name: App Storage SDK quirks
description: Undocumented byte-download response behavior observed in the Replit SDK.
---

The installed `@replit/object-storage` 1.0 SDK's `downloadAsBytes` returns the underlying GCS single-element `[Buffer]` tuple, despite documenting its value as a `Buffer`.

**Why:** An upload succeeded, but verification failed because its returned tuple was passed directly to a hash function expecting bytes. This was not a missing bucket or failed upload.

**How to apply:** Check the installed SDK implementation when byte-download types seem inconsistent. Accept verified `Buffer` or single-element `[Buffer]` results and reject unexpected shapes explicitly. Do not report every verification failure as a storage-configuration failure.
