/* ===========================================================
   NOUR DATASHEET — product detail (single-scroll datasheet)
   Exposed as window.NOUR.renderProduct and invoked by the page bootstrap
   after the runtime data layer (nour-data.js) has loaded.
   =========================================================== */
window.NOUR = window.NOUR || {};
window.NOUR.renderProduct = function () {
  const { D, ICONS, esc, cm, productUrl } = window.NOUR;
  const SVG = window.NOUR_SVG;

  window.NOUR.applyBrandAssets();
  window.NOUR.miniActions(document.getElementById("miniActions"));
  window.NOUR.footer(document.getElementById("footer"));

  const id = new URLSearchParams(location.search).get("id");
  const p = D.products.find((x) => x.id === id);
  const root = document.getElementById("ds");

  if (!p) {
    root.innerHTML = `<div class="container empty">
      <p>لم يتم العثور على المنتج.</p>
      <a class="btn btn-call" href="index.html">${ICONS.arrow} العودة إلى المنتجات</a></div>`;
    return;
  }

  document.title = `${p.name} — NOUR DATASHEET`;
  const dimOk = [p.h, p.w, p.d].every((v) => v != null);
  const img = p.mainImage || p.referenceImage || (p.images && p.images[0]);
  const extraImages = (p.imageItems || [])
    .filter((image) => image.visible !== false && image.type !== "main" && image.src);
  const knownExtraSrcs = new Set(extraImages.map((image) => image.src));
  [
    { src: p.aiClosedImageUrl, caption: "صورة اللوحة المغلقة" },
    { src: p.aiOpenImageUrl, caption: "صورة اللوحة المفتوحة" },
  ].forEach((image) => {
    if (image.src && !knownExtraSrcs.has(image.src)) {
      knownExtraSrcs.add(image.src);
      extraImages.push({
        type: "extra",
        src: image.src,
        alt: `${p.name} — ${image.caption}`,
        caption: image.caption,
        visible: true,
      });
    }
  });

  // Keep fallbacks out of inline event attributes. This also catches cached
  // failures that may complete before the listeners are attached.
  let fallbackId = 0;
  const imageFallbacks = new Map();
  const imageOrFallback = (url, fallbackFn, alt, options) => {
    if (!url) return fallbackFn();
    const opts = options || {};
    const key = `media-fallback-${++fallbackId}`;
    imageFallbacks.set(key, fallbackFn());
    return `<img${opts.className ? ` class="${esc(opts.className)}"` : ""}
      src="${esc(url)}" alt="${esc(alt)}"
      width="${Number(opts.width) || 1200}" height="${Number(opts.height) || 900}"
      loading="${opts.loading || "lazy"}" decoding="async"
      ${opts.fetchpriority ? `fetchpriority="${esc(opts.fetchpriority)}"` : ""}
      data-fallback-key="${key}" />`;
  };
  const bindImageFallbacks = (scope) => {
    scope.querySelectorAll("img[data-fallback-key]").forEach((image) => {
      const swap = () => {
        const fallback = imageFallbacks.get(image.dataset.fallbackKey);
        if (!fallback || !image.isConnected) return;
        image.insertAdjacentHTML("afterend", fallback);
        imageFallbacks.delete(image.dataset.fallbackKey);
        image.remove();
      };
      image.addEventListener("error", swap, { once: true });
      if (image.complete && image.naturalWidth === 0) swap();
    });
  };

  // ----- features -----
  const stdFeatures = [
    "خامات قوية بجودة عالية وعمر تشغيلي طويل",
    "عزل محكم ودرجة أمان عالية",
    "تصميم عملي وتنظيم داخلي احترافي يسهّل التركيب",
    "تصنيع دقيق على يد فنيين متخصصين",
    "متوفر بمقاسات قياسية ويمكن التصنيع حسب الطلب",
  ];
  const productFeatures = [...stdFeatures, ...(p.features || [])];

  // ----- dimension table -----
  const dimRow = (label, mm) =>
    `<tr><td class="lbl">${label}</td>
      <td>${mm == null ? "غير متوفر" : mm}</td>
      <td>${mm == null ? "غير متوفر" : cm(mm)}</td></tr>`;

  const dimTable = `
    <table class="dim-table">
      <thead><tr><th>Dimension</th><th>mm</th><th>cm</th></tr></thead>
      <tbody>
        ${dimRow("Width", p.w)}
        ${dimRow("Height", p.h)}
        ${dimRow("Depth", p.d)}
      </tbody>
    </table>`;

  // ----- related (same category) -----
  const related = D.products
    .filter((x) => x.categoryId === p.categoryId && x.id !== p.id)
    .slice(0, 6);

  const relatedHTML = related.length
    ? `<section class="block reveal">
        <h2 class="block-title"><span class="dot"></span> منتجات من نفس القسم</h2>
        <div class="grid">
          ${related
            .map((r) => {
              const ri =
                r.thumbnailImage ||
                r.mainImage ||
                (r.images && r.images[0]);
              const media = imageOrFallback(
                ri,
                () => SVG.placeholder(),
                r.name,
                {
                  width: r.thumbnailWidth,
                  height: r.thumbnailHeight,
                  loading: "lazy",
                }
              );
              return `<article class="card">
                <a class="card-media" href="${productUrl(r)}">${media}
                  ${[r.h, r.w, r.d].every((v) => v != null) ? `<span class="size-tag">${r.h}×${r.w}×${r.d} mm</span>` : ""}
                </a>
                <div class="card-body">
                  <h3 class="card-title" style="min-height:auto">${esc(r.name)}</h3>
                  <a class="btn btn-outline btn-block" href="${productUrl(r)}">${ICONS.arrow} عرض التفاصيل</a>
                </div></article>`;
            })
            .join("")}
        </div>
      </section>`
    : "";

  const extraImagesHTML = extraImages.length
    ? `<section class="block reveal">
        <h2 class="block-title"><span class="dot"></span> صور إضافية للمنتج</h2>
        <div class="product-gallery">
          ${extraImages
            .map(
              (image) => `<figure>
                <img src="${esc(image.src)}" alt="${esc(image.alt || p.name)}"
                  width="900" height="675" loading="lazy" decoding="async" />
                ${image.caption ? `<figcaption>${esc(image.caption)}</figcaption>` : ""}
              </figure>`
            )
            .join("")}
        </div>
      </section>`
    : "";

  const contentBlocksHTML = (p.contentBlocks || [])
    .map(renderContentBlock)
    .filter(Boolean)
    .join("");

  function renderContentBlock(block) {
    if (!block || !block.type) return "";
    const title = block.title
      ? `<h2 class="block-title"><span class="dot"></span> ${esc(block.title)}</h2>`
      : "";
    if (block.type === "text")
      return `<section class="block reveal custom-content-block">${title}<p class="desc-text">${esc(block.body || "")}</p></section>`;
    if (block.type === "note")
      return `<section class="block reveal custom-content-block">${title}<div class="note-custom">${ICONS.info}<span>${esc(block.body || "")}</span></div></section>`;
    if (block.type === "image" && block.image)
      return `<section class="block reveal custom-content-block">${title}<figure class="content-image"><img src="${esc(block.image)}" alt="${esc(block.title || p.name)}" width="1000" height="750" loading="lazy" decoding="async" />${block.caption ? `<figcaption>${esc(block.caption)}</figcaption>` : ""}</figure></section>`;
    if (block.type === "features" && Array.isArray(block.items))
      return `<section class="block reveal custom-content-block">${title}<div class="features">${block.items.map((item) => `<div class="feature">${ICONS.check}<p>${esc(item)}</p></div>`).join("")}</div></section>`;
    if (block.type === "table" && Array.isArray(block.rows))
      return `<section class="block reveal custom-content-block">${title}<div class="content-table-wrap"><table class="content-table">${block.rows.map((row) => `<tr>${(row || []).map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`).join("")}</table></div></section>`;
    if (block.type === "gallery" && Array.isArray(block.images))
      return `<section class="block reveal custom-content-block">${title}<div class="product-gallery">${block.images.map((src) => `<figure><img src="${esc(src)}" alt="${esc(block.title || p.name)}" width="900" height="675" loading="lazy" decoding="async" /></figure>`).join("")}</div></section>`;
    return "";
  }

  // ----- compose -----
  root.innerHTML = `
    <section class="ds-top">
      <div class="container">
        <div class="crumbs">
          <a href="index.html">${ICONS.arrow} كل المنتجات</a>
          <a href="index.html#cat-${esc(p.categorySlug)}">${ICONS.bolt} ${esc(p.categoryName)}</a>
        </div>
        <div class="ds-brandline">
          <span class="logo product-logo-card">
            <img class="product-brand-logo" src="${esc(D.company.logoPath || "assets/img/logo.webp")}" alt="نور"
              width="600" height="343" decoding="async" />
          </span>
          <span class="t"><b>NOUR DATASHEET</b><span>${esc(D.company.nameAr)}</span></span>
        </div>
        <p class="intro-ar" style="margin:12px 0 0;text-align:right">${esc(D.company.introAr)}</p>
        <h1 class="ds-product-title">${esc(p.name)}</h1>
        <span class="ds-product-cat">${ICONS.bolt} ${esc(p.categoryName)}</span>
      </div>
    </section>

    <div class="container">
      <!-- main image -->
      <section class="block section-pull reveal">
        <h2 class="block-title"><span class="dot"></span> الصورة الرئيسية</h2>
        <div class="hero-photo">
          ${imageOrFallback(img, () => SVG.placeholder(), p.name, {
            className: "product-main-image",
            width: p.mainImageWidth,
            height: p.mainImageHeight,
            loading: "eager",
            fetchpriority: "high",
          })}
        </div>
      </section>

      ${extraImagesHTML}

      <!-- dimensions -->
      <section class="block reveal">
        <h2 class="block-title"><span class="dot"></span> المقاسات والأبعاد</h2>
        <div class="two-col">
          <div class="dim-illus">${
            p.dimensionImage
              ? imageOrFallback(
                  p.dimensionImage,
                  () => SVG.dims(p),
                  `${p.name} — رسم المقاسات`,
                  { className: "dim-custom-image", width: 1000, height: 760, loading: "lazy" }
                )
              : SVG.dims(p)
          }</div>
          <div>
            ${dimTable}
            <p class="dim-note">${ICONS.ruler} ${
              dimOk ? "جميع الأبعاد بالمليمتر (mm) والسنتيمتر (cm)." : "بعض الأبعاد غير متوفرة في الكتالوج."
            }</p>
          </div>
        </div>
      </section>

      <!-- features -->
      <section class="block reveal">
        <h2 class="block-title"><span class="dot"></span> المواصفات والمميزات</h2>
        ${
          p.description
            ? `<p class="desc-text">${esc(p.description)}</p>`
            : ""
        }
        <div class="features">
          ${productFeatures.map((f) => `<div class="feature">${ICONS.check}<p>${esc(f)}</p></div>`).join("")}
          ${(p.specs || []).map((spec) => `<div class="feature">${ICONS.check}<p>${esc(typeof spec === "string" ? spec : JSON.stringify(spec))}</p></div>`).join("")}
          ${
            dimOk
              ? `<div class="feature">${ICONS.ruler}<p>المقاس: <b dir="ltr">${p.w}×${p.h}×${p.d} mm</b> (عرض×ارتفاع×عمق)</p></div>`
              : ""
          }
        </div>
        <div class="note-custom" style="margin-top:14px">
          ${ICONS.bolt}
          <span>${esc(p.customNote || D.company.customNoteAr)} — تواصل معنا لتنفيذ أي مقاس خاص بمشروعك.</span>
        </div>
      </section>

      ${contentBlocksHTML}

      <!-- contact -->
      <section class="block ds-contact reveal">
        <h2 class="block-title"><span class="dot" style="background:#fff;box-shadow:0 0 0 4px rgba(255,255,255,.25)"></span> تواصل معنا للطلب والاستفسار</h2>
        <p style="margin:0 0 8px">${esc(D.company.nameAr)} — لطلب «${esc(p.name)}» أو الاستفسار عن الأسعار والتصنيع حسب الطلب:</p>
        <div class="phone-big">${esc(D.contact.phoneDisplay)}</div>
        <div class="cta-grid" style="margin-top:12px">
          <a class="btn btn-wa btn-lg" href="${window.NOUR.waFor(p.name)}" target="_blank" rel="noopener">${ICONS.wa} طلب عبر واتساب</a>
          <a class="btn btn-ghost btn-lg" href="${D.contact.tel}">${ICONS.phone} اتصال هاتفي</a>
          <a class="btn btn-ghost btn-lg" href="${D.contact.facebook}" target="_blank" rel="noopener">${ICONS.fb} صفحة الفيسبوك</a>
        </div>
      </section>

      ${relatedHTML}
    </div>

    <!-- sticky mobile action bar -->
    <div class="action-bar">
      <div class="container">
        <a class="btn btn-wa" href="${window.NOUR.waFor(p.name)}" target="_blank" rel="noopener">${ICONS.wa} واتساب</a>
        <a class="btn btn-call" href="${D.contact.tel}">${ICONS.phone} اتصال</a>
        <a class="btn btn-fb" href="${D.contact.facebook}" target="_blank" rel="noopener" aria-label="فيسبوك">${ICONS.fb}</a>
      </div>
    </div>`;

  bindImageFallbacks(root);
  window.NOUR.observeReveals(root);
};
