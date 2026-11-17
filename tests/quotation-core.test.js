const test = require("node:test");
const assert = require("node:assert/strict");
const { itemDisplayName } = require("../quotation-core.js");

test("formats catalog and custom quotation item names", () => {
  assert.equal(itemDisplayName({ catalogId: "premium-bond", name: "Premium Bond · Standard · 72×36×4 inch" }), "Premium Bond · Standard · 72×36×4 inch");
  assert.equal(itemDisplayName({ customName: "Custom Hotel Mattress", customSize: "80×42×7 inch" }), "Custom Hotel Mattress · 80×42×7 inch");
  assert.equal(itemDisplayName({}), "Untitled item");
});
