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
      "label": "Bus"
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
  "liveUrls": [
    "https://toronto-live.seattle-live.workers.dev/live.json"
  ],
  "future": [
    {
      "id": "ontario-line",
      "name": "Ontario Line",
      "mode": "train",
      "modeLabel": "Subway",
      "status": "under construction",
      "opening": "2031 target",
      "headwayMin": 3,
      "travelMin": 35,
      "color": "#b06cff",
      "shape": [[-79.418,43.636],[-79.404,43.641],[-79.396,43.645],[-79.387,43.650],[-79.379,43.653],[-79.369,43.656],[-79.360,43.658],[-79.350,43.661],[-79.344,43.668],[-79.339,43.700],[-79.339,43.719]]
    },
    {
      "id": "scarborough-extension",
      "name": "Scarborough Subway Extension",
      "mode": "train",
      "modeLabel": "Subway",
      "status": "under construction",
      "opening": "2030 target",
      "headwayMin": 5,
      "travelMin": 15,
      "color": "#5c8dff",
      "shape": [[-79.263,43.732],[-79.263,43.750],[-79.257,43.773],[-79.257,43.776]]
    },
    {
      "id": "eglinton-west",
      "name": "Eglinton Crosstown West Extension",
      "mode": "lrt",
      "modeLabel": "LRT",
      "status": "under construction",
      "opening": "2031 target",
      "headwayMin": 4,
      "travelMin": 25,
      "color": "#d65cc8",
      "shape": [[-79.486,43.688],[-79.500,43.686],[-79.530,43.680],[-79.560,43.670],[-79.586,43.657]]
    },
    {
      "id": "yonge-north",
      "name": "Yonge North Subway Extension",
      "mode": "train",
      "modeLabel": "Subway",
      "status": "under construction",
      "opening": "2032 target",
      "headwayMin": 4,
      "travelMin": 20,
      "color": "#4cc9f0",
      "shape": [[-79.415,43.780],[-79.415,43.786],[-79.415,43.800],[-79.400,43.820],[-79.382,43.842]]
    },
    {
      "id": "hamilton-lrt",
      "name": "Hamilton LRT",
      "mode": "lrt",
      "modeLabel": "LRT",
      "status": "under construction",
      "opening": "2030 target",
      "headwayMin": 5,
      "travelMin": 25,
      "color": "#e0a33a",
      "shape": [[-79.919,43.262],[-79.900,43.260],[-79.870,43.255],[-79.830,43.243],[-79.799,43.238]]
    },
    {
      "id": "durham-scarborough-brt",
      "name": "Durham–Scarborough Bus Rapid Transit",
      "mode": "brt",
      "modeLabel": "BRT",
      "status": "under construction",
      "opening": "2028 target",
      "headwayMin": 8,
      "travelMin": 35,
      "color": "#ff7a59",
      "shape": [[-79.257,43.773],[-79.200,43.800],[-79.130,43.820],[-79.086,43.835],[-79.020,43.850]]
    },
    {
      "id": "hurontario-line-10",
      "name": "Hurontario–Main Line 10 LRT",
      "mode": "lrt",
      "modeLabel": "LRT",
      "status": "under construction",
      "opening": "TBD (delayed)",
      "headwayMin": 5,
      "travelMin": 40,
      "color": "#ff6b9a",
      "shape": [[-79.586,43.555],[-79.600,43.570],[-79.640,43.590],[-79.690,43.620],[-79.720,43.650],[-79.750,43.690],[-79.760,43.715]]
    },
    {
      "id": "waterfront-east-lrt",
      "name": "Waterfront East LRT",
      "mode": "lrt",
      "modeLabel": "LRT",
      "status": "in design",
      "opening": "TBD",
      "headwayMin": 5,
      "travelMin": 15,
      "color": "#5cc9c0",
      "shape": [[-79.380,43.645],[-79.374,43.643],[-79.360,43.643],[-79.350,43.645],[-79.340,43.648],[-79.330,43.655]]
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
