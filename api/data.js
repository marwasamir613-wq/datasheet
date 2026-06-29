const { sendJson, supabaseRest } = require("../lib/supabase-api");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { ok: false, errors: ["Method not allowed."] });
  }

  try {
    const [categories, products, settingsRows] = await Promise.all([
      supabaseRest("categories?select=*&order=display_order.asc"),
      supabaseRest("products?select=*&order=display_order.asc"),
      supabaseRest("site_settings?id=eq.1&select=data"),
    ]);
    return sendJson(res, 200, {
      ok: true,
      source: "supabase",
      loadedAt: new Date().toISOString(),
      settings: (settingsRows && settingsRows[0] && settingsRows[0].data) || {},
      categories: categories || [],
      products: products || [],
    });
  } catch (error) {
    return sendJson(res, error.status || 500, {
      ok: false,
      errors: [error.message || "Could not load Supabase data."],
    });
  }
};
