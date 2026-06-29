/* ===========================================================
   NOUR DATASHEET - one-time import of the current catalog into Supabase.

   Reads data/*.raw.json + data/site-settings.json, uploads current local
   product images to Supabase Storage, then upserts rows into the tables from
   supabase/schema.sql.

   Usage (from the project root):
     SUPABASE_URL="https://xxxx.supabase.co" \
     SUPABASE_SERVICE_ROLE_KEY="<service_role key>" \
     ADMIN_EMAILS="admin@example.com" \
     node tools/import-to-supabase.js

   The service_role key is used only here/server-side. Never commit it.
   =========================================================== */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const URL = (
  process.env.SUPABASE_URL ||
  process.env.NOUR_SUPABASE_URL ||
  ""
).replace(/\/+$/, "");
const KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.NOUR_SUPABASE_SERVICE_KEY;
const BUCKET =
  process.env.SUPABASE_STORAGE_BUCKET ||
  process.env.NOUR_SUPABASE_BUCKET ||
  "product-images";
const UPLOAD_EXISTING_IMAGES = process.env.NOUR_UPLOAD_EXISTING_IMAGES !== "false";

if (!URL || !KEY) {
  console.error(
    "Missing env vars. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
  );
  process.exit(1);
}

const readJson = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
  } catch {
    return fallback;
  }
};

const asArray = (value) => (Array.isArray(value) ? value : []);
const num = (value) =>
  value === "" || value == null ? null : Number(value) || null;

function envEmails() {
  return (
    process.env.ADMIN_EMAILS ||
    process.env.NOUR_ADMIN_EMAILS ||
    process.env.NOUR_ADMIN_EMAIL ||
    ""
  )
    .split(/[,\s]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

async function upsert(table, rows) {
  if (!rows.length) return;
  const response = await fetch(`${URL}/rest/v1/${table}?on_conflict=id`, {
    method: "POST",
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${table} upsert failed: HTTP ${response.status} - ${text}`);
  }
}

async function upsertAdminUsers(emails) {
  if (!emails.length) return;
  const response = await fetch(`${URL}/rest/v1/admin_users?on_conflict=email`, {
    method: "POST",
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(emails.map((email) => ({ email }))),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`admin_users upsert failed: HTTP ${response.status} - ${text}`);
  }
}

function encodeStoragePath(objectPath) {
  return objectPath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".webp") return "image/webp";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

function publicStorageUrl(objectPath) {
  return `${URL}/storage/v1/object/public/${encodeURIComponent(BUCKET)}/${encodeStoragePath(objectPath)}`;
}

const uploaded = new Map();

async function uploadLocalAsset(src) {
  if (!UPLOAD_EXISTING_IMAGES || !src || /^(https?:|data:|blob:)/i.test(src))
    return src;
  if (uploaded.has(src)) return uploaded.get(src);

  const clean = String(src).replace(/^\/+/, "");
  const file = path.resolve(ROOT, clean);
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) {
    console.warn(`Image not found, keeping original path: ${src}`);
    return src;
  }

  const objectPath = `catalog/${path.basename(file)}`;
  const response = await fetch(
    `${URL}/storage/v1/object/${encodeURIComponent(BUCKET)}/${encodeStoragePath(objectPath)}`,
    {
      method: "POST",
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        "Content-Type": contentType(file),
        "x-upsert": "true",
      },
      body: fs.readFileSync(file),
    }
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upload failed for ${src}: HTTP ${response.status} - ${text}`);
  }

  const publicUrl = publicStorageUrl(objectPath);
  uploaded.set(src, publicUrl);
  return publicUrl;
}

async function rewriteImages(product) {
  const copy = { ...product };
  copy.images = await Promise.all(
    asArray(product.images).map(async (image) => {
      if (typeof image === "string") return uploadLocalAsset(image);
      if (!image || typeof image !== "object") return image;
      return { ...image, src: await uploadLocalAsset(image.src) };
    })
  );

  for (const key of ["dimension_image", "ai_open_image_url", "ai_closed_image_url"]) {
    if (copy[key]) copy[key] = await uploadLocalAsset(copy[key]);
  }
  return copy;
}

async function main() {
  const rawCategories = asArray(readJson("data/categories.raw.json", []));
  const rawProducts = asArray(readJson("data/products.raw.json", []));
  const settings = readJson("data/site-settings.json", {});

  console.log(
    `Preparing ${rawCategories.length} categories, ${rawProducts.length} products...`
  );

  const categories = rawCategories.map((c, i) => ({
    id: c.id,
    name: String(c.name || "").trim(),
    slug: c.slug,
    description: c.description || "",
    display_order: Number(c.display_order) || i + 1,
    is_visible: c.is_visible !== false,
    ...(c.created_at ? { created_at: c.created_at } : {}),
    ...(c.updated_at ? { updated_at: c.updated_at } : {}),
  }));

  const rewrittenProducts = [];
  for (const product of rawProducts) rewrittenProducts.push(await rewriteImages(product));

  const products = rewrittenProducts.map((p, i) => ({
    id: p.id,
    category_id: p.category_id,
    name: String(p.name || "").trim(),
    slug: p.slug,
    description: p.description || "",
    dimensions_w: num(p.dimensions_w),
    dimensions_h: num(p.dimensions_h),
    dimensions_d: num(p.dimensions_d),
    specifications: asArray(p.specifications),
    features: asArray(p.features),
    keywords: asArray(p.keywords),
    images: asArray(p.images),
    content_blocks: asArray(p.contentBlocks || p.content_blocks),
    dimension_image: p.dimension_image || p.dimensionImage || "",
    ai_open_image_url: p.ai_open_image_url || p.aiOpenImageUrl || "",
    ai_closed_image_url: p.ai_closed_image_url || p.aiClosedImageUrl || "",
    custom_note: p.custom_note || p.customNote || "",
    internal_price: num(p.internal_price),
    price_label: p.price_label || "",
    spec_sheet_url: p.spec_sheet_url || "",
    display_order: Number(p.display_order) || i + 1,
    is_visible: p.is_visible !== false,
    is_featured: p.is_featured === true,
    ...(p.created_at ? { created_at: p.created_at } : {}),
    ...(p.updated_at ? { updated_at: p.updated_at } : {}),
  }));

  const emails = envEmails();
  console.log(
    `Importing ${categories.length} categories, ${products.length} products, ${uploaded.size} uploaded images...`
  );
  await upsertAdminUsers(emails);
  await upsert("categories", categories);
  await upsert("products", products);
  await upsert("site_settings", [{ id: 1, data: settings }]);

  if (emails.length) console.log(`Admin allowlist updated: ${emails.join(", ")}`);
  else console.warn("No ADMIN_EMAILS/NOUR_ADMIN_EMAIL provided. Add an admin email to public.admin_users.");
  console.log("Import complete.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
