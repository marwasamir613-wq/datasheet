/* ===========================================================
   NOUR DATASHEET — Supabase connection config (PUBLIC)
   The anon (public) key is safe to expose in the browser; row-level
   security on the database controls who can write. Fill in url + anonKey,
   then set enabled: true. Leave enabled:false to run from the bundled
   static snapshot (assets/js/data.js) with no backend.
   =========================================================== */
window.NOUR_SUPABASE = {
  url: "",        // e.g. https://abcdefgh.supabase.co
  anonKey: "",    // the "anon public" key from Project Settings → API
  bucket: "product-images",
  get enabled() {
    return Boolean(this.url && this.anonKey);
  },
};
