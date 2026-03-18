# dbontr bracket oracle

Live March Madness bracket predictions with a GitHub Pages-only runtime.

On every page load (each run), the browser generates predictions fresh:

1. fetches current ESPN tournament data
2. applies data-quality guards (dedupe, score sanity, clipping, alias normalization)
3. trains the ensemble matchup system client-side
4. solves the bracket deterministically (Elo-style matchup probabilities, no Monte Carlo for the live board)
5. renders updated odds and the projected path

No backend is required.

## Goal

This repo is now run-based, not batch-output-based.

- We do not rely on a required backend API endpoint.
- We do not require GitHub Actions cron jobs to refresh predictions.
- Predictions are computed live in the browser each time the app is opened/reloaded.

## Stack

- Frontend UI: `docs/index.html`
- Browser runtime engine: `docs/live-runtime.js`
- Runtime data files: `docs/data/runtime/<season>/`
- Root redirect: `index.html` -> `./docs/` for repo-root Pages deployments

## GitHub Pages deploy

1. Push this repo to GitHub.
2. In repo settings, enable Pages and set source to the `docs/` folder (on your chosen branch).
3. Open the Pages URL.

The app recomputes predictions directly in the browser every open/refresh.

If your root URL is publishing repo root, keep `index.html` in root so it redirects to `./docs/`.

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

If `random_seed` is omitted, runtime uses the default seed configured in code.

## Runtime data layout

The browser runtime expects:

- `docs/data/runtime/config.json`
- `docs/data/runtime/<season>/team_stats.csv`
- `docs/data/runtime/<season>/historical_games.csv`
- `docs/data/runtime/<season>/aliases.csv` (optional)
- `docs/data/runtime/<season>/injuries.csv` (optional)

Current repo includes `2026` runtime CSVs under `docs/data/runtime/2026/`.

## What Happens Per Run

At runtime, `docs/live-runtime.js`:

1. loads local runtime CSV files
2. fetches NCAA scoreboard/event data from ESPN public JSON endpoints
3. runs data-quality guards against malformed rows, duplicate games, unknown teams, and outliers
4. derives bracket slots and locks completed game winners
5. computes weighted performance context (tempo-adjusted margins, recency, round importance, rolling form)
6. trains an ensemble (logistic + tree + performance + continuous style interaction model)
7. calibrates probabilities with round-aware calibrators (early vs late rounds)
8. runs deterministic bracket solving
9. renders bracket board + title odds + team logos

## Model Tuning + Backtests

- Runtime backtest harness runs walk-forward holdout seasons and scores by ESPN-style round points.
- Holdout training uses pre-tournament data only for each season (filters out NCAA tournament rounds when present).
- Random-search tuning optimizes objective = normalized bracket score + actual-winner probability - stability penalty across seasons.
- Seed/rank is excluded from matchup model features and tie-break scoring (performance metrics only).
- Tuned params are cached in browser local storage to avoid rerunning every refresh.
- Configure behavior in `docs/data/runtime/config.json` under:
  - `model_params`
  - `model_tuning`
  - `model_tuning.holdout_max_seasons`
  - `model_tuning.season_recency_decay`
  - `model_tuning.objective_actual_prob_weight`
  - `model_tuning.objective_stability_penalty`

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
