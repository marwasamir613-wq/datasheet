/* ===========================================================
   NOUR DATASHEET — lightweight public SVG utilities
   Professional technical dimension drawing + missing-image placeholder.
   The dimension drawing is generated from each product's own
   Width / Height / Depth values (p.w / p.h / p.d). It is reusable and
   applied to every product page automatically.
   =========================================================== */
(function () {
  let nextId = 0;
  const uid = () => "nour-dim-" + ++nextId;
  const r = (n) => Math.round(n * 10) / 10;

  /* Clean engineering-style drawing: a FRONT view (Width × Height) with a
     hinged door, plus a SIDE view (Depth × Height), with proper extension
     lines, arrowheaded dimension lines and Width / Height / Depth labels.
     Black/blue line work on a white sheet — close to the old Nour PDF style. */
  function dims(p) {
    const id = uid();
    const wmm = Number(p && p.w) > 0 ? Number(p.w) : null;
    const hmm = Number(p && p.h) > 0 ? Number(p.h) : null;
    const dmm = Number(p && p.d) > 0 ? Number(p.d) : null;

    // Proportion fallbacks for the geometry only — labels still show the
    // real catalog values (or "غير متوفر" when a dimension is missing).
    const w = wmm || 300, h = hmm || 400, d = dmm || 90;

    // One shared scale (mm → px) so all three views stay to the same ratio.
    const FRONT_MAX_W = 175, FRONT_MAX_H = 215;
    const s = Math.min(FRONT_MAX_W / w, FRONT_MAX_H / h);
    const FW = w * s, FH = h * s;
    const SW = Math.max(22, Math.min(130, d * s)); // side-view width (depth)

    const viewTop = 52;       // space above for the depth dimension
    const frontX = 100;       // space left for the height dimension
    const gap = 58;           // space between the front and side views
    const sideX = frontX + FW + gap;

    const VBW = r(sideX + SW + 40);
    const VBH = r(viewTop + FH + 66);

    const blue = "#0b57b8", navy = "#07254d", ink = "#0f1b2d";
    const edge = "#9fc0ea", faint = "#c9def7";
    const fillFront = "#f4f9ff", fillDoor = "#ffffff", fillSide = "#e9f2fd";

    const wLabel = wmm == null ? "غير متوفر" : wmm + " mm";
    const hLabel = hmm == null ? "غير متوفر" : hmm + " mm";
    const dLabel = dmm == null ? "غير متوفر" : dmm + " mm";

    // front rect corners
    const fL = frontX, fR = frontX + FW, fT = viewTop, fB = viewTop + FH;
    // side rect corners
    const sL = sideX, sR = sideX + SW, sT = viewTop, sB = viewTop + FH;

    // dimension-line positions
    const widthDimY = fB + 30;
    const heightDimX = fL - 42;
    const depthDimY = sT - 26;

    const TXT = 'font-family="Montserrat,Arial,sans-serif" font-weight="700"';

    return `<svg viewBox="0 0 ${VBW} ${VBH}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="رسم المقاسات الفني — العرض ${wLabel}، الارتفاع ${hLabel}، العمق ${dLabel}">
      <defs>
        <marker id="${id}-a" markerWidth="11" markerHeight="11" refX="7.5" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M1 1 L8 4 L1 7 Z" fill="${blue}"/></marker>
        <marker id="${id}-b" markerWidth="11" markerHeight="11" refX="0.5" refY="4" orient="auto" markerUnits="userSpaceOnUse"><path d="M8 1 L1 4 L8 7 Z" fill="${blue}"/></marker>
      </defs>

      <rect x="0" y="0" width="${VBW}" height="${VBH}" rx="10" fill="#ffffff"/>

      <!-- FRONT VIEW -->
      <rect x="${r(fL)}" y="${r(fT)}" width="${r(FW)}" height="${r(FH)}" rx="7" fill="${fillFront}" stroke="${blue}" stroke-width="2.2"/>
      <rect x="${r(fL + 7)}" y="${r(fT + 7)}" width="${r(FW - 14)}" height="${r(FH - 14)}" rx="4" fill="${fillDoor}" stroke="${edge}" stroke-dasharray="4 4"/>
      <rect x="${r(fL + 5)}" y="${r(fT + FH * 0.17)}" width="5" height="16" rx="1.5" fill="${edge}"/>
      <rect x="${r(fL + 5)}" y="${r(fT + FH * 0.72)}" width="5" height="16" rx="1.5" fill="${edge}"/>
      <line x1="${r(fR - 9)}" y1="${r(fT + FH / 2 - 12)}" x2="${r(fR - 9)}" y2="${r(fT + FH / 2 + 12)}" stroke="${blue}" stroke-width="2.4" stroke-linecap="round"/>
      <text x="${r(fL + FW / 2)}" y="${r(fB + 50)}" text-anchor="middle" ${TXT} font-size="11" fill="${navy}" letter-spacing="1">FRONT VIEW</text>

      <!-- SIDE VIEW -->
      <rect x="${r(sL)}" y="${r(sT)}" width="${r(SW)}" height="${r(FH)}" rx="4" fill="${fillSide}" stroke="${blue}" stroke-width="2.2"/>
      <line x1="${r(sL + SW * 0.5)}" y1="${r(sT)}" x2="${r(sL + SW * 0.5)}" y2="${r(sB)}" stroke="${edge}" stroke-dasharray="4 4"/>
      <text x="${r(sL + SW / 2)}" y="${r(sB + 50)}" text-anchor="middle" ${TXT} font-size="11" fill="${navy}" letter-spacing="1">SIDE VIEW</text>

      <!-- WIDTH dimension (below front) -->
      <line x1="${r(fL)}" y1="${r(fB + 6)}" x2="${r(fL)}" y2="${r(widthDimY + 6)}" stroke="${faint}"/>
      <line x1="${r(fR)}" y1="${r(fB + 6)}" x2="${r(fR)}" y2="${r(widthDimY + 6)}" stroke="${faint}"/>
      <line x1="${r(fL)}" y1="${r(widthDimY)}" x2="${r(fR)}" y2="${r(widthDimY)}" stroke="${blue}" stroke-width="1.5" marker-start="url(#${id}-b)" marker-end="url(#${id}-a)"/>
      <text x="${r(fL + FW / 2)}" y="${r(widthDimY - 7)}" text-anchor="middle" ${TXT} font-size="12.5" fill="${ink}">Width — ${wLabel}</text>

      <!-- HEIGHT dimension (left of front) -->
      <line x1="${r(fL - 6)}" y1="${r(fT)}" x2="${r(heightDimX - 6)}" y2="${r(fT)}" stroke="${faint}"/>
      <line x1="${r(fL - 6)}" y1="${r(fB)}" x2="${r(heightDimX - 6)}" y2="${r(fB)}" stroke="${faint}"/>
      <line x1="${r(heightDimX)}" y1="${r(fT)}" x2="${r(heightDimX)}" y2="${r(fB)}" stroke="${blue}" stroke-width="1.5" marker-start="url(#${id}-b)" marker-end="url(#${id}-a)"/>
      <text x="${r(heightDimX - 9)}" y="${r(fT + FH / 2)}" text-anchor="middle" ${TXT} font-size="12.5" fill="${ink}" transform="rotate(-90 ${r(heightDimX - 9)} ${r(fT + FH / 2)})">Height — ${hLabel}</text>

      <!-- DEPTH dimension (above side) -->
      <line x1="${r(sL)}" y1="${r(sT - 6)}" x2="${r(sL)}" y2="${r(depthDimY - 6)}" stroke="${faint}"/>
      <line x1="${r(sR)}" y1="${r(sT - 6)}" x2="${r(sR)}" y2="${r(depthDimY - 6)}" stroke="${faint}"/>
      <line x1="${r(sL)}" y1="${r(depthDimY)}" x2="${r(sR)}" y2="${r(depthDimY)}" stroke="${blue}" stroke-width="1.5" marker-start="url(#${id}-b)" marker-end="url(#${id}-a)"/>
      <text x="${r(sL + SW / 2)}" y="${r(depthDimY - 7)}" text-anchor="middle" ${TXT} font-size="12.5" fill="${ink}">Depth — ${dLabel}</text>
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
