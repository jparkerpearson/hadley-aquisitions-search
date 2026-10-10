import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir } from "node:fs/promises";

const run = promisify(execFile);
const scratch = "generated-artifacts/logo-masks";
await mkdir(scratch, { recursive: true });
const logos = [
  { name: "jpmorgan" },
  { name: "blackstone", mask: "light", color: "#2B2F36" },
  { name: "scale", mask: "dark", color: "#000000", level: "1%,100%" },
  { name: "flybridge", white: true },
  { name: "citadel", mask: "red", color: "#0F2D64", level: "8%,98%" },
  { name: "duke" },
  { name: "google" },
  { name: "rbc", alpha: "20%,100%" },
  { name: "columbia" },
  { name: "a16z-scout" },
  { name: "goldman-sachs", mask: "red", color: "#0F2D64", shave: true },
  { name: "morgan-stanley", mask: "dark", color: "#000000", level: "20%,100%" },
];
const magick = (args) => run("magick", args);
for (const logo of logos) {
  const input = `assets/logo-${logo.name}.webp`;
  const output = `assets/logo-${logo.name}-transparent.png`;
  const finish = ["-trim", "+repage", "-bordercolor", "none", "-border", "4", "-strip", output];
  if (logo.mask) {
    const mask = `${scratch}/${logo.name}.png`;
    const channel = logo.mask === "red"
      ? [...(logo.shave ? ["-shave", "2x2"] : []), "-channel", "R", "-separate", "-level", logo.level ?? "51%,99%"]
      : ["-colorspace", "Gray", ...(logo.mask === "dark" ? ["-negate"] : []),
        "-level", logo.level ?? "8%,98%"];
    await magick([input, "-alpha", "off", ...channel, mask]);
    await magick([mask, "-colorspace", "sRGB", "-alpha", "copy",
      "-fill", logo.color, "-colorize", "100", ...finish]);
  } else {
    await magick([input, "-alpha", "on",
      ...(logo.white ? ["-fuzz", "10%", "-transparent", "white"] : []),
      ...(logo.alpha ? ["-channel", "A", "-level", logo.alpha, "+channel"] : []),
      ...finish]);
  }
  console.log(`Prepared ${logo.name}`);
}
