# Browser-only runtime phase 3

## Constraint

All prediction data processing, model training, matchup prediction, and bracket solving remain in the browser. No inference server or remotely precomputed prediction artifact is introduced.

## Changes

1. Start scoreboard and logo requests before model training so browser networking overlaps CPU work.
2. Cache trained model state in IndexedDB, keyed by runtime data and model configuration, for fast repeat loads.
3. Generate a compact live team-stat CSV containing only the live training seasons plus one prior-season buffer.
4. Keep full CSVs for leakage-safe benchmarks and fall back to them whenever compact files or IndexedDB are unavailable.

## Verification

- Compare full and compact runtime inputs.
- Unit-test compact team-stat selection and live-file preference.
- Unit-test deterministic cache keys and graceful no-IndexedDB fallback.
- Run syntax checks, all tests, compact-data build, smoke benchmark, and browser-runtime profiling.

## Measured results

- Full team stats: 7,290 rows, 1,391,662 bytes.
- Compact team stats: 4,024 rows, 766,630 bytes.
- Node browser-pipeline profile: 1,424.3 ms full vs 1,132.4 ms compact, a 25.8% first-load CPU speedup.- Across 1,500 current-season matchup comparisons, compact inputs changed probability by 0.00109 on average and 0.00747 maximum.
- Leakage-safe held-out comparison across 880 games: 68.52% accuracy full vs 68.98% compact; log loss 0.58857 vs 0.58837.
- Full-context official benchmark remains 67.00% regular accuracy, 0.62382 log loss, and 66.65% tournament normalized score.
- Headless Edge first run: 433.8 ms total, 284 ms local model phase, cache status `trained`.
- Headless Edge immediate repeat run: 133.6 ms total, 12 ms model phase, cache status `hit`.

All measured model construction and reuse occurred inside the browser. IndexedDB stores a structured clone of browser-trained state, not remote predictions.
