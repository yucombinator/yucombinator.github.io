/* Per-city configuration for the shared In Motion engine. */
window.MOTION_CONFIG = {
  "slug": "seattle-in-motion",
  "accent": "#6aa9ff",
  "timeZone": "America/Los_Angeles",
  "zoneLabel": "PT",
  "camera": [
    -122.335,
    47.606,
    10.4
  ],
  "inBounds": [
    -123.4,
    46.7,
    -120.9,
    49.0
  ],
  "modes": [
    {
      "key": "brt",
      "label": "BRT",
      "color": "#d7263d",
      "radius": 1.7,
      "lineWidth": 0.9,
      "lineAlpha": "24"
    },
    {
      "key": "ferry",
      "label": "Ferry",
      "color": "#1b4f8f",
      "radius": 2.2
    },
    {
      "key": "gorail",
      "label": "Sounder",
      "color": "#9ab6d3",
      "radius": 2.5
    },
    {
      "key": "localbus",
      "label": "Bus",
      "color": "#2f6db3",
      "radius": 1.35
    },
    {
      "key": "lrt",
      "label": "Link light rail",
      "color": "#28813f",
      "radius": 2.3,
      "lineWidth": 2.4,
      "lineAlpha": "a8"
    },
    {
      "key": "streetcar",
      "label": "Streetcar",
      "color": "#f47836",
      "radius": 2.0
    },
    {
      "key": "up",
      "label": "Monorail",
      "color": "#d24b8f",
      "radius": 2.5
    }
  ],
  "busModes": [
    "localbus"
  ],
  "trainModes": [
    "lrt",
    "gorail",
    "up"
  ],
  "dwellSeconds": {
    "lrt": 20.0,
    "gorail": 45.0,
    "up": 30.0,
    "ferry": 120.0
  },
  "legend": [
    {
      "mode": "streetcar",
      "title": "South Lake Union and First Hill streetcars",
      "dot": "#f47836",
      "label": "Streetcar"
    },
    {
      "mode": "lrt",
      "title": "Link — 1, 2 and T Lines",
      "swatches": [
        "#28813f",
        "#007cad",
        "#f38b00"
      ],
      "label": "Link"
    },
    {
      "mode": "gorail",
      "title": "Sounder commuter rail",
      "dot": "#9ab6d3",
      "label": "Sounder"
    },
    {
      "mode": "localbus",
      "title": "Metro, Sound Transit, Pierce, Community, Everett, Kitsap and Intercity buses",
      "tipId": "busTip",
      "tip": [
        {
          "color": "#2f6db3",
          "text": "King County Metro"
        },
        {
          "color": "#007a53",
          "text": "Sound Transit"
        },
        {
          "color": "#a03b7a",
          "text": "Pierce Transit"
        },
        {
          "color": "#8b5cf6",
          "text": "Community Transit"
        },
        {
          "color": "#b35b1f",
          "text": "Everett Transit"
        },
        {
          "color": "#0e7c86",
          "text": "Kitsap Transit"
        },
        {
          "color": "#6a9a2c",
          "text": "Intercity Transit"
        }
      ],
      "swatches": [
        "#2f6db3",
        "#007a53",
        "#a03b7a",
        "#8b5cf6"
      ],
      "label": "Bus"
    },
    {
      "mode": "brt",
      "title": "RapidRide, Swift, Stride and Stream bus rapid transit",
      "tipId": "brtTip",
      "tip": [
        {
          "color": "#5b93d6",
          "text": "King County Metro",
          "em": "RapidRide"
        },
        {
          "color": "#b18cff",
          "text": "Community Transit",
          "em": "Swift"
        },
        {
          "color": "#d063a6",
          "text": "Pierce Transit",
          "em": "Stream"
        },
        {
          "color": "#4fb37f",
          "text": "Sound Transit",
          "em": "Stride"
        }
      ],
      "swatches": [
        "#5b93d6",
        "#b18cff",
        "#d063a6",
        "#4fb37f"
      ],
      "label": "BRT"
    },
    {
      "mode": "up",
      "title": "Seattle Center Monorail",
      "dot": "#d24b8f",
      "label": "Monorail"
    },
    {
      "mode": "ferry",
      "title": "Washington State Ferries, Kitsap fast ferries, Metro water taxis",
      "tipId": "ferryTip",
      "tip": [
        {
          "color": "#79d6a5",
          "text": "Washington State Ferries"
        },
        {
          "color": "#0070c0",
          "text": "Kitsap",
          "em": "fast ferries"
        },
        {
          "color": "#4298cc",
          "text": "Metro",
          "em": "water taxis"
        }
      ],
      "dot": "#79d6a5",
      "label": "Ferry"
    }
  ],
  "liveUrls": [
    "https://seattle-live.seattle-live.workers.dev/live.json"
  ],
  "future": [
    {
      "id": "stride-s1",
      "name": "Stride S1",
      "mode": "brt",
      "modeLabel": "BRT",
      "status": "under construction",
      "opening": "2028 target",
      "headwayMin": 10,
      "travelMin": 45,
      "color": "#ffb347",
      "shape": [[-122.201,47.615],[-122.207,47.580],[-122.218,47.540],[-122.220,47.500],[-122.240,47.475],[-122.280,47.465],[-122.330,47.470]]
    },
    {
      "id": "stride-s2",
      "name": "Stride S2",
      "mode": "brt",
      "modeLabel": "BRT",
      "status": "under construction",
      "opening": "2028 target",
      "headwayMin": 10,
      "travelMin": 45,
      "color": "#ff8a5c",
      "shape": [[-122.310,47.816],[-122.290,47.800],[-122.250,47.780],[-122.200,47.750],[-122.190,47.700],[-122.190,47.660],[-122.200,47.615]]
    },
    {
      "id": "stride-s3",
      "name": "Stride S3",
      "mode": "brt",
      "modeLabel": "BRT",
      "status": "under construction",
      "opening": "2028 target",
      "headwayMin": 10,
      "travelMin": 30,
      "color": "#ffd166",
      "shape": [[-122.330,47.750],[-122.300,47.750],[-122.250,47.760],[-122.200,47.760]]
    },
    {
      "id": "rapidride-j",
      "name": "RapidRide J Line",
      "mode": "brt",
      "modeLabel": "BRT",
      "status": "under construction",
      "opening": "2027 target",
      "headwayMin": 8,
      "travelMin": 25,
      "color": "#ff5d8f",
      "shape": [[-122.332,47.606],[-122.328,47.620],[-122.325,47.640],[-122.313,47.661]]
    },
    {
      "id": "west-seattle-link",
      "name": "West Seattle Link Extension",
      "mode": "train",
      "modeLabel": "Link light rail",
      "status": "in design",
      "opening": "2032 target",
      "headwayMin": 5,
      "travelMin": 15,
      "color": "#7b8cff",
      "shape": [[-122.328,47.598],[-122.333,47.583],[-122.345,47.565],[-122.360,47.558],[-122.387,47.561]]
    },
    {
      "id": "ballard-link",
      "name": "Ballard Link Extension",
      "mode": "train",
      "modeLabel": "Link light rail",
      "status": "in design",
      "opening": "2039 target",
      "headwayMin": 5,
      "travelMin": 20,
      "color": "#c06ad6",
      "shape": [[-122.332,47.606],[-122.340,47.620],[-122.360,47.635],[-122.380,47.655],[-122.386,47.668]]
    },
    {
      "id": "everett-link",
      "name": "Everett Link Extension",
      "mode": "train",
      "modeLabel": "Link light rail",
      "status": "in design",
      "opening": "2036 target",
      "headwayMin": 6,
      "travelMin": 30,
      "color": "#4cc9f0",
      "shape": [[-122.310,47.816],[-122.290,47.860],[-122.250,47.910],[-122.220,47.950],[-122.200,47.977]]
    },
    {
      "id": "tacoma-dome-link",
      "name": "Tacoma Dome Link Extension",
      "mode": "train",
      "modeLabel": "Link light rail",
      "status": "under construction",
      "opening": "2030 target",
      "headwayMin": 6,
      "travelMin": 20,
      "color": "#ff8a5c",
      "shape": [[-122.304393,47.313895],[-122.299748,47.311440],[-122.300084,47.310606],[-122.306428,47.292427],[-122.309707,47.282410],[-122.316971,47.271615],[-122.327158,47.261351],[-122.334680,47.246365]]
    }
  ],
  "storageKey": "sea",
  "railModes": [
    "lrt",
    "gorail",
    "up"
  ],
  "interlineModes": [
    "lrt"
  ],
  "brandedModes": [
    "gorail",
    "up"
  ]
};
