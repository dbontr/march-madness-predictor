#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function printHelp() {
  console.log(`
Full benchmark + autotune runner

Usage:
  node scripts/benchmark.js [options]

Options:
  --season <year>                     Target season (default: config default_season)
  --trials <n>                        Number of random candidates (base params included automatically)
  --holdout-seasons <n|all>           Number of historical seasons to backtest
  --regular-max-seasons <n|all>       Number of seasons for game backtests
  --splits <csv>                      Within-season game backtest split points, e.g. 0.65,0.8,0.9
  --exclude-postseason                Exclude postseason games from game backtests
  --regular-min-train-games <n>       Min training games for regular-season contexts
  --regular-min-test-games <n>        Min test games for regular-season contexts
  --refine-rounds <n>                 Local refinement rounds around top candidates
  --refine-top-k <n>                  Top candidates to refine each round
  --refine-per-top <n>                Children generated per top candidate
  --refine-scale-start <n>            Initial local perturbation scale
  --refine-scale-decay <n>            Perturbation decay per round
  --crossover-rounds <n>              Crossover rounds over top candidates
  --crossover-top-k <n>               Top candidates eligible for crossover
  --crossover-children <n>            Crossover children generated per round
  --crossover-noise-scale <n>         Jitter applied to crossover children
  --cem-rounds <n>                    Cross-entropy rounds (elite-distribution search)
  --cem-samples <n>                   Candidates scored per CEM round
  --cem-elite-fraction <n>            Top fraction used to fit CEM distribution
  --cem-explore-floor <n>             Min random-explore probability in CEM
  --cem-spread-decay <n>              Spread decay per improving CEM round
  --cem-spread-min <n>                Minimum CEM spread as fraction of parameter range
  --cem-spread-max <n>                Maximum CEM spread as fraction of parameter range
  --local-search-passes <n>           Coordinate local-search passes from best candidate
  --local-search-step-start <n>       Starting coordinate step scale (fraction of parameter range)
  --local-search-step-decay <n>       Local-search step decay per pass
  --local-search-min-step <n>         Minimum coordinate step before ending local search
  --local-search-max-candidates <n>   Max candidates scored in local-search phase
  --fast-models                       Use lightweight model stack during search (faster)
  --full-models                       Disable lightweight search mode
  --full-rescore-top-k <n>            Full-fidelity rescore of best K search candidates
  --tournament-source <mode>          Tournament eval source: hybrid|historical_games|none
  --tournament-context-limit <n>      Max tournament holdout contexts during search
  --tournament-train-game-cap <n>     Max training games per tournament context during search
  --regular-context-limit <n>         Max regular-season contexts during search
  --regular-train-game-cap <n>        Max training games per regular context during search
  --regular-test-game-cap <n>         Max test games per regular context during search
  --phase-stagnation-patience <n>     Stop a phase after N stagnant rounds/passes
  --phase-stagnation-min-gain <n>     Gain threshold to count as non-stagnant phase progress
  --early-stop-patience <n>           Stop after N scored candidates without meaningful gain
  --early-stop-min-improvement <n>    Minimum objective gain that resets patience
  --early-stop-min-fraction <n>       Earliest fraction of planned search before early-stop can trigger
  --early-stop-min-evaluated <n>      Absolute minimum candidates before early-stop can trigger
  --no-early-stop                     Disable early-stop (run full planned search)
  --regular-objective-logloss-weight <n>
                                      Regular objective weight for log-loss skill
  --regular-objective-brier-weight <n>
                                      Regular objective weight for brier skill
  --regular-objective-accuracy-weight <n>
                                      Regular objective weight for accuracy
  --accuracy-priority                 Shortcut: emphasize regular-game accuracy in objective
  --tournament-weight <n>             Combined objective weight for tournament benchmark
  --regular-weight <n>                Combined objective weight for regular-season benchmark
  --random-seed <n>                   Benchmark random seed
  --skip-tournament                   Disable tournament benchmark objective
  --skip-regular                      Disable regular-season benchmark objective
  --progress-every <n>                Progress update frequency (candidate interval)
  --no-progress                       Disable live progress output
  --apply-best                        Write best params into docs/data/runtime/config.json model_params
  --out <file>                        Write full JSON result to file
  --help                              Show this help
`.trim());
}

function parseNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatDuration(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}m${String(s).padStart(2, "0")}s`;
  if (m > 0) return `${m}m${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

function renderProgressBar(done, total, width = 22) {
  if (!Number.isFinite(total) || total <= 0) return `${done}`;
  const ratio = Math.max(0, Math.min(1, done / total));
  const filled = Math.round(width * ratio);
  return `[${"#".repeat(filled)}${"-".repeat(Math.max(0, width - filled))}] ${(ratio * 100).toFixed(1)}%`;
}

function parseArgs(argv) {
  const out = {
    outFile: "",
    benchmarkOptions: {},
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--help" || arg === "-h") {
      out.help = true;
      continue;
    }
    if (arg === "--season" && next) {
      out.benchmarkOptions.season = Math.round(parseNumber(next, NaN));
      i += 1;
      continue;
    }
    if (arg === "--trials" && next) {
      out.benchmarkOptions.trials = Math.round(parseNumber(next, NaN));
      i += 1;
      continue;
    }
    if (arg === "--holdout-seasons" && next) {
      if (String(next).trim().toLowerCase() === "all") {
        out.benchmarkOptions.holdout_max_seasons = "all";
      } else {
        out.benchmarkOptions.holdout_max_seasons = Math.round(parseNumber(next, NaN));
      }
      i += 1;
      continue;
    }
    if (arg === "--regular-max-seasons" && next) {
      if (String(next).trim().toLowerCase() === "all") {
        out.benchmarkOptions.regular_max_seasons = "all";
      } else {
        out.benchmarkOptions.regular_max_seasons = Math.round(parseNumber(next, NaN));
      }
      i += 1;
      continue;
    }
    if (arg === "--splits" && next) {
      out.benchmarkOptions.regular_split_fractions = String(next)
        .split(",")
        .map((v) => Number(v.trim()))
        .filter((v) => Number.isFinite(v));
      i += 1;
      continue;
    }
    if (arg === "--exclude-postseason") {
      out.benchmarkOptions.include_postseason = false;
      continue;
    }
    if (arg === "--regular-min-train-games" && next) {
      out.benchmarkOptions.regular_min_train_games = Math.round(parseNumber(next, NaN));
      i += 1;
      continue;
    }
    if (arg === "--regular-min-test-games" && next) {
      out.benchmarkOptions.regular_min_test_games = Math.round(parseNumber(next, NaN));
      i += 1;
      continue;
    }
    if (arg === "--refine-rounds" && next) {
      out.benchmarkOptions.refine_rounds = Math.round(parseNumber(next, NaN));
      i += 1;
      continue;
    }
    if (arg === "--refine-top-k" && next) {
      out.benchmarkOptions.refine_top_k = Math.round(parseNumber(next, NaN));
      i += 1;
      continue;
    }
    if (arg === "--refine-per-top" && next) {
      out.benchmarkOptions.refine_per_top = Math.round(parseNumber(next, NaN));
      i += 1;
      continue;
    }
    if (arg === "--refine-scale-start" && next) {
      out.benchmarkOptions.refine_scale_start = parseNumber(next, NaN);
      i += 1;
      continue;
    }
    if (arg === "--refine-scale-decay" && next) {
      out.benchmarkOptions.refine_scale_decay = parseNumber(next, NaN);
      i += 1;
      continue;
    }
    if (arg === "--crossover-rounds" && next) {
      out.benchmarkOptions.crossover_rounds = Math.round(parseNumber(next, NaN));
      i += 1;
      continue;
    }
    if (arg === "--crossover-top-k" && next) {
      out.benchmarkOptions.crossover_top_k = Math.round(parseNumber(next, NaN));
      i += 1;
      continue;
    }
    if (arg === "--crossover-children" && next) {
      out.benchmarkOptions.crossover_children = Math.round(parseNumber(next, NaN));
      i += 1;
      continue;
    }
    if (arg === "--crossover-noise-scale" && next) {
      out.benchmarkOptions.crossover_noise_scale = parseNumber(next, NaN);
      i += 1;
      continue;
    }
    if (arg === "--cem-rounds" && next) {
      out.benchmarkOptions.cem_rounds = Math.round(parseNumber(next, NaN));
      i += 1;
      continue;
    }
    if (arg === "--cem-samples" && next) {
      out.benchmarkOptions.cem_samples = Math.round(parseNumber(next, NaN));
      i += 1;
      continue;
    }
    if (arg === "--cem-elite-fraction" && next) {
      out.benchmarkOptions.cem_elite_fraction = parseNumber(next, NaN);
      i += 1;
      continue;
    }
    if (arg === "--cem-explore-floor" && next) {
      out.benchmarkOptions.cem_explore_floor = parseNumber(next, NaN);
      i += 1;
      continue;
    }
    if (arg === "--cem-spread-decay" && next) {
      out.benchmarkOptions.cem_spread_decay = parseNumber(next, NaN);
      i += 1;
      continue;
    }
    if (arg === "--cem-spread-min" && next) {
      out.benchmarkOptions.cem_spread_min = parseNumber(next, NaN);
      i += 1;
      continue;
    }
    if (arg === "--cem-spread-max" && next) {
      out.benchmarkOptions.cem_spread_max = parseNumber(next, NaN);
      i += 1;
      continue;
    }
    if (arg === "--local-search-passes" && next) {
      out.benchmarkOptions.local_search_passes = Math.round(parseNumber(next, NaN));
      i += 1;
      continue;
    }
    if (arg === "--local-search-step-start" && next) {
      out.benchmarkOptions.local_search_step_start = parseNumber(next, NaN);
      i += 1;
      continue;
    }
    if (arg === "--local-search-step-decay" && next) {
      out.benchmarkOptions.local_search_step_decay = parseNumber(next, NaN);
      i += 1;
      continue;
    }
    if (arg === "--local-search-min-step" && next) {
      out.benchmarkOptions.local_search_min_step = parseNumber(next, NaN);
      i += 1;
      continue;
    }
    if (arg === "--local-search-max-candidates" && next) {
      out.benchmarkOptions.local_search_max_candidates = Math.round(parseNumber(next, NaN));
      i += 1;
      continue;
    }
    if (arg === "--fast-models") {
      out.benchmarkOptions.fast_models = true;
      continue;
    }
    if (arg === "--full-models") {
      out.benchmarkOptions.fast_models = false;
      continue;
    }
    if (arg === "--full-rescore-top-k" && next) {
      out.benchmarkOptions.full_rescore_top_k = Math.round(parseNumber(next, NaN));
      i += 1;
      continue;
    }
    if (arg === "--tournament-source" && next) {
      out.benchmarkOptions.tournament_source = String(next).trim();
      i += 1;
      continue;
    }
    if (arg === "--tournament-context-limit" && next) {
      out.benchmarkOptions.tournament_context_limit = Math.round(parseNumber(next, NaN));
      i += 1;
      continue;
    }
    if (arg === "--tournament-train-game-cap" && next) {
      out.benchmarkOptions.tournament_train_game_cap = Math.round(parseNumber(next, NaN));
      i += 1;
      continue;
    }
    if (arg === "--regular-context-limit" && next) {
      out.benchmarkOptions.regular_context_limit = Math.round(parseNumber(next, NaN));
      i += 1;
      continue;
    }
    if (arg === "--regular-train-game-cap" && next) {
      out.benchmarkOptions.regular_train_game_cap = Math.round(parseNumber(next, NaN));
      i += 1;
      continue;
    }
    if (arg === "--regular-test-game-cap" && next) {
      out.benchmarkOptions.regular_test_game_cap = Math.round(parseNumber(next, NaN));
      i += 1;
      continue;
    }
    if (arg === "--phase-stagnation-patience" && next) {
      out.benchmarkOptions.phase_stagnation_patience = Math.round(parseNumber(next, NaN));
      i += 1;
      continue;
    }
    if (arg === "--phase-stagnation-min-gain" && next) {
      out.benchmarkOptions.phase_stagnation_min_gain = parseNumber(next, NaN);
      i += 1;
      continue;
    }
    if (arg === "--early-stop-patience" && next) {
      out.benchmarkOptions.early_stop_patience = Math.round(parseNumber(next, NaN));
      i += 1;
      continue;
    }
    if (arg === "--early-stop-min-improvement" && next) {
      out.benchmarkOptions.early_stop_min_improvement = parseNumber(next, NaN);
      i += 1;
      continue;
    }
    if (arg === "--early-stop-min-fraction" && next) {
      out.benchmarkOptions.early_stop_min_fraction = parseNumber(next, NaN);
      i += 1;
      continue;
    }
    if (arg === "--early-stop-min-evaluated" && next) {
      out.benchmarkOptions.early_stop_min_evaluated = Math.round(parseNumber(next, NaN));
      i += 1;
      continue;
    }
    if (arg === "--no-early-stop") {
      out.benchmarkOptions.early_stop_patience = 0;
      continue;
    }
    if (arg === "--regular-objective-logloss-weight" && next) {
      out.benchmarkOptions.regular_objective_logloss_weight = parseNumber(next, NaN);
      i += 1;
      continue;
    }
    if (arg === "--regular-objective-brier-weight" && next) {
      out.benchmarkOptions.regular_objective_brier_weight = parseNumber(next, NaN);
      i += 1;
      continue;
    }
    if (arg === "--regular-objective-accuracy-weight" && next) {
      out.benchmarkOptions.regular_objective_accuracy_weight = parseNumber(next, NaN);
      i += 1;
      continue;
    }
    if (arg === "--accuracy-priority") {
      out.benchmarkOptions.regular_objective_logloss_weight = 0.35;
      out.benchmarkOptions.regular_objective_brier_weight = 0.15;
      out.benchmarkOptions.regular_objective_accuracy_weight = 0.5;
      continue;
    }
    if (arg === "--tournament-weight" && next) {
      out.benchmarkOptions.tournament_weight = parseNumber(next, NaN);
      i += 1;
      continue;
    }
    if (arg === "--regular-weight" && next) {
      out.benchmarkOptions.regular_weight = parseNumber(next, NaN);
      i += 1;
      continue;
    }
    if (arg === "--random-seed" && next) {
      out.benchmarkOptions.random_seed = Math.round(parseNumber(next, NaN));
      i += 1;
      continue;
    }
    if (arg === "--skip-tournament") {
      out.benchmarkOptions.include_tournament = false;
      continue;
    }
    if (arg === "--skip-regular") {
      out.benchmarkOptions.include_regular = false;
      continue;
    }
    if (arg === "--progress-every" && next) {
      out.benchmarkOptions.progress_every = Math.round(parseNumber(next, NaN));
      i += 1;
      continue;
    }
    if (arg === "--no-progress") {
      out.noProgress = true;
      continue;
    }
    if (arg === "--out" && next) {
      out.outFile = String(next);
      i += 1;
      continue;
    }
    if (arg === "--apply-best") {
      out.applyBest = true;
      continue;
    }
    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return out;
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    printHelp();
    return;
  }

  const workspace = process.cwd();
  const runtimePath = path.join(workspace, "docs", "live-runtime.js");
  if (!fs.existsSync(runtimePath)) {
    throw new Error(`Cannot find runtime at ${runtimePath}`);
  }

  const nativeFetch = global.fetch;
  if (typeof nativeFetch !== "function") {
    throw new Error("Node runtime does not provide fetch(). Use Node 18+.");
  }

  global.window = global;
  global.localStorage = {
    _m: new Map(),
    getItem(key) {
      return this._m.has(key) ? this._m.get(key) : null;
    },
    setItem(key, value) {
      this._m.set(key, String(value));
    },
  };

  global.fetch = async (url, options) => {
    const target = String(url || "");
    if (target.startsWith("./")) {
      const full = path.join(workspace, "docs", target.slice(2));
      if (!fs.existsSync(full)) {
        return new Response("", { status: 404 });
      }
      const body = fs.readFileSync(full, "utf8");
      const isJson = full.endsWith(".json");
      return new Response(body, {
        status: 200,
        headers: { "content-type": isJson ? "application/json" : "text/plain" },
      });
    }
    return nativeFetch(url, options);
  };

  const runtimeCode = fs.readFileSync(runtimePath, "utf8");
  eval(runtimeCode);
  if (!global.LiveBracketRuntime || typeof global.LiveBracketRuntime.runBenchmark !== "function") {
    throw new Error("runBenchmark() is not available from docs/live-runtime.js");
  }

  const showProgress = !parsed.noProgress;
  let lastProgressLen = 0;
  function onProgress(payload) {
    if (!showProgress) return;
    const phase = String(payload?.phase || "search");
    const done = Number(payload?.evaluated || 0);
    const total = Number(payload?.total_estimated || 0);
    const elapsed = Number(payload?.elapsed_ms || 0);
    const eta = payload?.eta_ms;
    const best = Number(payload?.best_objective);
    const source = String(payload?.last_source || "");
    const phaseShort = phase.replaceAll("_", " ");
    const bestTxt = Number.isFinite(best) ? best.toFixed(4) : "-";
    const etaTxt = Number.isFinite(eta) ? formatDuration(eta) : "-";
    const rate = elapsed > 0 ? done / (elapsed / 1000) : 0;
    const rateTxt = Number.isFinite(rate) && rate > 0 ? `${rate.toFixed(2)}/s` : "-";
    const line = `progress ${renderProgressBar(done, total)} | ${phaseShort} | ${done}/${total || "?"} | best ${bestTxt} | rate ${rateTxt} | elapsed ${formatDuration(elapsed)} | eta ${etaTxt}${source ? ` | ${source}` : ""}`;
    const padded = line.length < lastProgressLen ? `${line}${" ".repeat(lastProgressLen - line.length)}` : line;
    process.stdout.write(`\r${padded}`);
    lastProgressLen = padded.length;
    if (phase === "done") {
      process.stdout.write("\n");
      lastProgressLen = 0;
    }
  }

  const started = Date.now();
  const result = await global.LiveBracketRuntime.runBenchmark({
    ...parsed.benchmarkOptions,
    onProgress,
  });
  const elapsedMs = Date.now() - started;
  if (showProgress && lastProgressLen > 0) {
    process.stdout.write("\n");
  }

  const summary = {
    elapsed_ms: elapsedMs,
    season: result.season,
    candidates_evaluated: result.candidates_evaluated,
    include_postseason: result.include_postseason,
    tournament_contexts: result.tournament_contexts,
    stopped_early: result.stopped_early === true,
    base_objective: result.base?.objective ?? null,
    objective: result.best?.objective ?? null,
    objective_gain_vs_base: (Number.isFinite(result.best?.objective) && Number.isFinite(result.base?.objective))
      ? (result.best.objective - result.base.objective)
      : null,
    tournament_objective: result.best?.tournament?.objective ?? null,
    regular_objective: result.best?.regular_season?.objective ?? null,
    avg_tournament_normalized: result.best?.tournament?.avg_normalized ?? null,
    avg_regular_log_loss: result.best?.regular_season?.avg_log_loss ?? null,
    avg_regular_accuracy: result.best?.regular_season?.avg_accuracy ?? null,
    fast_models: result.settings?.fast_models ?? null,
    full_rescore_fast_models: result.settings?.full_rescore_fast_models ?? null,
    full_rescore_top_k: result.settings?.full_rescore_top_k ?? null,
    tournament_context_limit: result.settings?.tournament_context_limit ?? null,
    tournament_train_game_cap: result.settings?.tournament_train_game_cap ?? null,
    regular_context_limit: result.settings?.regular_context_limit ?? null,
    regular_train_game_cap: result.settings?.regular_train_game_cap ?? null,
    regular_test_game_cap: result.settings?.regular_test_game_cap ?? null,
    early_stop_patience: result.settings?.early_stop_patience ?? null,
    early_stop_min_improvement: result.settings?.early_stop_min_improvement ?? null,
    early_stop_min_evaluated: result.settings?.early_stop_min_evaluated ?? null,
    phase_summary: Array.isArray(result.phase_summary)
      ? result.phase_summary.map((row) => ({
          phase: row.phase,
          evaluated: row.evaluated,
          gain: row.gain,
          best_objective: row.best_objective,
          stopped_early: row.stopped_early,
        }))
      : [],
  };
  console.log(JSON.stringify(summary, null, 2));

  if (parsed.outFile) {
    const outPath = path.isAbsolute(parsed.outFile)
      ? parsed.outFile
      : path.join(workspace, parsed.outFile);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    console.log(`wrote ${outPath}`);
  }

  if (parsed.applyBest) {
    const configPath = path.join(workspace, "docs", "data", "runtime", "config.json");
    if (!result.best || !result.best.params) {
      throw new Error("No best params found to apply.");
    }
    if (!fs.existsSync(configPath)) {
      throw new Error(`Cannot find config file at ${configPath}`);
    }
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    config.model_params = result.best.params;
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    console.log(`applied best params to ${configPath}`);
  }
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
