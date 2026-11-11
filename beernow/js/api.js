// Thin client for the BeerNow Worker. Same origin in production; override with
// ?api=… when running `wrangler dev` locally.

const BASE = String(window.BEERNOW_API || "/beernow/api").replace(/\/+$/, "");

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
