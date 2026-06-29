const { readJsonBody, requireAdmin, saveCmsState, sendJson } = require("../lib/supabase-api");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { ok: false, errors: ["Method not allowed."] });
  }

  try {
    await requireAdmin(req);
    const state = await readJsonBody(req);
    const result = await saveCmsState(state);
    return sendJson(res, 200, {
      ok: true,
      source: "supabase",
      ...result,
    });
  } catch (error) {
    return sendJson(res, error.status || 500, {
      ok: false,
      errors: [error.message || "Could not save Supabase data."],
    });
  }
};
