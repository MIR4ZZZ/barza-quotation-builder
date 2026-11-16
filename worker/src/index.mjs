const MAX_BODY_BYTES = 1_000_000;

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
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sameText(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

async function authorised(request, env) {
  if (!env.SHARED_CODE_HASH) throw new Error("SHARED_CODE_HASH is not configured");
  const header = request.headers.get("Authorization") || "";
  const code = header.startsWith("Bearer ") ? header.slice(7) : "";
  return code.length >= 20 && sameText(await sha256(code), String(env.SHARED_CODE_HASH).toLowerCase());
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
          "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
          "Access-Control-Max-Age": "86400",
          Vary: "Origin",
        },
      });
    }

    const url = new URL(request.url);
    if (url.pathname !== "/api/workspace") return json({ error: "Not found" }, 404, origin || "");

    try {
      if (!(await authorised(request, env))) return json({ error: "Shared code was not accepted" }, 401, origin || "");
      if (request.method === "GET") return json(await latest(env), 200, origin || "");
      if (request.method === "PUT") return save(request, env, origin || "");
      return json({ error: "Method not allowed" }, 405, origin || "");
    } catch {
      return json({ error: "Shared workspace is temporarily unavailable" }, 500, origin || "");
    }
  },
};

export { allowedOrigin, authorised, validWorkspace };
