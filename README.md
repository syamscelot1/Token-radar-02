# Token Radar — pre-token protocols ranked by implied value

Entry for the make.fun **token-radar-01** bounty ($1,325; deadline 14 Dec 2026).

A dashboard that finds protocols whose token does not exist yet, ranks them by an
implied value derived from the sealed DefiLlama snapshot, and shows a reader how to
farm each one. 178 rows: all 40 watchlist protocols, plus every rankable pre-token
protocol below the $50M floor. Live-token protocols are set aside with their market
caps, never mixed into the ranking.

## Model (radar-2)

```
implied = round( tvl_usd x 0.25
  x (1 + clamp(change_7d, -60, 120) / 100 x 0.5)
  x (0.6 + min(age_days, 1095) / 1095 x 0.4)
  x (1 + 0.015 x min(chains - 1, 4)) )
```

- **TVL** — the size of the pool a token would launch from.
- **7-day growth** — momentum, clamped so one wild week cannot dominate.
- **Age with no token** — how long the protocol has run without issuing one
  (unknown age uses 365 days).
- **Chain breadth** — TVL spread over more chains reaches more users, worth up to 6%.

No protocol name is special-cased; the same function scores every row. "No token on
record" is what DefiLlama says, never proof a protocol has none. Implied value is
this entry's own claim, never a price and never a promise that a token is issued.

## Run it

Node 22.18+ (standard library only, nothing to install):

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

This writes `out/board.json`, `out/data.js`, `out/dashboard/`, `out/screenshots/`
and `out/dossier.json`. Open `out/dashboard/index.html` in a browser (no network
needed) to use the dashboard: search, filter by category / chain / minimum TVL,
watchlist-only scope, sortable columns, a Top 5 spotlight, and a detail view for
every protocol with its model breakdown, verdict, risk and 7-step farm plan.

## Layout

- `main.ts` — entrypoint: reads the snapshot, builds the board, writes the outputs.
- `lib/model.ts` — the radar-2 model, farm plans, verdicts and risk notes.
- `vendor/makefun-board.ts` — make.fun's dossier library (vendored, unmodified).
- `dashboard/` — the static page: `index.html`, `app.css`, `app.js`.
- `screenshots/` — 1-board, 2-detail, 3-filtered views of the dashboard.

## License

MIT — see `LICENSE`.
