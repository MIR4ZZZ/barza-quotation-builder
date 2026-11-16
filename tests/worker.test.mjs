import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import worker from "../worker/src/index.mjs";
import core from "../order-core.js";

class FakeD1 {
  constructor() {
    this.row = null;
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
        if (!sql.startsWith("SELECT") || !database.row) return null;
        return { ...database.row };
      },
      async run() {
        if (sql.startsWith("INSERT")) {
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

const code = "barza-test-shared-code-123456789";
const env = {
  DB: new FakeD1(),
  SHARED_CODE_HASH: createHash("sha256").update(code).digest("hex"),
  ALLOWED_ORIGINS: "https://mir4zzz.github.io,http://localhost:8000",
};

function request(method, body, auth = code, origin = "https://mir4zzz.github.io") {
  return new Request("https://orders.example/api/workspace", {
    method,
    headers: {
      Authorization: `Bearer ${auth}`,
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test("rejects an invalid shared code", async () => {
  const response = await worker.fetch(request("GET", null, "incorrect-code-123456789"), env);
  assert.equal(response.status, 401);
});

test("rejects a browser origin outside the configured list", async () => {
  const response = await worker.fetch(request("GET", null, code, "https://attacker.example"), env);
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
});

test("writes the first workspace and rejects a stale concurrent revision", async () => {
  const workspace = core.createWorkspace();
  delete workspace.revision;
  const first = await worker.fetch(request("PUT", { revision: 0, workspace }), env);
  assert.equal(first.status, 200);
  assert.equal((await first.json()).revision, 1);

  const stale = await worker.fetch(request("PUT", { revision: 0, workspace }), env);
  assert.equal(stale.status, 409);
  const conflict = await stale.json();
  assert.equal(conflict.revision, 1);
  assert.equal(conflict.workspace.catalog.length, 13);
});

test("updates only when the expected revision matches", async () => {
  const current = await worker.fetch(request("GET"), env);
  const body = await current.json();
  body.workspace.draft.greeting = "Good afternoon";
  const updated = await worker.fetch(request("PUT", body), env);
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).revision, 2);
});
