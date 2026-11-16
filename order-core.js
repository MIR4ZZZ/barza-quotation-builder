(function exposeOrderCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.BarzaOrderCore = api;
})(typeof globalThis === "object" ? globalThis : this, function createOrderCore() {
  "use strict";

  const DEFAULT_CATALOG = [
    {
      id: "sleepcare-6-pillowtop",
      name: "6\u201d Sleepcare (Pillowtop)",
      description: "120mm 90d rebonded + 1\u201d 32d Super Soft + 220gsm netted 16mm 13 DSQ + side quilt",
      referencePrice: "",
    },
    {
      id: "sleepcare-8-eurotop",
      name: "8\u201d Sleepcare (Eurotop)",
      description: "150mm 90d rebonded + 40mm 32d Super Soft + 220gsm netted 16mm 13 DSQ + side quilt",
      referencePrice: "",
    },
    {
      id: "sleepcare-6-eurotop",
      name: "6\u201d Sleepcare (Eurotop)",
      description: "120mm 90d rebonded + 1\u201d 32d Super Soft + 220gsm netted 16mm 13 DSQ + side quilt",
      referencePrice: "",
    },
    {
      id: "sleepcare-5-eurotop",
      name: "5\u201d Sleepcare (Eurotop)",
      description: "95mm 90d rebonded + 1\u201d 32d Super Soft + 220gsm netted 16mm 13 DSQ + side quilt",
      referencePrice: "",
    },
    {
      id: "sleepcare-4-standard",
      name: "4\u201d Sleepcare (Standard)",
      description: "95mm 90d rebonded + 220gsm netted 16mm 13 DSQ + side quilt",
      referencePrice: "",
    },
    {
      id: "sleepcare-5-standard",
      name: "5\u201d Sleepcare (Standard)",
      description: "120mm 90d rebonded + 220gsm netted 16mm 13 DSQ + side quilt",
      referencePrice: "",
    },
    {
      id: "medisleep-4",
      name: "Medisleep 4\u201d",
      description: "2\u201d RP EP + 1\u201d 90d bonded + 20mm 28d premium foam + 150gsm knitted 16mm 13d top quilt + 10mm LD backside quilt + side quilt",
      referencePrice: "",
    },
    {
      id: "medisleep-5-eurotop",
      name: "Medisleep 5\u201d (Eurotop)",
      description: "1\u201d bonded + 2\u201d RP EP + 1\u201d 90d bonded + 20mm 28d premium foam + 150gsm knitted 16mm 13d top quilt + 10mm LD backside quilt + side quilt",
      referencePrice: "",
    },
    {
      id: "medisleep-6-eurotop",
      name: "Medisleep 6\u201d (Eurotop)",
      description: "1\u201d bonded + 2\u201d RP EP + 1\u201d 90d bonded + 20mm 28d premium + 20mm 23d Super Soft foam + 150gsm knitted 16mm 13d top quilt + 10mm LD backside quilt + side quilt",
      referencePrice: "",
    },
    {
      id: "medisleep-8-eurotop",
      name: "Medisleep 8\u201d (Eurotop)",
      description: "1\u201d 90 bonded + 3\u201d RP EP + 2\u201d 90d bonded + 20mm 28d premium + 20mm 23d Super Soft foam + 150gsm knitted 16mm 13d top quilt + 10mm LD backside quilt + side quilt",
      referencePrice: "",
    },
    {
      id: "goodfeel-4",
      name: "Goodfeel 4\u201d mattress",
      description: "1\u201d EP + 2\u201d coir + 1\u201d EP + 16mm LD China quilt",
      referencePrice: "",
    },
    {
      id: "goodfeel-5",
      name: "Goodfeel 5\u201d mattress",
      description: "1\u201d EP + 2\u201d coir + 1\u201d EP + 1\u201d 23d Premium foam + LD 16mm China quilt",
      referencePrice: "",
    },
    {
      id: "goodfeel-6",
      name: "Goodfeel 6\u201d mattress",
      description: "1\u201d EP + 2\u201d coir + 2\u201d EP + 1\u201d 23d Premium foam + LD 16mm China quilt",
      referencePrice: "",
    },
  ];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function makeId(prefix = "item") {
    const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}-${random}`;
  }

  function createDraft() {
    return {
      greeting: "Good morning",
      intro: "Please provide for me below mattresses urgently",
      name: "",
      models: [],
      updatedAt: new Date().toISOString(),
    };
  }

  function createWorkspace() {
    return {
      revision: 0,
      catalog: clone(DEFAULT_CATALOG),
      draft: createDraft(),
      orders: [],
    };
  }

  function modelFromCatalog(model) {
    return {
      id: makeId("order-model"),
      catalogId: model?.id || "",
      name: model?.name || "New mattress model",
      description: model?.description || "",
      referencePrice: model?.referencePrice || "",
      sizes: [],
    };
  }

  function createSize(values = {}) {
    return {
      id: makeId("size"),
      length: values.length ?? "",
      width: values.width ?? "",
      thickness: values.thickness ?? "",
      qty: values.qty ?? 1,
      colour: values.colour ?? "",
      note: values.note ?? "",
    };
  }

  function quantity(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
  }

  function totalPieces(draft) {
    return (draft?.models || []).reduce(
      (total, model) => total + (model.sizes || []).reduce((subtotal, size) => subtotal + quantity(size.qty), 0),
      0,
    );
  }

  function formatDimension(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return "?";
    return Number.isInteger(number) ? String(number) : String(Number(number.toFixed(2)));
  }

  function expectedThickness(modelName) {
    const match = String(modelName || "").match(/(?:^|\s)(\d+(?:\.\d+)?)\s*[\u201d"]/i);
    return match ? Number(match[1]) : null;
  }

  function thicknessWarning(modelName, thickness) {
    const expected = expectedThickness(modelName);
    const actual = Number(thickness);
    if (expected === null || !Number.isFinite(actual) || actual <= 0 || expected === actual) return "";
    return `Model name says ${formatDimension(expected)}\u201d, but this size uses ${formatDimension(actual)}\u201d.`;
  }

  function formatSize(size) {
    const dimensions = [size.length, size.width, size.thickness].map(formatDimension).join("/");
    const details = [String(size.colour || "").trim(), String(size.note || "").trim()].filter(Boolean);
    return `${dimensions}\u201d - ${quantity(size.qty)}${details.length ? ` (${details.join("; ")})` : ""}`;
  }

  function formatMessage(draft) {
    const greeting = String(draft?.greeting || "").trim();
    const intro = String(draft?.intro || "").trim();
    const blocks = [];
    if (greeting) blocks.push(greeting);
    blocks.push(`${intro || "Please provide for me below mattresses urgently"}\n(${totalPieces(draft)} Pcs)`);

    for (const model of draft?.models || []) {
      const lines = [String(model.name || "Unnamed mattress model").trim()];
      const description = String(model.description || "").trim();
      const referencePrice = String(model.referencePrice || "").trim();
      if (description) lines.push(description);
      if (referencePrice) lines.push(`Reference price: ${referencePrice}`);
      const sizes = (model.sizes || []).filter((size) => quantity(size.qty) > 0);
      if (sizes.length) lines.push("", ...sizes.map(formatSize));
      blocks.push(lines.join("\n"));
    }

    blocks.push("Thanks & regards\nBarza Trading");
    return blocks.filter(Boolean).join("\n\n");
  }

  function validateDraft(draft) {
    const errors = [];
    if (!(draft?.models || []).length) errors.push("Add at least one mattress model.");
    for (const model of draft?.models || []) {
      if (!String(model.name || "").trim()) errors.push("Every model needs a name.");
      if (!(model.sizes || []).length) errors.push(`${model.name || "A model"} needs at least one size.`);
      for (const size of model.sizes || []) {
        if ([size.length, size.width, size.thickness].some((value) => !Number.isFinite(Number(value)) || Number(value) <= 0)) {
          errors.push(`${model.name || "A model"} has an incomplete size.`);
        }
        if (!quantity(size.qty)) errors.push(`${model.name || "A model"} has an invalid quantity.`);
      }
    }
    return [...new Set(errors)];
  }

  return {
    DEFAULT_CATALOG,
    clone,
    makeId,
    createDraft,
    createWorkspace,
    modelFromCatalog,
    createSize,
    quantity,
    totalPieces,
    expectedThickness,
    thicknessWarning,
    formatSize,
    formatMessage,
    validateDraft,
  };
});
