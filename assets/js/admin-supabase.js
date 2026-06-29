/* ===========================================================
   NOUR DATASHEET — dashboard cloud store (Supabase)
   Browser-side data layer for the admin: email/password auth, reading and
   writing products / categories / settings, and uploading images to Storage.
   Exposed as window.NOUR_STORE. Active only when assets/js/supabase-config.js
   is filled in; otherwise the dashboard keeps using the local Node server.
   =========================================================== */
(function () {
  const SESSION_KEY = "nour_admin_session";
  const cfg = () => window.NOUR_SUPABASE || {};
  const enabled = () => Boolean(cfg().enabled);
  const useServerApi = () => enabled() && cfg().serverApi === true;

  // ---- session ----
  const readSession = () => {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    } catch {
      return null;
    }
  };
  const writeSession = (session) =>
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  const clearSession = () => localStorage.removeItem(SESSION_KEY);
  const token = () => (readSession() || {}).access_token || "";

  const authHeaders = () => ({
    apikey: cfg().anonKey,
    Authorization: `Bearer ${token() || cfg().anonKey}`,
  });

  const safeHeader = (value) => encodeURIComponent(String(value || ""));

  async function apiJson(path, options = {}) {
    const response = await fetch(path, {
      method: options.method || "GET",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(options.requireAuth ? { Authorization: `Bearer ${token()}` } : {}),
        ...(options.headers || {}),
      },
      body: options.body,
    });
    const text = await response.text();
    let result = {};
    try {
      result = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`${path} did not return JSON (HTTP ${response.status}).`);
    }
    if (!response.ok || result.ok === false) {
      throw new Error((result.errors || [result.error || `HTTP ${response.status}`]).join("\n"));
    }
    return result;
  }

  async function signIn(email, password) {
    const response = await fetch(
      `${cfg().url}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: { apikey: cfg().anonKey, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      }
    );
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error_description || result.msg || "تعذّر تسجيل الدخول.");
    writeSession(result);
    return result;
  }

  async function signOut() {
    try {
      await fetch(`${cfg().url}/auth/v1/logout`, {
        method: "POST",
        headers: authHeaders(),
      });
    } catch {
      /* ignore network errors on logout */
    }
    clearSession();
  }

  const currentEmail = () => (readSession() || {}).user?.email || "";

  // ---- REST helpers ----
  async function restGet(pathAndQuery) {
    const response = await fetch(`${cfg().url}/rest/v1/${pathAndQuery}`, {
      headers: authHeaders(),
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error(`قراءة ${pathAndQuery} فشلت (HTTP ${response.status}).`);
    return response.json();
  }

  async function restWrite(method, pathAndQuery, body, prefer) {
    const response = await fetch(`${cfg().url}/rest/v1/${pathAndQuery}`, {
      method,
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: body == null ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text();
      if (response.status === 401 || response.status === 403)
        throw new Error("انتهت الجلسة أو لا تملك صلاحية. سجّل الدخول من جديد.");
      throw new Error(`الحفظ فشل (HTTP ${response.status}): ${text}`);
    }
    return response;
  }

  // ---- load everything (read is public) ----
  async function loadAll() {
    let categories;
    let products;
    let settings;
    if (useServerApi()) {
      const payload = await apiJson("/api/data");
      categories = payload.categories || [];
      products = payload.products || [];
      settings = payload.settings || {};
    } else {
      const [categoryRows, productRows, settingsRows] = await Promise.all([
        restGet("categories?select=*&order=display_order.asc"),
        restGet("products?select=*&order=display_order.asc"),
        restGet("site_settings?id=eq.1&select=data"),
      ]);
      categories = categoryRows || [];
      products = productRows || [];
      settings = (settingsRows && settingsRows[0] && settingsRows[0].data) || {};
    }
    // Map DB rows to the shape the admin UI expects.
    const mappedProducts = (products || []).map((p) => ({
      ...p,
      contentBlocks: Array.isArray(p.content_blocks) ? p.content_blocks : [],
      custom_note: p.custom_note || "",
      dimension_image: p.dimension_image || "",
      ai_open_image_url: p.ai_open_image_url || "",
      ai_closed_image_url: p.ai_closed_image_url || "",
    }));
    return { settings, categories: categories || [], products: mappedProducts };
  }

  // ---- save everything (requires auth) ----
  const categoryRow = (c, index) => ({
    id: c.id,
    name: String(c.name || "").trim(),
    slug: c.slug,
    description: c.description || "",
    display_order: Number(c.display_order) || index + 1,
    is_visible: c.is_visible !== false,
    updated_at: new Date().toISOString(),
  });

  const num = (value) =>
    value === "" || value == null ? null : Number(value) || null;

  const productRow = (p, index) => ({
    id: p.id,
    category_id: p.category_id || null,
    name: String(p.name || "").trim(),
    slug: p.slug,
    description: p.description || "",
    dimensions_w: num(p.dimensions_w),
    dimensions_h: num(p.dimensions_h),
    dimensions_d: num(p.dimensions_d),
    specifications: Array.isArray(p.specifications) ? p.specifications : [],
    features: Array.isArray(p.features) ? p.features : [],
    keywords: Array.isArray(p.keywords) ? p.keywords : [],
    images: Array.isArray(p.images) ? p.images : [],
    content_blocks: Array.isArray(p.contentBlocks) ? p.contentBlocks : [],
    dimension_image: p.dimension_image || "",
    ai_open_image_url: p.ai_open_image_url || "",
    ai_closed_image_url: p.ai_closed_image_url || "",
    custom_note: p.custom_note || "",
    internal_price: num(p.internal_price),
    price_label: p.price_label || "",
    spec_sheet_url: p.spec_sheet_url || "",
    display_order: Number(p.display_order) || index + 1,
    is_visible: p.is_visible !== false,
    is_featured: p.is_featured === true,
    updated_at: new Date().toISOString(),
  });

  async function deleteMissing(table, keepIds) {
    const existing = await restGet(`${table}?select=id`);
    const keep = new Set(keepIds);
    const remove = (existing || [])
      .map((row) => row.id)
      .filter((id) => !keep.has(id));
    if (!remove.length) return;
    const list = remove.map((id) => `"${id}"`).join(",");
    await restWrite("DELETE", `${table}?id=in.(${list})`, null, "return=minimal");
  }

  async function saveAll(state) {
    if (!token()) throw new Error("يجب تسجيل الدخول قبل الحفظ.");
    if (useServerApi()) {
      await apiJson("/api/save", {
        method: "POST",
        requireAuth: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      });
      return;
    }
    const categories = (state.categories || []).map(categoryRow);
    const products = (state.products || []).map(productRow);

    // Upsert categories first (products reference them), then products.
    if (categories.length)
      await restWrite(
        "POST",
        "categories?on_conflict=id",
        categories,
        "resolution=merge-duplicates,return=minimal"
      );
    if (products.length)
      await restWrite(
        "POST",
        "products?on_conflict=id",
        products,
        "resolution=merge-duplicates,return=minimal"
      );
    await restWrite(
      "POST",
      "site_settings?on_conflict=id",
      [{ id: 1, data: state.settings || {}, updated_at: new Date().toISOString() }],
      "resolution=merge-duplicates,return=minimal"
    );

    // Remove rows deleted in the dashboard.
    await deleteMissing("products", products.map((p) => p.id));
    await deleteMissing("categories", categories.map((c) => c.id));
  }

  // ---- image upload (resize → webp → Storage) ----
  function resizeToWebp(file, maxSide = 1400, quality = 0.85) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) =>
            blob ? resolve({ blob, width: w, height: h }) : reject(new Error("فشل تحويل الصورة.")),
          "image/webp",
          quality
        );
      };
      img.onerror = () => reject(new Error("تعذّر قراءة ملف الصورة."));
      img.src = URL.createObjectURL(file);
    });
  }

  const slugify = (value) =>
    String(value || "image")
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "image";

  async function uploadImage(file, nameHint) {
    if (!token()) throw new Error("يجب تسجيل الدخول قبل رفع الصور.");
    if (useServerApi()) {
      let uploadBody = file;
      let uploadContentType = file.type || "application/octet-stream";
      try {
        const resized = await resizeToWebp(file);
        uploadBody = resized.blob;
        uploadContentType = "image/webp";
      } catch {
        /* fall back to uploading the original file */
      }
      const result = await apiJson("/api/upload-image", {
        method: "POST",
        requireAuth: true,
        headers: {
          "Content-Type": uploadContentType,
          "x-file-name": safeHeader(file.name),
          "x-name-hint": safeHeader(nameHint),
        },
        body: uploadBody,
      });
      return { src: (result.image && result.image.src) || result.url };
    }
    const bucket = cfg().bucket || "product-images";
    let body = file;
    let contentType = file.type || "application/octet-stream";
    let ext = (file.name.split(".").pop() || "bin").toLowerCase();
    try {
      const resized = await resizeToWebp(file);
      body = resized.blob;
      contentType = "image/webp";
      ext = "webp";
    } catch {
      /* fall back to uploading the original file */
    }
    const objectPath = `${slugify(nameHint)}-${Date.now()}.${ext}`;
    const response = await fetch(
      `${cfg().url}/storage/v1/object/${bucket}/${encodeURIComponent(objectPath)}`,
      {
        method: "POST",
        headers: {
          apikey: cfg().anonKey,
          Authorization: `Bearer ${token()}`,
          "Content-Type": contentType,
          "x-upsert": "true",
        },
        body,
      }
    );
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`رفع الصورة فشل (HTTP ${response.status}): ${text}`);
    }
    return {
      src: `${cfg().url}/storage/v1/object/public/${bucket}/${objectPath}`,
    };
  }

  window.NOUR_STORE = {
    enabled,
    signIn,
    signOut,
    currentEmail,
    hasSession: () => Boolean(token()),
    loadAll,
    saveAll,
    uploadImage,
  };
})();
