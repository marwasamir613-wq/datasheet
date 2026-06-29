const {
  objectName,
  readBody,
  requireAdmin,
  sendJson,
  uploadToStorage,
} = require("../lib/supabase-api");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { ok: false, errors: ["Method not allowed."] });
  }

  try {
    await requireAdmin(req);
    const buffer = await readBody(req, 12 * 1024 * 1024);
    if (!buffer.length) throw Object.assign(new Error("Image file is empty."), { status: 400 });

    const decodeHeader = (value, fallback) => {
      try {
        return decodeURIComponent(String(value || fallback || ""));
      } catch {
        return String(value || fallback || "");
      }
    };
    const filename = decodeHeader(req.headers["x-file-name"], "image.webp");
    const nameHint = decodeHeader(req.headers["x-name-hint"], filename);
    const contentType = req.headers["content-type"] || "application/octet-stream";
    const storageName =
      /^image\/webp\b/i.test(contentType) && !/\.webp$/i.test(filename)
        ? `${filename.replace(/\.[^.]*$/, "") || "image"}.webp`
        : filename;
    const path = objectName(nameHint, storageName);
    const src = await uploadToStorage(buffer, path, contentType);

    return sendJson(res, 200, {
      ok: true,
      success: true,
      source: "supabase-storage",
      url: src,
      image: { src },
    });
  } catch (error) {
    return sendJson(res, error.status || 500, {
      ok: false,
      errors: [error.message || "Could not upload image."],
    });
  }
};

module.exports.config = {
  api: {
    bodyParser: false,
  },
};
