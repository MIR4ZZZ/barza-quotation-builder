const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../order-core.js");

function draftFromQuantities(groups) {
  const draft = Core.createDraft();
  draft.models = groups.map((quantities, modelIndex) => ({
    id: `model-${modelIndex}`,
    catalogId: "",
    name: `${modelIndex + 4}\u201d Test mattress`,
    description: "Test construction",
    referencePrice: "",
    sizes: quantities.map((qty, sizeIndex) => Core.createSize({
      length: 75,
      width: 36 + sizeIndex * 6,
      thickness: modelIndex + 4,
      qty,
    })),
  }));
  return draft;
}

test("preloads all 13 supplied mattress models", () => {
  assert.equal(Core.DEFAULT_CATALOG.length, 13);
  assert.deepEqual(
    [...new Set(Core.DEFAULT_CATALOG.map((model) => model.name.split(" ").find((part) => /Sleepcare|Medisleep|Goodfeel/i.test(part))))],
    ["Sleepcare", "Medisleep", "Goodfeel"],
  );
  assert.ok(Core.DEFAULT_CATALOG.every((model) => model.referencePrice === ""), "public presets must not expose historical prices");
});

test("calculates the supplied 14, 90, 93 and 200 piece orders", () => {
  const fixtures = [
    [14, [[5], [3, 2, 2], [2]]],
    [90, [[4], [12], [8, 4], [15, 10], [15, 10], [8, 4]]],
    [93, [[8, 5], [25, 6, 5, 3], [20, 2, 5, 6], [4, 4]]],
    [200, [[2, 4], [5, 1], [15, 2, 6], [6, 6], [3], [6], [25, 10, 10], [25, 4, 2, 10], [6, 10, 20, 3, 3], [4], [10, 2]]],
  ];
  fixtures.forEach(([expected, groups]) => assert.equal(Core.totalPieces(draftFromQuantities(groups)), expected));
});

test("accepts unusual custom sizes and warns without changing a mismatched thickness", () => {
  const size = Core.createSize({ length: 75, width: 38, thickness: 5, qty: 6 });
  assert.equal(Core.formatSize(size), '75/38/5\u201d - 6');
  assert.equal(Core.thicknessWarning("Medisleep 8\u201d (Eurotop)", size.thickness), "Model name says 8\u201d, but this size uses 5\u201d.");
  assert.equal(size.thickness, 5);
});

test("shows only an explicitly supplied model reference price", () => {
  const draft = draftFromQuantities([[2], [3]]);
  draft.models[0].referencePrice = "1234 + GST";
  const message = Core.formatMessage(draft);
  assert.match(message, /Reference price: 1234 \+ GST/);
  assert.equal((message.match(/Reference price:/g) || []).length, 1);
  assert.match(message, /\(5 Pcs\)/);
  assert.match(message, /Thanks & regards\nBarza Trading$/);
});

test("saved order snapshots remain independent of later catalog edits", () => {
  const workspace = Core.createWorkspace();
  const draftModel = Core.modelFromCatalog(workspace.catalog[0]);
  const saved = Core.clone({ draft: { ...Core.createDraft(), models: [draftModel] } });
  workspace.catalog[0].description = "Changed catalog description";
  assert.notEqual(saved.draft.models[0].description, workspace.catalog[0].description);
});
