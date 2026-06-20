/* Download and optimize the real catalog images for local/public use.
   Run: node data/optimize-images.js

   Originals remain untouched in Supabase and in products.raw.json.
   Generated files:
     assets/img/optimized/<slug>-main.webp   (max 1200px)
     assets/img/optimized/<slug>-thumb.webp  (max 480px)
     data/optimized-images.json              (build-data.js input)
*/
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "assets", "img", "optimized");
const TEMP_DIR = path.join(ROOT, ".image-optimize-temp");
const products = require(path.join(ROOT, "data", "products.raw.json"));

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(TEMP_DIR, { recursive: true });

function safeBase(product) {
  const slug = String(product.slug || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || product.id;
}

function runFfmpeg(input, output, maxSize, quality) {
  const result = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      input,
      "-vf",
      `scale=${maxSize}:${maxSize}:force_original_aspect_ratio=decrease`,
      "-c:v",
      "libwebp",
      "-quality",
      String(quality),
      "-compression_level",
      "6",
      "-an",
      output,
    ],
    { encoding: "utf8" }
  );
  if (result.status !== 0)
    throw new Error(result.stderr || `ffmpeg exited with ${result.status}`);
}

function imageSize(file) {
  const result = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "json",
      file,
    ],
    { encoding: "utf8" }
  );
  if (result.status !== 0) return { width: null, height: null };
  const stream = JSON.parse(result.stdout).streams[0] || {};
  return { width: stream.width || null, height: stream.height || null };
}

async function download(url, target) {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`HTTP ${response.status} while downloading ${url}`);
  fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
}

(async () => {
  const manifest = {};
  let originalBytes = 0;
  let optimizedBytes = 0;

  for (let index = 0; index < products.length; index++) {
    const product = products[index];
    const originalUrl =
      Array.isArray(product.images) && product.images.length
        ? product.images[0]
        : null;
    if (!originalUrl) continue;

    const base = safeBase(product);
    const tempFile = path.join(TEMP_DIR, product.id + path.extname(new URL(originalUrl).pathname || ".jpg"));
    const mainFile = path.join(OUT_DIR, `${base}-main.webp`);
    const thumbFile = path.join(OUT_DIR, `${base}-thumb.webp`);

    process.stdout.write(`[${index + 1}/${products.length}] ${product.name} ... `);
    await download(originalUrl, tempFile);
    originalBytes += fs.statSync(tempFile).size;
    runFfmpeg(tempFile, mainFile, 1200, 82);
    runFfmpeg(tempFile, thumbFile, 480, 78);

    const mainSize = imageSize(mainFile);
    const thumbSize = imageSize(thumbFile);
    optimizedBytes += fs.statSync(mainFile).size + fs.statSync(thumbFile).size;
    manifest[product.id] = {
      originalUrl,
      main: `assets/img/optimized/${path.basename(mainFile)}`,
      thumbnail: `assets/img/optimized/${path.basename(thumbFile)}`,
      mainWidth: mainSize.width,
      mainHeight: mainSize.height,
      thumbnailWidth: thumbSize.width,
      thumbnailHeight: thumbSize.height,
    };
    fs.rmSync(tempFile, { force: true });
    process.stdout.write("done\n");
  }

  fs.writeFileSync(
    path.join(ROOT, "data", "optimized-images.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8"
  );
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });

  console.log(
    `Optimized ${Object.keys(manifest).length} products | originals ${(originalBytes / 1048576).toFixed(1)} MB | local WebP main+thumb ${(optimizedBytes / 1048576).toFixed(1)} MB`
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
