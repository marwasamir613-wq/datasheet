const crypto = require("crypto");

function env(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value && String(value).trim()) return String(value).trim();
  }
  return "";
}

function supabaseEnv() {
  const url = env("SUPABASE_URL", "NOUR_SUPABASE_URL").replace(/\/+$/, "");
  const anonKey = env("SUPABASE_ANON_KEY", "NOUR_SUPABASE_ANON_KEY");
  const serviceKey = env(
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SERVICE_KEY",
    "NOUR_SUPABASE_SERVICE_KEY"
  );
  const bucket = env("SUPABASE_STORAGE_BUCKET", "NOUR_SUPABASE_BUCKET") || "product-images";
  return { url, anonKey, serviceKey, bucket };
}

function adminEmails() {
  return env("ADMIN_EMAILS", "NOUR_ADMIN_EMAILS", "NOUR_ADMIN_EMAIL")
    .split(/[,\s]+/)
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function assertPublicConfig() {
  const cfg = supabaseEnv();
  if (!cfg.url || !cfg.anonKey) {
    const error = new Error("Supabase URL/anon key are not configured.");
    error.status = 500;
    throw error;
  }
  return cfg;
}

function assertServiceConfig() {
  const cfg = assertPublicConfig();
  if (!cfg.serviceKey) {
    const error = new Error("Supabase service_role key is not configured server-side.");
    error.status = 500;
    throw error;
  }
  return cfg;
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(body);
}

function sendJs(res, status, source) {
  res.statusCode = status;
  res.setHeader("Content-Type", "text/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(source);
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function readBody(req, maxBytes = 25 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(httpError(413, "Request body is too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJsonBody(req) {
  const raw = await readBody(req);
  try {
    return JSON.parse(raw.toString("utf8") || "{}");
  } catch {
    throw httpError(400, "Invalid JSON body.");
  }
}

async function supabaseRest(path, options = {}) {
  const cfg = options.service ? assertServiceConfig() : assertPublicConfig();
  const key = options.service ? cfg.serviceKey : cfg.anonKey;
  const response = await fetch(`${cfg.url}/rest/v1/${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(options.body == null ? {} : { "Content-Type": "application/json" }),
      ...(options.prefer ? { Prefer: options.prefer } : {}),
      ...(options.headers || {}),
    },
    body: options.body == null ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw httpError(
      response.status,
      `Supabase REST ${path} failed (HTTP ${response.status}): ${text}`
    );
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function bearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || "";
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : "";
}

async function getUserFromToken(token) {
  const cfg = assertPublicConfig();
  const response = await fetch(`${cfg.url}/auth/v1/user`, {
    headers: {
      apikey: cfg.anonKey,
      Authorization: `Bearer ${token}`,
    },
  });
  const text = await response.text();
  if (!response.ok) throw httpError(401, "Admin login required.");
  try {
    return JSON.parse(text);
  } catch {
    throw httpError(401, "Invalid Supabase session.");
  }
}

async function requireAdmin(req) {
  const token = bearerToken(req);
  if (!token) throw httpError(401, "Admin login required.");

  const user = await getUserFromToken(token);
  const email = String(user.email || "").trim().toLowerCase();
  if (!email) throw httpError(403, "This account has no email address.");

  const configured = adminEmails();
  if (configured.length) {
    if (!configured.includes(email)) throw httpError(403, "This account is not an admin.");
    return { user, email };
  }

  const rows = await supabaseRest(
    `admin_users?email=eq.${encodeURIComponent(email)}&select=email&limit=1`,
    { service: true }
  );
  if (!Array.isArray(rows) || rows.length === 0)
    throw httpError(403, "This account is not listed in admin_users.");
  return { user, email };
}

function encodeStoragePath(objectPath) {
  return String(objectPath)
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function publicStorageUrl(objectPath, bucket) {
  const cfg = assertPublicConfig();
  return `${cfg.url}/storage/v1/object/public/${encodeURIComponent(bucket || cfg.bucket)}/${encodeStoragePath(objectPath)}`;
}

function slugify(value) {
  return (
    String(value || "image")
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70) || "image"
  );
}

function objectName(nameHint, originalName) {
  const ext = String(originalName || "")
    .split(".")
    .pop()
    .replace(/[^\w]+/g, "")
    .toLowerCase();
  const suffix = ext || "webp";
  const hash = crypto.randomBytes(4).toString("hex");
  return `uploads/${slugify(nameHint || originalName)}-${Date.now()}-${hash}.${suffix}`;
}

async function uploadToStorage(buffer, objectPath, contentType) {
  const cfg = assertServiceConfig();
  const response = await fetch(
    `${cfg.url}/storage/v1/object/${encodeURIComponent(cfg.bucket)}/${encodeStoragePath(objectPath)}`,
    {
      method: "POST",
      headers: {
        apikey: cfg.serviceKey,
        Authorization: `Bearer ${cfg.serviceKey}`,
        "Content-Type": contentType || "application/octet-stream",
        "x-upsert": "true",
      },
      body: buffer,
    }
  );
  const text = await response.text();
  if (!response.ok) {
    throw httpError(response.status, `Storage upload failed (HTTP ${response.status}): ${text}`);
  }
  return publicStorageUrl(objectPath, cfg.bucket);
}

const asArray = (value) => (Array.isArray(value) ? value : []);
const num = (value) => (value === "" || value == null ? null : Number(value) || null);

function categoryRow(category, index) {
  return {
    id: category.id,
    name: String(category.name || "").trim(),
    slug: category.slug,
    description: category.description || "",
    display_order: Number(category.display_order) || index + 1,
    is_visible: category.is_visible !== false,
    ...(category.created_at ? { created_at: category.created_at } : {}),
    updated_at: new Date().toISOString(),
  };
}

function productRow(product, index) {
  return {
    id: product.id,
    category_id: product.category_id || null,
    name: String(product.name || "").trim(),
    slug: product.slug,
    description: product.description || "",
    dimensions_w: num(product.dimensions_w),
    dimensions_h: num(product.dimensions_h),
    dimensions_d: num(product.dimensions_d),
    specifications: asArray(product.specifications),
    features: asArray(product.features),
    keywords: asArray(product.keywords),
    images: asArray(product.images),
    content_blocks: asArray(product.contentBlocks || product.content_blocks),
    dimension_image: product.dimension_image || product.dimensionImage || "",
    ai_open_image_url:
      product.ai_open_image_url || product.aiOpenImageUrl || product.aiOpenImage || "",
    ai_closed_image_url:
      product.ai_closed_image_url || product.aiClosedImageUrl || product.aiClosedImage || "",
    custom_note: product.custom_note || product.customNote || "",
    internal_price: num(product.internal_price),
    price_label: product.price_label || "",
    spec_sheet_url: product.spec_sheet_url || "",
    display_order: Number(product.display_order) || index + 1,
    is_visible: product.is_visible !== false,
    is_featured: product.is_featured === true,
    ...(product.created_at ? { created_at: product.created_at } : {}),
    updated_at: new Date().toISOString(),
  };
}

function validateState(categories, products) {
  const errors = [];
  const categoryIds = new Set(categories.map((category) => category.id));
  const categorySlugs = new Set();
  const productSlugs = new Set();

  categories.forEach((category, index) => {
    if (!category.id) errors.push(`Category ${index + 1} is missing an id.`);
    if (!category.name) errors.push(`Category ${index + 1} is missing a name.`);
    if (!category.slug) errors.push(`Category ${category.name || index + 1} is missing a slug.`);
    if (category.slug && categorySlugs.has(category.slug))
      errors.push(`Duplicate category slug: ${category.slug}`);
    categorySlugs.add(category.slug);
  });

  products.forEach((product, index) => {
    const label = product.name || `#${index + 1}`;
    if (!product.id) errors.push(`Product ${label} is missing an id.`);
    if (!product.name) errors.push(`Product ${label} is missing a name.`);
    if (!product.slug) errors.push(`Product ${label} is missing a slug.`);
    if (product.slug && productSlugs.has(product.slug))
      errors.push(`Duplicate product slug: ${product.slug}`);
    productSlugs.add(product.slug);
    if (product.category_id && !categoryIds.has(product.category_id))
      errors.push(`Product ${label} references a missing category.`);
  });

  return errors;
}

async function upsertRows(table, rows) {
  if (!rows.length) return;
  await supabaseRest(`${table}?on_conflict=id`, {
    service: true,
    method: "POST",
    body: rows,
    prefer: "resolution=merge-duplicates,return=minimal",
  });
}

async function deleteMissingRows(table, keepIds) {
  const existing = await supabaseRest(`${table}?select=id`, { service: true });
  const keep = new Set(keepIds);
  const remove = asArray(existing)
    .map((row) => row.id)
    .filter((id) => !keep.has(id));
  if (!remove.length) return 0;
  const list = remove.map((id) => `"${String(id).replace(/"/g, "")}"`).join(",");
  await supabaseRest(`${table}?id=in.(${list})`, {
    service: true,
    method: "DELETE",
    prefer: "return=minimal",
  });
  return remove.length;
}

async function saveCmsState(state) {
  const categories = asArray(state.categories).map(categoryRow);
  const products = asArray(state.products).map(productRow);
  const errors = validateState(categories, products);
  if (errors.length) throw httpError(400, errors.join("\n"));

  await upsertRows("categories", categories);
  await upsertRows("products", products);
  await supabaseRest("site_settings?on_conflict=id", {
    service: true,
    method: "POST",
    body: [{ id: 1, data: state.settings || {}, updated_at: new Date().toISOString() }],
    prefer: "resolution=merge-duplicates,return=minimal",
  });
  const deletedProducts = await deleteMissingRows(
    "products",
    products.map((product) => product.id)
  );
  const deletedCategories = await deleteMissingRows(
    "categories",
    categories.map((category) => category.id)
  );
  return {
    counts: { categories: categories.length, products: products.length },
    deleted: { categories: deletedCategories, products: deletedProducts },
  };
}

module.exports = {
  adminEmails,
  assertPublicConfig,
  assertServiceConfig,
  categoryRow,
  env,
  httpError,
  objectName,
  productRow,
  publicStorageUrl,
  readBody,
  readJsonBody,
  requireAdmin,
  saveCmsState,
  sendJs,
  sendJson,
  supabaseEnv,
  supabaseRest,
  uploadToStorage,
};
