# BeerNow

Ranks every pack at a Beer Store by **millilitres of pure alcohol per dollar**.
Originally a Rails 4.2 app from July 2015 (`~/dev/drinknow`) that called the
now-dead `ontariobeerapi.ca`; this is a static rewrite served from GitHub Pages
with a Cloudflare Worker for live prices.

    https://yuchenhou.com/beernow/

## How it works

```
browser ──GET /beernow/ ──────────────► GitHub Pages (this folder)
   │
   └──GET /beernow/api/… ─────────────► Cloudflare Worker (worker/)
                                            │ POST thebeerstore.ca/api/store
                                            │ POST <algolia>/Ecomm_Listing_Prod_size
                                            ▼
                                       Cache API (6 h stores, 15 min prices)
```

The page is plain HTML, CSS, and ES modules — no build step, no framework. The
Worker keeps the static page same-origin and hides the upstream shapes.

### API

| Route | Returns |
| --- | --- |
| `GET /beernow/api/stores` | 304 stores: `id`, `name`, `address`, `city`, `postal`, `slug`, `lat`, `lon` |
| `GET /beernow/api/stores/:id/beers?limit=25` | store plus up to 100 listings ranked by score |
| `GET /beernow/api/health` | liveness |

`limit` defaults to 25 and caps at 100. Responses carry `generated` (ms epoch);
a stale cache served after an upstream failure is marked with `x-stale: 1`.

### Ranking

    score        = pack size × volume (mL) × ABV ÷ effective price
    per-dollar   = pack size × volume (mL) × (ABV / 100) ÷ effective price

The client shows `per-dollar` (mL of ethanol per dollar); the Worker sorts by
`score`, which orders identically. The effective price is the sale price when
it is lower than the shelf price. Listings without a parseable volume, ABV, or
price are dropped rather than guessed at. Kegs are included and routinely rank
high; ABV chips keep the 2015 bands (<6% green, 6–8% amber, ≥8% red).

### Cache and failure behaviour

- Stores: 6 h, prices: 15 min, both in the colo Cache API (no KV, free plan).
- If a refresh fails, the last good copy is served with `x-stale: 1` and a
  60 s cache lifetime.

## Develop

```sh
cd worker && bun install
bun test                      # 14 unit tests, no network
npx wrangler dev --port 8799  # local API

# static page: serve the repo root, then open
# http://127.0.0.1:8849/beernow/?api=http://127.0.0.1:8799/beernow/api
python3 -m http.server 8849
```

## Deploy

```sh
cd worker && npx wrangler deploy   # route: yuchenhou.com/beernow/api/*
```

Static files deploy with the website repo: commit `beernow/` to `main` and
GitHub Pages publishes it. Wrangler uses the `yuchenhou.com` zone in the
`Houyuchen66@gmail.com` Cloudflare account.

## Layout

    index.html        page shell
    css/app.css       theme (light/dark), table, combobox
    js/api.js         Worker client
    js/app.js         store search, hash routing, rendering
    worker/src        Worker (store directory, ranking, cache)
    worker/test       bun tests with mocked upstreams
