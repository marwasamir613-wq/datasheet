/* Transforms the raw Supabase catalog export into assets/js/data.js
   Run: node data/build-data.js   (from project root) */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const cats = require(path.join(ROOT, "data/categories.raw.json"));
const prods = require(path.join(ROOT, "data/products.raw.json"));

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

// --- Products: clean, then sort by category order then size (small -> large) ---
const products = prods
  .filter((p) => p.is_visible !== false)
  .map((p) => ({
    id: p.id,
    name: (p.name || "").trim(),
    categoryId: p.category_id,
    categoryName: catName[p.category_id] || "",
    categorySlug: catSlug[p.category_id] || "",
    h: Number(p.dimensions_h) || null,
    w: Number(p.dimensions_w) || null,
    d: Number(p.dimensions_d) || null,
    images: Array.isArray(p.images) ? p.images.filter(Boolean) : [],
    description: (p.description || "").trim(),
    specs: Array.isArray(p.specifications) ? p.specifications : [],
  }))
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
console.log(
  "Wrote",
  out,
  "| categories:",
  categories.length,
  "| products:",
  products.length
);
