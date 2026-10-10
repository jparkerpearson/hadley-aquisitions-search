import { Client } from "@replit/object-storage";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// This is the only storage object exposed publicly. Never accept an object path from a request.
export const mountainObjects = {
  mp4: "hadley/mountain-hero.mp4",
  webm: "hadley/mountain-hero.webm",
};
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pending = new Map();

async function loadMountainVideo(format) {
  try {
    const client = new Client();
    await client.getBucket();
    const directory = await mkdtemp(join(tmpdir(), "hadley-media-"));
    const cached = join(directory, `mountain-hero.${format}`);
    const result = await client.downloadToFilename(mountainObjects[format], cached);
    if (!result.ok) throw new Error("Mountain video could not be retrieved from App Storage.");
    console.log("Mountain video loaded from App Storage.");
    return cached;
  } catch {
    const preview = resolve(root, `generated-artifacts/mountain-hero.${format}`);
    try {
      if (!(await stat(preview)).isFile()) throw new Error("Not a file");
    } catch {
      throw new Error("Mountain video unavailable: create an App Storage bucket and run npm run upload:mountain.");
    }
    console.warn("Mountain video is using the local Preview copy. Upload it to App Storage before publishing; generated-artifacts is excluded from deployment.");
    return preview;
  }
}

export function getMountainVideo(format) {
  if (!Object.hasOwn(mountainObjects, format)) throw new Error("Unsupported media format.");
  if (!pending.has(format)) {
    pending.set(format, loadMountainVideo(format).catch((error) => {
      pending.delete(format);
      throw error;
    }));
  }
  return pending.get(format);
}
