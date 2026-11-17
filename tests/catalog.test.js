const test = require("node:test");
const assert = require("node:assert/strict");
const catalog = require("../catalog.js");

function price(productId, size, style, thickness) {
  const product = catalog.find((entry) => entry.id === productId);
  const option = product?.options.find((entry) => entry.size === size && entry.style === style && entry.thickness === thickness);
  return option?.mrp;
}

test("contains every model and MRP cell from the supplied catalogue", () => {
  assert.deepEqual(catalog.map((product) => product.name), [
    "Premium Bond",
    "Luxury Bond",
    "Deluxe Memory",
    "Natural Latex",
    "Bonnel Comfort",
    "Pocket Comfort",
  ]);
  assert.deepEqual(catalog.map((product) => product.options.length), [55, 77, 36, 36, 77, 77]);
  assert.equal(catalog.flatMap((product) => product.options).length, 358);
  assert.ok(catalog.every((product) => product.options.every((option) => option.mrp > 0)));
});

test("keeps representative catalogue MRPs exact", () => {
  assert.equal(price("premium-bond", "72×36", "Standard", 4), 9275);
  assert.equal(price("premium-bond", "78×72", "Standard", 8), 32630);
  assert.equal(price("luxury-bond", "72×72", "Pillow Top", 10), 27720);
  assert.equal(price("deluxe-memory", "72×48", "Euro Top", 8), 32492);
  assert.equal(price("natural-latex", "75×60", "Euro Top", 10), 54013);
  assert.equal(price("bonnel-comfort", "72×60", "Euro Top", 8), 19246);
  assert.equal(price("pocket-comfort", "78×72", "Pillow Top", 10), 38043);
});
