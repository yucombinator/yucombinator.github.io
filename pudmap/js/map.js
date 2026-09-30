// Map layer: basemap, territory choropleth, labels, tooltips.
// Design language mirrors hikewithyu.com/algonquin/ — same tile pair, same
// greens, same chrome, so the two projects read as one family.

import { colorForRate, rateStyle, labelStyle, headlineCents, centsAtHour, monthlyBill, utilityById, hasRate, benchmarkCents, RATES } from "./rates.js";

const map = L.map("map", {
  preferCanvas: false,   // SVG: Leaflet's canvas renderer drops complex paths
  minZoom: 6,
  maxZoom: 12,
  zoomControl: false,
  attributionControl: false,
  center: [47.4, -120.7],
  zoom: 7,
});

// The map is about Washington, so the view stays over Washington. Leaflet
// clamps both panning and zoom-out to these bounds, so a small window cannot
// force a world view either.

const opentopo = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
  subdomains: "abc",
  maxZoom: 17,
  crossOrigin: true,
  attribution:
    '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
});

// CARTO now returns watermarked "API KEY REQUIRED" tiles on every endpoint,
// so the light option is Esri's Canvas/World_Light_Gray_Base (no key).
const light = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 16, attribution: 'Basemap: &copy; <a href="https://www.esri.com">Esri</a>' },
);

const BASEMAPS = { terrain: opentopo, light };

let activeBase = "light";
light.addTo(map);
// bottom-right is where the legend lives, so the zoom buttons go under the header
L.control.zoom({ position: "topleft" }).addTo(map);
L.control.attribution({ position: "bottomleft", prefix: false }).addTo(map);

export function setBasemap(which) {
  if (!BASEMAPS[which] || which === activeBase) return;
  map.removeLayer(BASEMAPS[activeBase]);
  BASEMAPS[which].addTo(map);
  BASEMAPS[which].bringToBack();
  activeBase = which;
}

let territories = null;
let labelLayer = null;
let sourceGeojson = null;
// the same object the UI mutates, so assumptions always reach the map
let current = { period: "flat", usage: 1000, hour: 19 };
let selected = null;
const onSelect = [];

export function initMap(geojson, handlers, sharedState) {
  if (sharedState) current = sharedState;   // one source of truth for assumptions
  sourceGeojson = geojson;
  territories = L.geoJSON(geojson, {
    smoothFactor: 0,   // the default 1.0 collapses our raster-derived borders
    style: (f) => rateStyle(f.properties, current),
    onEachFeature: (f, layer) => {
      const p = f.properties;
      layer.bindTooltip(tooltipHtml(p), {
        sticky: true,
        className: "pud-pop",
        direction: "top",
        opacity: 1,
      });
      layer.on({
        mouseover: (e) => e.target.setStyle({ weight: 2.5, color: "#1f78b4" }),
        mouseout: (e) => e.target.setStyle(rateStyle(p, current)),
        click: (e) => {
          if (selected) selected.setStyle(rateStyle(selected.feature.properties, current));
          selected = e.target;
          selected.setStyle({ weight: 3, color: "#1f78b4" });
          handlers.onSelect(p);
        },
      });
    },
  }).addTo(map);

  // keep the view over the state: bounds come from the data, padded slightly
  const dataBounds = territories.getBounds().pad(0.15);
  map.setMaxBounds(dataBounds);

  labelLayer = L.layerGroup().addTo(map);
  addLabels(geojson);
  map.fitBounds(dataBounds, { padding: [12, 12] });
  addLabels(geojson);                     // re-place after the fit resolves sizes
  map.on("zoomend", () => addLabels(geojson));
}

function addLabels(geojson) {
  labelLayer.clearLayers();
  const best = new Map();
  for (const f of geojson.features) {
    const p = f.properties;
    if (!hasRate(p.id)) continue;          // nothing to say, so no label
    const anchor = (p.label_at && p.label_at.length === 2) ? p.label_at : p.center;
    if (!anchor || anchor.length !== 2) continue;
    const a = areaOf(f);
    const prev = best.get(p.id);
    if (!prev || a > prev.area) best.set(p.id, { latlng: anchor, area: a, p });
  }

  // largest territories win a label; smaller neighbours are dropped rather
  // than stacked on top of them, so the map never reads as word soup
  const order = [...best.values()].sort((a, b) => b.area - a.area);
  const placed = [];
  const MIN_GAP = 112;                   // px between label centers (labels are wide now)
  for (const { latlng, p } of order) {
    const pt = map.latLngToContainerPoint(latlng);
    if (placed.some((q) => Math.hypot(q.x - pt.x, q.y - pt.y) < MIN_GAP)) continue;
    placed.push(pt);
    L.marker(latlng, {
      interactive: false,
      keyboard: false,
      icon: L.divIcon({
        className: "pud-label",
        html: `<span>${escapeHtml(shortName(p.name))}${rateSuffix(p.id)}</span>`,
        iconSize: [210, 18],
        iconAnchor: [105, 9],
      }),
    }).addTo(labelLayer);
  }
}

function rateSuffix(id) {
  const u = utilityById(id);
  const cents = current.period === "flat" ? headlineCents(u) : centsAtHour(u, current.hour);
  if (cents == null) return ' <i class="n">n/a</i>';
  return ` <b>${cents.toFixed(cents < 10 ? 2 : 1)}\u00A2</b>`;
}

function areaOf(f) {
  const g = f.geometry;
  if (!g) return 0;
  if (g.type === "Polygon") {
    const ring = g.coordinates[0];
    let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      a += (ring[j][0] * ring[i][1]) - (ring[i][0] * ring[j][1]);
    }
    return Math.abs(a / 2);
  }
  return 0;
}

function shortName(name) {
  return name
    .replace(/ County PUD( No\. \d+)?/g, " PUD")
    .replace(/ Public Utilities/g, " PUD")
    .replace(/^City of /, "")
    .replace(/ Light( & Power| Department)?$/, "")
    .replace(/ Energy Services/, "");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function tooltipHtml(p) {
  const u = utilityById(p.id);
  const cents = current.period === "flat" ? headlineCents(u) : centsAtHour(u, current.hour);
  const bench = utilityById(RATES.benchmark);
  const benchCents = benchmarkCents(current.hour, current.period);
  const bill = monthlyBill(u, current.usage);
  const benchBill = monthlyBill(bench, current.usage);
  const delta = (bill != null && benchBill != null) ? bill - benchBill : null;

  const rows = [];
  if (cents != null) {
    const when = current.period === "flat" ? "standard rate" : `at ${fmtHour(current.hour)}`;
    rows.push(`<div class="pop-rate"><b>${cents.toFixed(2)}&cent;</b><span>${when}</span></div>`);
  } else {
    rows.push(`<div class="pop-rate"><b>&mdash;</b><span>rate not collected</span></div>`);
  }
  if (bill != null) {
    rows.push(`<div class="pop-row"><span>${current.usage.toLocaleString()} kWh bill (all fees)</span><b>$${bill.toFixed(2)}</b></div>`);
  }
  if (delta != null && cents != null && benchCents != null) {
    const cheaper = delta < 0;
    const same = Math.abs(delta) < 0.5;
    const pct = benchBill > 0 ? Math.round(Math.abs(delta) / benchBill * 100) : null;
    const verdict = same
      ? "about the same as"
      : `${pct}% ${cheaper ? "cheaper" : "more expensive"} than`;
    const sign = cheaper ? "\u2212" : "+";
    rows.push(`<div class="verdict ${same ? "even" : cheaper ? "good" : "bad"}">
        <span class="verdict-arrow">${same ? "\u2248" : cheaper ? "\u25bc" : "\u25b2"}</span>
        <span class="verdict-text">${verdict} ${escapeHtml(shortName(bench.name))}</span>
        <b>${sign}$${Math.abs(delta).toFixed(2)}<i>/mo</i></b>
      </div>`);
  }
  if (u && u.tod) rows.push(`<div class="pop-row"><span>time-of-day</span><b>${centsAtHour(u, current.hour) != null ? "offered" : ""}</b></div>`);

  return `<div class="pud-pop">
    <h3>${escapeHtml(p.name)}</h3>
    <div class="pud-kind">${p.type === "pud" ? "Public utility district"
      : p.type === "municipal" ? "Municipal utility" : "Investor-owned"}</div>
    <div class="pud-county">${escapeHtml(p.official_name || p.county || "")}</div>
    ${rows.join("")}
  </div>`;
}

function fmtHour(h) {
  const ampm = h < 12 ? "am" : "pm";
  return `${h % 12 === 0 ? 12 : h % 12}:00 ${ampm}`;
}

export function setPeriod(period) {
  current.period = period;
  restyle();
}

export function setSelection(props) {
  selected = null;
  restyle();
  if (props) {
    territories.eachLayer((l) => {
      if (l.feature.properties.id === props.id) {
        selected = l;
        l.setStyle({ weight: 3, color: "#1f78b4" });
        if (l.getBounds) map.fitBounds(l.getBounds(), { maxZoom: 10, padding: [40, 40] });
      }
    });
  }
}

/** Centre the map on a utility and open its detail card. */
export function focusUtility(id) {
  setSelection({ id });
  const props = selected && selected.feature.properties;
  return props;
}

export function getSelected() {
  return selected ? selected.feature.properties : null;
}

export function getMap() {
  return map;
}

export function restyle() {
  if (!territories) return;
  territories.setStyle((f) => rateStyle(f.properties, current));
  // tooltip text and map labels both embed the current rate, so they are
  // rebuilt whenever the assumptions change
  territories.eachLayer((l) => {
    if (l.getTooltip && l.feature) l.setTooltipContent(tooltipHtml(l.feature.properties));
  });
  if (sourceGeojson) addLabels(sourceGeojson);
}

export { map, colorForRate, labelStyle };
