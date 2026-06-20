# NOUR AI image workflow

The real product photo is the reference. SVG drawings are only technical
fallback utilities and are not approved product images.

## Generate images

1. Run `node data/build-data.js`.
2. Open `data/ai-prompts.generated.json`, `.md`, or `.csv`.
3. Use `referenceImage`, `aiPromptClosed`, and `aiPromptOpen` in the external
   image tool.
4. Upload the final PNG/JPG/WebP files to a public URL.

## Link final images

Edit the matching product object in `data/products.raw.json` and add:

```json
"aiClosedImageUrl": "https://example.com/product-closed.webp",
"aiOpenImageUrl": "https://example.com/product-open.webp",
"imageStatus": "approved",
"reviewNotes": []
```

Use `imageStatus: "approved"` only after both images have been reviewed.
Without approval, omit `imageStatus` or use `"generated"`.

Then run:

```bash
node data/build-data.js
```

The website will show generated raster images only when their URLs exist.
Missing or broken generated-image URLs show a clear waiting/error placeholder.

