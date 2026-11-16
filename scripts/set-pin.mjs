import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const pin = process.argv[2] || "";
if (!/^\d{4}$/.test(pin)) {
  console.error("Usage: npm run set-pin -- 1234");
  process.exit(1);
}

const hash = createHash("sha256").update(pin).digest("hex");
const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(command, ["wrangler", "secret", "put", "PIN_HASH", "--config", "worker/wrangler.jsonc"], {
  input: `${hash}\n`,
  shell: process.platform === "win32",
  stdio: ["pipe", "inherit", "inherit"],
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
