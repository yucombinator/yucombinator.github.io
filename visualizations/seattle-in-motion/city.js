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
      "radius": 1.7
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
      "radius": 2.3
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
  "storageKey": "sea",
  "railModes": [
    "lrt",
    "gorail",
    "up"
  ],
  "brandedModes": [
    "gorail",
    "up"
  ]
};
