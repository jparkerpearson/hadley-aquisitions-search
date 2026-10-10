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
    if (digest(stored.value) !== digest(await readFile(source))) throw new Error("Stored file does not match the original.");
  }
  console.log("Mountain video saved and verified in App Storage. Restart Website preview to use the stored copy.");
} catch {
  console.error("Could not save the video. Create a bucket in All tools → App Storage, then run npm run upload:mountain.");
  process.exitCode = 1;
}
