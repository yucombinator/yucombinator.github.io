/* Per-city configuration for the shared In Motion engine. */
window.MOTION_CONFIG = {
  "slug": "vancouver-in-motion",
  "accent": "#6fe0a4",
  "timeZone": "America/Vancouver",
  "zoneLabel": "PST",
  "camera": [
    -123.1,
    49.27,
    10.4
  ],
  "inBounds": [
    -124.4,
    48.6,
    -120.9,
    50.7
  ],
  "modes": [
    {
      "key": "brt",
      "label": "BRT",
      "color": "#d7263d",
      "radius": 1.7
    },
    {
      "key": "ferry",
      "label": "SeaBus",
      "color": "#746661",
      "radius": 2.2
    },
    {
      "key": "gorail",
      "label": "West Coast Express",
      "color": "#87189d",
      "radius": 2.5
    },
    {
      "key": "localbus",
      "label": "Bus",
      "color": "#0072bc",
      "radius": 1.35
    },
    {
      "key": "subway",
      "label": "SkyTrain",
      "color": "#0033a0",
      "radius": 2.7
    }
  ],
  "busModes": [
    "localbus",
    "gobus"
  ],
  "trainModes": [
    "gorail",
    "up"
  ],
  "dwellSeconds": {
    "subway": 20.0,
    "lrt": 20.0,
    "gorail": 45.0,
    "up": 30.0,
    "ferry": 120.0
  },
  "legend": [
    {
      "mode": "subway",
      "title": "SkyTrain — Expo, Millennium and Canada lines",
      "swatches": [
        "#0033a0",
        "#ffcd00",
        "#007c9f"
      ],
      "label": "SkyTrain"
    },
    {
      "mode": "gorail",
      "title": "West Coast Express",
      "dot": "#87189d",
      "label": "West Coast Express"
    },
    {
      "mode": "localbus",
      "title": "TransLink and BC Transit buses",
      "tipId": "busTip",
      "tip": [
        {
          "color": "#0072bc",
          "text": "TransLink bus"
        },
        {
          "color": "#c96a2a",
          "text": "BC Transit",
          "em": "Fraser Valley"
        },
        {
          "color": "#2e9e6b",
          "text": "BC Transit",
          "em": "Squamish"
        },
        {
          "color": "#7b4fd0",
          "text": "BC Transit",
          "em": "Whistler"
        },
        {
          "color": "#b0873a",
          "text": "BC Transit",
          "em": "Pemberton"
        },
        {
          "color": "#1f8a9e",
          "text": "BC Transit",
          "em": "Sunshine Coast"
        }
      ],
      "swatches": [
        "#0072bc",
        "#c96a2a"
      ],
      "label": "Bus"
    },
    {
      "mode": "brt",
      "title": "RapidBus R1–R6 and the 99 B-Line",
      "swatches": [
        "#008522",
        "#d04110"
      ],
      "label": "BRT"
    },
    {
      "mode": "ferry",
      "title": "SeaBus, BC Ferries and Aquabus",
      "tipId": "ferryTip",
      "tip": [
        {
          "color": "#746661",
          "text": "SeaBus"
        },
        {
          "color": "#1b4f8f",
          "text": "BC Ferries",
          "em": "mainland routes"
        },
        {
          "color": "#e5a50a",
          "text": "Aquabus",
          "em": "False Creek"
        },
        {
          "color": "#ff6a3d",
          "text": "Hullo",
          "em": "Nanaimo fast ferry"
        },
        {
          "color": "#2b6cb0",
          "text": "False Creek Ferries",
          "em": "approximate"
        }
      ],
      "dot": "#746661",
      "label": "Ferry"
    }
  ]
};
