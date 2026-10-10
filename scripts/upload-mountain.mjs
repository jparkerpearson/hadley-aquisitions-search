import { Client } from "@replit/object-storage";
import { mountainObjects } from "./mountain-media.mjs";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

try {
  const client = new Client();
  await client.getBucket();
  const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
  for (const [format, object] of Object.entries(mountainObjects)) {
    const source = fileURLToPath(new URL(`../generated-artifacts/mountain-hero.${format}`, import.meta.url));
    const result = await client.uploadFromFilename(object, source);
    if (!result.ok) throw new Error("Upload failed.");
    const stored = await client.downloadAsBytes(object);
    if (!stored.ok) throw new Error("Upload verification failed.");
    // SDK 1.0 returns the GCS download tuple, although its documentation says Buffer.
    const bytes = Buffer.isBuffer(stored.value) ? stored.value
      : Array.isArray(stored.value) && stored.value.length === 1 && Buffer.isBuffer(stored.value[0])
        ? stored.value[0] : null;
    if (!bytes) throw new Error("Unrecognized storage download response.");
    if (digest(bytes) !== digest(await readFile(source))) throw new Error("Stored file does not match the original.");
  }
  console.log("Mountain video saved and verified in App Storage. Restart Website preview to use the stored copy.");
} catch {
  console.error("Could not save or verify the video. Check the App Storage bucket configuration, then run npm run upload:mountain.");
  process.exitCode = 1;
}
