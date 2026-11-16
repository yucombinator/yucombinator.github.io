/* Per-city configuration for the shared In Motion engine. */
window.MOTION_CONFIG = {
  "slug": "calgary-in-motion",
  "accent": "#ff7a5c",
  "timeZone": "America/Edmonton",
  "zoneLabel": "MT",
  "camera": [
    -114.0719,
    51.0447,
    10.2
  ],
  "inBounds": [
    -116.3,
    50.6,
    -113.2,
    51.6
  ],
  "modes": [
    {
      "key": "lrt",
      "label": "CTrain",
      "color": "#d22630",
      "radius": 2.4,
      "lineWidth": 2.4,
      "lineAlpha": "a8"
    },
    {
      "key": "brt",
      "label": "MAX",
      "color": "#7b2d8e",
      "radius": 1.7,
      "lineWidth": 0.9,
      "lineAlpha": "24"
    },
    {
      "key": "localbus",
      "label": "Bus",
      "color": "#6b7280",
      "radius": 1.35
    },
    {
      "key": "regionalbus",
      "label": "Regional bus",
      "color": "#0b5cad",
      "radius": 1.45
    }
  ],
  "busModes": [
    "localbus",
    "regionalbus"
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
    "localbus": 20.0,
    "regionalbus": 30.0
  },
  "storageKey": "yyc",
  "liveUrls": [
    "https://calgary-live.seattle-live.workers.dev/live.json"
  ],
  "legend": [
    {
      "mode": "lrt",
      "title": "CTrain \u2014 Red and Blue lines",
      "swatches": [
        "#d22630",
        "#0f6fbf"
      ],
      "label": "CTrain"
    },
    {
      "mode": "brt",
      "title": "MAX bus rapid transit",
      "tipId": "brtTip",
      "tip": [
        {
          "color": "#00a651",
          "text": "MAX Green"
        },
        {
          "color": "#f58220",
          "text": "MAX Orange"
        },
        {
          "color": "#ffc72c",
          "text": "MAX Yellow"
        },
        {
          "color": "#009ca6",
          "text": "MAX Teal"
        },
        {
          "color": "#7b2d8e",
          "text": "MAX Purple"
        },
        {
          "color": "#b5121b",
          "text": "BRT Southeast"
        }
      ],
      "swatches": [
        "#00a651",
        "#7b2d8e",
        "#f58220"
      ],
      "label": "MAX"
    },
    {
      "mode": "localbus",
      "title": "Calgary Transit buses",
      "dot": "#6b7280",
      "label": "Bus"
    },
    {
      "mode": "regionalbus",
      "title": "Regional buses \u2014 Airdrie, Cochrane, Falcon and Roam (approximate)",
      "tipId": "regionalTip",
      "tip": [
        {
          "color": "#0b5cad",
          "text": "Airdrie Transit"
        },
        {
          "color": "#2e7d32",
          "text": "Cochrane COLT"
        },
        {
          "color": "#d64123",
          "text": "Falcon Bus"
        },
        {
          "color": "#e87722",
          "text": "Roam Transit"
        }
      ],
      "dot": "#0b5cad",
      "label": "Regional"
    }
  ]
};
