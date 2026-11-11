/* Per-city configuration for the shared In Motion engine. */
window.MOTION_CONFIG = {
  "slug": "san-francisco-in-motion",
  "accent": "#f2c94c",
  "timeZone": "America/Los_Angeles",
  "zoneLabel": "PT",
  "camera": [-122.25, 37.35, 9.1],
  "inBounds": [-123.5, 36.7, -121.0, 39.0],
  "modes": [
    { "key": "subway", "label": "BART/eBART", "color": "#f2c94c", "radius": 2.7 },
    { "key": "lrt", "label": "Light rail", "color": "#d7263d", "radius": 2.3 },
    { "key": "streetcar", "label": "Streetcar", "color": "#f28e2b", "radius": 2.0 },
    { "key": "localbus", "label": "Bus", "color": "#2f6db3", "radius": 1.35 },
    { "key": "brt", "label": "BRT", "color": "#e4572e", "radius": 1.7 },
    { "key": "gorail", "label": "Regional rail", "color": "#e31837", "radius": 2.5 },
    { "key": "ferry", "label": "Ferry", "color": "#0ea5e9", "radius": 2.2 }
  ],
  "busModes": ["localbus", "brt"],
  "trainModes": ["subway", "lrt", "gorail"],
  "railModes": ["subway", "lrt", "streetcar", "gorail", "ferry"],
  "brandedModes": [],
  "interlineModes": ["subway", "lrt"],
  "dwellSeconds": {
    "subway": 20.0,
    "lrt": 20.0,
    "streetcar": 20.0,
    "localbus": 20.0,
    "brt": 20.0,
    "gorail": 45.0,
    "ferry": 60.0
  },
  "storageKey": "sf",
  "liveUrls": ["https://sf-live.seattle-live.workers.dev/live.json"],
  "legend": [
    {
      "mode": "subway",
      "title": "BART + eBART",
      "swatches": ["#ffff33", "#0099cc", "#ff9933", "#e10529", "#b0bec7"],
      "label": "BART/eBART"
    },
    {
      "mode": "lrt",
      "title": "Muni Metro, VTA",
      "swatches": ["#a96614", "#437c93", "#942d83", "#008547", "#005b95", "#bf2b45", "#2f9e44"],
      "label": "Muni/VTA"
    },
    {
      "mode": "streetcar",
      "title": "Streetcar and cable car",
      "dot": "#f28e2b",
      "label": "Streetcar"
    },
    {
      "mode": "brt",
      "title": "Tempo BRT",
      "dot": "#e4572e",
      "label": "Tempo BRT"
    },
    {
      "mode": "localbus",
      "title": "Buses",
      "tipId": "busTip",
      "tip": [
        { "color": "#2f6db3", "text": "Muni" },
        { "color": "#fd7e14", "text": "AC Transit" },
        { "color": "#2f9e44", "text": "VTA" },
        { "color": "#7b61ff", "text": "SamTrans" },
        { "color": "#e8590c", "text": "Golden Gate Transit" },
        { "color": "#f59f00", "text": "County Connection" },
        { "color": "#7048e8", "text": "Union City Transit" },
        { "color": "#20c997", "text": "WestCAT" },
        { "color": "#845ef7", "text": "SolTrans" },
        { "color": "#e64980", "text": "VINE" },
        { "color": "#12b886", "text": "Petaluma Transit" },
        { "color": "#fab005", "text": "Fairfield Transit" },
        { "color": "#4dabf7", "text": "Rio Vista Delta Breeze" },
        { "color": "#f06595", "text": "Sonoma County Transit" },
        { "color": "#9775fa", "text": "Santa Rosa CityBus" },
        { "color": "#15aabf", "text": "Marin Transit" },
        { "color": "#22b8cf", "text": "Mission Bay TMA" },
        { "color": "#94d82d", "text": "Emery Go-Round" },
        { "color": "#fcc419", "text": "Mountain View MVgo" },
        { "color": "#f59f00", "text": "LAVTA / Wheels" },
        { "color": "#f06595", "text": "Tri Delta Transit" },
        { "color": "#f59f00", "text": "Dumbarton Express" },
        { "color": "#20c997", "text": "San Leandro LINKS" },
        { "color": "#9775fa", "text": "South San Francisco Shuttle" },
        { "color": "#12b886", "text": "Vacaville City Coach" },
        { "color": "#94d82d", "text": "Commute.org" },
        { "color": "#ff922b", "text": "Stanford Marguerite" },
        { "color": "#0ea5e9", "text": "Santa Cruz METRO" },
        { "color": "#22b8cf", "text": "Santa Cruz Cruzer" }
      ],
      "twoCol": true,
      "dot": "#2f6db3",
      "label": "Bus"
    },
    {
      "mode": "gorail",
      "title": "Regional rail",
      "swatches": ["#e31837", "#d6336c", "#f03e3e"],
      "label": "Regional rail"
    },
    {
      "mode": "ferry",
      "title": "Ferries",
      "swatches": ["#0ea5e9", "#e8590c", "#06b6d4"],
      "label": "Ferries"
    }
  ],
  "future": [
    {
      "id": "bart-sv-phase-2",
      "name": "BART Silicon Valley Phase II",
      "mode": "subway",
      "modeLabel": "BART extension",
      "status": "under construction",
      "opening": "2036",
      "headwayMin": 5,
      "travelMin": 25,
      "color": "#f2c94c",
      "shape": [
        [
          -121.874,
          37.368
        ],
        [
          -121.87,
          37.36
        ],
        [
          -121.867,
          37.35
        ],
        [
          -121.875,
          37.342
        ],
        [
          -121.889,
          37.334
        ],
        [
          -121.896,
          37.331
        ],
        [
          -121.902,
          37.329
        ],
        [
          -121.915,
          37.337
        ],
        [
          -121.927,
          37.345
        ],
        [
          -121.936,
          37.353
        ]
      ]
    },
    {
      "id": "vta-eastridge",
      "name": "VTA Eastridge Extension",
      "mode": "lrt",
      "modeLabel": "light rail extension",
      "status": "under construction",
      "opening": "2029",
      "headwayMin": 10,
      "travelMin": 15,
      "color": "#2f9e44",
      "shape": [
        [
          -121.8323,
          37.3584
        ],
        [
          -121.8265,
          37.3505
        ],
        [
          -121.8205,
          37.3425
        ],
        [
          -121.8155,
          37.3355
        ],
        [
          -121.8120,
          37.3305
        ],
        [
          -121.8109,
          37.3274
        ]
      ]
    },
    {
      "id": "smart-healdsburg",
      "name": "SMART Healdsburg Extension",
      "mode": "gorail",
      "modeLabel": "SMART extension",
      "status": "planned",
      "opening": "2028",
      "headwayMin": 30,
      "travelMin": 20,
      "color": "#d6336c",
      "shape": [
        [
          -122.816,
          38.547
        ],
        [
          -122.823,
          38.56
        ],
        [
          -122.83,
          38.575
        ],
        [
          -122.838,
          38.59
        ],
        [
          -122.85,
          38.601
        ],
        [
          -122.862,
          38.61
        ],
        [
          -122.869,
          38.611
        ]
      ]
    },
    {
      "id": "valley-link",
      "name": "Valley Link",
      "mode": "gorail",
      "modeLabel": "commuter rail",
      "status": "planned",
      "opening": "2030",
      "headwayMin": 30,
      "travelMin": 55,
      "color": "#845ef7",
      "shape": [
        [
          -121.899,
          37.701
        ],
        [
          -121.86,
          37.69
        ],
        [
          -121.8,
          37.68
        ],
        [
          -121.768,
          37.682
        ],
        [
          -121.7,
          37.7
        ],
        [
          -121.6,
          37.72
        ],
        [
          -121.5,
          37.735
        ],
        [
          -121.421,
          37.739
        ]
      ]
    },
    {
      "id": "ebart-brentwood",
      "name": "eBART Brentwood Extension",
      "mode": "subway",
      "modeLabel": "eBART extension",
      "status": "proposed",
      "opening": "TBD",
      "headwayMin": 15,
      "travelMin": 12,
      "color": "#e8590c",
      "shape": [
        [
          -121.78,
          37.995
        ],
        [
          -121.76,
          37.975
        ],
        [
          -121.735,
          37.955
        ],
        [
          -121.715,
          37.942
        ],
        [
          -121.696,
          37.932
        ]
      ]
    },
    {
      "id": "santa-cruz-branch",
      "name": "Santa Cruz Branch Rail Line",
      "mode": "gorail",
      "modeLabel": "coastal rail",
      "status": "planned",
      "opening": "TBD",
      "headwayMin": 30,
      "travelMin": 50,
      "color": "#0ea5e9",
      "shape": [
        [-121.7570, 36.9100],
        [-121.8000, 36.9300],
        [-121.8500, 36.9500],
        [-121.9000, 36.9750],
        [-121.9500, 36.9700],
        [-121.9900, 36.9650],
        [-122.0300, 36.9700]
      ]
    }
  ]
};
