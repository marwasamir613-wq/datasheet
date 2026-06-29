/* NOUR DATASHEET local admin server.
   Local use only: http://127.0.0.1:8787/admin.html */
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const HOST = "127.0.0.1";
const PORT = Number(process.env.NOUR_ADMIN_PORT) || 8787;
const DATA = path.join(ROOT, "data");
const PRODUCTS_FILE = path.join(DATA, "products.raw.json");
const CATEGORIES_FILE = path.join(DATA, "categories.raw.json");
const SETTINGS_FILE = path.join(DATA, "site-settings.json");
const GENERATED_FILE = path.join(ROOT, "assets", "js", "data.js");
const PUBLIC_DATA_FILE = path.join(DATA, "public-data.json");
const BACKUPS_DIR = path.join(ROOT, "backups");
const PRODUCTS_IMG_DIR = path.join(ROOT, "assets", "img", "products");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function rel(file) {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

/* Reads a JSON data file and reports problems precisely so the dashboard can
   show a clear Arabic message naming the exact file/path that failed. */
function readDataFile(file, fallback) {
  const relPath = rel(file);
  if (!fs.existsSync(file)) {
    return { ok: true, missing: true, data: fallback, path: relPath };
  }
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (error) {
    return {
      ok: false,
      data: fallback,
      path: relPath,
      error: `تعذّر قراءة الملف: ${relPath} — ${error.message}`,
    };
  }
  try {
    return { ok: true, data: JSON.parse(raw), path: relPath };
  } catch (error) {
    return {
      ok: false,
      data: fallback,
      path: relPath,
      error: `صيغة JSON غير صحيحة في الملف: ${relPath} — ${error.message}`,
    };
  }
}

/* Assembles the full dashboard payload from the raw JSON files, with metadata
   (load time, file paths, counts) and a precise error if any file is broken. */
function buildDataPayload() {
  const settings = readDataFile(SETTINGS_FILE, {});
  const categories = readDataFile(CATEGORIES_FILE, []);
  const products = readDataFile(PRODUCTS_FILE, []);
  const errors = [settings, categories, products]
    .filter((entry) => !entry.ok)
    .map((entry) => entry.error);
  return {
    ok: errors.length === 0,
    errors,
    loadedAt: new Date().toISOString(),
    files: {
      settings: settings.path,
      categories: categories.path,
      products: products.path,
    },
    counts: {
      categories: Array.isArray(categories.data) ? categories.data.length : 0,
      products: Array.isArray(products.data) ? products.data.length : 0,
    },
    settings: settings.data || {},
    categories: Array.isArray(categories.data) ? categories.data : [],
    products: Array.isArray(products.data) ? products.data : [],
    backups: listBackups(),
  };
}

function publicDataIsFresh() {
  if (!fs.existsSync(PUBLIC_DATA_FILE)) return false;
  const publicTime = fs.statSync(PUBLIC_DATA_FILE).mtimeMs;
  return [SETTINGS_FILE, CATEGORIES_FILE, PRODUCTS_FILE].every((file) => {
    if (!fs.existsSync(file)) return true;
    return fs.statSync(file).mtimeMs <= publicTime + 1;
  });
}

function readPublicDataPayload() {
  const file = publicDataIsFresh() ? readDataFile(PUBLIC_DATA_FILE, null) : { ok: true, data: null };
  if (file.ok && file.data && typeof file.data === "object") {
    return { ok: true, data: file.data, path: file.path };
  }
  const built = buildDataPayload();
  if (!built.ok) return { ok: false, errors: built.errors, data: null };
  const build = runBuild();
  if (!build.ok)
    return {
      ok: false,
      errors: ["تعذّر بناء بيانات الصفحة الرئيسية."],
      buildOutput: build.output,
      data: null,
    };
  const rebuilt = readDataFile(PUBLIC_DATA_FILE, null);
  if (!rebuilt.ok || !rebuilt.data)
    return {
      ok: false,
      errors: [rebuilt.error || "ملف بيانات الصفحة الرئيسية غير موجود."],
      data: null,
    };
  return { ok: true, data: rebuilt.data, path: rebuilt.path };
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function timestamp() {
  const d = new Date();
  const part = (n) => String(n).padStart(2, "0");
  return [
    d.getFullYear(),
    part(d.getMonth() + 1),
    part(d.getDate()),
    part(d.getHours()),
    part(d.getMinutes()),
    part(d.getSeconds()),
  ].join("-");
}

function createBackup(label) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  const name = `${timestamp()}${label ? "-" + label : ""}`;
  const dir = path.join(BACKUPS_DIR, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const [source, target] of [
    [PRODUCTS_FILE, "products.raw.json"],
    [CATEGORIES_FILE, "categories.raw.json"],
    [SETTINGS_FILE, "site-settings.json"],
    [GENERATED_FILE, "data.js"],
    [PUBLIC_DATA_FILE, "public-data.json"],
  ]) {
    if (fs.existsSync(source))
      fs.copyFileSync(source, path.join(dir, target));
  }
  return name;
}

function listBackups() {
  if (!fs.existsSync(BACKUPS_DIR)) return [];
  return fs
    .readdirSync(BACKUPS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();
}

function runBuild() {
  const result = spawnSync(process.execPath, ["data/build-data.js"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return {
    ok: result.status === 0,
    output: [result.stdout, result.stderr].filter(Boolean).join("\n").trim(),
  };
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

function normalizedImages(product) {
  const images = Array.isArray(product.images) ? product.images : [];
  return images
    .map((image, index) => {
      if (typeof image === "string")
        return {
          type: index === 0 ? "main" : "extra",
          src: image,
          alt: product.name || "",
          caption: index === 0 ? "الصورة الرئيسية" : "",
          visible: true,
          order: index + 1,
        };
      return image && typeof image === "object"
        ? {
            type: image.type === "main" ? "main" : "extra",
            src: String(image.src || "").trim(),
            alt: String(image.alt || product.name || "").trim(),
            caption: String(image.caption || "").trim(),
            visible: image.visible !== false,
            order: Number(image.order) || index + 1,
          }
        : null;
    })
    .filter(Boolean);
}

function localPathExists(src) {
  if (!src || /^https?:\/\//i.test(src) || /^data:/i.test(src)) return true;
  const resolved = path.resolve(ROOT, src.replace(/^\/+/, ""));
  return resolved.startsWith(ROOT) && fs.existsSync(resolved);
}

function validateState(state) {
  const errors = [];
  const warnings = [];
  const categories = Array.isArray(state.categories) ? state.categories : [];
  const products = Array.isArray(state.products) ? state.products : [];
  const categoryIds = new Set(categories.map((c) => c.id));
  const categorySlugs = new Set();
  const productSlugs = new Set();

  categories.forEach((category, index) => {
    if (!String(category.name || "").trim())
      errors.push(`القسم رقم ${index + 1}: الاسم مطلوب.`);
    if (!String(category.slug || "").trim())
      errors.push(`القسم «${category.name || index + 1}»: الرابط المختصر مطلوب.`);
    if (categorySlugs.has(category.slug))
      errors.push(`رابط القسم المختصر مكرر: ${category.slug}`);
    categorySlugs.add(category.slug);
  });

  products.forEach((product, index) => {
    const label = product.name || `رقم ${index + 1}`;
    if (!String(product.name || "").trim())
      errors.push(`المنتج رقم ${index + 1}: الاسم مطلوب.`);
    if (!categoryIds.has(product.category_id))
      errors.push(`المنتج «${label}»: القسم غير موجود.`);
    if (!String(product.slug || "").trim())
      errors.push(`المنتج «${label}»: الرابط المختصر مطلوب.`);
    if (productSlugs.has(product.slug))
      errors.push(`رابط المنتج المختصر مكرر: ${product.slug}`);
    productSlugs.add(product.slug);
    for (const key of ["dimensions_w", "dimensions_h", "dimensions_d"]) {
      const value = product[key];
      if (value !== null && value !== "" && (!Number.isFinite(Number(value)) || Number(value) <= 0))
        errors.push(`المنتج «${label}»: أحد الأبعاد غير صحيح.`);
    }
    const images = normalizedImages(product);
    const visible = images.filter((image) => image.visible && image.src);
    if (product.is_visible !== false && !visible.length)
      warnings.push(`المنتج «${label}»: لا توجد صورة رئيسية، وسيظهر بديل تلقائي في صفحة المنتج.`);
    if (
      product.is_visible !== false &&
      visible.length &&
      !visible.some((image) => image.type === "main")
    )
      errors.push(`المنتج «${label}»: حدد صورة رئيسية واحدة على الأقل.`);
    images.forEach((image) => {
      if (image.src && !localPathExists(image.src))
        warnings.push(`المنتج «${label}»: مسار الصورة غير موجود محليًا: ${image.src}`);
    });
  });

  return { errors, warnings };
}

function normalizeForSave(state) {
  const now = new Date().toISOString();
  const categories = state.categories.map((category, index) => ({
    ...category,
    id: category.id || crypto.randomUUID(),
    name: String(category.name || "").trim(),
    slug: slugify(category.slug || category.name),
    description: String(category.description || "").trim(),
    display_order: Number(category.display_order) || index + 1,
    is_visible: category.is_visible !== false,
    created_at: category.created_at || now,
    updated_at: now,
  }));
  const products = state.products.map((product, index) => ({
    ...product,
    id: product.id || crypto.randomUUID(),
    name: String(product.name || "").trim(),
    slug: slugify(product.slug || product.name),
    description: String(product.description || "").trim(),
    dimensions_w: product.dimensions_w === "" ? null : Number(product.dimensions_w) || null,
    dimensions_h: product.dimensions_h === "" ? null : Number(product.dimensions_h) || null,
    dimensions_d: product.dimensions_d === "" ? null : Number(product.dimensions_d) || null,
    specifications: Array.isArray(product.specifications) ? product.specifications : [],
    features: Array.isArray(product.features) ? product.features.filter(Boolean) : [],
    keywords: Array.isArray(product.keywords) ? product.keywords.filter(Boolean) : [],
    contentBlocks: Array.isArray(product.contentBlocks) ? product.contentBlocks : [],
    images: normalizedImages(product).map((image, imageIndex) => ({
      ...image,
      order: imageIndex + 1,
      type: imageIndex === 0 ? "main" : "extra",
    })),
    display_order: Number(product.display_order) || index + 1,
    is_visible: product.is_visible !== false,
    created_at: product.created_at || now,
    updated_at: now,
  }));
  return { settings: state.settings || {}, categories, products };
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    ...CORS_HEADERS,
  });
  res.end(body);
}

function sendJs(res, status, source) {
  res.writeHead(status, {
    "Content-Type": "text/javascript; charset=utf-8",
    "Cache-Control": "no-store",
    ...CORS_HEADERS,
  });
  res.end(source);
}

function publicSupabaseConfigSource() {
  const config = {
    url: process.env.SUPABASE_URL || process.env.NOUR_SUPABASE_URL || "",
    anonKey: process.env.SUPABASE_ANON_KEY || process.env.NOUR_SUPABASE_ANON_KEY || "",
    bucket: process.env.SUPABASE_STORAGE_BUCKET || process.env.NOUR_SUPABASE_BUCKET || "product-images",
    serverApi: false,
  };
  return `(function (cfg) {
  var target = window.NOUR_SUPABASE || {};
  Object.assign(target, cfg);
  if (!Object.getOwnPropertyDescriptor(target, "enabled")) {
    Object.defineProperty(target, "enabled", {
      get: function () { return Boolean(this.url && this.anonKey); }
    });
  }
  window.NOUR_SUPABASE = target;
})(${JSON.stringify(config)});`;
}

function readBody(req, maxBytes = 30 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("حجم الطلب أكبر من المسموح."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(new Error("بيانات JSON غير صحيحة."));
      }
    });
    req.on("error", reject);
  });
}

function optimizeUpload(input, output) {
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
      "scale=w='min(1200,iw)':h='min(1200,ih)':force_original_aspect_ratio=decrease",
      "-c:v",
      "libwebp",
      "-quality",
      "82",
      "-compression_level",
      "6",
      "-an",
      output,
    ],
    { encoding: "utf8" }
  );
  if (result.status !== 0) throw new Error(result.stderr || "فشل تحسين الصورة.");
}

function imageDimensions(file) {
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
  if (result.status !== 0) return { width: 1200, height: 900 };
  const stream = (JSON.parse(result.stdout).streams || [])[0] || {};
  return { width: stream.width || 1200, height: stream.height || 900 };
}

/* Saves one slice (products or categories) back to its raw JSON file, keeping
   the other slices intact, then rebuilds the public site. Shared by the
   POST /api/products and POST /api/categories endpoints. */
function saveSlice(slice, incoming) {
  const current = {
    settings: readJson(SETTINGS_FILE, {}),
    categories: readJson(CATEGORIES_FILE, []),
    products: readJson(PRODUCTS_FILE, []),
  };
  const merged = {
    settings: current.settings,
    categories:
      slice === "categories" ? incoming : current.categories,
    products: slice === "products" ? incoming : current.products,
  };
  const state = normalizeForSave(merged);
  const validation = validateState(state);
  if (validation.errors.length)
    return { status: 400, body: { ok: false, ...validation } };
  const backup = createBackup(`before-${slice}`);
  if (slice === "categories") writeJson(CATEGORIES_FILE, state.categories);
  else writeJson(PRODUCTS_FILE, state.products);
  const build = runBuild();
  return {
    status: build.ok ? 200 : 500,
    body: {
      ok: build.ok,
      warnings: validation.warnings,
      backup,
      counts: {
        categories: state.categories.length,
        products: state.products.length,
      },
      buildOutput: build.output,
      errors: build.ok
        ? []
        : ["تم الحفظ لكن فشل بناء الموقع. استرجع النسخة الاحتياطية."],
    },
  };
}

async function handleApi(req, res, pathname) {
  if (req.method === "GET" && pathname === "/api/supabase-config.js")
    return sendJs(res, 200, publicSupabaseConfigSource());

  // Primary endpoint with metadata (load time, file paths, counts).
  if (req.method === "GET" && (pathname === "/api/data" || pathname === "/api/state")) {
    const payload = buildDataPayload();
    return sendJson(res, payload.ok ? 200 : 500, payload);
  }
  if (req.method === "GET" && pathname === "/api/public-data") {
    const payload = readPublicDataPayload();
    if (!payload.ok)
      return sendJson(res, 500, { ok: false, errors: payload.errors || ["تعذّر تحميل بيانات الصفحة الرئيسية."] });
    return sendJson(res, 200, { ok: true, source: payload.path, data: payload.data });
  }
  if (req.method === "GET" && pathname === "/api/products") {
    const file = readDataFile(PRODUCTS_FILE, []);
    return sendJson(res, file.ok ? 200 : 500, {
      ok: file.ok,
      errors: file.ok ? [] : [file.error],
      path: file.path,
      count: Array.isArray(file.data) ? file.data.length : 0,
      products: Array.isArray(file.data) ? file.data : [],
    });
  }
  if (req.method === "GET" && pathname === "/api/categories") {
    const file = readDataFile(CATEGORIES_FILE, []);
    return sendJson(res, file.ok ? 200 : 500, {
      ok: file.ok,
      errors: file.ok ? [] : [file.error],
      path: file.path,
      count: Array.isArray(file.data) ? file.data.length : 0,
      categories: Array.isArray(file.data) ? file.data : [],
    });
  }
  if (req.method === "POST" && pathname === "/api/products") {
    const body = await readBody(req);
    const incoming = Array.isArray(body) ? body : body.products;
    if (!Array.isArray(incoming))
      return sendJson(res, 400, { ok: false, errors: ["قائمة المنتجات مطلوبة."] });
    const result = saveSlice("products", incoming);
    return sendJson(res, result.status, result.body);
  }
  if (req.method === "POST" && pathname === "/api/categories") {
    const body = await readBody(req);
    const incoming = Array.isArray(body) ? body : body.categories;
    if (!Array.isArray(incoming))
      return sendJson(res, 400, { ok: false, errors: ["قائمة الأقسام مطلوبة."] });
    const result = saveSlice("categories", incoming);
    return sendJson(res, result.status, result.body);
  }
  if (req.method === "GET" && pathname === "/api/backups")
    return sendJson(res, 200, { backups: listBackups() });

  if (req.method === "POST" && pathname === "/api/backup") {
    const name = createBackup("manual");
    return sendJson(res, 200, { ok: true, backup: name, backups: listBackups() });
  }

  if (req.method === "POST" && pathname === "/api/save") {
    const state = normalizeForSave(await readBody(req));
    const validation = validateState(state);
    if (validation.errors.length)
      return sendJson(res, 400, { ok: false, ...validation });
    const backup = createBackup("before-save");
    writeJson(SETTINGS_FILE, state.settings);
    writeJson(CATEGORIES_FILE, state.categories);
    writeJson(PRODUCTS_FILE, state.products);
    const build = runBuild();
    if (!build.ok)
      return sendJson(res, 500, {
        ok: false,
        errors: ["تم الحفظ لكن فشل بناء الموقع. استرجع النسخة الاحتياطية."],
        warnings: validation.warnings,
        backup,
        buildOutput: build.output,
      });
    return sendJson(res, 200, {
      ok: true,
      warnings: validation.warnings,
      backup,
      buildOutput: build.output,
    });
  }

  if (req.method === "POST" && pathname === "/api/restore") {
    const body = await readBody(req);
    const name = path.basename(String(body.name || ""));
    const source = path.join(BACKUPS_DIR, name);
    if (!name || !fs.existsSync(source))
      return sendJson(res, 404, { ok: false, errors: ["النسخة الاحتياطية غير موجودة."] });
    createBackup("before-restore");
    for (const [backupName, target] of [
      ["products.raw.json", PRODUCTS_FILE],
      ["categories.raw.json", CATEGORIES_FILE],
      ["site-settings.json", SETTINGS_FILE],
      ["data.js", GENERATED_FILE],
      ["public-data.json", PUBLIC_DATA_FILE],
    ]) {
      const file = path.join(source, backupName);
      if (fs.existsSync(file)) fs.copyFileSync(file, target);
    }
    const build = runBuild();
    return sendJson(res, build.ok ? 200 : 500, {
      ok: build.ok,
      buildOutput: build.output,
      backups: listBackups(),
    });
  }

  if (req.method === "POST" && pathname === "/api/upload-image") {
    const body = await readBody(req);
    const match = String(body.dataUrl || "").match(/^data:image\/[\w.+-]+;base64,(.+)$/);
    if (!match)
      return sendJson(res, 400, { ok: false, errors: ["ملف الصورة غير صحيح."] });
    fs.mkdirSync(PRODUCTS_IMG_DIR, { recursive: true });
    const base = slugify(body.name || body.filename || "product-image") || crypto.randomUUID();
    const temp = path.join(PRODUCTS_IMG_DIR, `${base}-${Date.now()}.upload`);
    const outputName = `${base}-${Date.now()}.webp`;
    const output = path.join(PRODUCTS_IMG_DIR, outputName);
    fs.writeFileSync(temp, Buffer.from(match[1], "base64"));
    try {
      optimizeUpload(temp, output);
    } finally {
      fs.rmSync(temp, { force: true });
    }
    const size = imageDimensions(output);
    const src = `assets/img/products/${outputName}`;
    return sendJson(res, 200, {
      ok: true,
      success: true,
      url: src,
      image: {
        src,
        width: size.width,
        height: size.height,
      },
    });
  }

  return sendJson(res, 404, { ok: false, errors: ["المسار غير موجود."] });
}

function serveStatic(req, res, pathname) {
  const requested = pathname === "/" || pathname === "/admin" ? "/admin.html" : pathname;
  const file = path.resolve(ROOT, "." + decodeURIComponent(requested));
  if (!file.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(file, (error, content) => {
    if (error) {
      res.writeHead(404);
      return res.end("Not found");
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS_HEADERS);
      return res.end();
    }
    if (url.pathname.startsWith("/api/"))
      await handleApi(req, res, url.pathname);
    else serveStatic(req, res, url.pathname);
  } catch (error) {
    sendJson(res, 500, { ok: false, errors: [error.message] });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`NOUR local admin: http://${HOST}:${PORT}/admin.html`);
  console.log("Local only. Press Ctrl+C to stop.");
});
