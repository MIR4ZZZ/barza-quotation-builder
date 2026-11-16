# Barza Business Tools

The site contains two tools for BARZA TRADING CO.:

- **Quotation** — edit item rows and choose **Print / Save PDF** for an A4 quotation. Totals, savings, discount, and amount in words update automatically.
- **Order request** — build a mattress request from editable presets, custom sizes, colours and notes, then copy the generated message for WhatsApp. The latest draft and saved orders are kept in the browser even when the shared service is offline.

Open `index.html` locally or use the [published site](https://mir4zzz.github.io/barza-quotation-builder/). The repository and Pages site are public. Private prices and customer orders are stored in the protected shared database.

## Shared order workspace setup

The live site asks for a four-digit team PIN, then automatically synchronizes the catalog, current draft and saved orders. The PIN is checked by the Cloudflare Worker and is never stored in the repository.

1. The production config is already bound to the Barza D1 database. For a fresh Cloudflare account, create another database with `npx wrangler d1 create barza-orders` and replace `database_id` in `worker/wrangler.jsonc` with the returned ID.
2. Apply the schema with `npx wrangler d1 migrations apply barza-orders --remote --config worker/wrangler.jsonc`.
3. Set or change the PIN with `npm run set-pin -- 1234`, replacing `1234` with the new four digits. The command hashes and uploads it without printing the hash.
4. Deploy with `npx wrangler deploy --config worker/wrangler.jsonc`. The production Worker URL is already set in `config.js`.

Five incorrect PIN attempts from the same connection are blocked for 15 minutes. A successful unlock receives a temporary session token; data edits then sync automatically.

## Checks

Run `npm test` for order totals, custom sizes, message formatting, authorization, origin controls and revision conflicts. For local browser testing, run `python -m http.server 8000` and open `http://127.0.0.1:8000`.
