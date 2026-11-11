// Thin client for the BeerNow Worker. Same origin in production; override with
// ?api=… when running `wrangler dev` locally.

// Same-origin when served from the live path (yuchenhou.com/beernow/); the
// absolute Worker URL otherwise, so a plain checkout still works.
const explicitBase = window.BEERNOW_API;
const defaultBase = location.pathname.startsWith("/beernow/")
  ? "/beernow/api"
  : "https://yuchenhou.com/beernow/api";
const BASE = String(explicitBase || defaultBase).replace(/\/+$/, "");

async function getJson(path, signal) {
  const response = await fetch(`${BASE}${path}`, {
    signal,
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    let detail = "";
    try {
      detail = (await response.json()).error || "";
    } catch {
      // Upstream returned non-JSON; the status code is all we have.
    }
    const error = new Error(detail || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export function fetchStores(signal) {
  return getJson("/stores", signal).then((data) => {
    if (!Array.isArray(data.stores)) throw new Error("store list was empty");
    return data;
  });
}

export function fetchBeers(storeId, signal) {
  return getJson(`/stores/${encodeURIComponent(storeId)}/beers?limit=100`, signal).then((data) => {
    if (!Array.isArray(data.beers)) throw new Error("price list was empty");
    return data;
  });
}
