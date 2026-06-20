/* ===========================================================
   NOUR DATASHEET — lightweight public SVG utilities
   Dimension diagram + neutral missing-image placeholder only.
   Product panel illustrations are intentionally not rendered.
   =========================================================== */
(function () {
  let nextId = 0;
  const uid = () => "nour-dim-" + ++nextId;

  function dims(p) {
    const id = uid(), VB = 430, VH = 360;
    const w = p.w || 300, h = p.h || 400, d = p.d || 90;
    const s = 190 / Math.max(w, h);
    const W = w * s, H = h * s;
    const D = Math.max(14, Math.min(60, d * s));
    const dxv = D * 0.7, dyv = D * 0.5;
    const x = 96, y = (VH - H) / 2 - 6;
    const blue = "#0b57b8", ink = "#0f1b2d", tick = "#9fbfe6";
    const trx = x + W, try_ = y;
    return `<svg viewBox="0 0 ${VB} ${VH}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="رسم المقاسات">
      <defs><marker id="${id}-ar" markerWidth="9" markerHeight="9" refX="4.5" refY="4.5" orient="auto"><path d="M1 1 L8 4.5 L1 8 Z" fill="${blue}"/></marker></defs>
      <rect x="${x}" y="${y}" width="${W}" height="${H}" rx="8" fill="#f4f9ff" stroke="${blue}" stroke-width="2"/>
      <rect x="${x + 8}" y="${y + 8}" width="${W - 16}" height="${H - 16}" rx="6" fill="#fff" stroke="${tick}" stroke-dasharray="3 4"/>
      <polygon points="${trx},${try_} ${trx + dxv},${try_ - dyv} ${trx + dxv},${try_ - dyv + H} ${trx},${try_ + H}" fill="#dcebfc" opacity="0.6" stroke="${tick}"/>
      <line x1="${x}" y1="${y + H + 16}" x2="${x}" y2="${y + H + 40}" stroke="${tick}"/>
      <line x1="${x + W}" y1="${y + H + 16}" x2="${x + W}" y2="${y + H + 40}" stroke="${tick}"/>
      <line x1="${x}" y1="${y + H + 30}" x2="${x + W}" y2="${y + H + 30}" stroke="${blue}" stroke-width="1.6" marker-start="url(#${id}-ar)" marker-end="url(#${id}-ar)"/>
      <text x="${x + W / 2}" y="${y + H + 52}" text-anchor="middle" font-family="Montserrat,Arial,sans-serif" font-weight="700" font-size="13" fill="${ink}">Width — ${w} mm</text>
      <line x1="${x - 16}" y1="${y}" x2="${x - 40}" y2="${y}" stroke="${tick}"/>
      <line x1="${x - 16}" y1="${y + H}" x2="${x - 40}" y2="${y + H}" stroke="${tick}"/>
      <line x1="${x - 30}" y1="${y}" x2="${x - 30}" y2="${y + H}" stroke="${blue}" stroke-width="1.6" marker-start="url(#${id}-ar)" marker-end="url(#${id}-ar)"/>
      <text x="${x - 36}" y="${y + H / 2}" text-anchor="middle" font-family="Montserrat,Arial,sans-serif" font-weight="700" font-size="13" fill="${ink}" transform="rotate(-90 ${x - 36} ${y + H / 2})">Height — ${h} mm</text>
      <line x1="${trx}" y1="${try_ - 8}" x2="${trx + dxv}" y2="${try_ - dyv - 8}" stroke="${blue}" stroke-width="1.6" marker-start="url(#${id}-ar)" marker-end="url(#${id}-ar)"/>
      <text x="${trx + dxv / 2 + 30}" y="${try_ - dyv - 14}" text-anchor="middle" font-family="Montserrat,Arial,sans-serif" font-weight="700" font-size="13" fill="${ink}">Depth — ${d} mm</text>
    </svg>`;
  }

  function placeholder() {
    return `<svg viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="صورة غير متوفرة">
      <rect width="200" height="160" rx="10" fill="#eaf2fb"/>
      <rect x="65" y="38" width="70" height="58" rx="7" fill="none" stroke="#7d9cc0" stroke-width="3"/>
      <circle cx="84" cy="56" r="6" fill="#9fbfe6"/>
      <path d="M70 88 91 68l14 13 10-9 15 16" fill="none" stroke="#7d9cc0" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="100" y="130" text-anchor="middle" font-family="Cairo,Arial,sans-serif" font-size="12" fill="#5b6b80">صورة غير متوفرة</text>
    </svg>`;
  }

  window.NOUR_SVG = { dims, placeholder };
})();
