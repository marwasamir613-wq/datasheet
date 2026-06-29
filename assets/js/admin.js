/* NOUR DATASHEET local admin dashboard */
(function () {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const esc = (value) =>
    String(value == null ? "" : value).replace(/[&<>"']/g, (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]
    );
  const slugify = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70);
  const uid = () =>
    crypto.randomUUID
      ? crypto.randomUUID()
      : "local-" + Date.now() + "-" + Math.random().toString(16).slice(2);

  let state = { settings: {}, categories: [], products: [], backups: [] };
  let selectedProductId = null;
  let activeProductTab = "general";
  let dirty = false;
  let uploadTargetProductId = null;
  let uploadMode = "gallery"; // gallery | main | open | closed | dimension
  let uploadBusy = 0;
  let lastEditedProductId = "";
  let lastEditedImageUrl = "";
  let lastEditedImageField = "";
  const pendingImagePreviews = new Map();
  let confirmResolver = null;
  let lastLoadedAt = null;
  let dataSource = null; // "server" (read/write) | "static" (read-only) | null

  const sectionTitles = {
    dashboard: "لوحة التحكم",
    settings: "إعدادات الشركة",
    categories: "الأقسام",
    products: "المنتجات",
    images: "الصور",
    transfer: "الاستيراد / التصدير",
    backups: "النسخ الاحتياطي",
  };

  function markDirty(value = true) {
    dirty = value;
    $("#dirtyBadge").classList.toggle("hidden", !dirty);
  }

  function toast(message, type = "success") {
    const item = document.createElement("div");
    item.className = "toast " + type;
    item.textContent = message;
    $("#toastHost").appendChild(item);
    setTimeout(() => item.remove(), 4300);
  }

  function notifyPublicDataChanged() {
    const message = {
      type: "nour-data-updated",
      at: Date.now(),
      productId: lastEditedProductId,
      imageUrl: lastEditedImageUrl,
      imageField: lastEditedImageField,
    };
    try {
      localStorage.setItem("nour-data-updated", String(message.at));
      if (lastEditedProductId)
        localStorage.setItem("nour-last-edited-product-id", lastEditedProductId);
      if (lastEditedImageUrl)
        localStorage.setItem("nour-last-edited-image-url", lastEditedImageUrl);
      if (lastEditedImageField)
        localStorage.setItem("nour-last-edited-image-field", lastEditedImageField);
    } catch {
      /* ignore localStorage limitations */
    }
    try {
      const channel = new BroadcastChannel("nour-dashboard-sync");
      channel.postMessage(message);
      channel.close();
    } catch {
      /* BroadcastChannel is optional */
    }
  }

  function debugEditedProduct(product, field, url) {
    lastEditedProductId = product && product.id ? product.id : "";
    lastEditedImageUrl = url || "";
    lastEditedImageField = field || "";
    console.info("[NOUR dashboard image state]", {
      productId: lastEditedProductId,
      imageField: lastEditedImageField,
      imageUrl: lastEditedImageUrl,
      product: product ? clone(product) : null,
    });
  }

  const LOCAL_API_ORIGIN = "http://127.0.0.1:8787";
  const isLocalAdminOrigin = () =>
    location.host === "127.0.0.1:8787" ||
    location.host === "localhost:8787";
  const localApiUrl = (path) => new URL(path, LOCAL_API_ORIGIN).href;

  async function api(path, options) {
    const requestUrl = path;
    const requestOptions = options || {};
    const method = requestOptions.method || "GET";
    console.info("[NOUR admin API]", method, requestUrl);
    let response;
    try {
      response = await fetch(requestUrl, {
        ...requestOptions,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(requestOptions.headers || {}),
        },
      });
    } catch (networkError) {
      console.error("[NOUR admin API network error]", {
        url: requestUrl,
        method,
        message: networkError.message,
      });
      networkError.network = true;
      networkError.url = requestUrl;
      throw networkError;
    }

    const text = await response.text();
    const contentType = response.headers.get("content-type") || "";
    console.info("[NOUR admin API response]", {
      url: response.url || requestUrl,
      status: response.status,
      contentType,
      body: text.slice(0, 600),
    });

    let result;
    try {
      result = text ? JSON.parse(text) : {};
    } catch (parseError) {
      const snippet = text.slice(0, 220).replace(/\s+/g, " ").trim();
      const error = new Error(
        `طلب API لم يرجع JSON. الرابط: ${response.url || requestUrl} — الحالة: HTTP ${response.status}. ` +
          `غالبًا تم فتح لوحة الإدارة من سيرفر static أو endpoint غير صحيح. شغّلي اللوحة من: ${LOCAL_API_ORIGIN}/admin.html`
      );
      error.nonJson = true;
      error.status = response.status;
      error.url = response.url || requestUrl;
      error.responseText = text;
      error.cause = parseError;
      console.error("[NOUR admin API non-JSON response]", {
        url: error.url,
        status: error.status,
        contentType,
        responseText: snippet,
      });
      throw error;
    }

    if (!response.ok || result.ok === false || result.success === false) {
      const error = new Error((result.errors || [result.error || "حدث خطأ."]).join("\n"));
      error.result = result;
      error.status = response.status;
      error.url = response.url || requestUrl;
      throw error;
    }
    return result;
  }

  async function apiWithLocalFallback(path, options) {
    try {
      return await api(path, options);
    } catch (error) {
      const canFallback =
        typeof path === "string" &&
        path.startsWith("/api/") &&
        !isLocalAdminOrigin() &&
        (error.nonJson || error.network || error.status === 404);
      if (!canFallback) throw error;
      const fallbackUrl = localApiUrl(path);
      console.warn("[NOUR admin API fallback]", {
        from: error.url || path,
        to: fallbackUrl,
        reason: error.message,
      });
      return api(fallbackUrl, options);
    }
  }

  // Reads a raw JSON file directly (used when the Node admin server is not
  // running, e.g. under `python -m http.server`). Reports the exact path.
  async function fetchJsonFile(relPath) {
    let response;
    try {
      response = await fetch(relPath, { cache: "no-store" });
    } catch (networkError) {
      throw new Error(`تعذّر الوصول إلى الملف: ${relPath} — ${networkError.message}`);
    }
    if (!response.ok)
      throw new Error(`تعذّر تحميل الملف: ${relPath} (HTTP ${response.status})`);
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (parseError) {
      throw new Error(`صيغة JSON غير صحيحة في الملف: ${relPath} — ${parseError.message}`);
    }
  }

  // Server-only actions (save, backup, restore, upload) are blocked in
  // read-only static mode with a clear message about how to enable them.
  const supabaseMode = () =>
    Boolean(window.NOUR_STORE && window.NOUR_STORE.enabled());

  function requireServer() {
    if (dataSource === "server" || (dataSource === "supabase" && window.NOUR_STORE.hasSession()))
      return true;
    if (supabaseMode() && !window.NOUR_STORE.hasSession()) {
      showLogin();
      return false;
    }
    toast(
      "هذه العملية تحتاج خادم الإدارة المحلي. شغّل: node tools/admin-server.js ثم افتح http://127.0.0.1:8787/admin.html",
      "error"
    );
    return false;
  }

  function normalizeProduct(product) {
    const images = Array.isArray(product.images) ? product.images : [];
    return {
      ...product,
      id: product.id || uid(),
      category_id: product.category_id || state.categories[0]?.id || "",
      name: product.name || "",
      slug: product.slug || "",
      description: product.description || "",
      dimensions_w: product.dimensions_w ?? "",
      dimensions_h: product.dimensions_h ?? "",
      dimensions_d: product.dimensions_d ?? "",
      dimension_image: product.dimension_image || product.dimensionImage || "",
      ai_open_image_url:
        product.ai_open_image_url ||
        product.aiOpenImageUrl ||
        product.aiOpenImage ||
        (product.ai && (product.ai.aiOpenImageUrl || product.ai.openImage)) ||
        "",
      ai_closed_image_url:
        product.ai_closed_image_url ||
        product.aiClosedImageUrl ||
        product.aiClosedImage ||
        (product.ai && (product.ai.aiClosedImageUrl || product.ai.closedImage)) ||
        "",
      display_order: product.display_order || state.products.length + 1,
      is_visible: product.is_visible !== false,
      is_featured: product.is_featured === true,
      specifications: Array.isArray(product.specifications) ? product.specifications : [],
      features: Array.isArray(product.features) ? product.features : [],
      keywords: Array.isArray(product.keywords) ? product.keywords : [],
      contentBlocks: Array.isArray(product.contentBlocks) ? product.contentBlocks : [],
      custom_note: product.custom_note || product.customNote || "",
      images: images.map((image, index) =>
        typeof image === "string"
          ? {
              type: index === 0 ? "main" : "extra",
              src: image,
              alt: product.name || "",
              caption: index === 0 ? "الصورة الرئيسية" : "",
              visible: true,
              order: index + 1,
            }
          : {
              type: image.type === "main" ? "main" : "extra",
              src: image.src || "",
              alt: image.alt || product.name || "",
              caption: image.caption || "",
              visible: image.visible !== false,
              order: image.order || index + 1,
            }
      ),
    };
  }

  function productCount(categoryId) {
    return state.products.filter((product) => product.category_id === categoryId).length;
  }

  function currentProduct() {
    return state.products.find((product) => product.id === selectedProductId) || null;
  }

  function selectProduct(id) {
    selectedProductId = id;
    renderProductList();
    renderProductEditor();
  }

  function duplicateProduct(product) {
    if (!product) return;
    const copy = clone(product);
    copy.id = uid();
    copy.name += " — نسخة";
    copy.slug = `${copy.slug || slugify(copy.name)}-copy-${Date.now()}`;
    copy.display_order = nextProductOrder(copy.category_id);
    state.products.push(copy);
    selectedProductId = copy.id;
    markDirty();
    renderAll();
    toast("تم نسخ المنتج.");
  }

  async function deleteProduct(product) {
    if (!product) return;
    if (await confirmAction("حذف المنتج", `حذف «${product.name}» نهائيًا؟`)) {
      state.products = state.products.filter((item) => item.id !== product.id);
      if (selectedProductId === product.id) selectedProductId = null;
      normalizeProductOrders(product.category_id);
      markDirty();
      renderAll();
      toast("تم حذف المنتج.");
    }
  }

  function nextProductOrder(categoryId) {
    const orders = state.products
      .filter((product) => product.category_id === categoryId)
      .map((product) => Number(product.display_order) || 0);
    return Math.max(0, ...orders) + 1;
  }

  function orderedProducts(categoryId) {
    return state.products
      .filter((product) => !categoryId || product.category_id === categoryId)
      .sort((a, b) => (Number(a.display_order) || 0) - (Number(b.display_order) || 0));
  }

  function normalizeProductOrders(categoryId) {
    orderedProducts(categoryId).forEach((product, index) => {
      product.display_order = index + 1;
    });
  }

  function moveProduct(productId, direction) {
    const product = state.products.find((item) => item.id === productId);
    if (!product) return;
    const list = orderedProducts(product.category_id);
    const index = list.findIndex((item) => item.id === productId);
    const target = index + direction;
    if (target < 0 || target >= list.length) return;
    const currentOrder = list[index].display_order;
    list[index].display_order = list[target].display_order;
    list[target].display_order = currentOrder;
    normalizeProductOrders(product.category_id);
    markDirty();
    renderAll();
  }

  function orderedCategories() {
    return [...state.categories].sort((a, b) => (Number(a.display_order) || 0) - (Number(b.display_order) || 0));
  }

  function normalizeCategoryOrders() {
    orderedCategories().forEach((category, index) => {
      category.display_order = index + 1;
    });
  }

  function moveCategory(categoryId, direction) {
    const list = orderedCategories();
    const index = list.findIndex((category) => category.id === categoryId);
    const target = index + direction;
    if (target < 0 || target >= list.length) return;
    const currentOrder = list[index].display_order;
    list[index].display_order = list[target].display_order;
    list[target].display_order = currentOrder;
    normalizeCategoryOrders();
    markDirty();
    renderAll();
  }

  function navigate(section) {
    $$("#adminNav button").forEach((button) =>
      button.classList.toggle("active", button.dataset.section === section)
    );
    $$(".admin-section").forEach((panel) =>
      panel.classList.toggle("active", panel.dataset.panel === section)
    );
    $("#sectionTitle").textContent = sectionTitles[section] || "لوحة الإدارة";
    if (section === "images") renderImageLibrary();
  }

  function renderDashboard() {
    const visible = state.products.filter((product) => product.is_visible !== false).length;
    const images = state.products.reduce(
      (sum, product) => sum + (Array.isArray(product.images) ? product.images.length : 0),
      0
    );
    $("#dashboardStats").innerHTML = [
      [state.products.length, "إجمالي المنتجات"],
      [visible, "منتجات ظاهرة"],
      [state.categories.length, "الأقسام"],
      [images, "صور المنتجات"],
    ]
      .map(([value, label]) => `<div class="stat-card"><b>${value}</b><span>${label}</span></div>`)
      .join("");
  }

  function renderDataStatus() {
    const host = $("#dataStatus");
    if (!host) return;
    const when = lastLoadedAt
      ? lastLoadedAt.toLocaleString("ar-EG", { hour12: false })
      : "—";
    const sourceLabel =
      dataSource === "supabase"
        ? "Supabase live CMS"
        : dataSource === "server"
        ? "خادم الإدارة المحلي (قراءة وحفظ)"
        : dataSource === "static"
          ? "قراءة فقط (الملفات مباشرة)"
          : "غير متصل";
    host.innerHTML = `
      <div class="status-head">
        <h2>حالة البيانات</h2>
        <button class="btn secondary" id="reloadDataBtn">إعادة تحميل البيانات</button>
      </div>
      <div class="status-cards">
        <div class="status-card"><span>عدد المنتجات</span><b>${state.products.length}</b></div>
        <div class="status-card"><span>عدد الأقسام</span><b>${state.categories.length}</b></div>
        <div class="status-card"><span>آخر تحميل للداتا</span><b>${esc(when)}</b></div>
        <div class="status-card"><span>مصدر البيانات</span><b>${esc(sourceLabel)}</b></div>
      </div>`;
  }

  function renderLoadError(message) {
    navigate("dashboard");
    dataSource = null;
    const host = $("#dataStatus");
    if (host)
      host.innerHTML = `
        <div class="status-error">
          <h2>تعذّر تحميل البيانات</h2>
          <p>${esc(message)}</p>
          <p>المسارات المتوقعة للبيانات:</p>
          <ul>
            <li><code>data/products.raw.json</code></li>
            <li><code>data/categories.raw.json</code></li>
            <li><code>data/site-settings.json</code></li>
          </ul>
          <p>الحل: شغّل خادم الإدارة المحلي ثم افتح اللوحة من خلاله:</p>
          <pre>node tools/admin-server.js</pre>
          <pre>http://127.0.0.1:8787/admin.html</pre>
          <button class="btn primary" id="reloadDataBtn">إعادة تحميل البيانات</button>
        </div>`;
    const stats = $("#dashboardStats");
    if (stats) stats.innerHTML = "";
    updateModeUI();
  }

  function updateModeUI() {
    const banner = $("#modeBanner");
    const saveBtn = $("#saveAllBtn");
    if (dataSource === "static") {
      if (banner) {
        banner.classList.remove("hidden");
        banner.innerHTML =
          "وضع القراءة فقط: البيانات مقروءة من الملفات مباشرة. لتعديل وحفظ التغييرات شغّل خادم الإدارة المحلي: " +
          "<code>node tools/admin-server.js</code> ثم افتح <code>http://127.0.0.1:8787/admin.html</code>";
      }
      if (saveBtn) saveBtn.disabled = true;
    } else {
      if (banner) banner.classList.add("hidden");
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  function getNested(object, path) {
    return path.split(".").reduce((value, key) => value?.[key], object);
  }

  function setNested(object, path, value) {
    const keys = path.split(".");
    let target = object;
    keys.slice(0, -1).forEach((key) => {
      target[key] = target[key] || {};
      target = target[key];
    });
    target[keys.at(-1)] = value;
  }

  function renderSettings() {
    $$("#settingsForm [name]").forEach((input) => {
      input.value = getNested(state.settings, input.name) ?? "";
    });
    renderStatsEditor();
  }

  function renderStatsEditor() {
    const stats = state.settings.homepage?.stats || [];
    $("#statsEditor").innerHTML = stats
      .map(
        (stat, index) => `<div class="repeat-row">
          <input data-stat="${index}" data-key="value" value="${esc(stat.value)}" placeholder="القيمة" />
          <input data-stat="${index}" data-key="label" value="${esc(stat.label)}" placeholder="العنوان" />
          <button type="button" class="btn danger small" data-remove-stat="${index}">حذف</button>
        </div>`
      )
      .join("");
  }

  function productAssignOptions(currentCategoryId) {
    return `<option value="">نقل منتج إلى هذا القسم</option>` +
      state.products
        .filter((product) => product.category_id !== currentCategoryId)
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "ar"))
        .map((product) => `<option value="${esc(product.id)}">${esc(product.name || "منتج بدون اسم")}</option>`)
        .join("");
  }

  function renderCategories() {
    $("#categoriesList").innerHTML = orderedCategories()
      .map(
        (category, index) => `<div class="list-row category-row" data-category-id="${esc(category.id)}">
          <input data-cat-id="${esc(category.id)}" data-field="name" value="${esc(category.name)}" aria-label="اسم القسم" />
          <input data-cat-id="${esc(category.id)}" data-field="slug" value="${esc(category.slug)}" dir="ltr" aria-label="الرابط المختصر" />
          <input data-cat-id="${esc(category.id)}" data-field="description" value="${esc(category.description || "")}" aria-label="الوصف" />
          <input data-cat-id="${esc(category.id)}" data-field="display_order" value="${Number(category.display_order) || index + 1}" type="number" min="1" aria-label="الترتيب" />
          <label class="check-row"><input data-cat-id="${esc(category.id)}" data-field="is_visible" type="checkbox" ${category.is_visible !== false ? "checked" : ""}/> ظاهر</label>
          <select data-assign-product-category="${esc(category.id)}" aria-label="نقل منتج إلى القسم">${productAssignOptions(category.id)}</select>
          <div class="editor-actions category-actions">
            <span class="count-pill">${productCount(category.id)} منتج</span>
            <button class="btn ghost small" data-category-up="${esc(category.id)}" aria-label="تحريك لأعلى">↑</button>
            <button class="btn ghost small" data-category-down="${esc(category.id)}" aria-label="تحريك لأسفل">↓</button>
            <button class="btn danger small" data-delete-category="${esc(category.id)}">حذف</button>
          </div>
        </div>`
      )
      .join("");
  }

  function renderProductFilter() {
    const value = $("#productCategoryFilter").value;
    $("#productCategoryFilter").innerHTML =
      `<option value="">كل الأقسام</option>` +
      state.categories
        .map((category) => `<option value="${esc(category.id)}">${esc(category.name)}</option>`)
        .join("");
    $("#productCategoryFilter").value = value;
  }

  function pendingPreviewKey(productId, slot) {
    return `${productId}:${slot}`;
  }

  function setPendingPreview(productId, slot, src) {
    pendingImagePreviews.set(pendingPreviewKey(productId, slot), src);
  }

  function clearPendingPreview(productId, slot) {
    const key = pendingPreviewKey(productId, slot);
    const src = pendingImagePreviews.get(key);
    if (src && src.startsWith("blob:")) URL.revokeObjectURL(src);
    pendingImagePreviews.delete(key);
  }

  function getPendingPreview(productId, slot) {
    return pendingImagePreviews.get(pendingPreviewKey(productId, slot)) || "";
  }

  function productMainPreview(product) {
    return getPendingPreview(product.id, "main") || mainImageSrc(product);
  }

  function uploadHint(productId, slot) {
    return getPendingPreview(productId, slot)
      ? `<span class="upload-hint">معاينة قبل الحفظ</span>`
      : `<span class="upload-hint">اضغطي على الصورة للتغيير</span>`;
  }

  function renderProductList() {
    const query = ($("#productSearch").value || "").trim().toLowerCase();
    const categoryId = $("#productCategoryFilter").value;
    const categoryMap = Object.fromEntries(state.categories.map((category) => [category.id, category.name]));
    const list = state.products
      .filter(
        (product) =>
          (!categoryId || product.category_id === categoryId) &&
          (!query ||
            `${product.name} ${product.slug} ${(product.keywords || []).join(" ")}`
              .toLowerCase()
              .includes(query))
      )
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    $("#productList").innerHTML = list
      .map(
        (product) => {
          const mainImage = productMainPreview(product);
          return `<article class="product-card ${product.id === selectedProductId ? "active" : ""}" data-product-card="${esc(product.id)}">
            <button type="button" class="product-card-image" data-card-image-upload="${esc(product.id)}" aria-label="تغيير صورة ${esc(product.name || "المنتج")}">
              ${
                mainImage
                  ? `<img src="${esc(mainImage)}" alt="${esc(product.name || "صورة المنتج")}" />`
                  : `<span class="product-image-empty">لا توجد صورة</span>`
              }
              ${uploadHint(product.id, "main")}
            </button>
            <div class="product-card-body">
              <b>${esc(product.name || "منتج بدون اسم")}</b>
              <small>${esc(categoryMap[product.category_id] || "بدون قسم")}</small>
            </div>
            <div class="product-card-actions">
              <button class="btn primary small" data-card-image-upload="${esc(product.id)}">تغيير الصورة</button>
              <button class="btn danger small" data-card-remove-main="${esc(product.id)}" ${mainImage ? "" : "disabled"}>حذف الصورة</button>
              <button class="btn secondary small" data-card-save-product="${esc(product.id)}">حفظ</button>
              <button class="btn ghost small" data-edit-details="${esc(product.id)}">تعديل التفاصيل</button>
              <button class="btn ghost small icon-only" data-product-up="${esc(product.id)}" aria-label="تحريك لأعلى">↑</button>
              <button class="btn ghost small icon-only" data-product-down="${esc(product.id)}" aria-label="تحريك لأسفل">↓</button>
              <button class="btn ghost small" data-list-duplicate-product="${esc(product.id)}">نسخ</button>
              <button class="btn danger small" data-list-delete-product="${esc(product.id)}">حذف</button>
            </div>
          </article>`;
        }
      )
      .join("");
  }

  function categoryOptions(selected) {
    return state.categories
      .map(
        (category) =>
          `<option value="${esc(category.id)}" ${category.id === selected ? "selected" : ""}>${esc(category.name)}</option>`
      )
      .join("");
  }

  function renderProductEditor() {
    const product = currentProduct();
    if (!product) {
      $("#productEditor").innerHTML = `<div class="empty-editor">اختر منتجًا للتعديل أو أضف منتجًا جديدًا.</div>`;
      return;
    }
    $("#productEditor").innerHTML = `
      <div class="editor-head">
        <div><h2>${esc(product.name || "منتج جديد")}</h2><small>ID: <code>${esc(product.id)}</code></small></div>
        <div class="editor-actions">
          <button class="btn primary" data-save-product>حفظ التغييرات</button>
          <button class="btn secondary" data-preview-product>معاينة المحفوظ</button>
          <button class="btn ghost" data-copy-product-link>نسخ الرابط</button>
          <button class="btn ghost" data-duplicate-product>نسخ المنتج</button>
          <button class="btn danger" data-delete-product>حذف</button>
        </div>
      </div>
      <div class="tabs">
        ${[
          ["general", "البيانات الأساسية"],
          ["images", "الصور"],
          ["features", "المواصفات"],
          ["blocks", "كتل المحتوى"],
        ]
          .map(
            ([key, label]) =>
              `<button data-product-tab="${key}" class="${activeProductTab === key ? "active" : ""}">${label}</button>`
          )
          .join("")}
      </div>
      <div class="tab-panel ${activeProductTab === "general" ? "active" : ""}" data-tab-panel="general">
        ${renderGeneralTab(product)}
      </div>
      <div class="tab-panel ${activeProductTab === "images" ? "active" : ""}" data-tab-panel="images">
        ${renderImagesTab(product)}
      </div>
      <div class="tab-panel ${activeProductTab === "features" ? "active" : ""}" data-tab-panel="features">
        ${renderFeaturesTab(product)}
      </div>
      <div class="tab-panel ${activeProductTab === "blocks" ? "active" : ""}" data-tab-panel="blocks">
        ${renderBlocksTab(product)}
      </div>`;
  }

  function renderGeneralTab(product) {
    return `<div class="form-grid">
      <label>اسم المنتج<input data-product-field="name" value="${esc(product.name)}" required /></label>
      <label>الرابط المختصر<input data-product-field="slug" value="${esc(product.slug)}" dir="ltr" /></label>
      <label>القسم<select data-product-field="category_id">${categoryOptions(product.category_id)}</select></label>
      <label>الترتيب<input data-product-field="display_order" type="number" min="1" value="${product.display_order || 1}" /></label>
      <label>العرض mm (Width)<input data-product-field="dimensions_w" type="number" min="1" value="${esc(product.dimensions_w)}" /></label>
      <label>الارتفاع mm (Height)<input data-product-field="dimensions_h" type="number" min="1" value="${esc(product.dimensions_h)}" /></label>
      <label>العمق mm (Depth)<input data-product-field="dimensions_d" type="number" min="1" value="${esc(product.dimensions_d)}" /></label>
      <label class="check-row"><input data-product-field="is_visible" type="checkbox" ${product.is_visible !== false ? "checked" : ""}/> إظهار المنتج</label>
      <label class="check-row"><input data-product-field="is_featured" type="checkbox" ${product.is_featured ? "checked" : ""}/> منتج مميز</label>
      <label class="span-2">الوصف المختصر<textarea data-product-field="description" rows="4">${esc(product.description)}</textarea></label>
      <label class="span-2">كلمات البحث — كلمة بكل سطر<textarea data-product-array="keywords" rows="3">${esc((product.keywords || []).join("\n"))}</textarea></label>
      <label class="span-2">ملاحظة خاصة بالمنتج<input data-product-field="custom_note" value="${esc(product.custom_note || "")}" /></label>
    </div>`;
  }

  // Live preview of the technical drawing that appears beside the dimensions
  // table. It updates automatically as Width/Height/Depth are edited, unless a
  // custom drawing image has been uploaded to replace it.
  function dimDrawingInner(product) {
    if (product.dimension_image)
      return `<img src="${esc(product.dimension_image)}" alt="رسم المقاسات المخصص" />
        <span class="dim-flag custom">رسم مخصص</span>`;
    const svg =
      window.NOUR_SVG && window.NOUR_SVG.dims
        ? window.NOUR_SVG.dims({
            w: Number(product.dimensions_w) || null,
            h: Number(product.dimensions_h) || null,
            d: Number(product.dimensions_d) || null,
          })
        : "";
    return svg + `<span class="dim-flag auto">رسم تلقائي من المقاسات</span>`;
  }

  function renderDimensionDrawing(product) {
    return `<div class="span-2 dim-drawing-box">
      <h3>رسم المقاسات الفني (يظهر بجانب الجدول)</h3>
      <p class="hint">يُرسم تلقائيًا من العرض/الارتفاع/العمق ويتحدّث فور تعديلها. يمكنك رفع رسم مخصص لاستبداله، أو إزالته للعودة للرسم التلقائي.</p>
      <div class="dim-drawing-preview" id="dimDrawingPreview">${dimDrawingInner(product)}</div>
      <div class="editor-actions">
        <button type="button" class="btn primary" data-upload-dim>رفع رسم مخصص</button>
        <button type="button" class="btn secondary" data-add-dim-url>تعيين برابط</button>
        ${
          product.dimension_image
            ? `<button type="button" class="btn danger" data-remove-dim>إزالة الرسم المخصص (العودة للتلقائي)</button>`
            : ""
        }
      </div>
    </div>`;
  }

  function refreshDimDrawing() {
    const box = document.getElementById("dimDrawingPreview");
    const product = currentProduct();
    if (box && product) box.innerHTML = dimDrawingInner(product);
  }

  function mainImageSrc(product) {
    return product.images && product.images[0] ? product.images[0].src : "";
  }

  function setMainImageSrc(product, src) {
    const image = {
      type: "main",
      src,
      alt: product.name || "",
      caption: "الصورة الرئيسية",
      visible: true,
      order: 1,
    };
    if (product.images && product.images[0]) {
      product.images[0] = { ...product.images[0], ...image };
    } else {
      product.images = [image, ...(product.images || [])];
    }
    product.images.forEach((item, index) => {
      item.order = index + 1;
      item.type = index === 0 ? "main" : "extra";
    });
  }

  function setImageSlot(product, slot, src) {
    if (slot === "main") setMainImageSrc(product, src);
    if (slot === "open") product.ai_open_image_url = src;
    if (slot === "closed") product.ai_closed_image_url = src;
    if (slot === "dimension") product.dimension_image = src;
  }

  function fieldNameForSlot(slot) {
    if (slot === "main") return "mainImage";
    if (slot === "open") return "aiOpenImageUrl";
    if (slot === "closed") return "aiClosedImageUrl";
    if (slot === "dimension") return "dimensionImage";
    return slot || "";
  }

  function removeImageSlot(product, slot) {
    if (slot === "main") {
      product.images = (product.images || []).slice(1);
      if (product.images[0]) product.images[0].type = "main";
    }
    if (slot === "open") product.ai_open_image_url = "";
    if (slot === "closed") product.ai_closed_image_url = "";
    if (slot === "dimension") product.dimension_image = "";
    (product.images || []).forEach((image, index) => {
      image.order = index + 1;
      image.type = index === 0 ? "main" : "extra";
    });
  }

  function imageSlotPreview(product, slot, src) {
    const previewSrc = getPendingPreview(product.id, slot) || src;
    if (previewSrc)
      return `<img src="${esc(previewSrc)}" alt="${esc(product.name || slot)}" />`;
    if (slot === "dimension")
      return `<div class="slot-dim-preview">${dimDrawingInner(product)}</div>`;
    return `<div class="slot-empty">لا توجد صورة</div>`;
  }

  function renderImageSlot(product, slot, title, src, hint) {
    const previewSrc = getPendingPreview(product.id, slot) || src;
    return `<div class="image-slot-card ${previewSrc ? "has-image" : ""}" data-image-slot="${slot}">
      <div class="image-slot-head">
        <b>${title}</b>
        <span>${hint}</span>
      </div>
      <button type="button" class="image-slot-preview" data-upload-slot="${slot}" aria-label="تغيير ${esc(title)}">
        ${imageSlotPreview(product, slot, src)}
        ${uploadHint(product.id, slot)}
      </button>
      <div class="image-slot-actions">
        <button type="button" class="btn primary small" data-upload-slot="${slot}">${previewSrc ? "تغيير الصورة" : "رفع صورة"}</button>
        ${
          previewSrc
            ? `<button type="button" class="btn danger small" data-remove-slot="${slot}">حذف الصورة</button>`
            : ""
        }
        <button type="button" class="btn secondary small" data-save-product>حفظ</button>
      </div>
    </div>`;
  }

  function renderImageSlots(product) {
    return `<div class="image-slots">
      ${renderImageSlot(product, "main", "الصورة الرئيسية", mainImageSrc(product), "تظهر في بطاقة المنتج وأعلى صفحة المنتج")}
      ${renderImageSlot(product, "open", "صورة اللوحة المفتوحة", product.ai_open_image_url, "تظهر في معرض صفحة المنتج")}
      ${renderImageSlot(product, "closed", "صورة اللوحة المغلقة", product.ai_closed_image_url, "تظهر في معرض صفحة المنتج")}
      ${renderImageSlot(product, "dimension", "رسم المقاسات", product.dimension_image, "ارفع رسمًا مخصصًا أو اترك الرسم التلقائي")}
    </div>`;
  }

  function renderImagesTab(product) {
    return renderImageSlots(product);
  }

  function renderFeaturesTab(product) {
    return `<div class="form-grid">
      <label class="span-2">المميزات — عنصر بكل سطر<textarea data-product-array="features" rows="8">${esc((product.features || []).join("\n"))}</textarea></label>
      <label class="span-2">المواصفات — عنصر بكل سطر<textarea data-product-array="specifications" rows="8">${esc((product.specifications || []).map((item) => typeof item === "string" ? item : JSON.stringify(item)).join("\n"))}</textarea></label>
    </div>`;
  }

  function renderBlocksTab(product) {
    return `<div class="section-tools">
        <p>تظهر هذه الأقسام داخل صفحة المنتج بعد المواصفات الأساسية.</p>
        <button class="btn primary" data-add-block>+ إضافة كتلة</button>
      </div>
      <div id="blocksList">
        ${(product.contentBlocks || []).map((block, index) => renderBlock(block, index)).join("")}
      </div>`;
  }

  function renderBlock(block, index) {
    const type = block.type || "text";
    const items = Array.isArray(block.items) ? block.items.join("\n") : "";
    const rows = Array.isArray(block.rows)
      ? block.rows.map((row) => (Array.isArray(row) ? row.join(" | ") : row)).join("\n")
      : "";
    const gallery = Array.isArray(block.images) ? block.images.join("\n") : "";
    return `<div class="block-card" data-block-index="${index}">
      <div class="block-toolbar">
        <select data-block-field="type">
          ${[
            ["text", "عنوان + نص"],
            ["image", "صورة + وصف"],
            ["features", "قائمة مواصفات"],
            ["note", "ملاحظة مهمة"],
            ["table", "جدول بسيط"],
            ["gallery", "معرض صور"],
          ]
            .map(([value, label]) => `<option value="${value}" ${type === value ? "selected" : ""}>${label}</option>`)
            .join("")}
        </select>
        <div class="editor-actions">
          <button class="btn ghost small" data-block-up="${index}">↑</button>
          <button class="btn ghost small" data-block-down="${index}">↓</button>
          <button class="btn danger small" data-remove-block="${index}">حذف</button>
        </div>
      </div>
      <div class="form-grid">
        <label class="span-2">العنوان<input data-block-field="title" value="${esc(block.title || "")}" /></label>
        ${
          ["text", "note"].includes(type)
            ? `<label class="span-2">النص<textarea data-block-field="body" rows="4">${esc(block.body || "")}</textarea></label>`
            : ""
        }
        ${
          type === "image"
            ? `<label>مسار الصورة<input data-block-field="image" value="${esc(block.image || "")}" dir="ltr" /></label>
               <label>التعليق<input data-block-field="caption" value="${esc(block.caption || "")}" /></label>`
            : ""
        }
        ${
          type === "features"
            ? `<label class="span-2">العناصر<textarea data-block-array="items" rows="5">${esc(items)}</textarea></label>`
            : ""
        }
        ${
          type === "table"
            ? `<label class="span-2">الصفوف — افصل الخلايا بعلامة |<textarea data-block-rows rows="5">${esc(rows)}</textarea></label>`
            : ""
        }
        ${
          type === "gallery"
            ? `<label class="span-2">مسارات الصور — مسار بكل سطر<textarea data-block-array="images" rows="5">${esc(gallery)}</textarea></label>`
            : ""
        }
      </div>
    </div>`;
  }

  function renderImageLibrary() {
    $("#imageLibrary").innerHTML = state.products
      .flatMap((product) =>
        (product.images || []).map(
          (image) => `<div class="image-card">
            <img src="${esc(image.src)}" alt="${esc(image.alt || product.name)}" />
            <b>${esc(product.name)}</b>
            <small>${esc(image.caption || image.type || "")}</small>
          </div>`
        )
      )
      .join("");
  }

  function renderBackups() {
    $("#backupsList").innerHTML = state.backups.length
      ? state.backups
          .map(
            (name) => `<div class="list-row" style="grid-template-columns:1fr auto">
              <code>${esc(name)}</code>
              <button class="btn secondary small" data-restore-backup="${esc(name)}">استرجاع</button>
            </div>`
          )
          .join("")
      : `<div class="admin-card">لا توجد نسخ احتياطية بعد.</div>`;
  }

  function renderAll() {
    state.products = state.products.map(normalizeProduct);
    renderDashboard();
    renderDataStatus();
    updateModeUI();
    renderSettings();
    renderCategories();
    renderProductFilter();
    renderProductList();
    renderProductEditor();
    renderImageLibrary();
    renderBackups();
  }

  async function confirmAction(title, message) {
    $("#confirmTitle").textContent = title;
    $("#confirmMessage").textContent = message;
    $("#confirmModal").classList.remove("hidden");
    return new Promise((resolve) => {
      confirmResolver = resolve;
    });
  }

  function closeConfirm(result) {
    $("#confirmModal").classList.add("hidden");
    if (confirmResolver) confirmResolver(result);
    confirmResolver = null;
  }

  // ----- Supabase Auth (cloud mode only) -----
  function showLogin() {
    document.body.classList.add("auth-locked");
    const overlay = $("#loginOverlay");
    if (!overlay) return;
    overlay.classList.remove("hidden");
    const email = $("#loginEmail");
    if (email) email.focus();
  }
  function hideLogin() {
    document.body.classList.remove("auth-locked");
    const overlay = $("#loginOverlay");
    if (overlay) overlay.classList.add("hidden");
  }
  function updateAuthUI() {
    const box = $("#authBox");
    if (!box) return;
    if (supabaseMode() && window.NOUR_STORE.hasSession()) {
      box.classList.remove("hidden");
      $("#authEmail").textContent = window.NOUR_STORE.currentEmail();
    } else {
      box.classList.add("hidden");
    }
  }
  async function handleLogin(event) {
    event.preventDefault();
    const button = $("#loginSubmit");
    const errorBox = $("#loginError");
    errorBox.textContent = "";
    button.disabled = true;
    button.textContent = "جارٍ الدخول…";
    try {
      await window.NOUR_STORE.signIn($("#loginEmail").value.trim(), $("#loginPassword").value);
      $("#loginPassword").value = "";
      hideLogin();
      updateAuthUI();
      await loadState();
    } catch (error) {
      errorBox.textContent = error.message;
    } finally {
      button.disabled = false;
      button.textContent = "تسجيل الدخول";
    }
  }
  async function handleLogout() {
    if (window.NOUR_STORE) await window.NOUR_STORE.signOut();
    updateAuthUI();
    showLogin();
  }

  async function saveAll() {
    if (!requireServer()) return;
    if (uploadBusy > 0) {
      toast("انتظري انتهاء رفع الصورة ثم اضغطي حفظ.", "warn");
      return;
    }
    const button = $("#saveAllBtn");
    button.disabled = true;
    button.textContent = "جارٍ الحفظ…";
    try {
      const editedProduct = state.products.find((item) => item.id === lastEditedProductId);
      if (editedProduct)
        console.info("[NOUR dashboard product object before save]", {
          productId: lastEditedProductId,
          imageField: lastEditedImageField,
          imageUrl: lastEditedImageUrl,
          product: clone(editedProduct),
        });
      if (dataSource === "supabase") {
        await window.NOUR_STORE.saveAll({
          settings: state.settings,
          categories: state.categories,
          products: state.products,
        });
        if (editedProduct)
          console.info("[NOUR dashboard product object saved]", {
            productId: lastEditedProductId,
            imageField: lastEditedImageField,
            imageUrl: lastEditedImageUrl,
            product: clone(editedProduct),
            saveResult: { ok: true, source: "supabase" },
          });
        markDirty(false);
        notifyPublicDataChanged();
        toast("تم الحفظ على Supabase — التغييرات ظاهرة مباشرة على الموقع.");
      } else {
        const result = await apiWithLocalFallback("/api/save", {
          method: "POST",
          body: JSON.stringify({
            settings: state.settings,
            categories: state.categories,
            products: state.products,
          }),
        });
        if (editedProduct)
          console.info("[NOUR dashboard product object saved]", {
            productId: lastEditedProductId,
            imageField: lastEditedImageField,
            imageUrl: lastEditedImageUrl,
            product: clone(editedProduct),
            saveResult: result,
          });
        markDirty(false);
        state.backups = [result.backup, ...state.backups.filter((item) => item !== result.backup)];
        renderBackups();
        notifyPublicDataChanged();
        toast("تم الحفظ وبناء الموقع بنجاح. تم تحديث بيانات الصفحة الرئيسية.");
        (result.warnings || []).forEach((warning) => toast(warning, "warn"));
      }
    } catch (error) {
      toast(error.message, "error");
    } finally {
      button.disabled = false;
      button.textContent = "حفظ وبناء الموقع";
    }
  }

  async function persistImageEdit(product, field, url) {
    if (!product) return;
    console.info("[NOUR dashboard persist image edit]", {
      productId: product.id,
      imageField: field,
      imageUrl: url,
      product: clone(product),
      source: dataSource,
    });
    try {
      if (dataSource === "supabase") {
        await window.NOUR_STORE.saveAll({
          settings: state.settings,
          categories: state.categories,
          products: state.products,
        });
      } else {
        const result = await apiWithLocalFallback("/api/save", {
          method: "POST",
          body: JSON.stringify({
            settings: state.settings,
            categories: state.categories,
            products: state.products,
          }),
        });
        if (result.backup) {
          state.backups = [result.backup, ...state.backups.filter((item) => item !== result.backup)];
          renderBackups();
        }
        (result.warnings || []).forEach((warning) => toast(warning, "warn"));
      }
      markDirty(false);
      setTimeout(() => markDirty(false), 0);
      notifyPublicDataChanged();
      console.info("[NOUR dashboard image edit persisted]", {
        productId: product.id,
        imageField: field,
        imageUrl: url,
        product: clone(product),
      });
      toast("تم حفظ الصورة وتحديث مصدر بيانات الموقع.");
    } catch (error) {
      markDirty(true);
      console.error("[NOUR dashboard image edit persist failed]", {
        productId: product.id,
        imageField: field,
        imageUrl: url,
        error,
      });
      toast("تم تغيير الصورة في الداشبورد لكن فشل حفظها في مصدر بيانات الموقع: " + error.message, "error");
    }
  }

  function downloadJson() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            settings: state.settings,
            categories: state.categories,
            products: state.products,
          },
          null,
          2
        ),
      ],
      { type: "application/json" }
    );
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `nour-datasheet-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function uploadImage(file) {
    const mode = uploadMode;
    uploadMode = "gallery"; // reset for the next upload
    const product = state.products.find((item) => item.id === uploadTargetProductId);
    if (!product || !file) return;
    const isDimension = mode === "dimension";
    const isMain = mode === "main";
    const isOpen = mode === "open";
    const isClosed = mode === "closed";
    const previewSlot = isDimension ? "dimension" : isMain ? "main" : isOpen ? "open" : isClosed ? "closed" : "";
    if (previewSlot) {
      setPendingPreview(product.id, previewSlot, URL.createObjectURL(file));
      renderProductList();
      if (selectedProductId === product.id) renderProductEditor();
    }
    if (!requireServer()) {
      if (previewSlot) {
        clearPendingPreview(product.id, previewSlot);
        renderProductList();
        if (selectedProductId === product.id) renderProductEditor();
      }
      return;
    }
    const nameHint = isDimension
      ? `${product.slug || product.name}-dimension`
      : isOpen
        ? `${product.slug || product.name}-open`
        : isClosed
          ? `${product.slug || product.name}-closed`
          : isMain
            ? `${product.slug || product.name}-main`
      : `${product.slug || product.name}-${product.images.length + 1}`;

    const applyUploadedSrc = async (src) => {
      if (isDimension) {
        product.dimension_image = src;
        debugEditedProduct(product, "dimensionImage", src);
        await persistImageEdit(product, "dimensionImage", src);
        clearPendingPreview(product.id, "dimension");
        markDirty();
        renderProductList();
        renderProductEditor();
        toast("تم رفع الرسم المخصص.");
        return;
      }
      if (isMain) {
        setMainImageSrc(product, src);
        debugEditedProduct(product, "mainImage", src);
        await persistImageEdit(product, "mainImage", src);
        clearPendingPreview(product.id, "main");
        markDirty();
        renderProductList();
        renderProductEditor();
        toast("تم تحديث الصورة الرئيسية.");
        return;
      }
      if (isOpen) {
        product.ai_open_image_url = src;
        debugEditedProduct(product, "aiOpenImageUrl", src);
        await persistImageEdit(product, "aiOpenImageUrl", src);
        clearPendingPreview(product.id, "open");
        markDirty();
        renderProductList();
        renderProductEditor();
        toast("تم تحديث صورة اللوحة المفتوحة.");
        return;
      }
      if (isClosed) {
        product.ai_closed_image_url = src;
        debugEditedProduct(product, "aiClosedImageUrl", src);
        await persistImageEdit(product, "aiClosedImageUrl", src);
        clearPendingPreview(product.id, "closed");
        markDirty();
        renderProductList();
        renderProductEditor();
        toast("تم تحديث صورة اللوحة المغلقة.");
        return;
      }
      product.images.push({
        type: product.images.length ? "extra" : "main",
        src,
        alt: product.name,
        caption: product.images.length ? "" : "الصورة الرئيسية",
        visible: true,
        order: product.images.length + 1,
      });
      debugEditedProduct(product, "images", src);
      await persistImageEdit(product, "images", src);
      markDirty();
      renderProductList();
      renderProductEditor();
      toast("تم رفع الصورة.");
    };

    // Cloud mode: upload directly to Supabase Storage (resized to WebP).
    if (dataSource === "supabase") {
      uploadBusy++;
      try {
        toast("جارٍ رفع الصورة إلى Supabase…", "warn");
        const result = await window.NOUR_STORE.uploadImage(file, nameHint);
        await applyUploadedSrc(result.src);
      } catch (error) {
        if (previewSlot) clearPendingPreview(product.id, previewSlot);
        renderProductList();
        if (selectedProductId === product.id) renderProductEditor();
        toast(error.message, "error");
      } finally {
        uploadBusy--;
      }
      return;
    }

    // Local server mode: send data URL, server converts via ffmpeg.
    uploadBusy++;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        toast("جارٍ رفع الصورة وتحسينها…", "warn");
        const result = await apiWithLocalFallback("/api/upload-image", {
          method: "POST",
          body: JSON.stringify({ filename: file.name, name: nameHint, dataUrl: reader.result }),
        });
        const uploadedUrl = (result.image && result.image.src) || result.url;
        if (!uploadedUrl) throw new Error("تم رفع الطلب لكن السيرفر لم يرجع رابط الصورة.");
        await applyUploadedSrc(uploadedUrl);
      } catch (error) {
        if (previewSlot) clearPendingPreview(product.id, previewSlot);
        renderProductList();
        if (selectedProductId === product.id) renderProductEditor();
        toast(error.message, "error");
      } finally {
        uploadBusy--;
      }
    };
    reader.onerror = () => {
      uploadBusy--;
      if (previewSlot) clearPendingPreview(product.id, previewSlot);
      renderProductList();
      if (selectedProductId === product.id) renderProductEditor();
      toast("تعذّر قراءة ملف الصورة.", "error");
    };
    reader.readAsDataURL(file);
  }

  document.addEventListener("click", async (event) => {
    const nav = event.target.closest("[data-section]");
    const go = event.target.closest("[data-go]");
    if (nav) navigate(nav.dataset.section);
    if (go) navigate(go.dataset.go);

    if (event.target.closest("#reloadDataBtn") || event.target.closest("#reloadBtn")) {
      if (dirty && !(await confirmAction("إعادة تحميل البيانات", "هناك تغييرات غير محفوظة ستُفقد. متابعة؟"))) return;
      toast("جارٍ إعادة تحميل البيانات…", "warn");
      await loadState();
    }

    const cardImageUpload = event.target.closest("[data-card-image-upload]");
    if (cardImageUpload) {
      uploadMode = "main";
      uploadTargetProductId = cardImageUpload.dataset.cardImageUpload;
      $("#imageUploadInput").click();
    }

    const cardRemoveMain = event.target.closest("[data-card-remove-main]");
    if (cardRemoveMain) {
      const product = state.products.find((item) => item.id === cardRemoveMain.dataset.cardRemoveMain);
      if (product && (await confirmAction("حذف الصورة", "هل تريدين حذف الصورة الرئيسية من هذا المنتج؟"))) {
        clearPendingPreview(product.id, "main");
        removeImageSlot(product, "main");
        debugEditedProduct(product, "mainImage", "");
        markDirty();
        renderProductList();
        if (selectedProductId === product.id) renderProductEditor();
      }
    }

    if (event.target.closest("[data-card-save-product]")) {
      await saveAll();
    }

    const editDetails = event.target.closest("[data-edit-details]");
    if (editDetails) {
      activeProductTab = "general";
      selectProduct(editDetails.dataset.editDetails);
      $("#productEditor").scrollIntoView({ behavior: "smooth", block: "start" });
    }

    const productItem = event.target.closest("[data-product-id]");
    if (productItem) {
      selectProduct(productItem.dataset.productId);
    }

    const duplicateFromList = event.target.closest("[data-list-duplicate-product]");
    if (duplicateFromList) {
      duplicateProduct(state.products.find((product) => product.id === duplicateFromList.dataset.listDuplicateProduct));
    }

    const deleteFromList = event.target.closest("[data-list-delete-product]");
    if (deleteFromList) {
      await deleteProduct(state.products.find((product) => product.id === deleteFromList.dataset.listDeleteProduct));
    }

    const productUp = event.target.closest("[data-product-up]");
    if (productUp) {
      moveProduct(productUp.dataset.productUp, -1);
    }

    const productDown = event.target.closest("[data-product-down]");
    if (productDown) {
      moveProduct(productDown.dataset.productDown, 1);
    }

    const tab = event.target.closest("[data-product-tab]");
    if (tab) {
      activeProductTab = tab.dataset.productTab;
      renderProductEditor();
    }

    if (event.target.closest("#addCategoryBtn")) {
      state.categories.push({
        id: uid(),
        name: "قسم جديد",
        slug: `category-${Date.now()}`,
        description: "",
        display_order: state.categories.length + 1,
        is_visible: true,
      });
      markDirty();
      renderCategories();
      renderProductFilter();
    }

    const deleteCategory = event.target.closest("[data-delete-category]");
    if (deleteCategory) {
      const id = deleteCategory.dataset.deleteCategory;
      const count = productCount(id);
      const ok = await confirmAction(
        "حذف القسم",
        count
          ? `القسم يحتوي على ${count} منتج. انقل أو احذف المنتجات أولًا.`
          : "هل تريد حذف هذا القسم؟"
      );
      if (ok && !count) {
        state.categories = state.categories.filter((category) => category.id !== id);
        markDirty();
        renderAll();
      }
    }

    const categoryUp = event.target.closest("[data-category-up]");
    if (categoryUp) {
      moveCategory(categoryUp.dataset.categoryUp, -1);
    }

    const categoryDown = event.target.closest("[data-category-down]");
    if (categoryDown) {
      moveCategory(categoryDown.dataset.categoryDown, 1);
    }

    if (event.target.closest("#addProductBtn")) {
      const product = normalizeProduct({
        id: uid(),
        category_id: $("#productCategoryFilter").value || state.categories[0]?.id || "",
        name: "منتج جديد",
        slug: `product-${Date.now()}`,
        display_order: state.products.length + 1,
        is_visible: false,
        images: [],
      });
      state.products.push(product);
      selectedProductId = product.id;
      activeProductTab = "general";
      markDirty();
      renderAll();
    }

    if (event.target.closest("[data-duplicate-product]")) {
      duplicateProduct(currentProduct());
    }

    if (event.target.closest("[data-delete-product]")) {
      await deleteProduct(currentProduct());
    }

    if (event.target.closest("[data-preview-product]")) {
      const product = currentProduct();
      if (product) window.open(`product.html?id=${encodeURIComponent(product.id)}`, "_blank");
    }
    if (event.target.closest("[data-copy-product-link]")) {
      const product = currentProduct();
      if (product) {
        const url = `${location.origin}/product.html?id=${encodeURIComponent(product.id)}`;
        try {
          await navigator.clipboard.writeText(url);
          toast("تم نسخ رابط المنتج.");
        } catch {
          prompt("انسخ رابط المنتج:", url);
        }
      }
    }

    if (event.target.closest("[data-add-image-url]")) {
      const product = currentProduct();
      const src = prompt("أدخل رابط أو مسار الصورة:");
      if (product && src) {
        product.images.push({
          type: product.images.length ? "extra" : "main",
          src: src.trim(),
          alt: product.name,
          caption: product.images.length ? "" : "الصورة الرئيسية",
          visible: true,
          order: product.images.length + 1,
        });
        debugEditedProduct(product, product.images.length === 1 ? "mainImage" : "images", src.trim());
        markDirty();
        renderProductEditor();
      }
    }

    if (event.target.closest("[data-upload-image]")) {
      uploadMode = "gallery";
      uploadTargetProductId = selectedProductId;
      $("#imageUploadInput").click();
    }

    const uploadSlot = event.target.closest("[data-upload-slot]");
    if (uploadSlot) {
      uploadMode = uploadSlot.dataset.uploadSlot;
      uploadTargetProductId = selectedProductId;
      $("#imageUploadInput").click();
    }

    const setSlotUrl = event.target.closest("[data-set-slot-url]");
    if (setSlotUrl) {
      const product = currentProduct();
      const slot = setSlotUrl.dataset.setSlotUrl;
      const src = prompt("أدخل رابط أو مسار الصورة:");
      if (product && src) {
        setImageSlot(product, slot, src.trim());
        debugEditedProduct(product, fieldNameForSlot(slot), src.trim());
        markDirty();
        renderProductEditor();
      }
    }

    const removeSlot = event.target.closest("[data-remove-slot]");
    if (removeSlot) {
      const product = currentProduct();
      const slot = removeSlot.dataset.removeSlot;
      if (product && (await confirmAction("إزالة الصورة", "هل تريد إزالة هذه الصورة من المنتج؟"))) {
        clearPendingPreview(product.id, slot);
        removeImageSlot(product, slot);
        debugEditedProduct(product, fieldNameForSlot(slot), "");
        markDirty();
        renderProductList();
        renderProductEditor();
      }
    }

    const setMain = event.target.closest("[data-set-main]");
    if (setMain) {
      const product = currentProduct();
      const index = Number(setMain.dataset.setMain);
      if (product && index > 0 && index < product.images.length) {
        const [chosen] = product.images.splice(index, 1);
        product.images.unshift(chosen);
        product.images.forEach((image, i) => {
          image.order = i + 1;
          image.type = i === 0 ? "main" : "extra";
        });
        debugEditedProduct(product, "mainImage", product.images[0] ? product.images[0].src : "");
        markDirty();
        renderProductEditor();
        toast("تم تعيين الصورة كصورة رئيسية.");
      }
    }

    // ----- dimension drawing override -----
    if (event.target.closest("[data-upload-dim]")) {
      uploadMode = "dimension";
      uploadTargetProductId = selectedProductId;
      $("#imageUploadInput").click();
    }
    if (event.target.closest("[data-add-dim-url]")) {
      const product = currentProduct();
      const src = prompt("أدخل رابط أو مسار صورة الرسم المخصص:");
      if (product && src) {
        product.dimension_image = src.trim();
        debugEditedProduct(product, "dimensionImage", src.trim());
        markDirty();
        renderProductEditor();
      }
    }
    if (event.target.closest("[data-remove-dim]")) {
      const product = currentProduct();
      if (product) {
        product.dimension_image = "";
        debugEditedProduct(product, "dimensionImage", "");
        markDirty();
        renderProductEditor();
      }
    }

    const removeImage = event.target.closest("[data-remove-image]");
    if (removeImage) {
      const product = currentProduct();
      const index = Number(removeImage.dataset.removeImage);
      if (await confirmAction("حذف الصورة", "هل تريد حذف الصورة من المنتج؟")) {
        product.images.splice(index, 1);
        if (product.images[0]) product.images[0].type = "main";
        debugEditedProduct(product, index === 0 ? "mainImage" : "images", "");
        markDirty();
        renderProductEditor();
      }
    }

    for (const direction of ["up", "down"]) {
      const button = event.target.closest(`[data-image-${direction}]`);
      if (button) {
        const product = currentProduct();
        const index = Number(button.dataset[`image${direction[0].toUpperCase() + direction.slice(1)}`]);
        const target = direction === "up" ? index - 1 : index + 1;
        if (target >= 0 && target < product.images.length) {
          [product.images[index], product.images[target]] = [product.images[target], product.images[index]];
          product.images.forEach((image, i) => {
            image.order = i + 1;
            image.type = i === 0 ? "main" : "extra";
          });
          markDirty();
          renderProductEditor();
        }
      }
    }

    if (event.target.closest("[data-add-block]")) {
      currentProduct().contentBlocks.push({ type: "text", title: "قسم جديد", body: "" });
      markDirty();
      renderProductEditor();
    }

    const removeBlock = event.target.closest("[data-remove-block]");
    if (removeBlock) {
      currentProduct().contentBlocks.splice(Number(removeBlock.dataset.removeBlock), 1);
      markDirty();
      renderProductEditor();
    }

    for (const direction of ["up", "down"]) {
      const button = event.target.closest(`[data-block-${direction}]`);
      if (button) {
        const blocks = currentProduct().contentBlocks;
        const index = Number(button.dataset[`block${direction[0].toUpperCase() + direction.slice(1)}`]);
        const target = direction === "up" ? index - 1 : index + 1;
        if (target >= 0 && target < blocks.length) {
          [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
          markDirty();
          renderProductEditor();
        }
      }
    }

    if (event.target.closest("#addStatBtn")) {
      state.settings.homepage = state.settings.homepage || {};
      state.settings.homepage.stats = state.settings.homepage.stats || [];
      state.settings.homepage.stats.push({ value: "", label: "" });
      markDirty();
      renderStatsEditor();
    }
    const removeStat = event.target.closest("[data-remove-stat]");
    if (removeStat) {
      state.settings.homepage.stats.splice(Number(removeStat.dataset.removeStat), 1);
      markDirty();
      renderStatsEditor();
    }

    if (event.target.closest("#saveAllBtn") || event.target.closest("[data-save-product]")) await saveAll();
    if (event.target.closest("#previewBtn")) window.open("index.html", "_blank");
    if (event.target.closest("#exportBtn")) downloadJson();

    if (event.target.closest("#createBackupBtn")) {
      if (dataSource === "supabase") {
        toast("في وضع Supabase تُحفظ كل التغييرات مباشرة في السحابة، والنسخ المحلية غير مطلوبة.", "warn");
        return;
      }
      if (!requireServer()) return;
      try {
        const result = await apiWithLocalFallback("/api/backup", { method: "POST", body: "{}" });
        state.backups = result.backups;
        renderBackups();
        toast("تم إنشاء النسخة الاحتياطية.");
      } catch (error) {
        toast(error.message, "error");
      }
    }

    const restore = event.target.closest("[data-restore-backup]");
    if (restore) {
      if (dataSource === "supabase") {
        toast("استرجاع النسخ المحلية غير متاح في وضع Supabase.", "warn");
        return;
      }
      if (!requireServer()) return;
      const name = restore.dataset.restoreBackup;
      if (await confirmAction("استرجاع نسخة احتياطية", `استرجاع النسخة ${name}؟ سيتم حفظ نسخة من الحالة الحالية أولًا.`)) {
        try {
          await apiWithLocalFallback("/api/restore", { method: "POST", body: JSON.stringify({ name }) });
          toast("تم الاسترجاع. جارٍ إعادة تحميل البيانات.");
          await loadState();
        } catch (error) {
          toast(error.message, "error");
        }
      }
    }

    if (event.target.closest("#confirmCancel")) closeConfirm(false);
    if (event.target.closest("#confirmOk")) closeConfirm(true);
  });

  document.addEventListener("input", (event) => {
    const input = event.target;
    if (input.closest("#settingsForm") && input.name) {
      setNested(state.settings, input.name, input.type === "number" ? Number(input.value) : input.value);
      markDirty();
    }
    if (input.dataset.stat != null) {
      state.settings.homepage.stats[Number(input.dataset.stat)][input.dataset.key] = input.value;
      markDirty();
    }
    if (input.dataset.catId != null || input.dataset.catIndex != null) {
      const category =
        input.dataset.catId != null
          ? state.categories.find((item) => item.id === input.dataset.catId)
          : state.categories[Number(input.dataset.catIndex)];
      if (!category) return;
      category[input.dataset.field] =
        input.type === "checkbox" ? input.checked : input.type === "number" ? Number(input.value) : input.value;
      markDirty();
      if (input.dataset.field === "name") renderProductFilter();
    }
    const product = currentProduct();
    if (product && input.dataset.productField) {
      const field = input.dataset.productField;
      const previousCategoryId = product.category_id;
      product[field] =
        input.type === "checkbox" ? input.checked : input.type === "number" ? input.value : input.value;
      if (field === "category_id" && previousCategoryId !== product.category_id) {
        product.display_order = nextProductOrder(product.category_id);
        normalizeProductOrders(previousCategoryId);
        normalizeProductOrders(product.category_id);
        renderCategories();
      }
      if (field === "name" && !product.slug)
        product.slug = slugify(input.value);
      markDirty();
      if (/^dimensions_[whd]$/.test(field)) refreshDimDrawing();
      else renderProductList();
    }
    if (product && input.dataset.productArray) {
      product[input.dataset.productArray] = input.value
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean);
      markDirty();
    }
    const imageCard = input.closest("[data-image-index]");
    if (product && imageCard && input.dataset.imageField) {
      const image = product.images[Number(imageCard.dataset.imageIndex)];
      image[input.dataset.imageField] = input.type === "checkbox" ? input.checked : input.value;
      markDirty();
    }
    const blockCard = input.closest("[data-block-index]");
    if (product && blockCard) {
      const block = product.contentBlocks[Number(blockCard.dataset.blockIndex)];
      if (input.dataset.blockField) {
        block[input.dataset.blockField] = input.value;
        markDirty();
        if (input.dataset.blockField === "type") renderProductEditor();
      }
      if (input.dataset.blockArray) {
        block[input.dataset.blockArray] = input.value.split("\n").map((item) => item.trim()).filter(Boolean);
        markDirty();
      }
      if (input.hasAttribute("data-block-rows")) {
        block.rows = input.value
          .split("\n")
          .map((row) => row.split("|").map((cell) => cell.trim()).filter(Boolean))
          .filter((row) => row.length);
        markDirty();
      }
    }
  });

  document.addEventListener("change", (event) => {
    const assign = event.target.closest("[data-assign-product-category]");
    if (!assign || !assign.value) return;
    const product = state.products.find((item) => item.id === assign.value);
    if (!product) return;
    const previousCategoryId = product.category_id;
    product.category_id = assign.dataset.assignProductCategory;
    product.display_order = nextProductOrder(product.category_id);
    normalizeProductOrders(previousCategoryId);
    normalizeProductOrders(product.category_id);
    markDirty();
    renderAll();
    toast("تم نقل المنتج إلى القسم.");
  });

  $("#productSearch").addEventListener("input", renderProductList);
  $("#productCategoryFilter").addEventListener("change", renderProductList);
  $("#imageUploadInput").addEventListener("change", (event) => {
    uploadImage(event.target.files[0]);
    event.target.value = "";
  });
  $("#importInput").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      state.settings = imported.settings || state.settings;
      state.categories = imported.categories || [];
      state.products = (imported.products || []).map(normalizeProduct);
      selectedProductId = null;
      markDirty();
      renderAll();
      toast("تم استيراد البيانات. راجعها ثم اضغط حفظ.", "warn");
    } catch {
      toast("ملف الاستيراد غير صحيح.", "error");
    }
  });

  window.addEventListener("beforeunload", (event) => {
    if (!dirty) return;
    event.preventDefault();
    event.returnValue = "";
  });

  function afterLoad() {
    if (!supabaseMode() || window.NOUR_STORE.hasSession()) hideLogin();
    selectedProductId =
      selectedProductId && state.products.some((item) => item.id === selectedProductId)
        ? selectedProductId
        : null;
    markDirty(false);
    renderAll();
    updateAuthUI();
  }

  async function loadState() {
    // 0) Cloud mode: Supabase (live read + write) when configured.
    if (supabaseMode()) {
      if (!window.NOUR_STORE.hasSession()) {
        showLogin();
        return;
      }
      try {
        const data = await window.NOUR_STORE.loadAll();
        state = {
          settings: data.settings || {},
          categories: Array.isArray(data.categories) ? data.categories : [],
          products: (Array.isArray(data.products) ? data.products : []).map(normalizeProduct),
          backups: [],
        };
        dataSource = "supabase";
        lastLoadedAt = new Date();
        hideLogin();
        afterLoad();
        toast("تم تحميل البيانات من Supabase (تحديث مباشر على الموقع).");
      } catch (error) {
        toast("تعذّر تحميل البيانات من Supabase: " + error.message, "error");
        renderLoadError(error.message);
      }
      return;
    }

    // 1) Preferred: the local Node admin server (full read + write).
    try {
      const data = await apiWithLocalFallback("/api/data");
      if (data && data.ok === false)
        throw new Error((data.errors || ["خطأ في قراءة ملفات البيانات."]).join("\n"));
      state = {
        settings: data.settings || {},
        categories: Array.isArray(data.categories) ? data.categories : [],
        products: (Array.isArray(data.products) ? data.products : []).map(normalizeProduct),
        backups: Array.isArray(data.backups) ? data.backups : [],
      };
      dataSource = "server";
      lastLoadedAt = data.loadedAt ? new Date(data.loadedAt) : new Date();
      afterLoad();
      const total = state.products.length + state.categories.length;
      if (total === 0)
        toast("تم الاتصال بالخادم لكن ملفات البيانات فارغة فعليًا.", "warn");
      return;
    } catch (serverError) {
      // Server not reachable — fall back to reading the raw files directly.
    }

    // 2) Fallback: read the raw JSON files directly (read-only static mode).
    try {
      const [settings, categories, products] = await Promise.all([
        fetchJsonFile("data/site-settings.json").catch(() => ({})),
        fetchJsonFile("data/categories.raw.json"),
        fetchJsonFile("data/products.raw.json"),
      ]);
      state = {
        settings: settings || {},
        categories: Array.isArray(categories) ? categories : [],
        products: (Array.isArray(products) ? products : []).map(normalizeProduct),
        backups: [],
      };
      dataSource = "static";
      lastLoadedAt = new Date();
      afterLoad();
      toast("تم تحميل البيانات في وضع القراءة فقط (بدون خادم).", "warn");
      return;
    } catch (fileError) {
      // 3) Nothing could be read — show a precise, actionable error on the page.
      renderLoadError(fileError.message);
      toast("تعذّر تحميل البيانات: " + fileError.message, "error");
    }
  }

  $$("#adminNav button").forEach((button) =>
    button.addEventListener("click", () => navigate(button.dataset.section))
  );

  const loginForm = $("#loginForm");
  if (loginForm) loginForm.addEventListener("submit", handleLogin);
  const logoutBtn = $("#logoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", handleLogout);
  updateAuthUI();

  loadState();
})();
