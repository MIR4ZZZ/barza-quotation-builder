import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import worker from "../worker/src/index.mjs";
import core from "../order-core.js";

class FakeD1 {
  constructor() {
    this.row = null;
    this.attempts = new Map();
  }

  prepare(sql) {
    const database = this;
    let values = [];
    return {
      bind(...next) {
        values = next;
        return this;
      },
      async first() {
        if (sql.includes("FROM pin_attempts")) return database.attempts.has(values[0]) ? { ...database.attempts.get(values[0]) } : null;
        if (!sql.startsWith("SELECT") || !database.row) return null;
        return { ...database.row };
      },
      async run() {
        if (sql.startsWith("INSERT INTO pin_attempts")) {
          database.attempts.set(values[0], { failures: values[1], window_started: values[2], blocked_until: values[3] });
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith("DELETE FROM pin_attempts")) {
          database.attempts.delete(values[0]);
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith("INSERT OR IGNORE")) {
          if (database.row) return { meta: { changes: 0 } };
          database.row = { revision: 1, payload: values[0], updated_at: values[1] };
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith("UPDATE")) {
          if (!database.row || database.row.revision !== values[2]) return { meta: { changes: 0 } };
          database.row = { revision: database.row.revision + 1, payload: values[0], updated_at: values[1] };
          return { meta: { changes: 1 } };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      },
    };
  }
}

const pin = "1234";
const env = {
  DB: new FakeD1(),
  PIN_HASH: createHash("sha256").update(pin).digest("hex"),
  ALLOWED_ORIGINS: "https://mir4zzz.github.io,http://localhost:8000",
};

function request(path, method, body, auth = "", origin = "https://mir4zzz.github.io", ip = "203.0.113.10") {
  return new Request(`https://orders.example${path}`, {
    method,
    headers: {
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      "Content-Type": "application/json",
      Origin: origin,
      "CF-Connecting-IP": ip,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function login(ip = "203.0.113.10") {
  const response = await worker.fetch(request("/api/session", "POST", { pin }, "", "https://mir4zzz.github.io", ip), env);
  assert.equal(response.status, 200);
  return (await response.json()).token;
}

test("issues a short-lived session for the correct four-digit PIN", async () => {
  const token = await login();
  assert.equal(token.split(".").length, 2);
  const response = await worker.fetch(request("/api/workspace", "GET", null, "invalid-session-token"), env);
  assert.equal(response.status, 401);
});

test("rejects a browser origin outside the configured list", async () => {
  const response = await worker.fetch(request("/api/session", "POST", { pin }, "", "https://attacker.example"), env);
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
});

test("blocks a client after five incorrect PIN attempts", async () => {
  const ip = "203.0.113.11";
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await worker.fetch(request("/api/session", "POST", { pin: "9999" }, "", "https://mir4zzz.github.io", ip), env);
    assert.equal(response.status, 401);
  }
  const blocked = await worker.fetch(request("/api/session", "POST", { pin: "9999" }, "", "https://mir4zzz.github.io", ip), env);
  assert.equal(blocked.status, 429);
});

test("writes the first workspace and rejects a stale concurrent revision", async () => {
  const token = await login("203.0.113.12");
  const workspace = core.createWorkspace();
  delete workspace.revision;
  const first = await worker.fetch(request("/api/workspace", "PUT", { revision: 0, workspace }, token), env);
  assert.equal(first.status, 200);
  assert.equal((await first.json()).revision, 1);

  const stale = await worker.fetch(request("/api/workspace", "PUT", { revision: 0, workspace }, token), env);
  assert.equal(stale.status, 409);
  const conflict = await stale.json();
  assert.equal(conflict.revision, 1);
  assert.equal(conflict.workspace.catalog.length, 13);
});

test("updates only when the expected revision matches", async () => {
  const token = await login("203.0.113.13");
  const current = await worker.fetch(request("/api/workspace", "GET", null, token), env);
  const body = await current.json();
  body.workspace.draft.greeting = "Good afternoon";
  const updated = await worker.fetch(request("/api/workspace", "PUT", body, token), env);
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).revision, 2);
});
