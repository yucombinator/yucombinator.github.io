/* Per-city configuration for the shared In Motion engine. */
window.MOTION_CONFIG = {
  "slug": "toronto-in-motion",
  "accent": "#f5c26b",
  "timeZone": "America/Toronto",
  "zoneLabel": "EST",
  "camera": [
    -79.383,
    43.653,
    9.8
  ],
  "inBounds": [
    -86.0,
    40.5,
    -73.0,
    48.5
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
      "label": "Ferry",
      "color": "#1f8a9e",
      "radius": 2.2
    },
    {
      "key": "gobus",
      "label": "GO bus",
      "color": "#5aa93f",
      "radius": 1.9
    },
    {
      "key": "gorail",
      "label": "GO train",
      "color": "#00853e",
      "radius": 2.5
    },
    {
      "key": "localbus",
      "label": "Bus",
      "color": "#5aa9e6",
      "radius": 1.35
    },
    {
      "key": "lrt",
      "label": "LRT",
      "color": "#f87005",
      "radius": 2.3
    },
    {
      "key": "streetcar",
      "label": "Streetcar",
      "color": "#da251d",
      "radius": 2.0
    },
    {
      "key": "subway",
      "label": "Subway",
      "color": "#f8c302",
      "radius": 2.7
    },
    {
      "key": "up",
      "label": "UP Express",
      "color": "#0075d2",
      "radius": 2.5
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
    "up": 30.0
  },
  "legend": [
    {
      "mode": "subway",
      "title": "TTC Line 1, Line 2, Line 4",
      "swatches": [
        "#f8c302",
        "#16a753",
        "#b32078"
      ],
      "label": "Subway"
    },
    {
      "mode": "streetcar",
      "title": "TTC streetcars",
      "dot": "#da251d",
      "label": "Streetcar"
    },
    {
      "mode": "lrt",
      "title": "Line 5, Line 6, ION",
      "swatches": [
        "#f87005",
        "#8a999a",
        "#00b3b0"
      ],
      "label": "LRT"
    },
    {
      "mode": "gorail",
      "title": "GO Transit trains",
      "swatches": [
        "#98002e",
        "#00853e",
        "#003767",
        "#f57f25"
      ],
      "label": "GO train"
    },
    {
      "mode": "gobus",
      "title": "GO Transit buses",
      "dot": "#5aa93f",
      "label": "GO bus"
    },
    {
      "mode": "localbus",
      "title": "TTC, MiWay, Brampton, YRT, Durham, Oakville, Burlington, HSR, GRT, Guelph, Barrie, Milton, Simcoe County LINX, Orangeville, Lindsay, Orillia, Mid-Pen, Niagara Region",
      "twoCol": true,
      "tipId": "busTip",
      "tip": [
        {
          "color": "#5aa9e6",
          "text": "TTC bus"
        },
        {
          "color": "#2f6fd0",
          "text": "MiWay"
        },
        {
          "color": "#e07b39",
          "text": "Brampton"
        },
        {
          "color": "#8a4fb5",
          "text": "YRT"
        },
        {
          "color": "#12a5b0",
          "text": "Durham RT"
        },
        {
          "color": "#3f8f6b",
          "text": "Oakville"
        },
        {
          "color": "#c9a227",
          "text": "Burlington"
        },
        {
          "color": "#c2456b",
          "text": "HSR"
        },
        {
          "color": "#00838f",
          "text": "GRT"
        },
        {
          "color": "#8d6e63",
          "text": "Guelph"
        },
        {
          "color": "#546e7a",
          "text": "Barrie"
        },
        {
          "color": "#7fa650",
          "text": "Milton"
        },
        {
          "color": "#b06fd0",
          "text": "Simcoe LINX"
        },
        {
          "color": "#d0563a",
          "text": "Orangeville"
        },
        {
          "color": "#4f8fd0",
          "text": "Lindsay"
        },
        {
          "color": "#c26b3f",
          "text": "Orillia"
        },
        {
          "color": "#7b8f3a",
          "text": "Mid-Pen"
        },
        {
          "color": "#c04fa0",
          "text": "Niagara Region"
        }
      ],
      "swatches": [
        "#2f6fd0",
        "#e07b39",
        "#8a4fb5",
        "#12a5b0"
      ],
      "label": "Local bus"
    },
    {
      "mode": "brt",
      "title": "Züm, Viva and PULSE rapid transit",
      "tipId": "brtTip",
      "tip": [
        {
          "color": "#f0a574",
          "text": "Brampton",
          "em": "Züm"
        },
        {
          "color": "#4fc6ce",
          "text": "Durham",
          "em": "PULSE"
        },
        {
          "color": "#b07fd8",
          "text": "YRT",
          "em": "Viva"
        }
      ],
      "swatches": [
        "#f0a574",
        "#4fc6ce",
        "#b07fd8"
      ],
      "label": "BRT"
    },
    {
      "mode": "up",
      "title": "UP Express",
      "dot": "#0075d2",
      "label": "UP"
    },
    {
      "mode": "ferry",
      "title": "Toronto Island Ferry",
      "dot": "#1f8a9e",
      "label": "Ferry"
    }
  ],
  "storageKey": "tim",
  "railModes": [
    "subway",
    "lrt",
    "gorail",
    "up"
  ],
  "brandedModes": [
    "gorail",
    "up"
  ]
};
