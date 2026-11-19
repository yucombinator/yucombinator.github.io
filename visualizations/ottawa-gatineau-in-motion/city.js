/* Per-city configuration for the shared In Motion engine. */
window.MOTION_CONFIG = {
  "slug": "ottawa-gatineau-in-motion",
  "accent": "#e4002b",
  "timeZone": "America/Toronto",
  "zoneLabel": "ET",
  "camera": [
    -75.6972,
    45.4215,
    10.2
  ],
  "inBounds": [
    -76.6,
    44.8,
    -74.9,
    46.0
  ],
  "modes": [
    {
      "key": "lrt",
      "label": "O-Train",
      "color": "#d30f1d",
      "radius": 2.4,
      "lineWidth": 2.4,
      "lineAlpha": "a8"
    },
    {
      "key": "brt",
      "label": "Rapibus",
      "color": "#8e44ad",
      "radius": 1.7,
      "lineWidth": 0.9,
      "lineAlpha": "24"
    },
    {
      "key": "localbus",
      "label": "Bus",
      "color": "#0057b8",
      "radius": 1.35
    }
  ],
  "busModes": [
    "localbus"
  ],
  "trainModes": [
    "lrt"
  ],
  "railModes": [
    "lrt"
  ],
  "brandedModes": [
    "lrt"
  ],
  "speedUnit": "km/h",
  "dwellSeconds": {
    "lrt": 25.0,
    "brt": 20.0,
    "localbus": 20.0
  },
  "storageKey": "yow",
  "legend": [
    {
      "mode": "lrt",
      "title": "O-Train — Lines 1, 2 and 4",
      "swatches": [
        "#d30f1d",
        "#508128",
        "#0980a5"
      ],
      "label": "O-Train"
    },
    {
      "mode": "brt",
      "title": "STO Rapibus",
      "dot": "#8e44ad",
      "label": "Rapibus"
    },
    {
      "mode": "localbus",
      "title": "Buses",
      "tipId": "busTip",
      "tip": [
        {
          "color": "#0057b8",
          "text": "OC Transpo"
        },
        {
          "color": "#00a19a",
          "text": "STO"
        }
      ],
      "dot": "#0057b8",
      "label": "Bus"
    }
  ]
};
