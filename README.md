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
- Adaptive tuning search (random -> refine -> crossover -> CEM -> local search) optimizes objective = normalized bracket score + actual-winner probability - stability penalty across seasons.
- Seed/rank is excluded from matchup model features and tie-break scoring (performance metrics only).
- Home-court context is modeled for non-neutral games in game-level backtests and calibration.
- Tuned params are cached in browser local storage to avoid rerunning every refresh.
- Configure behavior in `docs/data/runtime/config.json` under:
  - `model_params`
  - `model_tuning`
  - `model_tuning.holdout_max_seasons`
  - `model_tuning.season_recency_decay`
- `model_tuning.objective_actual_prob_weight`
- `model_tuning.objective_stability_penalty`
  - `live_runtime.fast_models`
  - `live_runtime.max_seasons`
  - `live_runtime.game_cap`
  - `live_runtime.scoreboard_cache_minutes`
  - `live_runtime.scoreboard_concurrency`
  - `live_runtime.fetch_team_logos`
  - `live_runtime.team_logo_cache_minutes`

For GitHub Pages stability, keep `model_tuning.enabled` set to `false` and use `model_params` from your latest benchmark run.

## Full D1 Data Generation

Build a full Division I historical dataset (all final games per season window) and regenerate runtime CSVs:

```bash
node scripts/build_d1_runtime_data.js \
  --target-season 2026 \
  --from-season 2018 \
  --to-season 2026 \
  --market-lines
```

Expand the runtime database to a wider range quickly (no market-line enrichment):

```bash
node scripts/build_d1_runtime_data.js \
  --target-season 2026 \
  --from-season 2016 \
  --to-season 2026 \
  --no-market-lines \
  --day-concurrency 12 \
  --team-stats-concurrency 20
```

What this script does:

- Pulls all finalized D1 games from ESPN scoreboard day-by-day.
- Pulls season team-stat profiles from ESPN team statistics endpoints.
- Optionally enriches each game with market priors from ESPN `pickcenter` (`market_prob_a`, `market_spread_a`, moneylines).
- Computes derived team ratings/features and writes:
  - `data/raw/<target-season>/team_stats.csv`
  - `data/raw/<target-season>/historical_games.csv`
  - `docs/data/runtime/<target-season>/team_stats.csv`
  - `docs/data/runtime/<target-season>/historical_games.csv`
- Stores generation metadata in `data/generated/<target-season>/full_d1_generation_report.json`.

Useful flags:

- `--exclude-postseason`
- `--no-market-lines`
- `--cache-file data/generated/2026/summary_market_cache.json`
- `--skip-cache`
- `--day-concurrency 8`
- `--summary-concurrency 10`
- `--team-stats-concurrency 12`
- `--progress-every 100`

## Full Benchmark Runner (CLI)

Run a full parameter benchmark + autotune from terminal:

```bash
node scripts/benchmark.js --season 2026 --out data/generated/2026/full_benchmark.json --apply-best
```

What it evaluates:

- Tournament holdout seasons (ESPN bracket scoring objective)
- Game-level prediction backtests (regular season + postseason by default):
  - prior-seasons -> full holdout season
  - within-season splits (train early games, predict later games)

Useful flags:

- `--holdout-seasons all`
- `--regular-max-seasons all`
- `--splits 0.65,0.8,0.9`
- `--regular-min-train-games 160`
- `--regular-min-test-games 30`
- `--fast-models` / `--full-models`
- `--full-rescore-top-k 4`
- `--tournament-source historical_games`
- `--tournament-context-limit 2`
- `--tournament-train-game-cap 1800`
- `--regular-context-limit 3`
- `--regular-train-game-cap 1800`
- `--regular-test-game-cap 280`
- `--exclude-postseason` (if you want regular-season-only game backtests)
- `--refine-rounds 1`
- `--refine-top-k 6`
- `--refine-per-top 8`
- `--crossover-rounds 1`
- `--crossover-top-k 8`
- `--crossover-children 10`
- `--cem-rounds 2`
- `--cem-samples 40`
- `--cem-elite-fraction 0.16`
- `--cem-explore-floor 0.12`
- `--local-search-passes 1`
- `--local-search-step-start 0.12`
- `--local-search-max-candidates 90`
- `--phase-stagnation-patience 2`
- `--phase-stagnation-min-gain 0.00006`
- `--early-stop-patience 120`
- `--early-stop-min-improvement 0.00004`
- `--early-stop-min-fraction 0.35`
- `--no-early-stop`
- `--progress-every 10` (live counter/progress updates)
- `--no-progress` (quiet mode)
- `--accuracy-priority` (bias regular-game objective toward accuracy)
- `--tournament-weight 0.62`
- `--regular-weight 0.38`
- `--skip-tournament` (regular-season-only optimization)
- `--skip-regular` (tournament-only optimization)
- `--apply-best` (writes best params to `docs/data/runtime/config.json` -> `model_params`)

Deep search on full D1 data (fast-screen search + full-fidelity top-K rescore):

```bash
node scripts/benchmark.js \
  --season 2026 \
  --holdout-seasons all \
  --regular-max-seasons all \
  --trials 180 \
  --splits 0.8 \
  --regular-min-train-games 650 \
  --regular-min-test-games 180 \
  --refine-rounds 1 \
  --refine-top-k 8 \
  --refine-per-top 10 \
  --refine-scale-start 0.34 \
  --refine-scale-decay 0.62 \
  --crossover-rounds 1 \
  --crossover-top-k 8 \
  --crossover-children 12 \
  --crossover-noise-scale 0.10 \
  --cem-rounds 3 \
  --cem-samples 56 \
  --cem-elite-fraction 0.16 \
  --cem-explore-floor 0.12 \
  --cem-spread-decay 0.80 \
  --cem-spread-min 0.02 \
  --cem-spread-max 0.40 \
  --local-search-passes 1 \
  --local-search-step-start 0.12 \
  --local-search-step-decay 0.62 \
  --local-search-min-step 0.02 \
  --local-search-max-candidates 140 \
  --phase-stagnation-patience 1 \
  --phase-stagnation-min-gain 0.00004 \
  --early-stop-patience 180 \
  --early-stop-min-improvement 0.00004 \
  --early-stop-min-fraction 0.35 \
  --fast-models \
  --full-rescore-top-k 10 \
  --tournament-source historical_games \
  --tournament-context-limit 2 \
  --tournament-train-game-cap 1800 \
  --regular-context-limit 3 \
  --regular-train-game-cap 1800 \
  --regular-test-game-cap 280 \
  --regular-objective-logloss-weight 0.35 \
  --regular-objective-brier-weight 0.15 \
  --regular-objective-accuracy-weight 0.50 \
  --progress-every 2 \
  --tournament-weight 0.52 \
  --regular-weight 0.48 \
  --random-seed 20260318 \
  --out data/generated/2026/full_benchmark_long.json \
  --apply-best
```

Use broad historical coverage while holding search speed around `>=1.0 candidates/sec`:

```bash
node scripts/benchmark.js \
  --season 2026 \
  --all-years \
  --min-eval-rate 1 \
  --tournament-context-limit 0 \
  --regular-context-limit 0 \
  --tournament-contexts-per-candidate 2 \
  --regular-contexts-per-candidate 2 \
  --tournament-train-game-cap 1200 \
  --regular-train-game-cap 1200 \
  --regular-test-game-cap 220 \
  --fast-models \
  --full-rescore-top-k 2 \
  --out data/generated/2026/full_benchmark_all_years.json \
  --apply-best
```

If you want full-fidelity scoring for every candidate (much slower), add `--full-models --full-rescore-top-k 0`.

Quick tuned run (good first pass before long run):

```bash
node scripts/benchmark.js --season 2026 --trials 70 --out data/generated/2026/full_benchmark_quick.json --apply-best
```

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

Additional optional columns (used when present):

- `ast_rate`
- `stl_rate`
- `blk_rate`
- `three_rate`
- `opp_three_rate`
- `opp_fg3_pct`
- `opp_ft_rate`

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
- `home_team` or `home_edge_a`
- `rest_days_a`, `rest_days_b`
- `travel_distance_a`, `travel_distance_b`
- `injuries_impact_a`, `injuries_impact_b`
- `market_prob_a` / `market_prob_b`
- `market_spread_a` / `market_spread_b` (or `closing_spread_a` / `closing_spread_b`)
- `moneyline_a` / `moneyline_b`

If market columns are present, the runtime automatically incorporates them as priors and matchup context.

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
