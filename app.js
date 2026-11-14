const STORAGE_KEY = "barza-quotation-builder-v1";

const today = new Date();
const todayIso = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("-");

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const defaultState = {
  quoteNumber: "QT-125",
  quoteDate: todayIso,
  customer: "Customer - Bangalore",
  priceNote: "Customer-specific sale prices shown below",
  taxInclusive: true,
  items: [
    { id: makeId(), name: "Goodfeel EP + Foam - 72/30/4", qty: 1, mrp: 3910, price: 955 },
    { id: makeId(), name: "Goodfeel EP + Foam - 72/36/4", qty: 1, mrp: 4783, price: 2391 },
    { id: makeId(), name: "Goodfeel EP + Foam - 72/48/4", qty: 1, mrp: 6242, price: 3121 },
    { id: makeId(), name: "Goodfeel EP + Foam - 78/60/4", qty: 1, mrp: 8800, price: 4400 },
    { id: makeId(), name: "Goodfeel EP + Foam - 78/72/4", qty: 1, mrp: 10558, price: 5279 },
  ],
};

let state = loadState();
let saveTimer;

const elements = {
  quoteNumber: document.querySelector("#quoteNumber"),
  quoteDate: document.querySelector("#quoteDate"),
  customer: document.querySelector("#customer"),
  priceNote: document.querySelector("#priceNote"),
  taxInclusive: document.querySelector("#taxInclusive"),
  itemEditor: document.querySelector("#itemEditor"),
  itemTemplate: document.querySelector("#itemRowTemplate"),
  previewItems: document.querySelector("#previewItems"),
  saveStatus: document.querySelector("#saveStatus"),
};

function cloneDefaultState() {
  return {
    ...defaultState,
    items: defaultState.items.map((item) => ({ ...item, id: makeId() })),
  };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !Array.isArray(saved.items)) return cloneDefaultState();
    return {
      ...cloneDefaultState(),
      ...saved,
      items: saved.items.map((item) => ({
        id: item.id || makeId(),
        name: String(item.name || ""),
        qty: numberValue(item.qty),
        mrp: numberValue(item.mrp),
        price: numberValue(item.price),
      })),
    };
  } catch {
    return cloneDefaultState();
  }
}

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatInr(value, symbol = false) {
  return `${symbol ? "₹" : "INR "}${formatNumber(value)}`;
}

function formatDate(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(year, month - 1, day));
}

function totals() {
  return state.items.reduce(
    (result, item) => {
      result.qty += numberValue(item.qty);
      result.mrp += numberValue(item.qty) * numberValue(item.mrp);
      result.sale += numberValue(item.qty) * numberValue(item.price);
      return result;
    },
    { qty: 0, mrp: 0, sale: 0 },
  );
}

function scheduleSave() {
  clearTimeout(saveTimer);
  elements.saveStatus.textContent = "Unsaved changes";
  saveTimer = setTimeout(saveDraft, 650);
}

function saveDraft() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  elements.saveStatus.textContent = "Draft saved";
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function renderEditor() {
  elements.quoteNumber.value = state.quoteNumber;
  elements.quoteDate.value = state.quoteDate;
  elements.customer.value = state.customer;
  elements.priceNote.value = state.priceNote;
  elements.taxInclusive.checked = state.taxInclusive;

  elements.itemEditor.replaceChildren();
  state.items.forEach((item) => {
    const row = elements.itemTemplate.content.firstElementChild.cloneNode(true);
    row.dataset.id = item.id;
    row.querySelector(".item-name").value = item.name;
    row.querySelector(".item-qty").value = item.qty;
    row.querySelector(".item-mrp").value = item.mrp;
    row.querySelector(".item-price").value = item.price;
    row.querySelector(".remove-item").disabled = state.items.length === 1;

    row.addEventListener("input", (event) => {
      const target = event.target;
      const current = state.items.find((candidate) => candidate.id === item.id);
      if (!current) return;
      if (target.classList.contains("item-name")) current.name = target.value;
      if (target.classList.contains("item-qty")) current.qty = numberValue(target.value);
      if (target.classList.contains("item-mrp")) current.mrp = numberValue(target.value);
      if (target.classList.contains("item-price")) current.price = numberValue(target.value);
      renderPreview();
      scheduleSave();
    });

    row.querySelector(".remove-item").addEventListener("click", () => {
      if (state.items.length === 1) return;
      state.items = state.items.filter((candidate) => candidate.id !== item.id);
      renderAll();
      scheduleSave();
    });

    elements.itemEditor.append(row);
  });
}

function renderPreviewRows() {
  elements.previewItems.replaceChildren();
  state.items.forEach((item, index) => {
    const row = document.createElement("tr");
    const values = [
      String(index + 1),
      item.name.trim() || "Untitled item",
      formatNumber(numberValue(item.qty)),
      formatInr(numberValue(item.mrp)),
      formatInr(numberValue(item.price)),
    ];
    values.forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    });
    elements.previewItems.append(row);
  });
}

function renderPreview() {
  const current = totals();
  const savings = current.mrp - current.sale;
  const discount = current.mrp > 0 ? (savings / current.mrp) * 100 : 0;
  const qtyLabel = `${formatNumber(current.qty)} ${current.qty === 1 ? "Pc" : "Pcs"}`;
  const itemLabel = `${state.items.length} ${state.items.length === 1 ? "item" : "items"}`;

  renderPreviewRows();
  setText("#previewCustomer", state.customer.trim() || "Customer");
  setText("#previewPriceNote", state.priceNote.trim() || "Customer-specific sale prices shown below");
  setText("#previewNumber", state.quoteNumber.trim() || "Quotation");
  setText("#previewDate", formatDate(state.quoteDate));
  setText("#previewQty", qtyLabel);
  setText("#tableTotalQty", qtyLabel);
  setText("#tableTotalMrp", formatInr(current.mrp));
  setText("#tableTotalSale", formatInr(current.sale));
  setText("#summaryMrp", formatInr(current.mrp));
  setText("#summarySavings", formatInr(savings));
  setText("#summarySale", formatInr(current.sale));
  setText("#quotedTotalLabel", state.taxInclusive ? "TAX-INCLUSIVE TOTAL" : "QUOTED TOTAL");
  setText("#amountWords", `Rupees ${numberToWordsIndian(Math.round(current.sale))} Only`);
  setText("#discountText", `Overall saving against MRP: ${discount.toFixed(2)}%`);
  setText("#footerNumber", `Quotation ${state.quoteNumber.trim() || ""}`.trim());
  setText("#footerDate", `Issued ${formatDate(state.quoteDate)}`.trim());
  setText("#itemCountLabel", itemLabel);
  setText("#editorMrp", formatInr(current.mrp, true));
  setText("#editorSale", formatInr(current.sale, true));
  setText("#editorSavings", formatInr(savings, true));

  document.querySelector("#taxDeclarationRow").hidden = !state.taxInclusive;
}

function renderAll() {
  renderEditor();
  renderPreview();
}

function bindDetails() {
  const bindings = [
    [elements.quoteNumber, "quoteNumber"],
    [elements.quoteDate, "quoteDate"],
    [elements.customer, "customer"],
    [elements.priceNote, "priceNote"],
  ];
  bindings.forEach(([element, key]) => {
    element.addEventListener("input", () => {
      state[key] = element.value;
      renderPreview();
      scheduleSave();
    });
  });

  elements.taxInclusive.addEventListener("change", () => {
    state.taxInclusive = elements.taxInclusive.checked;
    renderPreview();
    scheduleSave();
  });
}

document.querySelector("#addItemButton").addEventListener("click", () => {
  state.items.push({ id: makeId(), name: "New item", qty: 1, mrp: 0, price: 0 });
  renderAll();
  scheduleSave();
  const lastName = elements.itemEditor.lastElementChild?.querySelector(".item-name");
  lastName?.focus();
  lastName?.select();
});

document.querySelector("#saveButton").addEventListener("click", saveDraft);
document.querySelector("#printButton").addEventListener("click", () => window.print());
document.querySelector("#resetButton").addEventListener("click", () => {
  if (!window.confirm("Reset the quotation to the original Goodfeel template?")) return;
  state = cloneDefaultState();
  localStorage.removeItem(STORAGE_KEY);
  renderAll();
  saveDraft();
});

function numberToWordsIndian(value) {
  if (!Number.isFinite(value) || value <= 0) return "Zero";
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  const belowHundred = (number) => {
    if (number < 20) return ones[number];
    return `${tens[Math.floor(number / 10)]}${number % 10 ? ` ${ones[number % 10]}` : ""}`;
  };

  const belowThousand = (number) => {
    if (number < 100) return belowHundred(number);
    return `${ones[Math.floor(number / 100)]} Hundred${number % 100 ? ` ${belowHundred(number % 100)}` : ""}`;
  };

  let number = Math.floor(value);
  const parts = [];
  const crore = Math.floor(number / 10000000);
  if (crore) {
    parts.push(`${belowThousand(crore)} Crore`);
    number %= 10000000;
  }
  const lakh = Math.floor(number / 100000);
  if (lakh) {
    parts.push(`${belowHundred(lakh)} Lakh`);
    number %= 100000;
  }
  const thousand = Math.floor(number / 1000);
  if (thousand) {
    parts.push(`${belowHundred(thousand)} Thousand`);
    number %= 1000;
  }
  if (number) parts.push(belowThousand(number));
  return parts.join(" ");
}

bindDetails();
renderAll();
