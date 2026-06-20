/* Transforms the raw Supabase catalog export into assets/js/data.js
   Run: node data/build-data.js   (from project root) */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const cats = require(path.join(ROOT, "data/categories.raw.json"));
const prods = require(path.join(ROOT, "data/products.raw.json"));
const STRUCT = require(path.join(ROOT, "data/structure.js")); // structure + AI-prompt engine
const optimizedManifestPath = path.join(ROOT, "data/optimized-images.json");
const optimizedImages = fs.existsSync(optimizedManifestPath)
  ? require(optimizedManifestPath)
  : {};

// --- Company + contact (from profile + brief) ---
const company = {
  nameAr: "نور للإضاءة الحديثة",
  titleEn: "NOUR DATASHEET",
  introAr: "شركة نور متخصصة في تصنيع جميع مقاسات لوحات الكهرباء ويوجد تصنيع حسب الطلب",
  aboutAr:
    "نور للإضاءة الحديثة — خبرة تتجاوز 40 عامًا منذ عام 1985 في تصنيع لوحات الكهرباء بمختلف المقاسات، واللوحات الذكية، ولوحات الاتصالات، والبواطات. خامات قوية وتصنيع دقيق على يد فنيين متخصصين، مع إمكانية التصنيع حسب الطلب لخدمة المشاريع السكنية والتجارية والصناعية.",
  customNoteAr: "يوجد تصنيع حسب الطلب بأي مقاس",
};

const contact = {
  phoneDisplay: "01003510077",
  tel: "tel:+201003510077",
  whatsapp: "https://wa.me/201003510077",
  whatsappText:
    "https://wa.me/201003510077?text=" +
    encodeURIComponent("السلام عليكم، أرغب في الاستفسار عن "),
  facebook: "https://www.facebook.com/profile.php?id=100090946688622",
  email: "nourformodernligting111@gmail.com",
};

// --- Categories (catalog display_order) ---
cats.sort((a, b) => a.display_order - b.display_order);
const categories = cats
  .filter((c) => c.is_visible !== false)
  .map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description || "",
    order: c.display_order,
  }));
const catName = Object.fromEntries(categories.map((c) => [c.id, c.name]));
const catSlug = Object.fromEntries(categories.map((c) => [c.id, c.slug]));
const catOrder = Object.fromEntries(categories.map((c) => [c.id, c.order]));
const firstImageUrl = (...values) =>
  values.find((value) => typeof value === "string" && value.trim()) || null;
const IMAGE_STATUSES = new Set([
  "needs-generation",
  "generated",
  "approved",
  "review-required",
]);
const reviewNotesFrom = (value) => {
  if (Array.isArray(value))
    return value.map((note) => String(note || "").trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
};

// --- Products: clean, then sort by category order then size (small -> large) ---
const products = prods
  .filter((p) => p.is_visible !== false)
  .map((p) => {
    const images = Array.isArray(p.images) ? p.images.filter(Boolean) : [];
    const optimized = optimizedImages[p.id] || {};
    const originalImage = firstImageUrl(
      p.mainImage,
      p.main_image,
      images[0]
    );
    const mainImage = firstImageUrl(optimized.main, originalImage);
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
      originalImage,
      mainImage,
      thumbnailImage: firstImageUrl(optimized.thumbnail, mainImage),
      mainImageWidth: Number(optimized.mainWidth) || 1200,
      mainImageHeight: Number(optimized.mainHeight) || 900,
      thumbnailWidth: Number(optimized.thumbnailWidth) || 480,
      thumbnailHeight: Number(optimized.thumbnailHeight) || 360,
      referenceImage: firstImageUrl(
        p.referenceImage,
        p.reference_image,
        originalImage
      ),
      aiClosedImageUrl: firstImageUrl(
        p.aiClosedImageUrl,
        p.ai_closed_image_url,
        p.aiClosedImage,
        p.ai_closed_image,
        p.ai && p.ai.aiClosedImageUrl,
        p.ai && p.ai.aiClosedImage,
        p.ai && p.ai.closedImage
      ),
      aiOpenImageUrl: firstImageUrl(
        p.aiOpenImageUrl,
        p.ai_open_image_url,
        p.aiOpenImage,
        p.ai_open_image,
        p.ai && p.ai.aiOpenImageUrl,
        p.ai && p.ai.aiOpenImage,
        p.ai && p.ai.openImage
      ),
      requestedImageStatus: IMAGE_STATUSES.has(p.imageStatus)
        ? p.imageStatus
        : null,
      sourceReviewNotes: reviewNotesFrom(p.reviewNotes),
      description: (p.description || "").trim(),
      specs: Array.isArray(p.specifications) ? p.specifications : [],
    };
  })
  .sort((a, b) => {
    if (catOrder[a.categoryId] !== catOrder[b.categoryId])
      return catOrder[a.categoryId] - catOrder[b.categoryId];
    return (a.h || 0) - (b.h || 0) || (a.w || 0) - (b.w || 0) || (a.d || 0) - (b.d || 0);
  });

// add per-category running index (order within section)
const seen = {};
products.forEach((p) => {
  seen[p.categoryId] = (seen[p.categoryId] || 0) + 1;
  p.indexInCategory = seen[p.categoryId];
});

// --- enrich every product with structure config + per-product AI prompts ---
// One reusable engine (data/structure.js) infers the real panel configuration
// from category + Arabic name + dimensions, classifies a clean layoutType, and
// builds tailored closed/open prompts so the 3D illustrations stay structurally
// faithful instead of generic. Real generated raster URLs are optional and are
// preserved from products.raw.json; missing views remain explicitly pending.
products.forEach((p) => {
  const structure = STRUCT.analyzeProduct(p, p.categorySlug);
  const { promptClosed, promptOpen } = STRUCT.buildPrompts(p, structure);
  const reviewNotes = p.sourceReviewNotes.slice();
  const hasClosed = !!p.aiClosedImageUrl;
  const hasOpen = !!p.aiOpenImageUrl;

  if (!p.referenceImage)
    reviewNotes.push("الصورة المرجعية الحقيقية غير متوفرة؛ أضفها قبل توليد الصور.");
  if (structure.reviewRequired)
    reviewNotes.push(
      "ثقة تحليل التكوين منخفضة؛ راجع الترتيب الداخلي الحقيقي قبل توليد الصور."
    );
  if (!hasClosed) reviewNotes.push("صورة اللوحة المغلقة ما زالت بانتظار التوليد.");
  if (!hasOpen) reviewNotes.push("صورة اللوحة المفتوحة/الداخلية ما زالت بانتظار التوليد.");

  let imageStatus;
  if (
    structure.reviewRequired ||
    !p.referenceImage ||
    p.requestedImageStatus === "review-required"
  ) {
    imageStatus = "review-required";
  } else if (hasClosed && hasOpen) {
    imageStatus =
      p.requestedImageStatus === "approved" ? "approved" : "generated";
  } else {
    imageStatus = "needs-generation";
  }

  p.structure = structure;
  p.structureDescription = structure.structureDescription;
  p.layoutType = structure.layoutType;
  p.aiPromptClosed = promptClosed;
  p.aiPromptOpen = promptOpen;
  p.imageStatus = imageStatus;
  p.reviewNotes = [...new Set(reviewNotes)];

  delete p.requestedImageStatus;
  delete p.sourceReviewNotes;

  // Compatibility object for any older integrations. New code should use the
  // top-level workflow fields above.
  p.ai = {
    layoutType: p.layoutType,
    promptClosed: p.aiPromptClosed,
    promptOpen: p.aiPromptOpen,
    aiClosedImageUrl: p.aiClosedImageUrl,
    aiOpenImageUrl: p.aiOpenImageUrl,
    imageStatus: p.imageStatus,
    reviewNotes: p.reviewNotes,
    reviewRequired: structure.reviewRequired,
    confidenceScore: structure.confidenceScore,
  };
});

const data = {
  generatedAt: new Date().toISOString(),
  company,
  contact,
  stats: { categories: categories.length, products: products.length },
  categories,
  products,
};

const out = path.join(ROOT, "assets/js/data.js");
fs.writeFileSync(
  out,
  "/* AUTO-GENERATED from data/*.raw.json by data/build-data.js — do not edit by hand. */\n" +
    "window.NOUR_DATA = " +
    JSON.stringify(data, null, 2) +
    ";\n",
  "utf8"
);

// --- side outputs: machine + human readable AI prompts, and a review list ---
const promptRows = products.map((p) => ({
  productId: p.id,
  productName: p.name,
  category: p.categoryName,
  mainImage: p.mainImage,
  referenceImage: p.referenceImage,
  layoutType: p.layoutType,
  structureDescription: p.structureDescription,
  aiPromptClosed: p.aiPromptClosed,
  aiPromptOpen: p.aiPromptOpen,
  aiClosedImageUrl: p.aiClosedImageUrl,
  aiOpenImageUrl: p.aiOpenImageUrl,
  imageStatus: p.imageStatus,
  reviewNotes: p.reviewNotes,
  confidenceScore: p.structure.confidenceScore,
  reviewRequired: p.structure.reviewRequired,
}));
fs.writeFileSync(
  path.join(ROOT, "data/ai-prompts.generated.json"),
  JSON.stringify(promptRows, null, 2),
  "utf8"
);

const csvEscape = (value) => {
  const text = Array.isArray(value)
    ? value.join(" | ")
    : value == null
      ? ""
      : String(value);
  return `"${text.replace(/"/g, '""')}"`;
};
const csvColumns = [
  "productId",
  "productName",
  "category",
  "mainImage",
  "referenceImage",
  "layoutType",
  "structureDescription",
  "aiPromptClosed",
  "aiPromptOpen",
  "aiClosedImageUrl",
  "aiOpenImageUrl",
  "imageStatus",
  "reviewNotes",
  "confidenceScore",
  "reviewRequired",
];
const csv = [
  csvColumns.map(csvEscape).join(","),
  ...promptRows.map((row) =>
    csvColumns.map((column) => csvEscape(row[column])).join(",")
  ),
].join("\n");
fs.writeFileSync(
  path.join(ROOT, "data/ai-prompts.generated.csv"),
  "\ufeff" + csv,
  "utf8"
);

const md = [
  "# NOUR DATASHEET — per-product AI image prompts (auto-generated)",
  "",
  "Generated by `node data/build-data.js`. One closed + one open prompt per product,",
  "built from each product's inferred structure. Do not edit by hand — edit the source",
  "name/dimensions in `products.raw.json` or the logic in `data/structure.js`, then rebuild.",
  "",
];
categories.forEach((c) => {
  const list = products.filter((p) => p.categoryId === c.id);
  if (!list.length) return;
  md.push("## " + c.name + " (" + list.length + ")", "");
  list.forEach((p) => {
    md.push("### " + p.name);
    md.push("- **productId:** `" + p.id + "`");
    md.push("- **reference image:** " + (p.referenceImage || "MISSING"));
    md.push("- **layoutType:** `" + p.layoutType + "` · **confidence:** " +
      p.structure.confidenceScore + " · **imageStatus:** `" + p.imageStatus + "`");
    md.push("- **structure:** " + p.structureDescription);
    md.push("- **generated closed URL:** " + (p.aiClosedImageUrl || ""));
    md.push("- **generated open URL:** " + (p.aiOpenImageUrl || ""));
    if (p.reviewNotes.length)
      md.push("- **review notes:** " + p.reviewNotes.join(" | "));
    md.push("- **CLOSED prompt:**");
    md.push("  > " + p.aiPromptClosed);
    md.push("- **OPEN prompt:**");
    md.push("  > " + p.aiPromptOpen);
    md.push("");
  });
});
fs.writeFileSync(path.join(ROOT, "data/ai-prompts.generated.md"), md.join("\n"), "utf8");

const review = products.filter((p) => p.structure.reviewRequired);
console.log(
  "Wrote",
  out,
  "| categories:",
  categories.length,
  "| products:",
  products.length
);
console.log(
  "Wrote data/ai-prompts.generated.json + .md + .csv | prompts:",
  products.length * 2
);
console.log(
  "Products flagged reviewRequired (low confidence):",
  review.length
);
review.forEach((p) =>
  console.log(
    "  - [" + p.structure.confidenceScore + "] " + p.name + "  (" + p.categoryName + ")"
  )
);
