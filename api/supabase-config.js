const { sendJs, supabaseEnv } = require("../lib/supabase-api");

module.exports = function handler(req, res) {
  const cfg = supabaseEnv();
  const publicConfig = {
    url: cfg.url || "",
    anonKey: cfg.anonKey || "",
    bucket: cfg.bucket || "product-images",
    serverApi: Boolean(cfg.url && cfg.anonKey),
  };
  sendJs(
    res,
    200,
    `(function (cfg) {
  var target = window.NOUR_SUPABASE || {};
  Object.assign(target, cfg);
  if (!Object.getOwnPropertyDescriptor(target, "enabled")) {
    Object.defineProperty(target, "enabled", {
      get: function () { return Boolean(this.url && this.anonKey); }
    });
  }
  window.NOUR_SUPABASE = target;
})(${JSON.stringify(publicConfig)});`
  );
};
