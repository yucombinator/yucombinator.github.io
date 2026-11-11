/* Per-city configuration for the shared In Motion engine. */
window.MOTION_CONFIG = {
  "slug": "san-francisco-in-motion",
  "accent": "#f2c94c",
  "timeZone": "America/Los_Angeles",
  "zoneLabel": "PT",
  "camera": [-122.4194, 37.7749, 11.2],
  "inBounds": [-123.3, 37.1, -121.4, 38.6],
  "modes": [
    {
      "key": "subway",
      "label": "BART",
      "color": "#f2c94c",
      "radius": 2.7
    },
    {
      "key": "lrt",
      "label": "Muni Metro",
      "color": "#d7263d",
      "radius": 2.3
    },
    {
      "key": "streetcar",
      "label": "Streetcar",
      "color": "#f28e2b",
      "radius": 2.0
    },
    {
      "key": "localbus",
      "label": "Muni bus",
      "color": "#2f6db3",
      "radius": 1.35
    },
    {
      "key": "gorail",
      "label": "Caltrain",
      "color": "#e31837",
      "radius": 2.5
    }
  ],
  "busModes": ["localbus"],
  "trainModes": ["subway", "gorail"],
  "railModes": ["subway", "lrt", "streetcar", "gorail"],
  "brandedModes": [],
  "dwellSeconds": {
    "subway": 20.0,
    "lrt": 20.0,
    "streetcar": 20.0,
    "gorail": 45.0
  },
  "storageKey": "sf",
  "legend": [
    {
      "mode": "subway",
      "title": "BART",
      "swatches": ["#ffff33", "#0099cc", "#ff9933", "#e10529"],
      "label": "BART"
    },
    {
      "mode": "lrt",
      "title": "Muni Metro",
      "dot": "#d7263d",
      "label": "Muni Metro"
    },
    {
      "mode": "streetcar",
      "title": "Muni historic streetcars and cable cars",
      "dot": "#f28e2b",
      "label": "Streetcar"
    },
    {
      "mode": "localbus",
      "title": "Muni buses",
      "dot": "#2f6db3",
      "label": "Muni bus"
    },
    {
      "mode": "gorail",
      "title": "Caltrain",
      "dot": "#e31837",
      "label": "Caltrain"
    }
  ]
};
