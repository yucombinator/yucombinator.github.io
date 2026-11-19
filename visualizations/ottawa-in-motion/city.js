/* Per-city configuration for the shared In Motion engine. */
window.MOTION_CONFIG = {
  "slug": "ottawa-in-motion",
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
  "future": [
    {
      "id": "line1-east",
      "name": "O-Train Line 1 East — Blair to Trim",
      "mode": "train",
      "modeLabel": "O-Train",
      "status": "testing / opening soon",
      "opening": "2027 target",
      "headwayMin": 5,
      "travelMin": 18,
      "color": "#d30f1d",
      "shape": [
        [-75.582, 45.451],
        [-75.5833, 45.4518],
        [-75.5455, 45.4692],
        [-75.5336, 45.4739],
        [-75.5180, 45.4798],
        [-75.4812, 45.4955]
      ]
    },
    {
      "id": "line1-west",
      "name": "O-Train Line 1 West — Tunney's Pasture to Moodie",
      "mode": "train",
      "modeLabel": "O-Train",
      "status": "under construction",
      "opening": "2027 target",
      "headwayMin": 7,
      "travelMin": 25,
      "color": "#508128",
      "shape": [
        [-75.7345, 45.4050],
        [-75.7520, 45.3965],
        [-75.7590, 45.3930],
        [-75.7718, 45.3806],
        [-75.7779, 45.3741],
        [-75.7820, 45.3659],
        [-75.7816, 45.3543],
        [-75.7904, 45.3496],
        [-75.8095, 45.3456],
        [-75.8370, 45.3409]
      ]
    },
    {
      "id": "gatineau-tram",
      "name": "Gatineau–Ottawa tram — Plateau to downtown Ottawa",
      "mode": "train",
      "modeLabel": "Tram",
      "status": "planned / indicative",
      "opening": "TBD",
      "headwayMin": 6,
      "travelMin": 28,
      "color": "#8e44ad",
      "shape": [
        [-75.8000, 45.4800],
        [-75.7800, 45.4700],
        [-75.7400, 45.4550],
        [-75.7150, 45.4370],
        [-75.7050, 45.4320],
        [-75.6972, 45.4240]
      ]
    }
  ],
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
