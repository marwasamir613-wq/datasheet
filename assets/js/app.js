/* ===========================================================
   NOUR DATASHEET — landing page (catalog) logic
   =========================================================== */
(function () {
  const { D, ICONS, esc, dimShort, productUrl } = window.NOUR;

  // ---- hero / chrome ----
  document.getElementById("introAr").textContent = D.company.introAr;
  window.NOUR.miniActions(document.getElementById("miniActions"));
  window.NOUR.heroContact(document.getElementById("heroContact"));
  window.NOUR.footer(document.getElementById("footer"));

  document.getElementById("heroStats").innerHTML = `
    <div class="stat"><b>${D.stats.products}</b><span>منتج / مقاس</span></div>
    <div class="stat"><b>${D.stats.categories}</b><span>أقسام</span></div>
    <div class="stat"><b>+40</b><span>عامًا خبرة</span></div>
    <div class="stat"><b>حسب الطلب</b><span>تصنيع خاص</span></div>`;

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
    const img = p.images && p.images[0];
    const media = img
      ? `<img src="${esc(img)}" alt="${esc(p.name)}" loading="lazy"
           onerror="this.style.display='none';this.parentNode.insertAdjacentHTML('beforeend', window.NOUR_SVG.placeholder())" />`
      : window.NOUR_SVG.placeholder();
    const dimOk = [p.h, p.w, p.d].every((v) => v != null);
    return `
      <article class="card reveal" data-cat="${esc(p.categoryId)}"
        data-search="${esc((p.name + " " + dimShort(p)).toLowerCase())}">
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

  // ---- filtering (category + search) ----
  const searchInput = document.getElementById("searchInput");
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
    window.scrollTo({ top: document.querySelector(".toolbar").offsetTop - 70, behavior: "smooth" });
  });
  searchInput.addEventListener("input", applyFilter);

  window.NOUR.observeReveals(catalog);
})();
