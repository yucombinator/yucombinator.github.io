/* Per-city configuration for the shared In Motion engine. */
window.MOTION_CONFIG = {
  "slug": "vancouver-in-motion",
  "accent": "#6fe0a4",
  "timeZone": "America/Vancouver",
  "zoneLabel": "PT",
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
    "localbus"
  ],
  "trainModes": [
    "gorail"
  ],
  "dwellSeconds": {
    "subway": 20.0,
    "gorail": 45.0,
    "ferry": 120.0
  },
  "legend": [
    {
      "mode": "subway",
      "title": "SkyTrain \u2014 Expo, Millennium and Canada lines",
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
      "title": "RapidBus R1\u2013R6 and the 99 B-Line",
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
  ],
  "future": [
    {
      "id": "broadway-subway",
      "name": "Broadway Subway",
      "mode": "lrt",
      "modeLabel": "SkyTrain extension",
      "status": "under construction",
      "opening": "2027 target",
      "headwayMin": 3,
      "travelMin": 15,
      "color": "#7b8cff",
      "shape": [
        [
          -123.08195,
          49.266311
        ],
        [
          -123.089205,
          49.267741
        ],
        [
          -123.092495,
          49.26828
        ],
        [
          -123.093468,
          49.268233
        ],
        [
          -123.094018,
          49.268003
        ],
        [
          -123.096807,
          49.266047
        ],
        [
          -123.097067,
          49.264264
        ],
        [
          -123.097565,
          49.263499
        ],
        [
          -123.098342,
          49.263111
        ],
        [
          -123.099422,
          49.262923
        ],
        [
          -123.154404,
          49.263958
        ]
      ]
    },
    {
      "id": "surrey-langley",
      "name": "Surrey Langley SkyTrain",
      "mode": "train",
      "modeLabel": "SkyTrain extension",
      "status": "under construction",
      "opening": "2029 target",
      "headwayMin": 6,
      "travelMin": 35,
      "color": "#35b6a4",
      "shape": [
        [
          -122.840363,
          49.181126
        ],
        [
          -122.805946,
          49.167855
        ],
        [
          -122.803872,
          49.167332
        ],
        [
          -122.801624,
          49.166487
        ],
        [
          -122.797556,
          49.164727
        ],
        [
          -122.761178,
          49.150674
        ],
        [
          -122.760149,
          49.150218
        ],
        [
          -122.758507,
          49.149095
        ],
        [
          -122.75244,
          49.145906
        ],
        [
          -122.741818,
          49.141255
        ],
        [
          -122.738456,
          49.139597
        ],
        [
          -122.727319,
          49.13483
        ],
        [
          -122.72326,
          49.132327
        ],
        [
          -122.722035,
          49.131927
        ],
        [
          -122.719093,
          49.131333
        ],
        [
          -122.715008,
          49.130024
        ],
        [
          -122.711353,
          49.128478
        ],
        [
          -122.704129,
          49.124936
        ],
        [
          -122.69489,
          49.12094
        ],
        [
          -122.689729,
          49.11837
        ],
        [
          -122.68087,
          49.114508
        ],
        [
          -122.679387,
          49.114122
        ],
        [
          -122.677012,
          49.1131
        ],
        [
          -122.675189,
          49.112569
        ],
        [
          -122.67142,
          49.110926
        ],
        [
          -122.668329,
          49.10999
        ],
        [
          -122.658555,
          49.10613
        ]
      ]
    }
  ],
  "storageKey": "van",
  "railModes": [
    "subway",
    "gorail"
  ],
  "brandedModes": [
    "gorail"
  ],
  "ferryLabels": [
    {
      "match": "seabus",
      "label": "SeaBus"
    },
    {
      "match": "aquabus",
      "label": "Aquabus"
    },
    {
      "match": "^",
      "label": "Ferry"
    }
  ]
};
