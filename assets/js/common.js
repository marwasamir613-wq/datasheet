/* ===========================================================
   NOUR DATASHEET — shared helpers, icons, contact + footer
   =========================================================== */
(function () {
  const D = window.NOUR_DATA;

  const ICONS = {
    phone: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8a15.9 15.9 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.2.4 2.4.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.4c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .8-.3 1l-2.1 2.2z"/></svg>',
    wa: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M.06 24l1.68-6.13A11.86 11.86 0 0 1 .16 11.9C.16 5.33 5.5 0 12.06 0a11.82 11.82 0 0 1 8.41 3.49 11.8 11.8 0 0 1 3.48 8.42c0 6.56-5.34 11.9-11.9 11.9a11.9 11.9 0 0 1-5.68-1.45L.06 24zM6.6 20.13c1.67.99 3.27 1.58 5.45 1.58 5.45 0 9.9-4.44 9.9-9.9 0-5.46-4.43-9.9-9.9-9.9-5.46 0-9.9 4.44-9.9 9.9 0 2.3.67 4.02 1.8 5.82l-.99 3.62 3.64-.92zM17.5 14.3c-.07-.12-.27-.2-.57-.35-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.39-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.22 3.08.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.08 1.76-.72 2-1.41.25-.7.25-1.29.18-1.41z"/></svg>',
    fb: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.45 2.89h-2.33v6.99A10 10 0 0 0 22 12z"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/></svg>',
    ruler: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="10" rx="2"/><path d="M6 7v3M10 7v5M14 7v3M18 7v5"/></svg>',
    cube: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="M3 7l9 5 9-5M12 12v10"/></svg>',
    door: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 3v18"/><circle cx="13" cy="12" r="1" fill="currentColor"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>',
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg>',
  };

  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );

  // dimension helpers (mm + cm)
  const cm = (mm) => (mm == null ? "غير متوفر" : (mm / 10).toLocaleString("en-US"));
  const dimShort = (p) =>
    [p.h, p.w, p.d].every((v) => v != null)
      ? `${p.h}×${p.w}×${p.d}`
      : "غير متوفر";

  const waFor = (name) =>
    D.contact.whatsappText + encodeURIComponent("منتج: " + (name || ""));

  function productUrl(p) {
    return "product.html?id=" + encodeURIComponent(p.id);
  }

  function applyBrandAssets() {
    const logo = D.company.logoPath || "assets/img/logo.webp";
    document.querySelectorAll(".logo-mini").forEach((image) => {
      image.src = logo;
    });
  }

  // ---- mini header actions ----
  function miniActions(container) {
    container.innerHTML = `
      <a class="icon-btn" href="${D.contact.tel}" aria-label="اتصال">${ICONS.phone}</a>
      <a class="icon-btn wa pulse" href="${D.contact.whatsapp}" target="_blank" rel="noopener" aria-label="واتساب">${ICONS.wa}</a>`;
  }

  // ---- hero contact row ----
  function heroContact(container) {
    container.innerHTML = `
      <a class="btn btn-wa btn-lg" href="${D.contact.whatsapp}" target="_blank" rel="noopener">${ICONS.wa} واتساب: ${esc(D.contact.phoneDisplay)}</a>
      <a class="btn btn-call btn-lg" href="${D.contact.tel}">${ICONS.phone} اتصل الآن</a>
      <a class="btn btn-fb btn-lg" href="${D.contact.facebook}" target="_blank" rel="noopener">${ICONS.fb} فيسبوك</a>`;
  }

  // ---- footer (used on every page) ----
  function footer(container) {
    const c = D.contact;
    container.innerHTML = `
      <div class="container f-grid">
        <div>
          <div class="f-logo"><img src="${esc(D.company.logoPath || "assets/img/logo.webp")}" alt="نور للإضاءة الحديثة"
            width="600" height="343" loading="lazy" decoding="async" /></div>
          <h3 style="margin-top:14px">${esc(D.company.nameAr)}</h3>
          <p style="margin:0;max-width:36ch">${esc(D.company.introAr)}</p>
        </div>
        <div>
          <h3>تواصل معنا</h3>
          <a class="f-link" href="${c.tel}">${ICONS.phone}<span dir="ltr">${esc(c.phoneDisplay)}</span></a>
          <a class="f-link" href="${c.whatsapp}" target="_blank" rel="noopener">${ICONS.wa}<span>واتساب مباشر</span></a>
          <a class="f-link" href="${c.facebook}" target="_blank" rel="noopener">${ICONS.fb}<span>صفحة الفيسبوك</span></a>
          <a class="f-link" href="mailto:${esc(c.email)}">${ICONS.mail}<span dir="ltr">${esc(c.email)}</span></a>
        </div>
        <div>
          <h3>الأقسام</h3>
          ${D.categories
            .map(
              (cat) =>
                `<a class="f-link" href="index.html#cat-${esc(cat.slug)}">${ICONS.bolt}<span>${esc(cat.name)}</span></a>`
            )
            .join("")}
        </div>
      </div>
      <div class="container copy">© ${new Date().getFullYear()} ${esc(D.company.nameAr)} — جميع الحقوق محفوظة · NOUR DATASHEET</div>`;
  }

  // reveal-on-scroll
  function observeReveals(root) {
    const els = (root || document).querySelectorAll(".reveal:not(.in)");
    if (!("IntersectionObserver" in window)) {
      els.forEach((e) => e.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add("in");
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.08 }
    );
    els.forEach((e) => io.observe(e));
  }

  window.NOUR = {
    D, ICONS, esc, cm, dimShort, waFor, productUrl,
    miniActions, heroContact, footer, observeReveals, applyBrandAssets,
  };
})();
