# March Madness Predictor Improvement Plan

## Objectives

1. Remove future-season information from historical evaluation snapshots.
2. Ensure unavailable ensemble components do not silently contribute 50% predictions.
3. Reduce browser startup cost without adding a permanent backend.
4. Add repeatable automated checks for the new behavior.

## Phase 1: Leakage-safe snapshots

- Add a pregame snapshot builder using only games before a supplied date or index.
- Use prior-season style statistics as priors instead of current full-season statistics.
- Use the snapshot in tournament and regular-season benchmark contexts.
- Verify that changing games after the cutoff cannot change the snapshot.

## Phase 2: Active ensemble blending

- Renormalize weights over components that are actually trained and available.
- Disable the market component when no historical or matchup market data exists.
- Verify fast mode no longer gives fixed weight to an absent tree model.

## Phase 3: Smaller live artifact

- Generate a capped `historical_games_live.csv` for the static site.
- Prefer the compact file for live page loads and retain full-history fallback.
- Keep benchmark runs on the full historical file.

## Verification

- Node syntax checks for all runtime and scripts.
- Node built-in tests for leakage, component blending, and live-history selection.
- Smoke benchmark and final Git diff/status review.

## Verified results

- Automated tests: 10 passing.
- Full history: 64,963 rows and 5,297,360 bytes.
- Compact live history: 2,600 rows and 208,626 bytes.
- Broad leakage-safe validation: 10 tournament seasons and 5 regular contexts.
- Validation regular-game accuracy: 0.669997.
- Validation regular-game log loss: 0.623816.
- Validation tournament normalized score: 0.666537.
- Validation elapsed time: 15.449 seconds for five candidate evaluations.
