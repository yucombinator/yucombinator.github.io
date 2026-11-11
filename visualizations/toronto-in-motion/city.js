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
  "speedUnit": "km/h",
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
      "round": true,
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
      "title": "Z\u00fcm, Viva and PULSE rapid transit",
      "tipId": "brtTip",
      "tip": [
        {
          "color": "#f0a574",
          "text": "Brampton",
          "em": "Z\u00fcm"
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
      "shape": [
        [
          -79.425007,
          43.63448
        ],
        [
          -79.420421,
          43.63591
        ],
        [
          -79.408062,
          43.639107
        ],
        [
          -79.406269,
          43.63978
        ],
        [
          -79.404779,
          43.640704
        ],
        [
          -79.403589,
          43.641855
        ],
        [
          -79.400141,
          43.647216
        ],
        [
          -79.399266,
          43.647849
        ],
        [
          -79.398178,
          43.648283
        ],
        [
          -79.375402,
          43.653151
        ],
        [
          -79.372162,
          43.65406
        ],
        [
          -79.368334,
          43.654815
        ],
        [
          -79.366633,
          43.654618
        ],
        [
          -79.365252,
          43.653895
        ],
        [
          -79.364607,
          43.653133
        ],
        [
          -79.363457,
          43.65057
        ],
        [
          -79.362695,
          43.649866
        ],
        [
          -79.361281,
          43.649507
        ],
        [
          -79.358065,
          43.649552
        ],
        [
          -79.356515,
          43.650078
        ],
        [
          -79.351057,
          43.652978
        ],
        [
          -79.348512,
          43.654659
        ],
        [
          -79.347398,
          43.655737
        ],
        [
          -79.346599,
          43.656774
        ],
        [
          -79.346142,
          43.657786
        ],
        [
          -79.345645,
          43.661569
        ],
        [
          -79.344981,
          43.663679
        ],
        [
          -79.343708,
          43.666127
        ],
        [
          -79.341606,
          43.668937
        ],
        [
          -79.341276,
          43.670359
        ],
        [
          -79.343038,
          43.674982
        ],
        [
          -79.343639,
          43.678017
        ],
        [
          -79.344353,
          43.680122
        ],
        [
          -79.344909,
          43.68132
        ],
        [
          -79.346214,
          43.682848
        ],
        [
          -79.347285,
          43.68562
        ],
        [
          -79.348953,
          43.689169
        ],
        [
          -79.350211,
          43.693035
        ],
        [
          -79.352898,
          43.699986
        ],
        [
          -79.353082,
          43.701234
        ],
        [
          -79.352526,
          43.702607
        ],
        [
          -79.349073,
          43.706108
        ],
        [
          -79.349002,
          43.706819
        ],
        [
          -79.349663,
          43.708737
        ],
        [
          -79.349443,
          43.709434
        ],
        [
          -79.348866,
          43.710019
        ],
        [
          -79.34755,
          43.710494
        ],
        [
          -79.337932,
          43.712288
        ],
        [
          -79.337274,
          43.712531
        ],
        [
          -79.336659,
          43.713091
        ],
        [
          -79.336532,
          43.713981
        ],
        [
          -79.338268,
          43.718116
        ],
        [
          -79.338392,
          43.720455
        ],
        [
          -79.33945,
          43.72413
        ]
      ]
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
      "shape": [
        [
          -79.258961,
          43.791258
        ],
        [
          -79.256329,
          43.784886
        ],
        [
          -79.254874,
          43.782067
        ],
        [
          -79.253503,
          43.777597
        ],
        [
          -79.251817,
          43.773277
        ],
        [
          -79.251324,
          43.771391
        ],
        [
          -79.24568,
          43.756903
        ],
        [
          -79.245435,
          43.755191
        ],
        [
          -79.244502,
          43.75277
        ],
        [
          -79.24451,
          43.749781
        ],
        [
          -79.244706,
          43.745444
        ],
        [
          -79.245553,
          43.741203
        ],
        [
          -79.245593,
          43.73874
        ],
        [
          -79.246032,
          43.737721
        ],
        [
          -79.246466,
          43.737285
        ],
        [
          -79.247779,
          43.736769
        ],
        [
          -79.258791,
          43.73442
        ],
        [
          -79.261302,
          43.733359
        ]
      ]
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
      "shape": [
        [
          -79.488023,
          43.687543
        ],
        [
          -79.501396,
          43.684235
        ],
        [
          -79.503207,
          43.684351
        ],
        [
          -79.505484,
          43.68482
        ],
        [
          -79.507036,
          43.684861
        ],
        [
          -79.510834,
          43.684324
        ],
        [
          -79.514178,
          43.683618
        ],
        [
          -79.520642,
          43.683396
        ],
        [
          -79.522896,
          43.683121
        ],
        [
          -79.539391,
          43.679796
        ],
        [
          -79.562657,
          43.674562
        ],
        [
          -79.567769,
          43.674011
        ],
        [
          -79.570863,
          43.672373
        ],
        [
          -79.573563,
          43.671592
        ],
        [
          -79.57756,
          43.670763
        ],
        [
          -79.581802,
          43.670299
        ],
        [
          -79.58619,
          43.669072
        ],
        [
          -79.58725,
          43.668403
        ],
        [
          -79.588676,
          43.666283
        ],
        [
          -79.591524,
          43.663532
        ]
      ]
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
      "shape": [
        [
          -79.416541,
          43.78431
        ],
        [
          -79.422503,
          43.807924
        ],
        [
          -79.426197,
          43.824101
        ],
        [
          -79.425816,
          43.824887
        ],
        [
          -79.425049,
          43.825356
        ],
        [
          -79.416759,
          43.827286
        ],
        [
          -79.415498,
          43.827814
        ],
        [
          -79.414834,
          43.828575
        ],
        [
          -79.414852,
          43.829405
        ],
        [
          -79.416049,
          43.830908
        ],
        [
          -79.421546,
          43.836111
        ],
        [
          -79.42601,
          43.841209
        ],
        [
          -79.427493,
          43.843079
        ],
        [
          -79.428325,
          43.845657
        ]
      ]
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
      "shape": [
        [
          -79.890415,
          43.260111
        ],
        [
          -79.888934,
          43.25984
        ],
        [
          -79.887986,
          43.262016
        ],
        [
          -79.887728,
          43.262107
        ],
        [
          -79.878893,
          43.2594
        ],
        [
          -79.869259,
          43.256732
        ],
        [
          -79.859218,
          43.253499
        ],
        [
          -79.854211,
          43.252722
        ],
        [
          -79.843913,
          43.251463
        ],
        [
          -79.834987,
          43.251126
        ],
        [
          -79.833276,
          43.250456
        ],
        [
          -79.82927,
          43.248421
        ],
        [
          -79.827763,
          43.247311
        ],
        [
          -79.824951,
          43.244315
        ],
        [
          -79.823891,
          43.243533
        ],
        [
          -79.814774,
          43.241401
        ],
        [
          -79.809673,
          43.240381
        ],
        [
          -79.802184,
          43.238345
        ],
        [
          -79.801519,
          43.238061
        ],
        [
          -79.800126,
          43.236346
        ],
        [
          -79.799367,
          43.23593
        ],
        [
          -79.792787,
          43.234428
        ],
        [
          -79.785378,
          43.232511
        ],
        [
          -79.780825,
          43.231655
        ],
        [
          -79.77368,
          43.229935
        ],
        [
          -79.767578,
          43.228746
        ],
        [
          -79.765485,
          43.228514
        ]
      ]
    },
    {
      "id": "durham-scarborough-brt",
      "name": "Durham\u2013Scarborough Bus Rapid Transit",
      "mode": "brt",
      "modeLabel": "BRT",
      "status": "under construction",
      "opening": "2028 target",
      "headwayMin": 8,
      "travelMin": 35,
      "color": "#ff7a59",
      "shape": [
        [
          -79.257,
          43.773
        ],
        [
          -79.2,
          43.8
        ],
        [
          -79.13,
          43.82
        ],
        [
          -79.086,
          43.835
        ],
        [
          -79.02,
          43.85
        ]
      ]
    },
    {
      "id": "hurontario-line-10",
      "name": "Hurontario\u2013Main Line 10 LRT",
      "mode": "lrt",
      "modeLabel": "LRT",
      "status": "under construction",
      "opening": "TBD (delayed)",
      "headwayMin": 5,
      "travelMin": 40,
      "color": "#ff6b9a",
      "shape": [
        [
          -79.585866,
          43.558061
        ],
        [
          -79.586654,
          43.558827
        ],
        [
          -79.600114,
          43.568363
        ],
        [
          -79.603586,
          43.571375
        ],
        [
          -79.626551,
          43.587438
        ],
        [
          -79.639919,
          43.597351
        ],
        [
          -79.64171,
          43.598017
        ],
        [
          -79.645424,
          43.600383
        ],
        [
          -79.646816,
          43.602346
        ],
        [
          -79.649087,
          43.604088
        ],
        [
          -79.656506,
          43.609285
        ],
        [
          -79.679509,
          43.626295
        ],
        [
          -79.685168,
          43.630236
        ],
        [
          -79.687695,
          43.632356
        ],
        [
          -79.705217,
          43.645445
        ],
        [
          -79.733255,
          43.665998
        ]
      ]
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
      "shape": [
        [
          -79.38,
          43.645
        ],
        [
          -79.374,
          43.643
        ],
        [
          -79.36,
          43.643
        ],
        [
          -79.35,
          43.645
        ],
        [
          -79.34,
          43.648
        ],
        [
          -79.33,
          43.655
        ]
      ]
    },
    {
      "id": "ion-stage-2",
      "name": "ION Stage 2",
      "mode": "lrt",
      "modeLabel": "LRT",
      "status": "in design",
      "opening": "TBD",
      "headwayMin": 8,
      "travelMin": 30,
      "color": "#7b8cff",
      "shape": [[-80.444,43.421],[-80.410,43.400],[-80.380,43.390],[-80.350,43.370],[-80.312,43.358]]
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
