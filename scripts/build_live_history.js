#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function parseCsv(text) {
  const rows = [];
  const source = String(text || "").replace(/^\uFEFF/, "");
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell.length || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  if (!rows.length) return { header: [], rows: [] };

  const header = rows[0].map((value) => String(value).trim());
  const data = rows.slice(1).filter((cols) => cols.some((value) => value !== ""));
  return {
    header,
    rows: data.map((cols, index) => {
      const out = { __source_index: index };
      header.forEach((key, col) => {
        out[key] = cols[col] ?? "";
      });
      return out;
    }),
  };
}

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(header, rows) {
  const lines = [header.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(header.map((key) => csvEscape(row[key])).join(","));
  }
  return `${lines.join("\n")}\n`;
}
function isPostseasonRound(roundName) {
  const name = String(roundName || "").toLowerCase();
  return (
    name.includes("postseason") ||
    name.includes("tournament") ||
    name.includes("championship") ||
    name.includes("first four") ||
    name.includes("round of 64") ||
    name.includes("round of 32") ||
    name.includes("sweet 16") ||
    name.includes("elite eight") ||
    name.includes("final four")
  );
}

function capRowsEvenly(rows, maxRows) {
  const cap = Math.max(0, Math.round(Number(maxRows) || 0));
  if (!cap || rows.length <= cap) return rows;
  if (cap === 1) return [rows[rows.length - 1]];

  const selected = [];
  const used = new Set();
  const step = (rows.length - 1) / (cap - 1);
  for (let i = 0; i < cap; i += 1) {
    const index = Math.round(i * step);
    if (used.has(index)) continue;
    used.add(index);
    selected.push(rows[index]);
  }
  return selected;
}
function buildLiveRows(rows, options = {}) {
  const targetSeason = Math.round(Number(options.targetSeason));
  const maxSeasons = Math.max(1, Math.round(Number(options.maxSeasons) || 5));
  const includePostseason = options.includePostseason !== false;
  const seasons = [...new Set(rows.map((row) => Number(row.season)))]
    .filter((season) => Number.isFinite(season) && season <= targetSeason)
    .sort((a, b) => a - b)
    .slice(-maxSeasons);
  const seasonSet = new Set(seasons);

  const filtered = rows
    .filter((row) => seasonSet.has(Number(row.season)))
    .filter((row) => includePostseason || !isPostseasonRound(row.round_name))
    .sort((a, b) => {
      const seasonDiff = Number(a.season) - Number(b.season);
      if (seasonDiff !== 0) return seasonDiff;
      const dateDiff = String(a.game_date || "").localeCompare(String(b.game_date || ""));
      if (dateDiff !== 0) return dateDiff;
      return Number(a.__source_index || 0) - Number(b.__source_index || 0);
    });

  return capRowsEvenly(filtered, options.gameCap);
}

function buildLiveTeamStatsRows(rows, liveHistoryRows, options = {}) {
  const targetSeason = Math.round(Number(options.targetSeason));
  const historySeasons = [...new Set((liveHistoryRows || []).map((row) => Number(row.season)))]
    .filter((season) => Number.isFinite(season) && season <= targetSeason)
    .sort((a, b) => a - b);
  const keepSeasons = new Set(historySeasons);
  if (historySeasons.length) keepSeasons.add(historySeasons[0] - 1);
  if (Number.isFinite(targetSeason)) keepSeasons.add(targetSeason);

  return (rows || [])
    .filter((row) => keepSeasons.has(Number(row.season)))
    .sort((a, b) => {
      const seasonDiff = Number(a.season) - Number(b.season);
      if (seasonDiff !== 0) return seasonDiff;
      return String(a.team || '').localeCompare(String(b.team || ''));
    });
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--season" && next) { out.season = Number(next); i += 1; }
    else if (arg === "--max-seasons" && next) { out.maxSeasons = Number(next); i += 1; }
    else if (arg === "--game-cap" && next) { out.gameCap = Number(next); i += 1; }
    else if (arg === "--source" && next) { out.source = next; i += 1; }
    else if (arg === "--out" && next) { out.out = next; i += 1; }
    else if (arg === "--team-source" && next) { out.teamSource = next; i += 1; }
    else if (arg === "--team-out" && next) { out.teamOut = next; i += 1; }
    else if (arg === "--exclude-postseason") out.includePostseason = false;
    else if (arg === "--include-postseason") out.includePostseason = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return out;
}
function printHelp() {
  console.log([
    "Build the compact historical data file used by the browser runtime.",
    "",
    "Usage:",
    "  node scripts/build_live_history.js --season 2026",
    "",
    "Options:",
    "  --max-seasons <n>",
    "  --game-cap <n>",
    "  --source <csv>",
    "  --out <csv>",
    "  --team-source <csv>",
    "  --team-out <csv>",
    "  --exclude-postseason",
  ].join("\n"));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return printHelp();

  const workspace = process.cwd();
  const configPath = path.join(workspace, "docs", "data", "runtime", "config.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const season = Math.round(args.season || config.default_season || new Date().getUTCFullYear());
  const liveConfig = config.live_runtime || {};
  const source = path.resolve(workspace, args.source || `docs/data/runtime/${season}/historical_games.csv`);
  const output = path.resolve(workspace, args.out || `docs/data/runtime/${season}/historical_games_live.csv`);
  const teamSource = path.resolve(workspace, args.teamSource || `docs/data/runtime/${season}/team_stats.csv`);
  const teamOutput = path.resolve(workspace, args.teamOut || `docs/data/runtime/${season}/team_stats_live.csv`);

  const parsed = parseCsv(fs.readFileSync(source, "utf8"));
  const rows = buildLiveRows(parsed.rows, {
    targetSeason: season,
    maxSeasons: args.maxSeasons || liveConfig.max_seasons || 5,
    gameCap: args.gameCap || liveConfig.game_cap || 2600,
    includePostseason: args.includePostseason ?? liveConfig.include_postseason !== false,
  });

  const parsedTeamStats = parseCsv(fs.readFileSync(teamSource, "utf8"));
  const liveTeamStats = buildLiveTeamStatsRows(parsedTeamStats.rows, rows, { targetSeason: season });

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, toCsv(parsed.header, rows), "utf8");
  fs.mkdirSync(path.dirname(teamOutput), { recursive: true });
  fs.writeFileSync(teamOutput, toCsv(parsedTeamStats.header, liveTeamStats), "utf8");
  console.log(JSON.stringify({
    source,
    output,
    source_rows: parsed.rows.length,
    live_rows: rows.length,
    team_source: teamSource,
    team_output: teamOutput,
    team_source_rows: parsedTeamStats.rows.length,
    live_team_rows: liveTeamStats.length,
  }, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = { parseCsv, toCsv, capRowsEvenly, buildLiveRows, buildLiveTeamStatsRows, isPostseasonRound };
