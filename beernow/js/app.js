import { fetchBeers, fetchStores } from "./api.js";

const PAGE = 15;
const SEARCH_LIMIT = 8;

const els = {
  input: document.querySelector("#store-input"),
  list: document.querySelector("#store-list"),
  status: document.querySelector("#status"),
  results: document.querySelector("#results"),
  storeName: document.querySelector("#store-name"),
  storeAddress: document.querySelector("#store-address"),
  storeMeta: document.querySelector("#store-meta"),
  rows: document.querySelector("#rows"),
  more: document.querySelector("#more"),
};

const state = {
  stores: [],
  query: "",
  matches: [],
  active: -1,
  storeId: null,
  beers: [],
  shown: 0,
  abort: null,
  requestId: 0,
};

// ---------------------------------------------------------------- store list

function normalize(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function searchStores(stores, query) {
  const q = normalize(query);
  if (!q) return [];
  const compact = q.replace(/\s+/g, "");

  const hits = [];
  for (const store of stores) {
    const city = normalize(store.city);
    const address = normalize(store.address);
    const name = normalize(store.name);
    const postal = String(store.postal || "").toLowerCase().replace(/\s+/g, "");

    let rank = -1;
    if (city.startsWith(q) || name.startsWith(q)) rank = 0;
    else if (postal.startsWith(compact)) rank = 1;
    else if (address.startsWith(q)) rank = 2;
    else if (city.includes(q) || address.includes(q) || name.includes(q) || postal.includes(compact)) rank = 3;
    if (rank < 0) continue;

    hits.push({ store, rank });
  }

  hits.sort(
    (a, b) =>
      a.rank - b.rank ||
      a.store.city.localeCompare(b.store.city) ||
      a.store.address.localeCompare(b.store.address),
  );
  return hits.slice(0, SEARCH_LIMIT).map((hit) => hit.store);
}

function renderMatches() {
  const list = els.list;
  list.replaceChildren();
  state.matches = state.query.trim() ? searchStores(state.stores, state.query) : [];
  state.active = state.matches.length ? 0 : -1;

  if (state.query.trim() && state.matches.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No stores match that. Try a city or postal code.";
    list.append(empty);
  }

  state.matches.forEach((store, index) => {
    const item = document.createElement("li");
    item.id = `store-option-${store.id}`;
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", String(index === state.active));
    item.dataset.index = String(index);

    const city = document.createElement("span");
    city.className = "city";
    city.textContent = store.city;

    const where = document.createElement("span");
    where.className = "where";
    where.textContent = `${store.address} · ${store.postal}`;

    item.append(city, where);
    list.append(item);
  });

  const open = state.matches.length > 0;
  list.hidden = !open;
  els.input.setAttribute("aria-expanded", String(open));
  if (state.active >= 0) {
    els.input.setAttribute("aria-activedescendant", `store-option-${state.matches[state.active].id}`);
  } else {
    els.input.removeAttribute("aria-activedescendant");
  }
}

function closeList() {
  els.list.hidden = true;
  els.list.replaceChildren();
  state.matches = [];
  state.active = -1;
  els.input.setAttribute("aria-expanded", "false");
  els.input.removeAttribute("aria-activedescendant");
}

function moveActive(delta) {
  if (!state.matches.length) return;
  state.active = (state.active + delta + state.matches.length) % state.matches.length;
  [...els.list.children].forEach((child, index) => {
    child.setAttribute("aria-selected", String(index === state.active));
  });
  els.input.setAttribute("aria-activedescendant", `store-option-${state.matches[state.active].id}`);
  els.list.children[state.active]?.scrollIntoView({ block: "nearest" });
}

function choose(store) {
  if (!store) return;
  els.input.value = `${titleCase(store.city)} — ${store.address}`;
  closeList();
  if (`#s=${store.id}` !== location.hash) {
    location.hash = `#s=${store.id}`;
  } else {
    loadStore(store.id);
  }
}

// ------------------------------------------------------------------ rendering

function titleCase(value) {
  return String(value || "").replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

function money(value) {
  return `$${Number(value).toFixed(2)}`;
}

function abvBand(abv) {
  if (abv >= 8) return "strong";
  if (abv >= 6) return "mid";
  return "light";
}

function alcoholPerPack(beer) {
  const ml = (beer.pack * beer.volumeMl * beer.abv) / 100;
  return ml >= 1000 ? `${(ml / 1000).toFixed(1)} L` : `${Math.round(ml)} ml`;
}

function renderRows() {
  const fragment = document.createDocumentFragment();
  const slice = state.beers.slice(0, state.shown);

  slice.forEach((beer, index) => {
    const row = document.createElement("tr");

    const rank = document.createElement("td");
    rank.className = "col-rank";
    rank.textContent = String(index + 1);

    const nameCell = document.createElement("td");
    const name = document.createElement("span");
    name.className = "beer-name";
    name.textContent = titleCase(beer.name);

    const sub = document.createElement("span");
    sub.className = "beer-sub";
    sub.append(beer.label);
    if (beer.format) {
      const format = document.createElement("span");
      format.className = "badge";
      format.textContent = beer.format;
      sub.append(format);
    }
    if (beer.onSale) {
      const sale = document.createElement("span");
      sale.className = "badge sale";
      sale.textContent = "Sale";
      sub.append(sale);
    }
    nameCell.append(name, sub);

    const abv = document.createElement("td");
    abv.className = "num";
    const chip = document.createElement("span");
    chip.className = "abv";
    chip.dataset.band = abvBand(beer.abv);
    chip.textContent = `${beer.abv.toFixed(1)}%`;
    abv.append(chip);

    const pack = document.createElement("td");
    pack.className = "num col-pack";
    pack.textContent = `${beer.pack} × ${beer.volumeMl >= 1000 ? `${beer.volumeMl / 1000} L` : `${beer.volumeMl} ml`}`;

    const price = document.createElement("td");
    price.className = "num";
    const priceLine = document.createElement("span");
    priceLine.className = "price";
    priceLine.textContent = money(beer.effectivePrice);
    price.append(priceLine);
    if (beer.onSale) {
      const was = document.createElement("s");
      was.textContent = money(beer.price);
      price.append(was);
    }

    const value = document.createElement("td");
    value.className = "num";
    const score = document.createElement("span");
    score.className = "value";
    const perDollar = (beer.pack * beer.volumeMl * beer.abv) / 100 / beer.effectivePrice;
    const unit = document.createElement("small");
    unit.textContent = "ml / $";
    score.append(perDollar.toFixed(1), unit);
    value.append(score);

    nameCell.title = `${alcoholPerPack(beer)} of pure alcohol in the pack`;
    row.append(rank, nameCell, abv, pack, price, value);
    fragment.append(row);
  });

  els.rows.replaceChildren(fragment);
  els.more.hidden = state.shown >= state.beers.length;
  els.more.textContent = `Show ${Math.min(PAGE, state.beers.length - state.shown)} more`;
}

function setStatus(message, isError = false) {
  els.status.textContent = message;
  els.status.classList.toggle("error", isError);
}

async function loadStore(storeId) {
  const requestId = ++state.requestId;
  state.abort?.abort();
  const controller = new AbortController();
  state.abort = controller;

  state.storeId = storeId;
  state.shown = 0;
  setStatus("Loading prices…");

  try {
    const data = await fetchBeers(storeId, controller.signal);
    if (requestId !== state.requestId) return;

    const store = data.store;
    els.storeName.textContent = titleCase(store.name);
    els.storeAddress.textContent = `${store.address}, ${titleCase(store.city)} ${store.postal}`;
    els.storeMeta.textContent = `${data.total} listings ranked · ranked by alcohol per dollar · updated ${new Date(data.generated).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}${data.stale ? " (cached)" : ""}`;

    state.beers = data.beers;
    state.shown = Math.min(PAGE, data.beers.length);
    renderRows();
    els.results.hidden = false;
    setStatus("");
    document.title = `${titleCase(store.city)} prices — BeerNow`;
  } catch (error) {
    if (error.name === "AbortError" || requestId !== state.requestId) return;
    els.results.hidden = true;
    setStatus(`Could not load this store (${error.message}). Try another store.`, true);
  }
}

async function loadStoreDirectory() {
  try {
    const data = await fetchStores();
    state.stores = data.stores;
    setStatus(
      state.storeId ? "" : `${data.stores.length} stores loaded. Pick the store you shop at.`,
    );
  } catch (error) {
    setStatus(`Could not load the store directory (${error.message}). Reload to retry.`, true);
  }
}

// --------------------------------------------------------------------- wiring

els.input.addEventListener("input", (event) => {
  state.query = event.target.value;
  renderMatches();
});

els.input.addEventListener("keydown", (event) => {
  switch (event.key) {
    case "ArrowDown":
      if (!state.matches.length) renderMatches();
      moveActive(1);
      event.preventDefault();
      break;
    case "ArrowUp":
      if (!state.matches.length) renderMatches();
      moveActive(-1);
      event.preventDefault();
      break;
    case "Enter":
      event.preventDefault();
      choose(state.matches[state.active]);
      break;
    case "Escape":
      closeList();
      break;
    default:
      break;
  }
});

els.input.addEventListener("focus", () => {
  if (state.query.trim() && state.matches.length) renderMatches();
});

els.list.addEventListener("mousedown", (event) => {
  // mousedown, not click: keep focus in the input so the list does not blur shut.
  const item = event.target.closest("li[data-index]");
  if (!item) return;
  event.preventDefault();
  choose(state.matches[Number(item.dataset.index)]);
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".combo")) closeList();
});

els.more.addEventListener("click", () => {
  state.shown = Math.min(state.shown + PAGE, state.beers.length);
  renderRows();
});

window.addEventListener("hashchange", () => {
  const id = Number(/^#s=(\d+)$/.exec(location.hash)?.[1]);
  if (id) loadStore(id);
});

function storeIdFromHash() {
  const id = Number(/^#s=(\d+)$/.exec(location.hash)?.[1]);
  return Number.isFinite(id) && id > 0 ? id : null;
}

async function start() {
  const storeId = storeIdFromHash();
  await loadStoreDirectory();

  if (storeId) {
    const store = state.stores.find((candidate) => candidate.id === storeId);
    if (store) {
      els.input.value = `${titleCase(store.city)} — ${store.address}`;
    }
    loadStore(storeId);
  }
}

start();
