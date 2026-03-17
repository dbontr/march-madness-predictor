import fs from "node:fs";
import path from "node:path";

import { parse } from "csv-parse/sync";

import { applyKnownResults } from "./bracket";
import {
  applyInjuries,
  normalizeGames,
  normalizeTeamStats,
  seasonSnapshot,
  simulateTournament,
  trainMatchupModel,
} from "./model";
import {
  FetchError,
  fetchBracketFromEspn,
  fetchCompletedResults,
  fetchTeamLogoMap,
  loadAliasMap,
  maybeAlias,
} from "./publicSources";
import { BracketGame, DEFAULT_FEATURES, PredictionPayload, TeamStatRow } from "./types";

interface Config {
  site_title?: string;
  data_dir?: string;
  docs_data_dir?: string;
  default_simulations?: number;
  tournament_windows?: Record<
    string,
    {
      first_four_start: string;
      championship_date: string;
    }
  >;
}

export interface RunOptions {
  season?: number;
  simulations?: number;
  randomSeed?: number;
  skipPublicFetch?: boolean;
}

function readJsonFile<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

function readCsvRows(filePath: string): Array<Record<string, string>> {
  const raw = fs.readFileSync(filePath, "utf-8");
  return parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Array<Record<string, string>>;
}

function readOptionalCsvRows(filePath: string): Array<Record<string, string>> | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return readCsvRows(filePath);
}

function determineSeason(explicit?: number): number {
  if (explicit) {
    return Number(explicit);
  }
  return new Date().getUTCFullYear();
}

function defaultWindowForSeason(config: Config, season: number): [string, string] {
  const windows = config.tournament_windows ?? {};
  const seasonKey = String(season);
  if (windows[seasonKey]) {
    return [windows[seasonKey].first_four_start, windows[seasonKey].championship_date];
  }
  return [`${season}-03-15`, `${season}-04-08`];
}

function normalizeNameColumns<T>(
  rows: T[],
  columns: Array<keyof T>,
  aliasMap: Record<string, string>,
): T[] {
  return rows.map((row) => {
    const out = { ...(row as Record<string, unknown>) };
    for (const column of columns) {
      const key = String(column);
      if (key in out && out[key] !== undefined && out[key] !== null) {
        out[key] = maybeAlias(String(out[key]), aliasMap);
      }
    }
    return out as T;
  });
}

function parseBracketRows(rows: Array<Record<string, string>>): BracketGame[] {
  return rows.map((row) => ({
    slot: String(row.slot),
    round_order: Number(row.round_order),
    round_name: String(row.round_name),
    region: String(row.region),
    team_a: String(row.team_a),
    team_b: String(row.team_b),
  }));
}

function percentRankNotes(probability: number): string {
  if (probability >= 0.15) {
    return "Tier 1 title profile";
  }
  if (probability >= 0.08) {
    return "Strong contender";
  }
  if (probability >= 0.04) {
    return "Live dark horse";
  }
  return "Long-shot path";
}

function latestIsoUtc(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function assertBracketCoverage(snapshot: TeamStatRow[], bracket: BracketGame[]): void {
  const snapshotTeams = new Set(snapshot.map((row) => row.team));
  const bracketTeams = new Set<string>();

  for (const game of bracket) {
    for (const team of [game.team_a, game.team_b]) {
      if (team !== "TBD" && !team.startsWith("@slot:")) {
        bracketTeams.add(team);
      }
    }
  }

  const missing = [...bracketTeams].filter((team) => !snapshotTeams.has(team));
  if (missing.length) {
    throw new Error(
      `Some bracket teams are missing from team_stats.csv for this season: ${missing.sort().join(", ")}`,
    );
  }
}

export async function runLivePrediction(options: RunOptions = {}): Promise<PredictionPayload> {
  const root = process.cwd();
  const config = readJsonFile<Config>(path.join(root, "config.json"));

  const season = determineSeason(options.season);
  const simulations = Number(options.simulations ?? config.default_simulations ?? 5000);
  const randomSeed = Number(options.randomSeed ?? 42);
  const skipPublicFetch = Boolean(options.skipPublicFetch ?? false);

  const rawDir = path.join(root, String(config.data_dir ?? "data/raw"), String(season));

  const aliasRows = readOptionalCsvRows(path.join(rawDir, "aliases.csv")) ?? [];
  const aliasMap = loadAliasMap(aliasRows);

  const teamStatsRaw = readCsvRows(path.join(rawDir, "team_stats.csv"));
  const historicalRaw = readCsvRows(path.join(rawDir, "historical_games.csv"));
  const injuriesRaw = readOptionalCsvRows(path.join(rawDir, "injuries.csv"));

  let teamStats = normalizeTeamStats(teamStatsRaw);
  let historicalGames = normalizeGames(historicalRaw);

  teamStats = normalizeNameColumns(teamStats, ["team"], aliasMap);
  historicalGames = normalizeNameColumns(historicalGames, ["team_a", "team_b"], aliasMap);

  const injuries = injuriesRaw ? normalizeNameColumns(injuriesRaw, ["team"], aliasMap) : null;

  const bracketCachePath = path.join(rawDir, "bracket.csv");
  let bracket: BracketGame[];

  if (skipPublicFetch) {
    if (!fs.existsSync(bracketCachePath)) {
      throw new Error(`No cached bracket found at ${bracketCachePath}`);
    }
    bracket = parseBracketRows(readCsvRows(bracketCachePath));
  } else {
    try {
      bracket = await fetchBracketFromEspn(season);
    } catch (error) {
      if (fs.existsSync(bracketCachePath)) {
        bracket = parseBracketRows(readCsvRows(bracketCachePath));
      } else {
        throw new FetchError(`Could not fetch bracket and no fallback exists: ${String(error)}`);
      }
    }
  }

  bracket = normalizeNameColumns(bracket, ["team_a", "team_b"], aliasMap);

  teamStats = applyInjuries(teamStats, injuries, season);
  const snapshot = seasonSnapshot(teamStats, season);

  assertBracketCoverage(snapshot, bracket);

  const { model, metrics } = trainMatchupModel(teamStats, historicalGames, [...DEFAULT_FEATURES]);

  const [startDay, endDay] = defaultWindowForSeason(config, season);
  let knownResults: Record<string, string> = {};

  if (!skipPublicFetch) {
    try {
      knownResults = await fetchCompletedResults(startDay, endDay, aliasMap);
    } catch {
      knownResults = {};
    }
  }

  const lockedWinners = applyKnownResults(bracket, knownResults);

  let teamLogos: Record<string, string> = {};
  try {
    teamLogos = await fetchTeamLogoMap(snapshot.map((row) => row.team), aliasMap);
  } catch {
    teamLogos = {};
  }

  const { summary, advancement, bestBracket } = simulateTournament(
    model,
    bracket,
    snapshot,
    simulations,
    randomSeed,
    lockedWinners,
  );

  const maxRound = Math.max(...bracket.map((row) => row.round_order));
  const champCol = `reach_round_${maxRound}`;

  const titleOdds = [...advancement]
    .map((row) => {
      const probability = Number(row[champCol] ?? 0);
      return {
        team: String(row.team),
        title_prob: probability,
        note: percentRankNotes(probability),
      };
    })
    .sort((a, b) => b.title_prob - a.title_prob)
    .slice(0, 16);

  return {
    meta: {
      season,
      simulations,
      updated_at: latestIsoUtc(),
      training_metrics: metrics,
      team_logos_count: Object.keys(teamLogos).length,
    },
    matchups: summary,
    title_odds: titleOdds,
    best_bracket: bestBracket,
    team_logos: teamLogos,
  };
}
