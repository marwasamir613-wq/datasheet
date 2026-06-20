/* ===========================================================
   NOUR DATASHEET — Product STRUCTURE engine (single source of truth)
   -----------------------------------------------------------
   One reusable module that, for every product in all 7 sections:
     1) extracts a structured panel CONFIGURATION from its
        category + Arabic name + dimensions  (analyzeProduct)
     2) classifies it into a clean LAYOUT TYPE                (layoutType)
     3) builds a tailored AI image PROMPT for the closed view
        and the open / interior view                         (buildPrompts)

   The same configuration drives BOTH:
     - the on-site SVG illustrations (assets/js/svg.js), and
     - the AI prompts baked into data.js for later raster generation.
   So the closed view, the open view and any future AI render all
   describe the *same* unit with the *same* real arrangement —
   never a generic random panel.

   UMD: works under Node (build-data.js) and in the browser (window.NOUR_STRUCTURE).
   No dependencies. Pure functions. Deterministic (no randomness).
   =========================================================== */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api; // Node
  if (typeof window !== "undefined") window.NOUR_STRUCTURE = api;          // Browser
})(this, function () {
  "use strict";

  /* ---------- layout taxonomy (used by SVG + prompts) ---------- */
  const LAYOUT = {
    SINGLE_COLUMN: "single-column",
    DUAL_COLUMN: "dual-column",
    DUAL_COLUMN_BOTTOM: "dual-column-with-bottom-group",
    MULTI_ROW: "multi-row",
    METER_SINGLE: "meter-single",
    METER_AND_BREAKER: "meter-and-breaker-panel",
    METER_MATRIX: "meter-matrix",
    COMM_HORIZONTAL: "communication-horizontal",
    COMM_VERTICAL: "communication-vertical",
    COMM_PLASTIC: "communication-plastic-front",
    JUNCTION_BOX: "junction-box",
    CUSTOM: "custom-layout",
  };

  /* ---------- small Arabic parsing helpers ---------- */
  function intAfter(name, re) {
    const m = (name || "").match(re);
    return m ? parseInt(m[1], 10) : null;
  }
  const POLE_WORDS = { "أحادي": 1, "ثنائي": 2, "ثلاثي": 3, "رباعي": 4 };

  function readName(name) {
    name = name || "";
    let poles = null;
    for (const k in POLE_WORDS) if (name.indexOf(k) !== -1) poles = POLE_WORDS[k];
    return {
      lines: intAfter(name, /(\d+)\s*خط/),
      meters: intAfter(name, /(\d+)\s*عداد/),
      switches: intAfter(name, /(\d+)\s*مفاتيح/) || intAfter(name, /(\d+)\s*مفتاح/),
      poles,
      prepaid: /كارت\s*شحن/.test(name),                 // prepaid charge-card meter
      threePhase: /3\s*فاز|ثلاث(?:ي|ة)?\s*فاز|ثلاثي/.test(name),
      hasMain: /عمومي/.test(name),                      // main incoming breaker
      hasMeter: /عداد/.test(name),
      signalLamps: /لمب(?:ات|ة)?\s*إشارة|لمبات/.test(name),
      vertical: /رأسي|راسي/.test(name),
      horizontal: /أفقي|افقي/.test(name),
      plasticFront: /وش\s*بلاستيك|بلاستيك/.test(name),
      twoRows: /صفين|صفّين/.test(name),
      omega: /أوميجا|اوميجا|أوميغا|اوميغا/.test(name),
      omegaMobile: /متحرك/.test(name),
      omegaFixed: /ثابت/.test(name),
      insideFlat: /داخل\s*الشقة/.test(name),
      outsideFlat: /خارج\s*الشقة/.test(name),
    };
  }

  /* ---------- breaker decomposition -> realistic groups ----------
     Turns a single breaker count N into the real on-panel arrangement:
       small  -> one vertical group
       medium -> two vertical groups (left + right)
       large  -> two/three vertical groups + a smaller bottom group
     The leftover that does not fill the main columns becomes the
     "lower section" the customer specifically asked us to preserve. */
  function splitColumns(body, maxCols) {
    let cols = body > 28 ? Math.min(3, maxCols || 3) : 2;
    cols = Math.max(1, Math.min(cols, maxCols || cols));
    const base = Math.floor(body / cols), rem = body % cols, arr = [];
    for (let i = 0; i < cols; i++) arr.push(base + (i < rem ? 1 : 0));
    return arr;
  }

  function decomposeBreakers(n, opts) {
    opts = opts || {};
    n = Math.max(1, n | 0);
    // explicit "صفين" -> two horizontal rows, no bottom group
    if (opts.twoRows) {
      const perRow = Math.ceil(n / 2);
      return { columns: [perRow, n - perRow], lower: 0, rows: 2, orientation: "rows" };
    }
    if (n <= 6) return { columns: [n], lower: 0, rows: 1, orientation: "single" };
    if (n <= 12) {
      const a = Math.ceil(n / 2);
      return { columns: [a, n - a], lower: 0, rows: 1, orientation: "dual" };
    }
    // n > 12 -> reserve a small bottom group, split the rest into 2/3 columns
    let lower = n % 4 === 0 ? 4 : (n % 4 || 2);
    if (lower > 6) lower = 4;
    let body = n - lower;
    if (body % 2 !== 0) { lower += 1; body -= 1; }
    const columns = splitColumns(body, 3);
    return { columns, lower, rows: 1, orientation: "dual+bottom" };
  }

  /* ---------- door / hinge ---------- */
  function doorInfo(catSlug, n) {
    // Boxes have a flat bolted lid (no hinged door). Panels hinge on one side.
    if (catSlug === "junction-boxes" || catSlug === "nail-boxes")
      return { type: "bolted-cover", side: "none", opens: "lift-off flat cover" };
    return { type: "hinged-door", side: "left", opens: "swings open to the left" };
  }

  /* =====================================================================
     analyzeProduct(product, catSlug) -> rich structure object
     ===================================================================== */
  function analyzeProduct(product, catSlug) {
    const name = (product && product.name) || "";
    const slug = catSlug || product.categorySlug || "";
    const n = readName(name);
    const w = Number(product.w || product.dimensions_w) || null;
    const h = Number(product.h || product.dimensions_h) || null;
    const d = Number(product.d || product.dimensions_d) || null;

    // base structure shared by all products
    const S = {
      category: slug,
      productType: "panel",
      layoutType: LAYOUT.CUSTOM,
      orientation: h && w ? (h >= w ? "portrait" : "landscape") : "portrait",
      door: doorInfo(slug, n),
      doorSide: "left",
      // breaker model
      breakerGroups: 0,
      breakerColumns: [],
      breakerRows: 1,
      totalBreakers: 0,
      lowerSection: false,
      lowerCount: 0,
      // meter / main / extras
      hasMeter: false,
      meterCount: 0,
      prepaid: !!n.prepaid,
      hasMainBreaker: false,
      mainBreakerPosition: "none",
      mainBreakerPoles: n.poles || (n.threePhase ? 3 : null),
      threePhase: !!n.threePhase,
      signalLamps: 0,
      // descriptive
      structureDescription: "",
      notes: [],
      // QA
      confidenceScore: 0.5,
      reviewRequired: false,
    };

    let conf = 0.5;
    const note = (t) => { if (t) S.notes.push(t); };

    /* ---- decide the panel KIND, then fill the structure ---- */
    const isBox = slug === "junction-boxes" || slug === "nail-boxes" || /بواط|بواب/.test(name);
    const isComm = slug === "communications" || /اتصالات/.test(name);
    const isSmart = slug === "smart-panels" || /سمارت|ذكي/.test(name);
    const meterMatrix = (n.meters && n.meters >= 2);
    const isMeterOnly = slug === "meter-only" || (n.hasMeter && !n.lines && !isComm && !isBox);
    const isLineMeter = slug === "lines-meter" || (n.hasMeter && n.lines);
    const isLines = slug === "lines-only" || (n.lines && !n.hasMeter);

    if (isBox) {
      // ---- junction / nail box: empty steel enclosure, knockouts, no breakers ----
      S.productType = slug === "nail-boxes" ? "nail-junction-box" : "junction-box";
      S.layoutType = LAYOUT.JUNCTION_BOX;
      S.door = doorInfo(slug, n);
      S.doorSide = "none";
      conf = 0.92; // structure is trivially known from dimensions
      S.structureDescription =
        "Empty galvanized-steel junction enclosure: plain interior back-plate, " +
        "cable knockouts on the sides, no breakers and no meter — a wiring/distribution box.";
      note("بواط/علبة توزيع معدنية فارغة بفتحات كابلات — لا توجد قواطع أو عداد");
    } else if (isComm) {
      // ---- communications panel ----
      S.productType = "communication-panel";
      if (n.plasticFront) { S.layoutType = LAYOUT.COMM_PLASTIC; conf = 0.7; note("وش بلاستيك أمامي"); }
      else if (n.vertical) { S.layoutType = LAYOUT.COMM_VERTICAL; conf = 0.78; }
      else { S.layoutType = LAYOUT.COMM_HORIZONTAL; conf = 0.78; }
      S.commLanes = n.vertical ? 5 : 4;
      S.structureDescription =
        "Communications / telecom distribution box: a back-plate carrying rows of " +
        (n.vertical ? "vertical" : "horizontal") +
        " terminal blocks and cable lanes" +
        (n.plasticFront ? ", behind a hinged plastic front cover" : "") +
        " — no electrical breakers.";
      note("لوحة اتصالات: قواعد توصيل/تيرمينال بدون قواطع كهرباء");
    } else if (isSmart) {
      // ---- smart panel: custom, low structural certainty ----
      S.productType = "smart-panel";
      S.layoutType = LAYOUT.CUSTOM;
      const guess = n.lines || estimateLinesFromSize(w, h) || 8;
      const dec = decomposeBreakers(guess, {});
      applyBreakers(S, dec);
      S.hasMainBreaker = true;
      S.mainBreakerPosition = "top-center";
      S.smartControl = true;
      conf = n.lines ? 0.55 : 0.4;
      S.structureDescription =
        "Smart control & distribution panel: a smart controller / touch module at the top, " +
        "a main breaker, then approximately " + guess + " outgoing breakers in " +
        describeColumns(dec) + ". Exact internal layout is custom per order.";
      note("لوحة سمارت — تكوين داخلي حسب الطلب؛ العدد تقديري");
    } else if (meterMatrix) {
      // ---- multi-meter board (10/12 عداد ...) ----
      S.productType = "multi-meter-panel";
      S.layoutType = LAYOUT.METER_MATRIX;
      S.hasMeter = true;
      S.meterCount = n.meters;
      S.meterGrid = gridFor(n.meters);
      S.signalLamps = n.signalLamps ? n.meters : 0;
      S.hasMainBreaker = true;
      S.mainBreakerPosition = "top";
      conf = 0.8;
      S.structureDescription =
        n.meters + " electricity meters arranged in a " + S.meterGrid.cols + "×" + S.meterGrid.rows +
        " grid, each meter paired with its own breaker switch" +
        (n.signalLamps ? " and indicator lamp" : "") +
        ", fed from a common main bus at the top.";
      note("لوحة عدادات متعددة (" + n.meters + " عداد) بشبكة منتظمة + قواطع لكل عداد");
    } else if (isMeterOnly) {
      // ---- single / switched meter panel ----
      S.productType = "meter-panel";
      S.hasMeter = true;
      S.meterCount = 1;
      if (n.switches) {
        S.layoutType = LAYOUT.METER_AND_BREAKER;
        const dec = decomposeBreakers(n.switches, {});
        applyBreakers(S, dec);
        S.signalLamps = n.signalLamps ? n.switches : 0;
        conf = 0.8;
        S.structureDescription =
          "Single incoming meter at the top" + (n.prepaid ? " (prepaid charge-card type)" : "") +
          ", a row of " + n.switches + " breaker switches" +
          (n.signalLamps ? " each with an indicator lamp" : "") + " below it.";
        note("عداد واحد + " + n.switches + " مفاتيح قاطع" + (n.signalLamps ? " + لمبات إشارة" : ""));
      } else if (n.poles) {
        // the multi-pole switch IS the main switch — not a separate breaker group
        S.layoutType = LAYOUT.METER_AND_BREAKER;
        S.hasMainBreaker = true;
        S.mainBreakerPosition = "below-meter";
        S.mainBreakerPoles = n.poles;
        conf = 0.78;
        S.structureDescription =
          "Single incoming meter at the top" + (n.prepaid ? " (prepaid charge-card type)" : "") +
          " with a " + poleWord(n.poles) + " main switch directly beneath it.";
        note("عداد واحد + مفتاح " + poleWord(n.poles));
      } else {
        S.layoutType = LAYOUT.METER_SINGLE;
        conf = 0.72;
        S.structureDescription =
          "Single electricity meter" + (n.prepaid ? " (prepaid charge-card type)" : "") +
          (n.threePhase ? ", three-phase" : ", single-phase") +
          " filling the front, with terminal connections below.";
        note("لوحة عداد فردي" + (n.prepaid ? " كارت شحن" : ""));
      }
    } else if (isLineMeter) {
      // ---- meter + lines combined ----
      S.productType = "meter-and-lines-panel";
      S.hasMeter = true;
      S.meterCount = 1;
      const count = n.lines || n.switches || estimateLinesFromSize(w, h) || 12;
      const dec = decomposeBreakers(count, { twoRows: n.twoRows });
      applyBreakers(S, dec);
      S.layoutType = dec.lower ? LAYOUT.DUAL_COLUMN_BOTTOM
                   : dec.orientation === "rows" ? LAYOUT.MULTI_ROW
                   : dec.columns.length > 1 ? LAYOUT.DUAL_COLUMN : LAYOUT.SINGLE_COLUMN;
      S.hasMainBreaker = n.hasMain || n.threePhase || !!n.poles;
      S.mainBreakerPosition = S.hasMainBreaker ? "top-center" : "none";
      conf = n.lines ? 0.82 : 0.6;
      S.structureDescription =
        "Meter at the top" + (n.prepaid ? " (prepaid charge-card)" : "") +
        (S.hasMainBreaker ? " with a " + (n.threePhase ? "three-phase " : "") + "main breaker beside/under it" : "") +
        ", then " + count + " outgoing line breakers in " + describeColumns(dec) +
        (dec.lower ? " plus a smaller bottom group of " + dec.lower + " breakers" : "") + ".";
      note("لوحة خطوط + عداد: " + count + " خط" + (n.hasMain ? " بالعمومي" : ""));
    } else if (isLines) {
      // ---- lines-only distribution board ----
      S.productType = "distribution-panel";
      const count = n.lines || estimateLinesFromSize(w, h) || 12;
      const dec = decomposeBreakers(count, { twoRows: n.twoRows });
      applyBreakers(S, dec);
      S.layoutType = dec.lower ? LAYOUT.DUAL_COLUMN_BOTTOM
                   : dec.orientation === "rows" ? LAYOUT.MULTI_ROW
                   : dec.columns.length > 1 ? LAYOUT.DUAL_COLUMN : LAYOUT.SINGLE_COLUMN;
      S.hasMainBreaker = n.hasMain || n.threePhase;
      S.mainBreakerPosition = S.hasMainBreaker ? "top-center" : "none";
      conf = n.lines ? 0.85 : 0.55;
      S.structureDescription =
        (S.hasMainBreaker
          ? "A " + (n.threePhase ? "three-phase " : "") + "main breaker across the top, then "
          : "") +
        count + " outgoing line breakers on DIN rails arranged as " + describeColumns(dec) +
        (dec.lower ? " plus a smaller bottom group of " + dec.lower + " breakers" : "") +
        (n.omega ? " (" + (n.omegaMobile ? "movable" : "fixed") + " omega DIN rail)" : "") + ".";
      note("لوحة خطوط: " + count + " خط" + (n.hasMain ? " بالعمومي" : "") + (n.twoRows ? " صفين" : ""));
    } else {
      // ---- unknown: safe category-correct fallback ----
      S.productType = "panel";
      const count = estimateLinesFromSize(w, h) || 8;
      const dec = decomposeBreakers(count, {});
      applyBreakers(S, dec);
      S.layoutType = dec.lower ? LAYOUT.DUAL_COLUMN_BOTTOM : LAYOUT.DUAL_COLUMN;
      conf = 0.35;
      S.structureDescription =
        "General electrical enclosure; interior approximated as " + count +
        " breakers in " + describeColumns(dec) + " (insufficient data — verify against the real photo).";
      note("نوع غير محدد — تقدير آمن، يلزم مراجعة");
    }

    // direction confidence bumps
    if (n.vertical || n.horizontal) conf += 0.04;
    if (S.hasMainBreaker) conf += 0.03;
    if (n.prepaid) conf += 0.02;

    S.confidenceScore = Math.max(0, Math.min(1, Number(conf.toFixed(2))));
    S.reviewRequired = S.confidenceScore < 0.6;
    if (S.reviewRequired) note("⚠ مراجعة يدوية مطلوبة (ثقة منخفضة)");

    // arabic-friendly door note
    S.doorSide = S.door.side;
    return S;
  }

  /* ---------- helpers used above ---------- */
  function applyBreakers(S, dec) {
    S.breakerColumns = dec.columns.slice();
    S.breakerGroups = dec.columns.length + (dec.lower ? 1 : 0);
    S.breakerRows = dec.rows || 1;
    S.lowerSection = !!dec.lower;
    S.lowerCount = dec.lower || 0;
    S.totalBreakers = dec.columns.reduce((a, b) => a + b, 0) + (dec.lower || 0);
    S._dec = dec;
  }
  function describeColumns(dec) {
    if (dec.orientation === "rows") return dec.rows + " horizontal rows";
    if (dec.columns.length === 1) return "a single vertical group of " + dec.columns[0];
    if (dec.columns.length === 2) return "two vertical groups (" + dec.columns.join(" + ") + ")";
    return dec.columns.length + " vertical groups (" + dec.columns.join(" + ") + ")";
  }
  function poleWord(p) {
    return ({ 1: "single-pole", 2: "double-pole", 3: "three-pole", 4: "four-pole" })[p] || (p + "-pole");
  }
  function gridFor(nMeters) {
    const cols = nMeters <= 2 ? nMeters : (nMeters % 3 === 0 ? 3 : 2);
    return { cols, rows: Math.ceil(nMeters / cols) };
  }
  // rough fallback when the name carries no count: estimate from front area
  function estimateLinesFromSize(w, h) {
    if (!w || !h) return null;
    const area = (w * h) / 10000; // cm²
    return Math.max(4, Math.min(36, Math.round(area / 12) * 2));
  }

  /* =====================================================================
     PROMPT BUILDER — one closed prompt + one open prompt per product
     ===================================================================== */
  const STYLE =
    "Clean commercial 3D product illustration, professional datasheet/catalog style, " +
    "soft studio lighting, subtle reflections, neutral light-grey seamless background, " +
    "slight isometric three-quarter angle, crisp edges, high detail, photorealistic " +
    "materials but clearly a polished 3D render (NOT a photograph, NOT a copy of any photo).";

  const BRAND =
    "Brand identity: NOUR — modern blue (#0b4ea2) and white powder-coated steel, " +
    "a small NOUR badge with a red lightning bolt on the door.";

  function dimLine(p) {
    const w = p.w || p.dimensions_w, h = p.h || p.dimensions_h, d = p.d || p.dimensions_d;
    if (!w || !h) return "";
    return "Real proportions width " + w + "mm × height " + h + "mm × depth " + (d || 90) +
      "mm — keep this aspect ratio (" + (h >= w ? "tall portrait" : "wide landscape") + " cabinet).";
  }

  const GUARD =
    "STRICT RULES: keep it structurally faithful to the real product configuration described " +
    "below; do NOT invent a random breaker layout; do NOT add or remove breakers, meters or " +
    "sections; the closed view and the open view MUST be the exact same unit (same size, colour, " +
    "proportions and identity); output a single product centered in frame.";
  const REFERENCE =
    "Use the supplied real product image as the PRIMARY visual reference for the enclosure: " +
    "preserve its actual proportions, door shape, frame depth, handle/lock position, hinges, " +
    "visible openings, colour placement and NOUR branding. Improve it into a polished 3D catalog " +
    "render without replacing it with a generic electrical cabinet.";

  function buildClosedPrompt(p, S) {
    const parts = [
      "CLOSED VIEW — " + (p.name || "NOUR electrical panel") + ".",
      REFERENCE, STYLE, BRAND, dimLine(p),
      "Show the enclosure fully CLOSED from the front, " +
        (S.door.type === "bolted-cover"
          ? "a plain bolted steel cover with corner screws and side cable knockouts"
          : "a single hinged door (handle/lock on the right, hinges on the " + S.door.side + ")") +
        ".",
      frontCue(S),
      "Category: " + categoryLabel(S) + ".",
      GUARD,
      "Avoid: open door, visible breakers, text labels, watermarks, clutter, multiple panels.",
    ];
    return clean(parts);
  }

  function buildOpenPrompt(p, S) {
    const parts = [
      "OPEN / INTERIOR VIEW — " + (p.name || "NOUR electrical panel") + ".",
      REFERENCE, STYLE, BRAND, dimLine(p),
      "Same enclosure as the closed view but with the door " +
        (S.door.type === "bolted-cover" ? "cover removed and set aside" : S.door.opens) +
        ", revealing the interior back-plate.",
      "INTERNAL ARRANGEMENT (reproduce faithfully): " + S.structureDescription,
      interiorSpec(S),
      "Category: " + categoryLabel(S) + ".",
      GUARD,
      "Avoid: extra/random breakers, a different count, a generic front-facing panel, " +
        "mismatched size or colour vs the closed view, text labels, watermarks.",
    ];
    return clean(parts);
  }

  function frontCue(S) {
    switch (S.layoutType) {
      case LAYOUT.METER_SINGLE:
      case LAYOUT.METER_AND_BREAKER:
        return "A meter viewing window is visible on the door.";
      case LAYOUT.METER_MATRIX:
        return "Several meter viewing windows are visible on the door, in a regular grid.";
      case LAYOUT.COMM_PLASTIC:
        return "A hinged translucent plastic front cover.";
      case LAYOUT.JUNCTION_BOX:
        return "A plain rectangular steel box, no door details.";
      default:
        return "A plain door with a louvre/vent detail near the bottom.";
    }
  }

  function interiorSpec(S) {
    const bits = [];
    if (S.hasMainBreaker) {
      const poleTxt = S.threePhase ? "three-phase (wide) "
        : (S.mainBreakerPoles ? poleWord(S.mainBreakerPoles) + " " : "");
      const kind = (S.mainBreakerPoles && !S.threePhase) ? "main switch" : "main breaker";
      bits.push("a " + poleTxt + kind + " at the " +
        (S.mainBreakerPosition === "below-meter" ? "position just below the meter" : "top-centre"));
    }
    if (S.hasMeter)
      bits.push((S.meterCount > 1 ? S.meterCount + " meters in a " + (S.meterGrid ? S.meterGrid.cols + "×" + S.meterGrid.rows + " grid" : "grid")
                                  : "one meter" + (S.prepaid ? " (prepaid charge-card)" : "")));
    if (S.totalBreakers > 0 && S.layoutType !== LAYOUT.JUNCTION_BOX) {
      if (S.breakerRows > 1 && S._dec && S._dec.orientation === "rows")
        bits.push(S.totalBreakers + " breakers in " + S.breakerRows + " horizontal rows on DIN rails");
      else
        bits.push(S.breakerColumns.join(" + ") + " breakers in " +
          (S.breakerColumns.length > 1 ? S.breakerColumns.length + " vertical groups" : "one vertical group") +
          (S.lowerSection ? " plus a smaller bottom group of " + S.lowerCount + " breakers" : ""));
    }
    if (S.signalLamps) bits.push(S.signalLamps + " small indicator lamps");
    if (S.layoutType === LAYOUT.JUNCTION_BOX)
      bits.push("an empty steel back-plate with cable knockouts only — no breakers, no meter");
    if (S.commLanes) bits.push(S.commLanes + " rows of terminal blocks / cable lanes (telecom)");
    return "Interior must contain exactly: " + (bits.join("; ") || "the arrangement described above") + ".";
  }

  function categoryLabel(S) {
    return ({
      "lines-only": "lines-only distribution board",
      "meter-only": "meter panel",
      "lines-meter": "meter + lines panel",
      "smart-panels": "smart control panel",
      "communications": "communications panel",
      "junction-boxes": "metal junction box",
      "nail-boxes": "metal nail junction box",
    })[S.category] || "electrical panel";
  }

  function clean(parts) { return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim(); }

  function buildPrompts(p, S) {
    return { promptClosed: buildClosedPrompt(p, S), promptOpen: buildOpenPrompt(p, S) };
  }

  return {
    LAYOUT,
    analyzeProduct,
    buildPrompts,
    buildClosedPrompt,
    buildOpenPrompt,
    // exposed for the SVG renderer / debugging
    _internals: { readName, decomposeBreakers, estimateLinesFromSize },
  };
});
