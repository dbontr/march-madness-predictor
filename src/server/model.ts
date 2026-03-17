import {
  AdvancementRow,
  BestBracketRow,
  BracketGame,
  DEFAULT_FEATURES,
  FeatureName,
  HistoricalGameRow,
  MatchupSummaryRow,
  TeamStatRow,
  TrainingMetrics,
} from "./types";
import { resolveTeam } from "./bracket";

interface TrainingSet {
  x: number[][];
  y: number[];
  featureNames: string[];
}

interface Preprocessor {
  medians: number[];
  means: number[];
  stds: number[];
}

interface ModelParams {
  weights: number[];
  bias: number;
}

export interface MatchupModel {
  featureCols: FeatureName[];
  featureNames: string[];
  preprocessor: Preprocessor;
  params: ModelParams;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : Number.NaN;
  }
  if (value === null || value === undefined) {
    return Number.NaN;
  }
  const parsed = Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

function median(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function mean(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  return values.reduce((acc, v) => acc + v, 0) / values.length;
}

function std(values: number[], avg: number): number {
  if (!values.length) {
    return 1;
  }
  const variance = values.reduce((acc, v) => acc + (v - avg) ** 2, 0) / values.length;
  const s = Math.sqrt(variance);
  return s > 1e-9 ? s : 1;
}

function clamp01(value: number): number {
  if (value < 1e-9) {
    return 1e-9;
  }
  if (value > 1 - 1e-9) {
    return 1 - 1e-9;
  }
  return value;
}

function sigmoid(z: number): number {
  if (z >= 0) {
    const exp = Math.exp(-z);
    return 1 / (1 + exp);
  }
  const exp = Math.exp(z);
  return exp / (1 + exp);
}

function dot(a: number[], b: number[]): number {
  let total = 0;
  for (let i = 0; i < a.length; i += 1) {
    total += a[i] * b[i];
  }
  return total;
}

function fitPreprocessor(xRaw: number[][]): { preprocessor: Preprocessor; x: number[][] } {
  if (!xRaw.length) {
    throw new Error("Training matrix is empty.");
  }

  const featureCount = xRaw[0].length;
  const medians: number[] = [];

  for (let col = 0; col < featureCount; col += 1) {
    const values: number[] = [];
    for (const row of xRaw) {
      const v = row[col];
      if (isFiniteNumber(v)) {
        values.push(v);
      }
    }
    medians.push(median(values));
  }

  const imputed = xRaw.map((row) =>
    row.map((value, col) => (isFiniteNumber(value) ? value : medians[col])),
  );

  const means: number[] = [];
  const stds: number[] = [];

  for (let col = 0; col < featureCount; col += 1) {
    const values = imputed.map((row) => row[col]);
    const avg = mean(values);
    means.push(avg);
    stds.push(std(values, avg));
  }

  const scaled = imputed.map((row) => row.map((value, col) => (value - means[col]) / stds[col]));

  return {
    preprocessor: {
      medians,
      means,
      stds,
    },
    x: scaled,
  };
}

function transformVector(raw: number[], preprocessor: Preprocessor): number[] {
  return raw.map((value, col) => {
    const imputed = isFiniteNumber(value) ? value : preprocessor.medians[col];
    return (imputed - preprocessor.means[col]) / preprocessor.stds[col];
  });
}

function trainLogisticRegression(
  x: number[][],
  y: number[],
  opts: { learningRate?: number; epochs?: number; lambda?: number } = {},
): ModelParams {
  const n = x.length;
  const d = x[0].length;

  const lr = opts.learningRate ?? 0.08;
  const epochs = opts.epochs ?? 450;
  const lambda = opts.lambda ?? 0.001;

  const weights = new Array<number>(d).fill(0);
  let bias = 0;

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    const gradW = new Array<number>(d).fill(0);
    let gradB = 0;

    for (let i = 0; i < n; i += 1) {
      const prediction = sigmoid(dot(weights, x[i]) + bias);
      const err = prediction - y[i];
      gradB += err;
      for (let j = 0; j < d; j += 1) {
        gradW[j] += err * x[i][j];
      }
    }

    gradB /= n;

    for (let j = 0; j < d; j += 1) {
      const regGrad = lambda * weights[j];
      const finalGrad = gradW[j] / n + regGrad;
      weights[j] -= lr * finalGrad;
    }

    bias -= lr * gradB;
  }

  return { weights, bias };
}

function logLoss(yTrue: number[], yProb: number[]): number {
  const n = yTrue.length;
  let loss = 0;
  for (let i = 0; i < n; i += 1) {
    const p = clamp01(yProb[i]);
    const y = yTrue[i];
    loss += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
  }
  return loss / n;
}

function rocAuc(yTrue: number[], yProb: number[]): number {
  const pairs = yTrue.map((label, index) => ({ label, score: yProb[index] }));
  pairs.sort((a, b) => a.score - b.score);

  let nPos = 0;
  let nNeg = 0;
  for (const pair of pairs) {
    if (pair.label === 1) {
      nPos += 1;
    } else {
      nNeg += 1;
    }
  }
  if (nPos === 0 || nNeg === 0) {
    return 0.5;
  }

  let rankSumPos = 0;
  let i = 0;
  while (i < pairs.length) {
    let j = i;
    while (j + 1 < pairs.length && pairs[j + 1].score === pairs[i].score) {
      j += 1;
    }

    const avgRank = (i + 1 + (j + 1)) / 2;
    for (let k = i; k <= j; k += 1) {
      if (pairs[k].label === 1) {
        rankSumPos += avgRank;
      }
    }

    i = j + 1;
  }

  return (rankSumPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}

export function normalizeTeamStats(rawRows: Array<Record<string, string>>): TeamStatRow[] {
  if (!rawRows.length) {
    throw new Error("team_stats.csv is empty.");
  }

  const required = ["season", "team", "seed"];
  const missing = required.filter((col) => !(col in rawRows[0]));
  if (missing.length) {
    throw new Error(`team_stats.csv missing required columns: ${missing.join(", ")}`);
  }

  const rows = rawRows.map((raw) => {
    const row: TeamStatRow = {
      season: Number(raw.season),
      team: String(raw.team ?? "").trim(),
    };

    for (const feature of DEFAULT_FEATURES) {
      row[feature] = toNumber(raw[feature]);
    }

    return row;
  });

  const netRatings = rows.map((row) => toNumber(row.net_rating));
  const allNetRatingsMissing = netRatings.every((value) => !isFiniteNumber(value));

  if (allNetRatingsMissing) {
    for (const row of rows) {
      const offense = toNumber(row.adj_offense);
      const defense = toNumber(row.adj_defense);
      row.net_rating = isFiniteNumber(offense) && isFiniteNumber(defense) ? offense - defense : Number.NaN;
    }
  }

  return rows;
}

export function normalizeGames(rawRows: Array<Record<string, string>>): HistoricalGameRow[] {
  if (!rawRows.length) {
    throw new Error("historical_games.csv is empty.");
  }

  const required = ["season", "team_a", "team_b", "score_a", "score_b"];
  const missing = required.filter((col) => !(col in rawRows[0]));
  if (missing.length) {
    throw new Error(`historical_games.csv missing required columns: ${missing.join(", ")}`);
  }

  return rawRows.map((raw) => ({
    season: Number(raw.season),
    team_a: String(raw.team_a ?? "").trim(),
    team_b: String(raw.team_b ?? "").trim(),
    score_a: Number(raw.score_a),
    score_b: Number(raw.score_b),
    neutral_site: Number(raw.neutral_site ?? 1),
  }));
}

export function applyInjuries(
  teamStats: TeamStatRow[],
  injuriesRows: Array<Record<string, string>> | null,
  season: number,
): TeamStatRow[] {
  if (!injuriesRows || injuriesRows.length === 0) {
    return teamStats;
  }

  const hasTeam = "team" in injuriesRows[0];
  const hasImpact = "injuries_impact" in injuriesRows[0];
  if (!hasTeam || !hasImpact) {
    throw new Error("injuries.csv must include team and injuries_impact columns");
  }

  const override = new Map<string, number>();
  for (const raw of injuriesRows) {
    const team = String(raw.team ?? "").trim();
    const impact = toNumber(raw.injuries_impact);
    if (!team || !isFiniteNumber(impact)) {
      continue;
    }
    override.set(team, impact);
  }

  return teamStats.map((row) => {
    if (row.season !== season) {
      return row;
    }
    const custom = override.get(row.team);
    if (custom === undefined) {
      return row;
    }
    return {
      ...row,
      injuries_impact: custom,
    };
  });
}

export function seasonSnapshot(teamStats: TeamStatRow[], season: number): TeamStatRow[] {
  const rows = teamStats.filter((row) => row.season === season);
  if (!rows.length) {
    throw new Error(`No team stats found for season ${season}`);
  }

  const dedup = new Map<string, TeamStatRow>();
  for (const row of rows) {
    dedup.set(row.team, row);
  }

  return [...dedup.values()];
}

function buildTrainingSet(
  teamStats: TeamStatRow[],
  games: HistoricalGameRow[],
  featureCols: FeatureName[],
): TrainingSet {
  const statMap = new Map<string, TeamStatRow>();
  for (const row of teamStats) {
    statMap.set(`${row.season}|${row.team}`, row);
  }

  const x: number[][] = [];
  const y: number[] = [];
  const featureNames = [...featureCols.map((feature) => `diff_${feature}`), "seed_gap", "neutral_site"];

  for (const game of games) {
    const rowA = statMap.get(`${game.season}|${game.team_a}`);
    const rowB = statMap.get(`${game.season}|${game.team_b}`);
    if (!rowA || !rowB) {
      continue;
    }

    const diff = featureCols.map((feature) => toNumber(rowA[feature]) - toNumber(rowB[feature]));
    const seedGap = toNumber(rowB.seed) - toNumber(rowA.seed);
    const neutralSite = toNumber(game.neutral_site);

    const forward = [...diff, seedGap, neutralSite];
    const reverse = [...diff.map((value) => -value), -seedGap, neutralSite];

    x.push(forward);
    y.push(game.score_a > game.score_b ? 1 : 0);

    x.push(reverse);
    y.push(game.score_b > game.score_a ? 1 : 0);
  }

  if (!x.length) {
    throw new Error("No historical games matched team_stats.csv. Check team naming.");
  }

  return { x, y, featureNames };
}

export function trainMatchupModel(
  teamStats: TeamStatRow[],
  games: HistoricalGameRow[],
  featureCols: FeatureName[] = [...DEFAULT_FEATURES],
): { model: MatchupModel; metrics: TrainingMetrics } {
  const dataset = buildTrainingSet(teamStats, games, featureCols);
  const preprocessed = fitPreprocessor(dataset.x);
  const params = trainLogisticRegression(preprocessed.x, dataset.y);

  const probabilities = preprocessed.x.map((row) => sigmoid(dot(params.weights, row) + params.bias));

  const metrics: TrainingMetrics = {
    log_loss: logLoss(dataset.y, probabilities),
    roc_auc: rocAuc(dataset.y, probabilities),
    training_games: dataset.x.length,
  };

  return {
    model: {
      featureCols,
      featureNames: dataset.featureNames,
      preprocessor: preprocessed.preprocessor,
      params,
    },
    metrics,
  };
}

function matchupFeatureVector(
  snapshotMap: Map<string, TeamStatRow>,
  teamA: string,
  teamB: string,
  featureCols: FeatureName[],
): number[] {
  const rowA = snapshotMap.get(teamA);
  const rowB = snapshotMap.get(teamB);

  if (!rowA) {
    throw new Error(`Missing team in season snapshot: ${teamA}`);
  }
  if (!rowB) {
    throw new Error(`Missing team in season snapshot: ${teamB}`);
  }

  const diff = featureCols.map((feature) => toNumber(rowA[feature]) - toNumber(rowB[feature]));
  const seedGap = toNumber(rowB.seed) - toNumber(rowA.seed);
  return [...diff, seedGap, 1];
}

export function predictMatchup(
  model: MatchupModel,
  snapshotMap: Map<string, TeamStatRow>,
  teamA: string,
  teamB: string,
): number {
  const raw = matchupFeatureVector(snapshotMap, teamA, teamB, model.featureCols);
  const transformed = transformVector(raw, model.preprocessor);
  return sigmoid(dot(model.params.weights, transformed) + model.params.bias);
}

class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state += 0x6d2b79f5;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

export function simulateTournament(
  model: MatchupModel,
  bracket: BracketGame[],
  snapshot: TeamStatRow[],
  simulations: number,
  randomSeed: number,
  lockedWinners: Record<string, string> = {},
): {
  summary: MatchupSummaryRow[];
  advancement: AdvancementRow[];
  bestBracket: BestBracketRow[];
} {
  const rng = new SeededRandom(randomSeed);
  const snapshotMap = new Map(snapshot.map((row) => [row.team, row] as const));

  const ordered = [...bracket].sort((a, b) => (a.round_order - b.round_order) || a.slot.localeCompare(b.slot));
  const maxRound = Math.max(...ordered.map((row) => row.round_order));

  const probabilityCache = new Map<string, number>();
  const advancementCounts = new Map<string, number>();
  const pathCounts = new Map<string, number>();

  const summaryAgg = new Map<
    string,
    {
      slot: string;
      round_order: number;
      round_name: string;
      region: string;
      team_a: string;
      team_b: string;
      p_sum: number;
      wins_a: number;
      count: number;
      is_locked: boolean;
    }
  >();

  function cachedProb(teamA: string, teamB: string): number {
    const key = `${teamA}||${teamB}`;
    const reverseKey = `${teamB}||${teamA}`;

    if (!probabilityCache.has(key)) {
      const pA = predictMatchup(model, snapshotMap, teamA, teamB);
      probabilityCache.set(key, pA);
      probabilityCache.set(reverseKey, 1 - pA);
    }

    return probabilityCache.get(key) ?? 0.5;
  }

  for (let simId = 0; simId < simulations; simId += 1) {
    const winners: Record<string, string> = { ...lockedWinners };
    const path: Array<Record<string, string>> = [];

    for (const game of ordered) {
      const slot = game.slot;
      const teamA = resolveTeam(game.team_a, winners);
      const teamB = resolveTeam(game.team_b, winners);
      const pTeamA = cachedProb(teamA, teamB);

      let winner: string;
      const isLocked = Boolean(lockedWinners[slot]);

      if (isLocked) {
        winner = lockedWinners[slot];
      } else {
        winner = rng.next() < pTeamA ? teamA : teamB;
        winners[slot] = winner;
      }

      if (!winners[slot]) {
        winners[slot] = winner;
      }

      path.push({ [slot]: winner });

      const advancementKey = `${winner}||${game.round_order}`;
      advancementCounts.set(advancementKey, (advancementCounts.get(advancementKey) ?? 0) + 1);

      const aggKey = [
        slot,
        String(game.round_order),
        game.round_name,
        game.region,
        teamA,
        teamB,
      ].join("\u0001");

      const current = summaryAgg.get(aggKey);
      if (!current) {
        summaryAgg.set(aggKey, {
          slot,
          round_order: game.round_order,
          round_name: game.round_name,
          region: game.region,
          team_a: teamA,
          team_b: teamB,
          p_sum: pTeamA,
          wins_a: winner === teamA ? 1 : 0,
          count: 1,
          is_locked: isLocked,
        });
      } else {
        current.p_sum += pTeamA;
        current.wins_a += winner === teamA ? 1 : 0;
        current.count += 1;
        current.is_locked = current.is_locked || isLocked;
      }
    }

    const pathKey = JSON.stringify(path);
    pathCounts.set(pathKey, (pathCounts.get(pathKey) ?? 0) + 1);
  }

  const teams = [...new Set(snapshot.map((row) => row.team))].sort((a, b) => a.localeCompare(b));
  const advancement: AdvancementRow[] = teams.map((team) => {
    const row: AdvancementRow = { team };
    for (let round = 1; round <= maxRound; round += 1) {
      row[`reach_round_${round}`] = (advancementCounts.get(`${team}||${round}`) ?? 0) / simulations;
    }
    return row;
  });

  advancement.sort((a, b) => {
    const col = `reach_round_${maxRound}`;
    return Number(b[col] ?? 0) - Number(a[col] ?? 0);
  });

  const summary: MatchupSummaryRow[] = [...summaryAgg.values()]
    .map((agg) => {
      const teamAWinRate = agg.wins_a / agg.count;
      return {
        slot: agg.slot,
        round_order: agg.round_order,
        round_name: agg.round_name,
        region: agg.region,
        team_a: agg.team_a,
        team_b: agg.team_b,
        p_team_a: agg.p_sum / agg.count,
        p_team_b: 1 - agg.p_sum / agg.count,
        team_a_win_rate: teamAWinRate,
        team_b_win_rate: 1 - teamAWinRate,
        winner: teamAWinRate >= 0.5 ? agg.team_a : agg.team_b,
        is_locked: agg.is_locked,
      };
    })
    .sort((a, b) => (a.round_order - b.round_order) || a.slot.localeCompare(b.slot));

  let bestPathKey = "";
  let bestPathCount = -1;
  for (const [pathKey, count] of pathCounts.entries()) {
    if (count > bestPathCount) {
      bestPathCount = count;
      bestPathKey = pathKey;
    }
  }

  const bestPath = bestPathKey ? (JSON.parse(bestPathKey) as Array<Record<string, string>>) : [];
  const gameBySlot = new Map(ordered.map((game) => [game.slot, game] as const));

  const bestBracket: BestBracketRow[] = bestPath
    .map((item) => {
      const [slot, winner] = Object.entries(item)[0];
      const game = gameBySlot.get(slot);
      if (!game) {
        return null;
      }
      return {
        slot,
        round_order: game.round_order,
        round_name: game.round_name,
        region: game.region,
        winner,
        is_locked: Boolean(lockedWinners[slot]),
      };
    })
    .filter((row): row is BestBracketRow => Boolean(row))
    .sort((a, b) => (a.round_order - b.round_order) || a.slot.localeCompare(b.slot));

  return {
    summary,
    advancement,
    bestBracket,
  };
}
