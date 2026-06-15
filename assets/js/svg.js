/* ===========================================================
   NOUR DATASHEET — parametric SVG illustration generators
   Every drawing is scaled from the product's REAL w/h/d (mm).
   No measurements are invented; interior detail is illustrative.
   =========================================================== */
(function () {
  let _id = 0;
  const uid = () => "n" + ++_id;
  const C = {
    faceLight: "#eaf2fb", face: "#bcd6f4", faceMid: "#7fb0ea",
    blue: "#0b57b8", blue2: "#1769c9", navy: "#07254d", navy2: "#0a3a72",
    edge: "#cdddf2", steel: "#9fbfe6", red: "#e8312a", ink: "#0f1b2d",
  };

  function fit(w, h, maxW, maxH) {
    const s = Math.min(maxW / w, maxH / h);
    return { wpx: w * s, hpx: h * s, s };
  }

  /* NOUR badge (echoes the logo: blue wordmark + red spark) */
  function badge(cx, cy, w) {
    const h = w * 0.4, x = cx - w / 2, y = cy - h / 2;
    const fs = h * 0.52;
    return `
      <g>
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h * 0.24}" fill="#ffffff" stroke="${C.edge}"/>
        <text x="${cx - w * 0.08}" y="${cy + fs * 0.02}" font-family="Orbitron,Montserrat,sans-serif"
          font-weight="800" font-size="${fs}" fill="${C.blue}" text-anchor="middle"
          dominant-baseline="central" letter-spacing="0.5">NOUR</text>
        <path d="M ${x + w * 0.86} ${y + h * 0.2} L ${x + w * 0.7} ${y + h * 0.56}
          L ${x + w * 0.8} ${y + h * 0.56} L ${x + w * 0.7} ${y + h * 0.86}
          L ${x + w * 0.92} ${y + h * 0.44} L ${x + w * 0.82} ${y + h * 0.44} Z" fill="${C.red}"/>
      </g>`;
  }

  function gradDefs(id) {
    return `
    <defs>
      <linearGradient id="${id}-front" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#f4f9ff"/><stop offset="1" stop-color="#cfe2f8"/>
      </linearGradient>
      <linearGradient id="${id}-top" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#dcebfc"/><stop offset="1" stop-color="#b7d3f2"/>
      </linearGradient>
      <linearGradient id="${id}-side" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#6f9fdc"/><stop offset="1" stop-color="#3f74bb"/>
      </linearGradient>
      <linearGradient id="${id}-door" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#dbeafc"/>
      </linearGradient>
    </defs>`;
  }

  /* ---------- CLOSED panel (front view) ---------- */
  function closed(p) {
    const id = uid(), VB = 340, VH = 320;
    const { wpx, hpx } = fit(p.w || 300, p.h || 400, 196, 250);
    const x = (VB - wpx) / 2, y = (VH - hpx) / 2;
    const r = Math.min(14, wpx * 0.08);
    const pad = Math.max(7, wpx * 0.05);
    const dx = x + pad, dy = y + pad, dw = wpx - pad * 2, dh = hpx - pad * 2;
    const bolt = (bx, by) => `<circle cx="${bx}" cy="${by}" r="3.1" fill="${C.steel}"/>`;
    let louvers = "";
    for (let i = 0; i < 3; i++) {
      const ly = dy + dh - 16 - i * 9;
      louvers += `<rect x="${dx + dw * 0.28}" y="${ly}" width="${dw * 0.44}" height="3" rx="1.5" fill="${C.steel}" opacity="0.7"/>`;
    }
    return `<svg viewBox="0 0 ${VB} ${VH}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="اللوحة مغلقة">
      ${gradDefs(id)}
      <rect x="${x + 5}" y="${y + 6}" width="${wpx}" height="${hpx}" rx="${r}" fill="${C.navy2}" opacity="0.18"/>
      <rect x="${x}" y="${y}" width="${wpx}" height="${hpx}" rx="${r}" fill="url(#${id}-front)" stroke="${C.blue}" stroke-width="2"/>
      <rect x="${dx}" y="${dy}" width="${dw}" height="${dh}" rx="${r * 0.7}" fill="url(#${id}-door)" stroke="${C.steel}" stroke-width="1.5"/>
      <line x1="${dx + dw * 0.5}" y1="${dy + 4}" x2="${dx + dw * 0.5}" y2="${dy + dh - 4}" stroke="${C.steel}" stroke-width="1" stroke-dasharray="3 4" opacity="0.6"/>
      <g>
        <rect x="${dx - 3}" y="${dy + dh * 0.22}" width="4" height="${dh * 0.12}" rx="2" fill="${C.steel}"/>
        <rect x="${dx - 3}" y="${dy + dh * 0.66}" width="4" height="${dh * 0.12}" rx="2" fill="${C.steel}"/>
      </g>
      <circle cx="${dx + dw - 12}" cy="${dy + dh * 0.5}" r="4.5" fill="none" stroke="${C.blue}" stroke-width="2"/>
      <rect x="${dx + dw - 15}" y="${dy + dh * 0.5 - 1.5}" width="9" height="3" rx="1.5" fill="${C.blue}"/>
      ${badge(x + wpx / 2, y + hpx * 0.4, Math.min(96, wpx * 0.62))}
      ${louvers}
      ${bolt(x + 12, y + 12)}${bolt(x + wpx - 12, y + 12)}${bolt(x + 12, y + hpx - 12)}${bolt(x + wpx - 12, y + hpx - 12)}
    </svg>`;
  }

  /* ---------- OPEN panel (door swung open, interior visible) ---------- */
  function open(p) {
    const id = uid(), VB = 360, VH = 320;
    const { wpx, hpx } = fit(p.w || 300, p.h || 400, 150, 250);
    const x = 150, y = (VH - hpx) / 2;
    const r = Math.min(12, wpx * 0.07);
    // enclosure (interior box)
    const pad = Math.max(8, wpx * 0.07);
    const ix = x + pad, iy = y + pad, iw = wpx - pad * 2, ih = hpx - pad * 2;
    // DIN rails + breakers (illustrative density from size)
    const rails = Math.max(2, Math.min(4, Math.round((p.h || 400) / 150)));
    const perRail = Math.max(4, Math.min(9, Math.round((p.w || 300) / 42)));
    let interior = "";
    const railGap = ih / (rails + 1);
    for (let rI = 1; rI <= rails; rI++) {
      const ry = iy + railGap * rI;
      interior += `<rect x="${ix + 6}" y="${ry - 4}" width="${iw - 12}" height="8" rx="2" fill="${C.steel}" opacity="0.55"/>`;
      const bw = (iw - 16) / perRail;
      for (let c = 0; c < perRail; c++) {
        const bx = ix + 8 + c * bw;
        interior += `<rect x="${bx}" y="${ry - 11}" width="${bw - 2.5}" height="22" rx="2" fill="#fff" stroke="${C.blue2}" stroke-width="0.8"/>
          <rect x="${bx + (bw - 2.5) * 0.32}" y="${ry - 7}" width="${(bw - 2.5) * 0.36}" height="6" rx="1.5" fill="${C.red}" opacity="0.85"/>`;
      }
    }
    // door, swung open to the left (hinged on the panel's left edge)
    const doorW = wpx * 0.62, doorTop = y + hpx * 0.08, doorH = hpx * 0.84;
    const hingeX = x;
    const skew = 18;
    const doorPath = `M ${hingeX} ${doorTop} L ${hingeX - doorW} ${doorTop + skew}
      L ${hingeX - doorW} ${doorTop + doorH - skew} L ${hingeX} ${doorTop + doorH} Z`;
    return `<svg viewBox="0 0 ${VB} ${VH}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="اللوحة مفتوحة">
      ${gradDefs(id)}
      <rect x="${x + 5}" y="${y + 6}" width="${wpx}" height="${hpx}" rx="${r}" fill="${C.navy2}" opacity="0.16"/>
      <rect x="${x}" y="${y}" width="${wpx}" height="${hpx}" rx="${r}" fill="${C.navy}" />
      <rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" rx="${r * 0.6}" fill="#eef5ff" stroke="${C.steel}"/>
      <rect x="${ix + iw * 0.2}" y="${iy + 5}" width="${iw * 0.6}" height="11" rx="2" fill="${C.steel}" opacity="0.7"/>
      ${interior}
      <g>
        <path d="${doorPath}" fill="url(#${id}-door)" stroke="${C.blue}" stroke-width="2"/>
        <path d="${doorPath}" fill="none" stroke="${C.steel}" stroke-width="1" opacity="0.5" transform="translate(6,0)"/>
        ${badge(hingeX - doorW / 2, doorTop + doorH / 2, Math.min(86, doorW * 0.7))}
        <circle cx="${hingeX}" cy="${doorTop + doorH * 0.28}" r="3" fill="${C.steel}"/>
        <circle cx="${hingeX}" cy="${doorTop + doorH * 0.72}" r="3" fill="${C.steel}"/>
      </g>
    </svg>`;
  }

  /* ---------- 3D isometric render (uses real w, h, d) ---------- */
  function iso(p) {
    const id = uid(), VB = 420, VH = 360;
    const w = p.w || 300, h = p.h || 400, d = p.d || 90;
    const s = 220 / Math.max(w, h);
    const W = w * s, H = h * s, D = Math.max(16, Math.min(78, d * s));
    const dx = D * 0.62, dy = D * 0.42;
    const x = (VB - (W + dx)) / 2, y = (VH - (H + dy)) / 2 + dy;
    const r = Math.min(10, W * 0.06);
    // faces
    const top = `${x},${y} ${x + dx},${y - dy} ${x + W + dx},${y - dy} ${x + W},${y}`;
    const side = `${x + W},${y} ${x + W + dx},${y - dy} ${x + W + dx},${y - dy + H} ${x + W},${y + H}`;
    const pad = Math.max(7, W * 0.06);
    return `<svg viewBox="0 0 ${VB} ${VH}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="مجسم ثلاثي الأبعاد">
      ${gradDefs(id)}
      <ellipse cx="${x + W / 2 + dx / 2}" cy="${y + H + 14}" rx="${W * 0.55}" ry="12" fill="${C.navy}" opacity="0.14"/>
      <polygon points="${side}" fill="url(#${id}-side)" stroke="${C.navy2}" stroke-width="1"/>
      <polygon points="${top}" fill="url(#${id}-top)" stroke="${C.steel}" stroke-width="1"/>
      <rect x="${x}" y="${y}" width="${W}" height="${H}" rx="${r}" fill="url(#${id}-front)" stroke="${C.blue}" stroke-width="2"/>
      <rect x="${x + pad}" y="${y + pad}" width="${W - pad * 2}" height="${H - pad * 2}" rx="${r * 0.6}" fill="url(#${id}-door)" stroke="${C.steel}"/>
      ${badge(x + W / 2, y + H * 0.4, Math.min(92, W * 0.6))}
      <circle cx="${x + W - pad - 7}" cy="${y + H * 0.5}" r="4" fill="none" stroke="${C.blue}" stroke-width="2"/>
      <text x="${x + W + dx * 0.5}" y="${y - dy / 2 - 4}" font-family="Orbitron,sans-serif" font-size="10" fill="${C.navy2}" text-anchor="middle" opacity="0.7">3D</text>
    </svg>`;
  }

  /* ---------- Dimension drawing (Width / Height / Depth) ---------- */
  function dims(p) {
    const id = uid(), VB = 430, VH = 360;
    const w = p.w || 300, h = p.h || 400, d = p.d || 90;
    const s = 190 / Math.max(w, h);
    const W = w * s, H = h * s;
    const D = Math.max(14, Math.min(60, d * s));
    const dxv = D * 0.7, dyv = D * 0.5;
    const x = 96, y = (VH - H) / 2 - 6;
    const blue = C.blue, ink = C.ink;
    const tick = "#9fbfe6";
    // depth iso edge from top-right corner
    const trx = x + W, try_ = y;
    return `<svg viewBox="0 0 ${VB} ${VH}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="رسم المقاسات">
      <defs>
        <marker id="${id}-ar" markerWidth="9" markerHeight="9" refX="4.5" refY="4.5" orient="auto">
          <path d="M1 1 L8 4.5 L1 8 Z" fill="${blue}"/>
        </marker>
      </defs>
      <!-- panel face -->
      <rect x="${x}" y="${y}" width="${W}" height="${H}" rx="8" fill="#f4f9ff" stroke="${blue}" stroke-width="2"/>
      <rect x="${x + 8}" y="${y + 8}" width="${W - 16}" height="${H - 16}" rx="6" fill="#ffffff" stroke="${tick}" stroke-dasharray="3 4"/>
      <!-- depth iso edge -->
      <polygon points="${trx},${try_} ${trx + dxv},${try_ - dyv} ${trx + dxv},${try_ - dyv + H} ${trx},${try_ + H}"
        fill="#dcebfc" opacity="0.6" stroke="${tick}"/>
      <!-- WIDTH (bottom) -->
      <line x1="${x}" y1="${y + H + 16}" x2="${x}" y2="${y + H + 40}" stroke="${tick}"/>
      <line x1="${x + W}" y1="${y + H + 16}" x2="${x + W}" y2="${y + H + 40}" stroke="${tick}"/>
      <line x1="${x}" y1="${y + H + 30}" x2="${x + W}" y2="${y + H + 30}" stroke="${blue}" stroke-width="1.6"
        marker-start="url(#${id}-ar)" marker-end="url(#${id}-ar)"/>
      <text x="${x + W / 2}" y="${y + H + 52}" text-anchor="middle" font-family="Montserrat,Arial,sans-serif"
        font-weight="700" font-size="13" fill="${ink}">Width — ${w} mm</text>
      <!-- HEIGHT (left) -->
      <line x1="${x - 16}" y1="${y}" x2="${x - 40}" y2="${y}" stroke="${tick}"/>
      <line x1="${x - 16}" y1="${y + H}" x2="${x - 40}" y2="${y + H}" stroke="${tick}"/>
      <line x1="${x - 30}" y1="${y}" x2="${x - 30}" y2="${y + H}" stroke="${blue}" stroke-width="1.6"
        marker-start="url(#${id}-ar)" marker-end="url(#${id}-ar)"/>
      <text x="${x - 36}" y="${y + H / 2}" text-anchor="middle" font-family="Montserrat,Arial,sans-serif"
        font-weight="700" font-size="13" fill="${ink}" transform="rotate(-90 ${x - 36} ${y + H / 2})">Height — ${h} mm</text>
      <!-- DEPTH (top-right) -->
      <line x1="${trx}" y1="${try_ - 8}" x2="${trx + dxv}" y2="${try_ - dyv - 8}" stroke="${blue}" stroke-width="1.6"
        marker-start="url(#${id}-ar)" marker-end="url(#${id}-ar)"/>
      <text x="${trx + dxv / 2 + 30}" y="${try_ - dyv - 14}" text-anchor="middle" font-family="Montserrat,Arial,sans-serif"
        font-weight="700" font-size="13" fill="${ink}">Depth — ${d} mm</text>
    </svg>`;
  }

  /* ---------- image-load fallback ---------- */
  function placeholder() {
    const id = uid();
    return `<svg viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg">
      ${gradDefs(id)}
      <rect width="200" height="160" fill="url(#${id}-front)"/>
      <rect x="64" y="36" width="72" height="92" rx="8" fill="#fff" stroke="${C.blue}" stroke-width="2"/>
      ${badge(100, 70, 52)}
      <text x="100" y="120" text-anchor="middle" font-family="Cairo,sans-serif" font-size="11" fill="${C.muted || "#5b6b80"}">صورة غير متوفرة</text>
    </svg>`;
  }

  window.NOUR_SVG = { closed, open, iso, dims, placeholder };
})();
