/* ===========================================================
   NOUR DATASHEET — runtime data layer
   When Supabase is configured (assets/js/supabase-config.js), the public
   pages load live content from the cloud so dashboard edits appear
   immediately with no redeploy. If Supabase is not configured or
   unreachable, the bundled snapshot in assets/js/data.js is used instead,
   so the site always works.

   window.NOUR_BOOT() resolves once data is ready; pages then render.
   =========================================================== */
(function () {
  // Mutate the existing window.NOUR_DATA object in place so references that
  // other scripts captured (e.g. common.js) stay valid.
  function applyData(next) {
    const target = window.NOUR_DATA || (window.NOUR_DATA = {});
    Object.keys(target).forEach((key) => delete target[key]);
    Object.assign(target, next);
  }

  const LOCAL_API_ORIGIN = "http://127.0.0.1:8787";
  const localApiUrl = (path) =>
    location.host === "127.0.0.1:8787" || location.host === "localhost:8787"
      ? path
      : new URL(path, LOCAL_API_ORIGIN).href;
  const publicAssetUrl = (url) => {
    if (!url || /^(https?:|data:|blob:)/i.test(url)) return url;
    if (/^assets\//.test(url)) return new URL(url, LOCAL_API_ORIGIN + "/").href;
    return url;
  };
  const bustLocalAsset = (url, version) => {
    const publicUrl = publicAssetUrl(url);
    if (!publicUrl || !version || !/(^assets\/img\/products\/|\/assets\/img\/products\/)/.test(publicUrl))
      return publicUrl;
    try {
      const parsed = new URL(publicUrl, location.href);
      parsed.searchParams.set("v", version);
      return parsed.href;
    } catch {
      return publicUrl + (publicUrl.includes("?") ? "&" : "?") + "v=" + encodeURIComponent(version);
    }
  };
  function debugLoadedProduct(source, next) {
    try {
      const productId = localStorage.getItem("nour-last-edited-product-id");
      if (!productId) return;
      const product = (next.products || []).find((item) => item.id === productId);
      console.info("[NOUR homepage loaded product object]", {
        source,
        productId,
        product,
      });
    } catch {
      /* localStorage is optional. */
    }
  }

  const companyDefaults = {
    nameAr: "نور للإضاءة الحديثة",
    titleEn: "NOUR DATASHEET",
    introAr: "شركة نور متخصصة في تصنيع جميع مقاسات لوحات الكهرباء ويوجد تصنيع حسب الطلب",
    aboutAr: "",
    customNoteAr: "يوجد تصنيع حسب الطلب بأي مقاس",
    logoPath: "assets/img/logo.webp",
    heroImagePath: "assets/img/hero-panels.webp",
    yearsExperience: 40,
  };
  const contactDefaults = {
    phoneDisplay: "01003510077",
    phoneInternational: "201003510077",
    whatsappText: "السلام عليكم، أرغب في الاستفسار عن ",
    facebook: "https://www.facebook.com/profile.php?id=100090946688622",
    email: "nourformodernligting111@gmail.com",
  };

  const firstUrl = (...values) =>
    values.find((value) => typeof value === "string" && value.trim()) || null;
  const strList = (value) =>
    Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];

  function buildContact(source) {
    const phoneInternational = String(
      source.phoneInternational || source.phoneDisplay || ""
    ).replace(/\D/g, "");
    return {
      phoneDisplay: source.phoneDisplay,
      phoneInternational,
      tel: "tel:+" + phoneInternational,
      whatsapp: "https://wa.me/" + phoneInternational,
      whatsappText:
        "https://wa.me/" +
        phoneInternational +
        "?text=" +
        encodeURIComponent(source.whatsappText || ""),
      facebook: source.facebook,
      email: source.email,
    };
  }

  function normalizeImageItems(product) {
    const source = Array.isArray(product.images) ? product.images : [];
    return source
      .map((item, index) => {
        if (typeof item === "string")
          return {
            type: index === 0 ? "main" : "extra",
            src: item,
            alt: product.name || "",
            caption: index === 0 ? "الصورة الرئيسية" : "",
            visible: true,
            order: index + 1,
          };
        if (!item || typeof item !== "object" || !item.src) return null;
        return {
          type: item.type === "main" ? "main" : "extra",
          src: String(item.src),
          alt: String(item.alt || product.name || ""),
          caption: String(item.caption || ""),
          visible: item.visible !== false,
          order: Number(item.order) || index + 1,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.order - b.order);
  }

  // Builds the exact window.NOUR_DATA shape the public pages expect from the
  // raw Supabase rows (mirrors data/build-data.js, minus the build-time-only
  // AI/structure enrichment which the pages no longer render).
  function transform(rawCategories, rawProducts, settings) {
    const company = { ...companyDefaults, ...(settings.company || {}) };
    const contactSource = { ...contactDefaults, ...(settings.contact || {}) };
    const contact = buildContact(contactSource);
    const homepage = {
      heroTitle: "NOUR DATASHEET",
      searchPlaceholder: "ابحث عن منتج أو مقاس…",
      stats: [],
      ...(settings.homepage || {}),
    };

    const cats = (Array.isArray(rawCategories) ? rawCategories : [])
      .filter((c) => c.is_visible !== false)
      .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
    const categories = cats.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description || "",
      order: c.display_order,
    }));
    const catName = Object.fromEntries(categories.map((c) => [c.id, c.name]));
    const catSlug = Object.fromEntries(categories.map((c) => [c.id, c.slug]));
    const catOrder = Object.fromEntries(categories.map((c) => [c.id, c.order]));

    const products = (Array.isArray(rawProducts) ? rawProducts : [])
      .filter((p) => p.is_visible !== false)
      .map((p) => {
        const imageItems = normalizeImageItems(p);
        const visible = imageItems.filter((item) => item.visible);
        const mainItem =
          visible.find((item) => item.type === "main") || visible[0] || null;
        const version = p.updated_at || p.updatedAt || "";
        const images = visible.map((item) => bustLocalAsset(item.src, version));
        const mainImage = firstUrl(bustLocalAsset(mainItem && mainItem.src, version));
        const rawDimensionImage = firstUrl(p.dimension_image, p.dimensionImage);
        const rawClosedImage = firstUrl(
          p.ai_closed_image_url,
          p.aiClosedImageUrl,
          p.aiClosedImage,
          p.ai_closed_image,
          p.ai && p.ai.aiClosedImageUrl,
          p.ai && p.ai.closedImage
        );
        const rawOpenImage = firstUrl(
          p.ai_open_image_url,
          p.aiOpenImageUrl,
          p.aiOpenImage,
          p.ai_open_image,
          p.ai && p.ai.aiOpenImageUrl,
          p.ai && p.ai.openImage
        );
        const publicImageItems = visible.map((item, index) => ({
          ...item,
          src: images[index],
        }));
        return {
          id: p.id,
          name: (p.name || "").trim(),
          categoryId: p.category_id,
          categoryName: catName[p.category_id] || "",
          categorySlug: catSlug[p.category_id] || "",
          h: Number(p.dimensions_h) || null,
          w: Number(p.dimensions_w) || null,
          d: Number(p.dimensions_d) || null,
          images,
          imageItems: publicImageItems,
          originalImage: mainImage,
          mainImage,
          thumbnailImage: mainImage,
          mainImageWidth: 1200,
          mainImageHeight: 900,
          thumbnailWidth: 480,
          thumbnailHeight: 360,
          referenceImage: mainImage,
          dimensionImage: bustLocalAsset(rawDimensionImage, version),
          aiClosedImageUrl: bustLocalAsset(rawClosedImage, version),
          aiOpenImageUrl: bustLocalAsset(rawOpenImage, version),
          description: (p.description || "").trim(),
          specs: Array.isArray(p.specifications) ? p.specifications : [],
          features: strList(p.features),
          keywords: strList(p.keywords),
          customNote: String(p.custom_note || p.customNote || "").trim(),
          contentBlocks: Array.isArray(p.content_blocks)
            ? p.content_blocks
            : Array.isArray(p.contentBlocks)
              ? p.contentBlocks
              : [],
          displayOrder: Number(p.display_order) || 0,
        };
      })
      .sort((a, b) => {
        if (catOrder[a.categoryId] !== catOrder[b.categoryId])
          return (catOrder[a.categoryId] || 0) - (catOrder[b.categoryId] || 0);
        return (
          (a.displayOrder || 0) - (b.displayOrder || 0) ||
          (a.h || 0) - (b.h || 0) ||
          (a.w || 0) - (b.w || 0) ||
          (a.d || 0) - (b.d || 0)
        );
      });

    return {
      generatedAt: new Date().toISOString(),
      company,
      contact,
      homepage,
      stats: { categories: categories.length, products: products.length },
      categories,
      products,
    };
  }

  async function rest(path) {
    const cfg = window.NOUR_SUPABASE;
    const response = await fetch(`${cfg.url}/rest/v1/${path}`, {
      headers: { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}` },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Supabase ${path} → HTTP ${response.status}`);
    return response.json();
  }

  async function readLocalJson(path, label) {
    const response = await fetch(localApiUrl(path), {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (error) {
      throw new Error(
        `${label} did not return JSON (HTTP ${response.status}): ${text.slice(0, 120)}`
      );
    }
    if (!response.ok || payload.ok === false)
      throw new Error((payload.errors || [`${label} HTTP ${response.status}`]).join("\n"));
    return payload;
  }

  async function readJson(path, label) {
    const response = await fetch(path, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(
        `${label} did not return JSON (HTTP ${response.status}): ${text.slice(0, 120)}`
      );
    }
    if (!response.ok || payload.ok === false)
      throw new Error((payload.errors || [`${label} HTTP ${response.status}`]).join("\n"));
    return payload;
  }

  async function loadLocalData() {
    const payload = await readLocalJson(
      "/api/data?source=shared&ts=" + encodeURIComponent(Date.now()),
      "Local shared raw data API"
    );
    const next = transform(payload.categories, payload.products, payload.settings || {});
    next.generatedAt = payload.loadedAt || next.generatedAt;
    applyData(next);
    debugLoadedProduct("shared raw /api/data", next);
  }

  async function loadServerApiData() {
    const payload = await readJson(
      "/api/data?ts=" + encodeURIComponent(Date.now()),
      "Production Supabase data API"
    );
    const next = transform(payload.categories, payload.products, payload.settings || {});
    next.generatedAt = payload.loadedAt || next.generatedAt;
    applyData(next);
    debugLoadedProduct("production /api/data", next);
  }

  window.NOUR_BOOT = async function NOUR_BOOT() {
    const cfg = window.NOUR_SUPABASE;
    if (!cfg || !cfg.enabled) {
      try {
        await loadLocalData();
      } catch (error) {
        console.warn(
          "NOUR: local API data load failed — using bundled snapshot.",
          error
        );
      }
      return;
    }
    if (cfg.serverApi === true) {
      try {
        await loadServerApiData();
        return;
      } catch (error) {
        console.warn("NOUR: production /api/data failed, trying Supabase REST.", error);
      }
    }
    try {
      const [categories, products, settingsRows] = await Promise.all([
        rest("categories?select=*&order=display_order.asc"),
        rest("products?select=*&order=display_order.asc"),
        rest("site_settings?id=eq.1&select=data"),
      ]);
      const settings =
        (settingsRows && settingsRows[0] && settingsRows[0].data) || {};
      applyData(transform(categories, products, settings));
    } catch (error) {
      console.warn(
        "NOUR: live data load failed — using bundled snapshot.",
        error
      );
    }
  };

  async function refreshAndRenderPublicPage() {
    try {
      await window.NOUR_BOOT();
      if (document.getElementById("catalog") && window.NOUR && window.NOUR.renderHome)
        window.NOUR.renderHome();
      if (document.getElementById("ds") && window.NOUR && window.NOUR.renderProduct)
        window.NOUR.renderProduct();
    } catch (error) {
      console.warn("NOUR: public data refresh failed.", error);
    }
  }

  try {
    const channel = new BroadcastChannel("nour-dashboard-sync");
    channel.addEventListener("message", (event) => {
      if (event.data && event.data.type === "nour-data-updated")
        refreshAndRenderPublicPage();
    });
  } catch {
    /* BroadcastChannel is optional. */
  }

  window.addEventListener("storage", (event) => {
    if (event.key === "nour-data-updated") refreshAndRenderPublicPage();
  });
})();
