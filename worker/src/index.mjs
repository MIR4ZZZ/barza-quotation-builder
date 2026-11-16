const MAX_BODY_BYTES = 1_000_000;
const PIN_WINDOW_MS = 15 * 60 * 1000;
const PIN_MAX_FAILURES = 5;
const SESSION_SECONDS = 12 * 60 * 60;
const encoder = new TextEncoder();

function json(body, status = 200, origin = "") {
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin") || "";
  if (!origin) return "";
  const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean);
  return allowed.includes(origin) ? origin : null;
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sameText(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function base64Url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64Url(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

async function issueSession(env) {
  const nonce = new Uint8Array(12);
  crypto.getRandomValues(nonce);
  const payload = base64Url(encoder.encode(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS, nonce: base64Url(nonce) })));
  return `${payload}.${await sign(payload, env.PIN_HASH)}`;
}

async function verifySession(request, env) {
  if (!env.PIN_HASH) throw new Error("PIN_HASH is not configured");
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra || !sameText(await sign(payload, env.PIN_HASH), signature)) return false;
  try {
    const claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload)));
    return Number.isInteger(claims.exp) && claims.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

async function pinClientKey(request, env) {
  return sha256(`${env.PIN_HASH}:${request.headers.get("CF-Connecting-IP") || "unknown"}`);
}

async function recordPinFailure(env, clientKey, now) {
  const current = await env.DB.prepare(
    "SELECT failures, window_started, blocked_until FROM pin_attempts WHERE client_key = ? LIMIT 1",
  ).bind(clientKey).first();
  const inWindow = current && now - Number(current.window_started) < PIN_WINDOW_MS;
  const failures = inWindow ? Number(current.failures) + 1 : 1;
  const windowStarted = inWindow ? Number(current.window_started) : now;
  const blockedUntil = failures >= PIN_MAX_FAILURES ? now + PIN_WINDOW_MS : 0;
  await env.DB.prepare(
    "INSERT INTO pin_attempts (client_key, failures, window_started, blocked_until) VALUES (?, ?, ?, ?) ON CONFLICT(client_key) DO UPDATE SET failures = excluded.failures, window_started = excluded.window_started, blocked_until = excluded.blocked_until",
  ).bind(clientKey, failures, windowStarted, blockedUntil).run();
  return blockedUntil > now;
}

async function createSession(request, env, origin) {
  if (!env.PIN_HASH) throw new Error("PIN_HASH is not configured");
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Enter a four-digit PIN" }, 400, origin);
  }
  const pin = String(body?.pin || "");
  const now = Date.now();
  const clientKey = await pinClientKey(request, env);
  const attempt = await env.DB.prepare(
    "SELECT failures, window_started, blocked_until FROM pin_attempts WHERE client_key = ? LIMIT 1",
  ).bind(clientKey).first();
  if (attempt && Number(attempt.blocked_until) > now) return json({ error: "Too many attempts" }, 429, origin);

  const valid = /^\d{4}$/.test(pin) && sameText(await sha256(pin), String(env.PIN_HASH).toLowerCase());
  if (!valid) {
    const blocked = await recordPinFailure(env, clientKey, now);
    return json({ error: blocked ? "Too many attempts" : "Incorrect PIN" }, blocked ? 429 : 401, origin);
  }

  await env.DB.prepare("DELETE FROM pin_attempts WHERE client_key = ?").bind(clientKey).run();
  return json({ token: await issueSession(env), expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000).toISOString() }, 200, origin);
}

function validText(value, max) {
  return typeof value === "string" && value.length <= max;
}

function validSize(size) {
  return size && validText(String(size.id || ""), 100)
    && [size.length, size.width, size.thickness].every((value) => value === "" || (Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) <= 500))
    && (size.qty === "" || (Number.isInteger(Number(size.qty)) && Number(size.qty) > 0 && Number(size.qty) <= 100000))
    && validText(String(size.colour || ""), 200) && validText(String(size.note || ""), 500);
}

function validDraft(draft) {
  return draft && validText(String(draft.greeting || ""), 200) && validText(String(draft.intro || ""), 500)
    && validText(String(draft.name || ""), 200) && Array.isArray(draft.models) && draft.models.length <= 100
    && draft.models.every((model) => model && validText(String(model.id || ""), 100)
      && validText(String(model.catalogId || ""), 100) && validText(String(model.name || ""), 300)
      && validText(String(model.description || ""), 3000) && validText(String(model.referencePrice || ""), 200)
      && Array.isArray(model.sizes) && model.sizes.length <= 200 && model.sizes.every(validSize));
}

function validWorkspace(workspace) {
  return workspace && Array.isArray(workspace.catalog) && workspace.catalog.length <= 200
    && workspace.catalog.every((model) => model && validText(String(model.id || ""), 100)
      && validText(String(model.name || ""), 300) && validText(String(model.description || ""), 3000)
      && validText(String(model.referencePrice || ""), 200))
    && validDraft(workspace.draft) && Array.isArray(workspace.orders) && workspace.orders.length <= 500
    && workspace.orders.every((order) => order && validText(String(order.id || ""), 100)
      && validText(String(order.name || ""), 200) && validText(String(order.savedAt || ""), 100) && validDraft(order.draft));
}

async function latest(env) {
  const row = await env.DB.prepare("SELECT revision, payload FROM workspace WHERE id = 1 LIMIT 1").first();
  return row ? { revision: Number(row.revision), workspace: JSON.parse(row.payload) } : { revision: 0, workspace: null };
}

async function save(request, env, origin) {
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > MAX_BODY_BYTES) return json({ error: "Workspace is too large" }, 413, origin);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Request must contain valid JSON" }, 400, origin);
  }
  const revision = Number(body?.revision);
  if (!Number.isInteger(revision) || revision < 0 || !validWorkspace(body?.workspace)) {
    return json({ error: "Workspace data is invalid" }, 400, origin);
  }
  const payload = JSON.stringify(body.workspace);
  if (new TextEncoder().encode(payload).length > MAX_BODY_BYTES) return json({ error: "Workspace is too large" }, 413, origin);
  const now = new Date().toISOString();

  let result;
  if (revision === 0) {
    result = await env.DB.prepare(
      "INSERT OR IGNORE INTO workspace (id, revision, payload, updated_at) VALUES (1, 1, ?, ?)",
    ).bind(payload, now).run();
  } else {
    result = await env.DB.prepare(
      "UPDATE workspace SET revision = revision + 1, payload = ?, updated_at = ? WHERE id = 1 AND revision = ?",
    ).bind(payload, now, revision).run();
  }

  if (Number(result?.meta?.changes || 0) !== 1) return json(await latest(env), 409, origin);
  return json({ revision: revision + 1 }, 200, origin);
}

export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request, env);
    if (origin === null) return json({ error: "Origin is not allowed" }, 403);
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin || "*",
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
          "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
          "Access-Control-Max-Age": "86400",
          Vary: "Origin",
        },
      });
    }

    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/session" && request.method === "POST") return createSession(request, env, origin || "");
      if (url.pathname !== "/api/workspace") return json({ error: "Not found" }, 404, origin || "");
      if (!(await verifySession(request, env))) return json({ error: "Session is invalid or expired" }, 401, origin || "");
      if (request.method === "GET") return json(await latest(env), 200, origin || "");
      if (request.method === "PUT") return save(request, env, origin || "");
      return json({ error: "Method not allowed" }, 405, origin || "");
    } catch {
      return json({ error: "Shared workspace is temporarily unavailable" }, 500, origin || "");
    }
  },
};

export { allowedOrigin, createSession, validWorkspace, verifySession };
