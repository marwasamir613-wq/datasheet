/* ===========================================================
   NOUR DATASHEET — landing page (catalog) logic
   Exposed as window.NOUR.renderHome and invoked by the page bootstrap
   after the runtime data layer (nour-data.js) has loaded.
   =========================================================== */
window.NOUR = window.NOUR || {};
window.NOUR.renderHome = function () {
  const { D, ICONS, esc, dimShort, productUrl } = window.NOUR;

  // ---- hero / chrome ----
  window.NOUR.applyBrandAssets();
  const heroLogo = document.querySelector(".hero-logo-wrap img");
  if (heroLogo) heroLogo.src = D.company.logoPath || "assets/img/logo.webp";
  document.getElementById("titleEn").textContent =
    D.homepage.heroTitle || D.company.titleEn;
  document.getElementById("introAr").textContent = D.company.introAr;
  window.NOUR.miniActions(document.getElementById("miniActions"));
  window.NOUR.heroContact(document.getElementById("heroContact"));
  window.NOUR.footer(document.getElementById("footer"));

  const stats = Array.isArray(D.homepage.stats) && D.homepage.stats.length
    ? D.homepage.stats
    : [
        { value: "{products}", label: "منتج / مقاس" },
        { value: "{categories}", label: "أقسام" },
      ];
  document.getElementById("heroStats").innerHTML = stats
    .map((stat) => {
      const value = String(stat.value || "")
        .replace("{products}", D.stats.products)
        .replace("{categories}", D.stats.categories);
      return `<div class="stat"><b>${esc(value)}</b><span>${esc(stat.label)}</span></div>`;
    })
    .join("");

  // ---- group products by category (already sorted small→large) ----
  const byCat = {};
  D.products.forEach((p) => (byCat[p.categoryId] = byCat[p.categoryId] || []).push(p));

  // ---- chips ----
  const chipsEl = document.getElementById("chips");
  let activeCat = "all";
  const chip = (id, label, n, active) =>
    `<button class="chip ${active ? "active" : ""}" data-cat="${esc(id)}">${esc(label)}${
      n != null ? ` <span class="n">(${n})</span>` : ""
    }</button>`;
  chipsEl.innerHTML =
    chip("all", "الكل", D.products.length, true) +
    D.categories.map((c) => chip(c.id, c.name, (byCat[c.id] || []).length, false)).join("");

  // ---- card ----
  function card(p) {
    const img =
      p.thumbnailImage || p.mainImage || (p.images && p.images[0]);
    const media = img
      ? `<img src="${esc(img)}" alt="${esc(p.name)}"
           width="${Number(p.thumbnailWidth) || 480}"
           height="${Number(p.thumbnailHeight) || 360}"
           loading="lazy" decoding="async" data-card-image />`
      : window.NOUR_SVG.placeholder();
    const dimOk = [p.h, p.w, p.d].every((v) => v != null);
    return `
      <article class="card reveal" data-cat="${esc(p.categoryId)}"
        data-search="${esc((p.name + " " + dimShort(p) + " " + (p.keywords || []).join(" ")).toLowerCase())}">
        <a class="card-media" href="${productUrl(p)}">
          ${media}
          <span class="cat-tag">${esc(p.categoryName)}</span>
          ${dimOk ? `<span class="size-tag">${p.h}×${p.w}×${p.d} mm</span>` : ""}
        </a>
        <div class="card-body">
          <h3 class="card-title">${esc(p.name)}</h3>
          <div class="card-dims">
            ${
              dimOk
                ? `<span class="dim-pill">W <b>${p.w}</b></span>
                   <span class="dim-pill">H <b>${p.h}</b></span>
                   <span class="dim-pill">D <b>${p.d}</b></span>
                   <span class="dim-pill">mm</span>`
                : `<span class="dim-pill">المقاس: غير متوفر</span>`
            }
          </div>
          <div class="card-actions">
            <a class="btn btn-outline" href="${productUrl(p)}">${ICONS.arrow} عرض التفاصيل</a>
            <a class="btn btn-wa" href="${window.NOUR.waFor(p.name)}" target="_blank" rel="noopener" aria-label="تواصل واتساب">${ICONS.wa}</a>
          </div>
        </div>
      </article>`;
  }

  // ---- sections ----
  const catalog = document.getElementById("catalog");
  catalog.innerHTML = D.categories
    .map((c, i) => {
      const list = byCat[c.id] || [];
      if (!list.length) return "";
      return `
        <section class="category-section" id="cat-${esc(c.slug)}" data-cat="${esc(c.id)}">
          <div class="category-head reveal">
            <div class="idx">${i + 1}</div>
            <div>
              <h2>${esc(c.name)}</h2>
              ${c.description ? `<p>${esc(c.description)}</p>` : ""}
            </div>
            <span class="count">${list.length} منتج</span>
          </div>
          <div class="grid">${list.map(card).join("")}</div>
        </section>`;
    })
    .join("");

  const emptyEl = document.createElement("div");
  emptyEl.className = "empty";
  emptyEl.style.display = "none";
  emptyEl.innerHTML = "لا توجد نتائج مطابقة لبحثك.";
  catalog.appendChild(emptyEl);

  catalog.querySelectorAll("img[data-card-image]").forEach((image) => {
    const showFallback = () => {
      if (!image.isConnected) return;
      image.insertAdjacentHTML("afterend", window.NOUR_SVG.placeholder());
      image.remove();
    };
    image.addEventListener("error", showFallback, { once: true });
    if (image.complete && image.naturalWidth === 0) showFallback();
  });

  // ---- filtering (category + search) ----
  const searchInput = document.getElementById("searchInput");
  searchInput.placeholder =
    D.homepage.searchPlaceholder || searchInput.placeholder;
  function applyFilter() {
    const q = (searchInput.value || "").trim().toLowerCase();
    let anyVisible = false;
    catalog.querySelectorAll(".category-section").forEach((sec) => {
      const catMatch = activeCat === "all" || sec.dataset.cat === activeCat;
      let shown = 0;
      sec.querySelectorAll(".card").forEach((cardEl) => {
        const ok = catMatch && (!q || cardEl.dataset.search.includes(q));
        cardEl.style.display = ok ? "" : "none";
        if (ok) shown++;
      });
      sec.style.display = shown ? "" : "none";
      if (shown) anyVisible = true;
    });
    emptyEl.style.display = anyVisible ? "none" : "";
  }

  chipsEl.addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    chipsEl.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
    b.classList.add("active");
    activeCat = b.dataset.cat;
    applyFilter();
  });
  searchInput.addEventListener("input", applyFilter);

  window.NOUR.observeReveals(catalog);
};
