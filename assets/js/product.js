/* ===========================================================
   NOUR DATASHEET — product detail (single-scroll datasheet)
   =========================================================== */
(function () {
  const { D, ICONS, esc, cm, productUrl } = window.NOUR;
  const SVG = window.NOUR_SVG;

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
            <img class="product-brand-logo" src="assets/img/logo.webp" alt="نور"
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

      <!-- dimensions -->
      <section class="block reveal">
        <h2 class="block-title"><span class="dot"></span> المقاسات والأبعاد</h2>
        <div class="two-col">
          <div class="dim-illus">${SVG.dims(p)}</div>
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
          ${stdFeatures.map((f) => `<div class="feature">${ICONS.check}<p>${esc(f)}</p></div>`).join("")}
          ${
            dimOk
              ? `<div class="feature">${ICONS.ruler}<p>المقاس: <b dir="ltr">${p.w}×${p.h}×${p.d} mm</b> (عرض×ارتفاع×عمق)</p></div>`
              : ""
          }
        </div>
        <div class="note-custom" style="margin-top:14px">
          ${ICONS.bolt}
          <span>${esc(D.company.customNoteAr)} — تواصل معنا لتنفيذ أي مقاس خاص بمشروعك.</span>
        </div>
      </section>

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
})();
