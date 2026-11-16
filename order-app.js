(function initialiseOrderBuilder() {
  "use strict";

  const Core = window.BarzaOrderCore;
  if (!Core) return;

  const WORKSPACE_KEY = "barza-order-workspace-v1";
  const TOKEN_KEY = "barza-order-session-v1";
  const DIRTY_KEY = "barza-order-dirty-v1";
  localStorage.removeItem("barza-order-shared-code-v1");
  const API_URL = String(window.BARZA_ORDER_API_URL || "").replace(/\/$/, "");
  let workspace = loadWorkspace();
  let dirty = localStorage.getItem(DIRTY_KEY) === "true";
  let syncTimer;
  let conflict = null;

  const el = {
    appTitle: document.querySelector("#appTitle"),
    appButtons: document.querySelectorAll("[data-app-view]"),
    quotationActions: document.querySelector("#quotationHeaderActions"),
    quotationMobileSwitch: document.querySelector("#quotationMobileSwitch"),
    quotationWorkspace: document.querySelector("#quotationWorkspace"),
    orderWorkspace: document.querySelector("#orderWorkspace"),
    greeting: document.querySelector("#orderGreeting"),
    intro: document.querySelector("#orderIntro"),
    orderName: document.querySelector("#orderName"),
    pieceCount: document.querySelector("#orderPieceCount"),
    models: document.querySelector("#orderModels"),
    modelsEmpty: document.querySelector("#orderModelsEmpty"),
    modelTemplate: document.querySelector("#orderModelTemplate"),
    sizeTemplate: document.querySelector("#sizeRowTemplate"),
    catalogTemplate: document.querySelector("#catalogRowTemplate"),
    message: document.querySelector("#orderMessage"),
    syncStatus: document.querySelector("#syncStatus"),
    pinGate: document.querySelector("#pinGate"),
    pinForm: document.querySelector("#pinForm"),
    pinInput: document.querySelector("#pinInput"),
    pinSubmit: document.querySelector("#pinSubmit"),
    pinError: document.querySelector("#pinError"),
    conflictPanel: document.querySelector("#conflictPanel"),
    catalogEditor: document.querySelector("#catalogEditor"),
    catalogCount: document.querySelector("#catalogCount"),
    savedOrders: document.querySelector("#savedOrders"),
    savedOrdersEmpty: document.querySelector("#savedOrdersEmpty"),
    savedOrderCount: document.querySelector("#savedOrderCount"),
  };

  function validWorkspace(value) {
    return value && Array.isArray(value.catalog) && value.draft && Array.isArray(value.draft.models) && Array.isArray(value.orders);
  }

  function loadWorkspace() {
    try {
      const saved = JSON.parse(localStorage.getItem(WORKSPACE_KEY));
      if (validWorkspace(saved)) return saved;
    } catch {
      // A corrupt local draft falls back to the safe defaults below.
    }
    return Core.createWorkspace();
  }

  function saveLocal() {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(workspace));
    localStorage.setItem(DIRTY_KEY, String(dirty));
  }

  function setStatus(message, kind = "") {
    el.syncStatus.textContent = message;
    el.syncStatus.dataset.kind = kind;
  }

  function sessionToken() {
    return sessionStorage.getItem(TOKEN_KEY) || "";
  }

  function lockApp(message = "") {
    sessionStorage.removeItem(TOKEN_KEY);
    document.body.classList.add("is-locked");
    el.pinGate.hidden = false;
    el.pinInput.value = "";
    el.pinError.textContent = message;
    el.pinSubmit.disabled = false;
    el.pinSubmit.textContent = "Open workspace";
    requestAnimationFrame(() => el.pinInput.focus());
  }

  function unlockApp() {
    document.body.classList.remove("is-locked");
    el.pinGate.hidden = true;
  }

  function setView(view) {
    const order = view === "order";
    el.quotationWorkspace.hidden = order;
    el.quotationActions.hidden = order;
    el.quotationMobileSwitch.hidden = order;
    el.orderWorkspace.hidden = !order;
    el.appTitle.textContent = order ? "Order Request Builder" : "Quotation Builder";
    document.body.dataset.appView = view;
    el.appButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.appView === view)));
  }

  function renderMessage() {
    const total = Core.totalPieces(workspace.draft);
    el.pieceCount.textContent = `${total} ${total === 1 ? "Pc" : "Pcs"}`;
    el.message.value = Core.formatMessage(workspace.draft);
  }

  function scheduleChange() {
    workspace.draft.updatedAt = new Date().toISOString();
    dirty = true;
    saveLocal();
    renderMessage();
    if (!sessionToken()) {
      setStatus("Saved on this device", "local");
      return;
    }
    if (!API_URL) {
      setStatus("Saved on this device · shared backend not configured", "warning");
      return;
    }
    setStatus("Saved on this device · syncing…", "working");
    clearTimeout(syncTimer);
    syncTimer = setTimeout(pushRemote, 700);
  }

  function renderSize(model, size, container) {
    const row = el.sizeTemplate.content.firstElementChild.cloneNode(true);
    row.dataset.id = size.id;
    const fields = {
      length: row.querySelector(".size-length"),
      width: row.querySelector(".size-width"),
      thickness: row.querySelector(".size-thickness"),
      qty: row.querySelector(".size-qty"),
      colour: row.querySelector(".size-colour"),
      note: row.querySelector(".size-note"),
    };
    Object.entries(fields).forEach(([key, input]) => {
      input.value = size[key];
      input.addEventListener("input", () => {
        size[key] = input.value;
        updateWarning();
        scheduleChange();
      });
    });
    const warning = row.querySelector(".size-warning");
    function updateWarning() {
      const message = Core.thicknessWarning(model.name, size.thickness);
      warning.textContent = message;
      warning.hidden = !message;
    }
    row.querySelector(".remove-size").addEventListener("click", () => {
      model.sizes = model.sizes.filter((candidate) => candidate.id !== size.id);
      renderModels();
      scheduleChange();
    });
    updateWarning();
    container.append(row);
  }

  function catalogOptions(select, selectedId) {
    select.replaceChildren();
    for (const model of workspace.catalog) {
      const option = document.createElement("option");
      option.value = model.id;
      option.textContent = model.name || "Unnamed model";
      option.selected = model.id === selectedId;
      select.append(option);
    }
    const custom = document.createElement("option");
    custom.value = "";
    custom.textContent = "Custom / unsaved model";
    custom.selected = !workspace.catalog.some((model) => model.id === selectedId);
    select.append(custom);
  }

  function renderModels() {
    el.models.replaceChildren();
    el.modelsEmpty.hidden = workspace.draft.models.length > 0;
    for (const model of workspace.draft.models) {
      const card = el.modelTemplate.content.firstElementChild.cloneNode(true);
      card.dataset.id = model.id;
      const picker = card.querySelector(".model-picker");
      const name = card.querySelector(".order-model-name");
      const description = card.querySelector(".order-model-description");
      const price = card.querySelector(".order-model-price");
      const sizes = card.querySelector(".size-rows");
      catalogOptions(picker, model.catalogId);
      card.querySelector(".order-model-name-field").hidden = Boolean(picker.value);
      name.value = model.name;
      description.value = model.description;
      price.value = model.referencePrice;

      picker.addEventListener("change", () => {
        const selected = workspace.catalog.find((candidate) => candidate.id === picker.value);
        model.catalogId = selected?.id || "";
        if (selected) {
          model.name = selected.name;
          model.description = selected.description;
          model.referencePrice = selected.referencePrice;
        }
        renderModels();
        scheduleChange();
      });
      [
        [name, "name"],
        [description, "description"],
        [price, "referencePrice"],
      ].forEach(([input, key]) => input.addEventListener("input", () => {
        model[key] = input.value;
        if (key === "name") {
          model.catalogId = "";
          picker.value = "";
          card.querySelectorAll(".size-row").forEach((row) => {
            const size = model.sizes.find((candidate) => candidate.id === row.dataset.id);
            const message = Core.thicknessWarning(model.name, size?.thickness);
            const warning = row.querySelector(".size-warning");
            warning.textContent = message;
            warning.hidden = !message;
          });
        }
        scheduleChange();
      }));
      card.querySelector(".remove-order-model").addEventListener("click", () => {
        workspace.draft.models = workspace.draft.models.filter((candidate) => candidate.id !== model.id);
        renderModels();
        scheduleChange();
      });
      card.querySelector(".add-size-button").addEventListener("click", () => {
        const expected = Core.expectedThickness(model.name);
        model.sizes.push(Core.createSize({ thickness: expected || "" }));
        renderModels();
        scheduleChange();
        el.models.querySelector(`[data-id="${model.id}"] .size-row:last-child .size-length`)?.focus();
      });
      model.sizes.forEach((size) => renderSize(model, size, sizes));
      el.models.append(card);
    }
    renderMessage();
  }

  function renderCatalog() {
    el.catalogEditor.replaceChildren();
    el.catalogCount.textContent = `${workspace.catalog.length} ${workspace.catalog.length === 1 ? "model" : "models"}`;
    for (const model of workspace.catalog) {
      const row = el.catalogTemplate.content.firstElementChild.cloneNode(true);
      row.dataset.id = model.id;
      const name = row.querySelector(".catalog-name");
      const description = row.querySelector(".catalog-description");
      const price = row.querySelector(".catalog-price");
      name.value = model.name;
      description.value = model.description;
      price.value = model.referencePrice;
      row.querySelector(".catalog-row-title").textContent = model.name || "Unnamed model";
      [
        [name, "name"],
        [description, "description"],
        [price, "referencePrice"],
      ].forEach(([input, key]) => input.addEventListener("input", () => {
        model[key] = input.value;
        if (key === "name") row.querySelector(".catalog-row-title").textContent = input.value || "Unnamed model";
        scheduleChange();
      }));
      row.querySelector(".remove-catalog-model").addEventListener("click", () => {
        if (!window.confirm(`Delete ${model.name || "this model"} from the saved catalog? Existing orders keep their copy.`)) return;
        workspace.catalog = workspace.catalog.filter((candidate) => candidate.id !== model.id);
        renderCatalog();
        renderModels();
        scheduleChange();
      });
      el.catalogEditor.append(row);
    }
  }

  function orderTitle(order) {
    return order.name || `Order ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(order.savedAt))}`;
  }

  function renderSavedOrders() {
    el.savedOrders.replaceChildren();
    el.savedOrdersEmpty.hidden = workspace.orders.length > 0;
    el.savedOrderCount.textContent = `${workspace.orders.length} saved`;
    [...workspace.orders].sort((a, b) => b.savedAt.localeCompare(a.savedAt)).forEach((order) => {
      const row = document.createElement("div");
      row.className = "saved-order-row";
      const info = document.createElement("div");
      const title = document.createElement("strong");
      const meta = document.createElement("span");
      title.textContent = orderTitle(order);
      meta.textContent = `${Core.totalPieces(order.draft)} Pcs · ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(order.savedAt))}`;
      info.append(title, meta);
      const actions = document.createElement("div");
      const load = document.createElement("button");
      const remove = document.createElement("button");
      load.className = "button button-add";
      load.type = "button";
      load.textContent = "Load copy";
      remove.className = "button button-danger-quiet";
      remove.type = "button";
      remove.textContent = "Delete";
      load.addEventListener("click", () => {
        workspace.draft = Core.clone(order.draft);
        workspace.draft.name = `${orderTitle(order)} copy`;
        workspace.draft.updatedAt = new Date().toISOString();
        renderAll();
        scheduleChange();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
      remove.addEventListener("click", () => {
        if (!window.confirm(`Delete the saved order “${orderTitle(order)}”?`)) return;
        workspace.orders = workspace.orders.filter((candidate) => candidate.id !== order.id);
        renderSavedOrders();
        scheduleChange();
      });
      actions.append(load, remove);
      row.append(info, actions);
      el.savedOrders.append(row);
    });
  }

  function renderAll() {
    el.greeting.value = workspace.draft.greeting || "";
    el.intro.value = workspace.draft.intro || "";
    el.orderName.value = workspace.draft.name || "";
    renderModels();
    renderCatalog();
    renderSavedOrders();
    el.conflictPanel.hidden = !conflict;
  }

  function authHeaders() {
    return { Authorization: `Bearer ${sessionToken()}`, "Content-Type": "application/json" };
  }

  async function unlockWithPin(pin) {
    if (!API_URL) {
      el.pinError.textContent = "The shared service is not configured.";
      return;
    }
    el.pinSubmit.disabled = true;
    el.pinSubmit.textContent = "Checking…";
    el.pinError.textContent = "";
    try {
      const response = await fetch(`${API_URL}/api/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 429) {
        el.pinError.textContent = "Too many attempts. Try again in 15 minutes.";
        return;
      }
      if (!response.ok || !result.token) {
        el.pinError.textContent = "That PIN is incorrect.";
        el.pinInput.select();
        return;
      }
      sessionStorage.setItem(TOKEN_KEY, result.token);
      unlockApp();
      await pullRemote();
    } catch {
      el.pinError.textContent = "Unable to connect. Check your internet and try again.";
    } finally {
      el.pinSubmit.disabled = false;
      el.pinSubmit.textContent = "Open workspace";
    }
  }

  async function pullRemote() {
    if (!API_URL) {
      setStatus("Saved on this device · add the Worker URL in config.js to share", "warning");
      return;
    }
    setStatus("Loading shared workspace…", "working");
    try {
      const response = await fetch(`${API_URL}/api/workspace`, { headers: authHeaders() });
      if (response.status === 401) {
        lockApp("Your session expired. Enter the PIN again.");
        return;
      }
      if (!response.ok) throw new Error("Shared workspace could not be loaded");
      const remote = await response.json();
      if (!remote.workspace) {
        await pushRemote();
        return;
      }
      if (dirty) {
        if (Number(remote.revision) !== Number(workspace.revision)) {
          conflict = remote;
          el.conflictPanel.hidden = false;
          setStatus("Choose which version to keep", "warning");
          return;
        }
        await pushRemote();
        return;
      }
      workspace = { ...remote.workspace, revision: remote.revision };
      dirty = false;
      conflict = null;
      saveLocal();
      renderAll();
      setStatus("Shared workspace is up to date", "success");
    } catch {
      setStatus("Offline · changes remain saved on this device", "warning");
    }
  }

  async function pushRemote() {
    if (!sessionToken() || !API_URL || conflict) return;
    try {
      const payload = {
        revision: Number(workspace.revision) || 0,
        workspace: { catalog: workspace.catalog, draft: workspace.draft, orders: workspace.orders },
      };
      const response = await fetch(`${API_URL}/api/workspace`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      if (response.status === 401) {
        lockApp("Your session expired. Enter the PIN again.");
        return;
      }
      if (response.status === 409) {
        conflict = await response.json();
        el.conflictPanel.hidden = false;
        setStatus("A newer shared version needs your choice", "warning");
        return;
      }
      if (!response.ok) throw new Error("Sync failed");
      const saved = await response.json();
      workspace.revision = saved.revision;
      dirty = false;
      saveLocal();
      setStatus("Saved to shared workspace", "success");
    } catch {
      setStatus("Offline · changes remain saved on this device", "warning");
    }
  }

  async function copyMessage(button) {
    const errors = Core.validateDraft(workspace.draft);
    if (errors.length) {
      setStatus(errors[0], "error");
      el.models.querySelector("input")?.focus();
      return;
    }
    const original = button.textContent;
    try {
      await navigator.clipboard.writeText(el.message.value);
      button.textContent = "Copied";
      setStatus("Order message copied", "success");
    } catch {
      el.message.focus();
      el.message.select();
      setStatus("Text selected · choose Copy on your device", "warning");
    }
    setTimeout(() => { button.textContent = original; }, 1400);
  }

  el.appButtons.forEach((button) => button.addEventListener("click", () => setView(button.dataset.appView)));
  [
    [el.greeting, "greeting"],
    [el.intro, "intro"],
    [el.orderName, "name"],
  ].forEach(([input, key]) => input.addEventListener("input", () => {
    workspace.draft[key] = input.value;
    scheduleChange();
  }));

  document.querySelector("#addOrderModelButton").addEventListener("click", () => {
    const model = Core.modelFromCatalog(workspace.catalog[0]);
    model.sizes.push(Core.createSize({ thickness: Core.expectedThickness(model.name) || "" }));
    workspace.draft.models.push(model);
    renderModels();
    scheduleChange();
    el.models.lastElementChild?.querySelector(".model-picker")?.focus();
  });
  document.querySelector("#addCatalogModelButton").addEventListener("click", () => {
    workspace.catalog.push({ id: Core.makeId("catalog"), name: "New mattress model", description: "", referencePrice: "" });
    renderCatalog();
    scheduleChange();
    el.catalogEditor.lastElementChild?.querySelector(".catalog-name")?.focus();
  });
  document.querySelector("#saveOrderButton").addEventListener("click", () => {
    const errors = Core.validateDraft(workspace.draft);
    if (errors.length) {
      setStatus(errors[0], "error");
      return;
    }
    const now = new Date().toISOString();
    workspace.orders.push({
      id: Core.makeId("order"),
      name: workspace.draft.name.trim(),
      savedAt: now,
      draft: Core.clone({ ...workspace.draft, updatedAt: now }),
    });
    renderSavedOrders();
    scheduleChange();
    setStatus("Order saved as a reusable snapshot", "success");
  });
  document.querySelector("#copyOrderButton").addEventListener("click", (event) => copyMessage(event.currentTarget));
  document.querySelector("#copyPreviewButton").addEventListener("click", (event) => copyMessage(event.currentTarget));

  el.pinInput.addEventListener("input", () => {
    el.pinInput.value = el.pinInput.value.replace(/\D/g, "").slice(0, 4);
    el.pinError.textContent = "";
  });
  el.pinForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!/^\d{4}$/.test(el.pinInput.value)) {
      el.pinError.textContent = "Enter all four digits.";
      el.pinInput.focus();
      return;
    }
    await unlockWithPin(el.pinInput.value);
  });
  document.querySelector("#useServerButton").addEventListener("click", () => {
    if (!conflict?.workspace) return;
    const recovery = {
      id: Core.makeId("recovery"),
      name: `Recovered local draft ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date())}`,
      savedAt: new Date().toISOString(),
      draft: Core.clone(workspace.draft),
    };
    workspace = { ...conflict.workspace, revision: conflict.revision };
    workspace.orders.push(recovery);
    dirty = true;
    conflict = null;
    saveLocal();
    renderAll();
    setStatus("Loaded shared version · previous draft saved under Saved orders", "success");
    clearTimeout(syncTimer);
    syncTimer = setTimeout(pushRemote, 700);
  });
  document.querySelector("#keepLocalButton").addEventListener("click", async () => {
    if (!conflict) return;
    workspace.revision = conflict.revision;
    conflict = null;
    el.conflictPanel.hidden = true;
    await pushRemote();
  });

  renderAll();
  setView("quotation");
  if (sessionToken()) {
    unlockApp();
    pullRemote();
  } else {
    lockApp();
  }
})();
