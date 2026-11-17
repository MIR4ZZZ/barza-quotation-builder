(function (root, factory) {
  const core = factory();
  if (typeof module === "object" && module.exports) module.exports = core;
  else root.QuotationCore = core;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function itemDisplayName(item) {
    if (item.catalogId && item.optionId) return String(item.name || "").trim() || "Untitled item";
    if (item.catalogId) {
      return [item.name, item.customSize]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .join(" · ") || "Untitled item";
    }
    return [item.customName || item.name, item.customSize]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join(" · ") || "Untitled item";
  }

  return { itemDisplayName };
});
