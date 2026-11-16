# Barza Business Tools

The site contains two tools for BARZA TRADING CO.:

- **Quotation** — edit item rows and choose **Print / Save PDF** for an A4 quotation. Totals, savings, discount, and amount in words update automatically.
- **Order request** — build a mattress request from editable presets, custom sizes, colours and notes, then copy the generated message for WhatsApp. The latest draft and saved orders are kept in the browser even when the shared service is offline.

Open `index.html` locally or use the [published site](https://mir4zzz.github.io/barza-quotation-builder/). The repository and Pages site are public. Do not put the shared code, private prices, or customer orders in source files.

## Shared order workspace setup

The static site works without a backend. To make the catalog, current draft and saved orders available on multiple devices:

1. Create a Cloudflare D1 database with `npx wrangler d1 create barza-orders`. Replace the zero UUID in `worker/wrangler.jsonc` with the returned ID.
2. Apply the schema with `npx wrangler d1 migrations apply barza-orders --remote --config worker/wrangler.jsonc`.
3. Generate a long shared code and its hash without saving either in the repository:

   ```powershell
   node -e "const c=require('node:crypto');const code=c.randomBytes(24).toString('base64url');console.log('Shared code:',code);console.log('SHA-256:',c.createHash('sha256').update(code).digest('hex'))"
   ```

4. Run `npx wrangler secret put SHARED_CODE_HASH --config worker/wrangler.jsonc` and paste only the printed SHA-256 value. Keep the printed shared code for the team.
5. Deploy with `npx wrangler deploy --config worker/wrangler.jsonc`, then put the returned Worker URL in `config.js` as `window.BARZA_ORDER_API_URL`.

The shared code acts as the team password. Anyone with it can read and edit the order workspace. To rotate it, generate another code and hash, update the Worker secret, and enter the new code on each device. The **Forget code** action removes it from one browser without deleting local drafts.

## Checks

Run `npm test` for order totals, custom sizes, message formatting, authorization, origin controls and revision conflicts. For local browser testing, run `python -m http.server 8000` and open `http://127.0.0.1:8000`.
