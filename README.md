# dbontr bracket oracle

Live March Madness bracket predictions with a GitHub Pages-only runtime.

On every page load, the browser fetches current ESPN tournament data, trains the lightweight model client-side, simulates the bracket, and renders results. No backend is required.

## Stack

- Frontend UI: `docs/index.html`
- Browser runtime engine: `docs/live-runtime.js`
- Runtime data files: `docs/data/runtime/<season>/`
- Legacy/offline scripts: `scripts/` and `src/server/` (not required for GitHub Pages runtime)

## GitHub Pages deploy

1. Push this repo to GitHub.
2. In repo settings, enable Pages and set source to the `docs/` folder (on your chosen branch).
3. Open the Pages URL.

The site recomputes predictions per request directly in the browser.

## Local preview

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080/docs/`.

## Runtime query params

Optional URL parameters:

- `season` (number)
- `simulations` (number)
- `random_seed` (number)

Example:

`/docs/?season=2026&simulations=2500&random_seed=42`

## Runtime data layout

The browser runtime expects:

- `docs/data/runtime/config.json`
- `docs/data/runtime/<season>/team_stats.csv`
- `docs/data/runtime/<season>/historical_games.csv`
- `docs/data/runtime/<season>/aliases.csv` (optional)
- `docs/data/runtime/<season>/injuries.csv` (optional)

Current repo includes `2026` runtime CSVs under `docs/data/runtime/2026/`.

## Raw data files

### `team_stats.csv`

Required columns:

- `season`
- `team`
- `seed`

Recommended numeric columns:

- `adj_offense`
- `adj_defense`
- `tempo`
- `sos`
- `net_rating`
- `q1_wins`
- `q2_wins`
- `q3_losses`
- `q4_losses`
- `recent_form`
- `injuries_impact`
- `fg3_pct`
- `tov_pct`
- `orb_pct`
- `drb_pct`
- `ft_rate`

### `historical_games.csv`

Required columns:

- `season`
- `team_a`
- `team_b`
- `score_a`
- `score_b`

Optional:

- `neutral_site`
- `game_date`
- `round_name`

### `injuries.csv` (optional)

Columns:

- `team`
- `injuries_impact`

Convention:

- `0.0` = healthy baseline
- negative = worse from injuries/availability
- positive = better than baseline

### `aliases.csv` (optional but recommended)

Columns:

- `canonical`
- `alias`

## Notes

- ESPN public JSON endpoints are used for bracket events, completed results, and team logos.
- ESPN HTML bracket pages are not scraped from the browser due cross-origin restrictions.
- If live runtime fetch fails, the page falls back to existing static files in `docs/data/`, then demo data.
