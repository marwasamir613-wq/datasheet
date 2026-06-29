# NOUR DATASHEET - Production CMS Setup

This project is now wired for a real live CMS:

- Public site reads live data from Supabase through `/api/data`.
- Dashboard saves through `/api/save`.
- Dashboard image uploads go through `/api/upload-image` into Supabase Storage.
- The browser receives only `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
- `SUPABASE_SERVICE_ROLE_KEY` is used server-side only.

## 1. Supabase

1. Create/open the Supabase project.
2. Run [`supabase/schema.sql`](supabase/schema.sql) in SQL Editor.
3. Create your admin user in **Authentication -> Users**.
4. Add the admin email to the allowlist:

```sql
insert into public.admin_users (email)
values ('YOUR-ADMIN-EMAIL@example.com')
on conflict (email) do nothing;
```

## 2. Import Current Local Data + Images

From the project root:

```bash
SUPABASE_URL="https://YOUR-PROJECT.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="YOUR-service_role-key" \
ADMIN_EMAILS="YOUR-ADMIN-EMAIL@example.com" \
node tools/import-to-supabase.js
```

The import script:

- reads `data/products.raw.json`, `data/categories.raw.json`, and `data/site-settings.json`
- uploads existing local product images to the `product-images` Supabase bucket
- preserves current product/category IDs and ordering
- upserts the dashboard admin email into `admin_users`

## 3. Vercel Environment Variables

Add these to the existing Vercel project:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ADMIN_EMAILS
SUPABASE_STORAGE_BUCKET
```

`SUPABASE_STORAGE_BUCKET` can stay `product-images`.

Do not put `SUPABASE_SERVICE_ROLE_KEY` in frontend files.

## 4. Production Links

- Homepage: `https://datasheet-4vph-blue.vercel.app/`
- Dashboard: `https://datasheet-4vph-blue.vercel.app/admin`

The dashboard uses Supabase Auth email/password. Only emails in
`ADMIN_EMAILS` or `public.admin_users` can save or upload.

## 5. Deploy

Deploy the existing Vercel project after the env vars are set. The site itself
is static, but content is live in Supabase, so future dashboard edits do not
need file edits or redeploys.
