# Phase 2 Accuracy and Speed Results

## Accuracy retune

The runtime parameters were retuned after the leakage-safe benchmark changes.
The search evaluated all 10 tournament contexts and all 5 available regular-season contexts per candidate.

| Metric | Previous parameters | Retuned parameters |
| --- | ---: | ---: |
| Regular-game accuracy | 0.650775 | 0.669997 |
| Regular-game log loss | 0.650346 | 0.623816 |
| Regular-game Brier score | 0.228796 | 0.216264 |
| Tournament normalized score | 0.656927 | 0.666537 |
| Balanced objective | 0.620041 | 0.641922 |

The complete search result is stored at `data/generated/2026/leakage_safe_balanced_tune.json`.
## Scoreboard loading

The ESPN tournament scoreboard can return the complete date range in one request.
A direct comparison for March 17 through April 8, 2026 returned the same 105 events:

- One range request: 270 ms.
- Twenty-three daily requests at concurrency eight: 645 ms.

The browser now uses the range request first and automatically falls back to daily requests if it fails.

## Remaining load cost

Local profiling on Jupiter measured approximately 0.4 seconds for CSV parsing and validation and 1.0 second for fast-mode model training. The next major speed phase is a pruned, precomputed current-season model artifact with runtime fallback to browser training.
