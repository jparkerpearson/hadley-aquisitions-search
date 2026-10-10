import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, copyFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const output = `${root}generated-artifacts`;
// Uploaded clip 4 leads at 2× speed, then 1, 2, 3 at their original speed.
// Twelve-second excerpts keep the background moving through all four scenes.
const clips = [
  { file: "15433444_3840_2160_30fps_1791662280693.mp4", speed: 2 },
  // This upload starts with black frames. Start on the fully visible mountain.
  { file: "10905810-hd_3840_2160_25fps_1791662029224.mp4", speed: 1, start: 0.6 },
  { file: "10976054-hd_3840_2160_25fps_1791662073290.mp4", speed: 1 },
  { file: "6900954-uhd_3840_2160_30fps_1791662181759.mp4", speed: 1 },
];
const ffmpeg = (args) => run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { maxBuffer: 1024 * 1024 });
await mkdir(output, { recursive: true });
const reuseScenes = process.argv.includes("--reuse-scenes");

for (const [index, clip] of clips.entries()) {
  // Rebuild trimmed scenes so a previously cached black opening cannot survive.
  if (reuseScenes && !clip.start) {
    const scene = `${output}/rotation-scene-${index}.mp4`;
    if (!(await stat(scene)).size) throw new Error(`Missing normalized scene: ${scene}`);
    console.log(`Reusing scene ${index + 1}`);
    continue;
  }
  console.log(`Preparing scene ${index + 1}: ${clip.speed}× speed`);
  await ffmpeg([
    "-ss", String(clip.start ?? 0), "-threads", "2", "-i", `${root}attached_assets/${clip.file}`, "-an",
    "-vf", `scale=1920:1080,setsar=1,setpts=(PTS-STARTPTS)/${clip.speed},fps=25`,
    "-t", "12", "-c:v", "libx264", "-threads", "2", "-preset", "fast",
    "-crf", "19", "-pix_fmt", "yuv420p", `${output}/rotation-scene-${index}.mp4`,
  ]);
}

// Join the four excerpts directly, with no fades — including at the loop boundary.
const filters = "[0:v][1:v][2:v][3:v]concat=n=4:v=1:a=0[out]";

console.log("Building four-scene rotation with straight cuts");
await ffmpeg([
  ...clips.flatMap((_, index) => ["-threads", "2", "-i", `${output}/rotation-scene-${index}.mp4`]),
  "-filter_complex_threads", "2", "-filter_complex", filters, "-map", "[out]", "-an",
  "-c:v", "libx264", "-threads", "2", "-preset", "fast", "-crf", "26",
  "-maxrate", "3000k", "-bufsize", "6000k", "-pix_fmt", "yuv420p",
  "-movflags", "+faststart", `${output}/mountain-rotation.mp4`,
]);
console.log("Preparing compatible WebM alternative");
await ffmpeg([
  "-i", `${output}/mountain-rotation.mp4`, "-an", "-c:v", "libvpx-vp9",
  "-row-mt", "1", "-threads", "4", "-cpu-used", "5", "-b:v", "1700k",
  `${output}/mountain-rotation.webm`,
]);
await copyFile(`${output}/mountain-rotation.mp4`, `${output}/mountain-hero.mp4`);
await copyFile(`${output}/mountain-rotation.webm`, `${output}/mountain-hero.webm`);
await ffmpeg([
  "-ss", "0.3", "-i", `${output}/mountain-rotation.mp4`, "-frames:v", "1",
  "-vf", "scale=1600:-2", "-quality", "85", `${root}assets/mountain-poster.webp`,
]);
console.log("Rotation ready. Run npm run upload:mountain to save and verify both formats.");
