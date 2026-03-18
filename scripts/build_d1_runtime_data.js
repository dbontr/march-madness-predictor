#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard";
const TEAM_STATS_URL = (teamId, season) =>
  `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/${encodeURIComponent(teamId)}/statistics?season=${encodeURIComponent(season)}`;
const SUMMARY_URL = (eventId) =>
  `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary?event=${encodeURIComponent(eventId)}`;

function printHelp() {
  console.log(`
Build full D1 runtime dataset (games + team stats + optional market lines)

Usage:
  node scripts/build_d1_runtime_data.js [options]

Options:
  --target-season <year>          Target runtime folder season (default: 2026)
  --from-season <year>            First season label to include (default: target-2)
  --to-season <year>              Last season label to include (default: target)
  --include-postseason            Include postseason + conference tournaments (default: true)
  --exclude-postseason            Use regular season only
  --market-lines                  Enrich historical_games with pickcenter lines (default: true)
  --no-market-lines               Skip summary/pickcenter fetch
  --day-concurrency <n>           Concurrent daily scoreboard fetches (default: 8)
  --team-stats-concurrency <n>    Concurrent team stats fetches (default: 12)
  --summary-concurrency <n>       Concurrent summary fetches (default: 10)
  --retry <n>                     Retry attempts per request (default: 4)
  --timeout-ms <n>                Request timeout in ms (default: 12000)
  --max-days <n>                  Limit days per season (debug)
  --max-events <n>                Limit total games after fetch (debug)
  --cache-file <file>             Summary cache path (default: data/generated/<target>/summary_market_cache.json)
  --skip-cache                    Ignore existing summary cache
  --raw-out <dir>                 Output root for raw CSV (default: data/raw)
  --runtime-out <dir>             Output root for runtime CSV (default: docs/data/runtime)
  --no-write-raw                  Do not write data/raw output
  --no-write-runtime              Do not write docs/data/runtime output
  --progress-every <n>            Print progress every N items (default: 100)
  --help                          Show this help

Example:
  node scripts/build_d1_runtime_data.js \
    --target-season 2026 \
    --from-season 2018 \
    --to-season 2026 \
    --market-lines
`.trim());
}

function parseNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : Number.NaN;
}

function isFiniteNumber(value) {
  return Number.isFinite(value);
}

function finiteOr(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function canonicalName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replaceAll("&", " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dateToYmd(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function ymdToDate(ymd) {
  const [y, m, d] = String(ymd).split("-").map((v) => Number(v));
  return new Date(Date.UTC(y, m - 1, d));
}

function ymdCompact(ymd) {
  return String(ymd).replaceAll("-", "");
}

function addDays(ymd, days) {
  const date = ymdToDate(ymd);
  date.setUTCDate(date.getUTCDate() + days);
  return dateToYmd(date);
}

function enumerateDays(startYmd, endYmd) {
  const out = [];
  for (let cur = startYmd; cur <= endYmd; cur = addDays(cur, 1)) {
    out.push(cur);
  }
  return out;
}

function moneylineToProbability(ml) {
  const v = toNumber(ml);
  if (!isFiniteNumber(v) || v === 0) return Number.NaN;
  if (v > 0) return 100 / (v + 100);
  return -v / (-v + 100);
}

function spreadToProbability(spread) {
  const s = toNumber(spread);
  if (!isFiniteNumber(s)) return Number.NaN;
  return 1 / (1 + Math.exp(-s / 6.8));
}

function parseArgs(argv) {
  const out = {
    targetSeason: 2026,
    includePostseason: true,
    includeMarketLines: true,
    dayConcurrency: 8,
    teamStatsConcurrency: 12,
    summaryConcurrency: 10,
    retry: 4,
    timeoutMs: 12000,
    maxDays: 0,
    maxEvents: 0,
    cacheFile: "",
    skipCache: false,
    rawOut: "data/raw",
    runtimeOut: "docs/data/runtime",
    writeRaw: true,
    writeRuntime: true,
    progressEvery: 100,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--help" || arg === "-h") {
      out.help = true;
      continue;
    }
    if (arg === "--target-season" && next) {
      out.targetSeason = Math.round(parseNumber(next, out.targetSeason));
      i += 1;
      continue;
    }
    if (arg === "--from-season" && next) {
      out.fromSeason = Math.round(parseNumber(next, Number.NaN));
      i += 1;
      continue;
    }
    if (arg === "--to-season" && next) {
      out.toSeason = Math.round(parseNumber(next, Number.NaN));
      i += 1;
      continue;
    }
    if (arg === "--include-postseason") {
      out.includePostseason = true;
      continue;
    }
    if (arg === "--exclude-postseason") {
      out.includePostseason = false;
      continue;
    }
    if (arg === "--market-lines") {
      out.includeMarketLines = true;
      continue;
    }
    if (arg === "--no-market-lines") {
      out.includeMarketLines = false;
      continue;
    }
    if (arg === "--day-concurrency" && next) {
      out.dayConcurrency = Math.round(parseNumber(next, out.dayConcurrency));
      i += 1;
      continue;
    }
    if (arg === "--team-stats-concurrency" && next) {
      out.teamStatsConcurrency = Math.round(parseNumber(next, out.teamStatsConcurrency));
      i += 1;
      continue;
    }
    if (arg === "--summary-concurrency" && next) {
      out.summaryConcurrency = Math.round(parseNumber(next, out.summaryConcurrency));
      i += 1;
      continue;
    }
    if (arg === "--retry" && next) {
      out.retry = Math.round(parseNumber(next, out.retry));
      i += 1;
      continue;
    }
    if (arg === "--timeout-ms" && next) {
      out.timeoutMs = Math.round(parseNumber(next, out.timeoutMs));
      i += 1;
      continue;
    }
    if (arg === "--max-days" && next) {
      out.maxDays = Math.round(parseNumber(next, out.maxDays));
      i += 1;
      continue;
    }
    if (arg === "--max-events" && next) {
      out.maxEvents = Math.round(parseNumber(next, out.maxEvents));
      i += 1;
      continue;
    }
    if (arg === "--cache-file" && next) {
      out.cacheFile = String(next);
      i += 1;
      continue;
    }
    if (arg === "--skip-cache") {
      out.skipCache = true;
      continue;
    }
    if (arg === "--raw-out" && next) {
      out.rawOut = String(next);
      i += 1;
      continue;
    }
    if (arg === "--runtime-out" && next) {
      out.runtimeOut = String(next);
      i += 1;
      continue;
    }
    if (arg === "--no-write-raw") {
      out.writeRaw = false;
      continue;
    }
    if (arg === "--no-write-runtime") {
      out.writeRuntime = false;
      continue;
    }
    if (arg === "--progress-every" && next) {
      out.progressEvery = Math.max(1, Math.round(parseNumber(next, out.progressEvery)));
      i += 1;
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!Number.isFinite(out.fromSeason)) {
    out.fromSeason = out.targetSeason - 2;
  }
  if (!Number.isFinite(out.toSeason)) {
    out.toSeason = out.targetSeason;
  }
  if (out.fromSeason > out.toSeason) {
    const tmp = out.fromSeason;
    out.fromSeason = out.toSeason;
    out.toSeason = tmp;
  }

  out.dayConcurrency = Math.max(1, Math.min(32, out.dayConcurrency));
  out.teamStatsConcurrency = Math.max(1, Math.min(64, out.teamStatsConcurrency));
  out.summaryConcurrency = Math.max(1, Math.min(64, out.summaryConcurrency));
  out.retry = Math.max(1, Math.min(12, out.retry));
  out.timeoutMs = Math.max(2000, Math.min(60000, out.timeoutMs));

  return out;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonWithRetry(url, opts) {
  const retries = Math.max(1, opts.retry || 4);
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), opts.timeoutMs || 12000);
    try {
      const res = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        headers: {
          "accept": "application/json,text/plain;q=0.9,*/*;q=0.8",
          "user-agent": "march-madness-predictor-data-builder/1.0",
        },
      });
      clearTimeout(timeout);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      return await res.json();
    } catch (err) {
      clearTimeout(timeout);
      lastError = err;
      if (attempt < retries) {
        await sleep(220 * (2 ** (attempt - 1)) + Math.floor(Math.random() * 120));
      }
    }
  }
  throw lastError || new Error(`Failed to fetch ${url}`);
}

async function asyncPool(limit, items, worker) {
  const out = new Array(items.length);
  let index = 0;
  let active = 0;
  let resolveDone;
  let rejectDone;
  const done = new Promise((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });

  function launch() {
    if (index >= items.length && active === 0) {
      resolveDone(out);
      return;
    }
    while (active < limit && index < items.length) {
      const i = index;
      const item = items[i];
      index += 1;
      active += 1;
      Promise.resolve()
        .then(() => worker(item, i))
        .then((result) => {
          out[i] = result;
          active -= 1;
          launch();
        })
        .catch((err) => {
          rejectDone(err);
        });
    }
  }

  launch();
  return done;
}

function seasonWindow(season) {
  return {
    start: `${season - 1}-10-15`,
    end: `${season}-04-15`,
  };
}

function eventStatusIsFinal(event) {
  const status = event?.status?.type || {};
  if (status.completed === true) return true;
  const name = String(status.name || "").toUpperCase();
  return name.includes("FINAL");
}

function competitionRoundName(event, competition) {
  const note = String((((competition?.notes || [])[0] || {}).headline || "")).trim();
  if (note) return note;

  const seasonSlug = String(event?.season?.slug || "").toLowerCase();
  if (seasonSlug.includes("regular")) {
    return "Regular Season";
  }
  if (seasonSlug.includes("post")) {
    return "Postseason";
  }
  return "Regular Season";
}

function teamNameFromCompetitor(comp) {
  return String(
    comp?.team?.shortDisplayName ||
      comp?.team?.displayName ||
      comp?.team?.name ||
      "",
  ).trim();
}

function parseScore(comp) {
  return Math.round(parseNumber(comp?.score, Number.NaN));
}

function parseSeasonStatValue(stat) {
  const direct = Number(stat?.value);
  if (Number.isFinite(direct)) {
    return direct;
  }
  const text = String(stat?.displayValue || "").replace(/[%,$]/g, "").replace(/,/g, "").trim();
  const maybe = Number(text);
  return Number.isFinite(maybe) ? maybe : Number.NaN;
}

function statsMapFromTeamStatsPayload(payload) {
  const out = {};
  const categories = payload?.results?.stats?.categories || [];
  for (const cat of categories) {
    for (const stat of cat?.stats || []) {
      const key = String(stat?.name || "").trim();
      if (!key) continue;
      const value = parseSeasonStatValue(stat);
      if (Number.isFinite(value)) {
        out[key] = value;
      }
    }
  }
  return out;
}

function normalizeCsvCell(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    if (Math.abs(value - Math.round(value)) < 1e-9) return String(Math.round(value));
    return String(Number(value.toFixed(6)));
  }
  return String(value);
}

function csvEscape(value) {
  const text = normalizeCsvCell(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function toCsv(rows, header) {
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(header.map((key) => csvEscape(row[key])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function readCsv(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").trim();
  if (!text) return [];

  const lines = text.split(/\r?\n/);
  const header = lines[0].split(",").map((h) => h.trim());
  const out = [];
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cols = [];
    let cur = "";
    let inQuote = false;
    for (let j = 0; j < line.length; j += 1) {
      const ch = line[j];
      if (inQuote) {
        if (ch === '"') {
          if (line[j + 1] === '"') {
            cur += '"';
            j += 1;
          } else {
            inQuote = false;
          }
        } else {
          cur += ch;
        }
      } else if (ch === ',') {
        cols.push(cur);
        cur = "";
      } else if (ch === '"') {
        inQuote = true;
      } else {
        cur += ch;
      }
    }
    cols.push(cur);

    const row = {};
    for (let j = 0; j < header.length; j += 1) {
      row[header[j]] = cols[j] || "";
    }
    out.push(row);
  }
  return out;
}

function readSeedHints(workspace, targetSeason) {
  const seedMap = new Map();
  const candidateFiles = [
    path.join(workspace, "docs", "data", "runtime", String(targetSeason), "team_stats.csv"),
    path.join(workspace, "data", "raw", String(targetSeason), "team_stats.csv"),
  ];

  for (const file of candidateFiles) {
    for (const row of readCsv(file)) {
      const season = Math.round(parseNumber(row.season, Number.NaN));
      const team = String(row.team || "").trim();
      const seed = Math.round(parseNumber(row.seed, Number.NaN));
      if (!Number.isFinite(season) || !team || !Number.isFinite(seed)) continue;
      if (seed < 1 || seed > 16) continue;
      seedMap.set(`${season}|${team}`, seed);
    }
  }

  return seedMap;
}

function tryReadJson(filePath, fallback) {
  if (!filePath || !fs.existsSync(filePath)) return fallback;
  try {
    const text = fs.readFileSync(filePath, "utf8");
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function writeJson(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(obj, null, 2)}\n`, "utf8");
}

function summarizeSeasonParticipants(events) {
  const out = new Map();
  for (const event of events) {
    const keyA = `${event.season}|${event.team_a}`;
    const keyB = `${event.season}|${event.team_b}`;
    if (event.team_a_id) out.set(keyA, event.team_a_id);
    if (event.team_b_id) out.set(keyB, event.team_b_id);
  }
  return out;
}

function daysBetween(aYmd, bYmd) {
  if (!aYmd || !bYmd) return Number.NaN;
  const a = ymdToDate(aYmd);
  const b = ymdToDate(bYmd);
  return Math.round((b.getTime() - a.getTime()) / (24 * 3600 * 1000));
}

function attachRestDays(events) {
  const lastSeen = new Map();
  for (const row of events) {
    const keyA = `${row.season}|${row.team_a}`;
    const keyB = `${row.season}|${row.team_b}`;

    const prevA = lastSeen.get(keyA);
    const prevB = lastSeen.get(keyB);
    const gapA = isFiniteNumber(daysBetween(prevA, row.game_date)) ? daysBetween(prevA, row.game_date) - 1 : Number.NaN;
    const gapB = isFiniteNumber(daysBetween(prevB, row.game_date)) ? daysBetween(prevB, row.game_date) - 1 : Number.NaN;

    row.rest_days_a = isFiniteNumber(gapA) ? clamp(gapA, 0, 12) : Number.NaN;
    row.rest_days_b = isFiniteNumber(gapB) ? clamp(gapB, 0, 12) : Number.NaN;

    lastSeen.set(keyA, row.game_date);
    lastSeen.set(keyB, row.game_date);
  }
}

function parsePickcenter(summary) {
  const pick = (summary?.pickcenter || [])[0] || null;
  const comp = (summary?.header?.competitions || [])[0] || null;
  if (!pick || !comp) {
    return null;
  }

  const competitors = comp.competitors || [];
  if (competitors.length !== 2) return null;

  const away = competitors.find((c) => c?.homeAway === "away") || null;
  const home = competitors.find((c) => c?.homeAway === "home") || null;
  if (!away || !home) return null;

  const awayId = String(away?.team?.id || away?.id || "").trim();
  const homeId = String(home?.team?.id || home?.id || "").trim();
  if (!awayId || !homeId) return null;

  const awayMl = toNumber(pick?.awayTeamOdds?.moneyLine);
  const homeMl = toNumber(pick?.homeTeamOdds?.moneyLine);

  const spreadAbs = toNumber(pick?.pointSpread);
  const awayFav = pick?.awayTeamOdds?.favorite === true;
  const homeFav = pick?.homeTeamOdds?.favorite === true;

  let spreadAway = Number.NaN;
  let spreadHome = Number.NaN;
  if (isFiniteNumber(spreadAbs)) {
    if (awayFav) {
      spreadAway = spreadAbs;
      spreadHome = -spreadAbs;
    } else if (homeFav) {
      spreadAway = -spreadAbs;
      spreadHome = spreadAbs;
    }
  }

  return {
    moneyline_by_team_id: {
      [awayId]: awayMl,
      [homeId]: homeMl,
    },
    spread_by_team_id: {
      [awayId]: spreadAway,
      [homeId]: spreadHome,
    },
    over_under: toNumber(pick?.total || pick?.overUnder),
  };
}

function buildTeamGamesBySeason(events) {
  const bySeasonTeam = new Map();
  for (const row of events) {
    const keyA = `${row.season}|${row.team_a}`;
    const keyB = `${row.season}|${row.team_b}`;

    if (!bySeasonTeam.has(keyA)) bySeasonTeam.set(keyA, []);
    if (!bySeasonTeam.has(keyB)) bySeasonTeam.set(keyB, []);

    bySeasonTeam.get(keyA).push({
      date: row.game_date,
      opp: row.team_b,
      points_for: row.score_a,
      points_against: row.score_b,
      neutral_site: row.neutral_site,
      home_team: row.home_team,
      won: row.score_a > row.score_b,
    });

    bySeasonTeam.get(keyB).push({
      date: row.game_date,
      opp: row.team_a,
      points_for: row.score_b,
      points_against: row.score_a,
      neutral_site: row.neutral_site,
      home_team: row.home_team,
      won: row.score_b > row.score_a,
    });
  }

  for (const list of bySeasonTeam.values()) {
    list.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }

  return bySeasonTeam;
}

function solveSeasonRatings(events, teamsInSeason, homeBonus = 3.2) {
  const rating = new Map();
  teamsInSeason.forEach((team) => rating.set(team, 0));

  const gamesByTeam = new Map();
  for (const team of teamsInSeason) {
    gamesByTeam.set(team, []);
  }

  for (const row of events) {
    const marginA = row.score_a - row.score_b;
    const marginB = -marginA;

    const aHome = row.neutral_site === 0 && canonicalName(row.home_team) === canonicalName(row.team_a);
    const bHome = row.neutral_site === 0 && canonicalName(row.home_team) === canonicalName(row.team_b);

    const adjA = aHome ? marginA - homeBonus : (bHome ? marginA + homeBonus : marginA);
    const adjB = bHome ? marginB - homeBonus : (aHome ? marginB + homeBonus : marginB);

    gamesByTeam.get(row.team_a)?.push({ opp: row.team_b, margin_adj: adjA });
    gamesByTeam.get(row.team_b)?.push({ opp: row.team_a, margin_adj: adjB });
  }

  for (let iter = 0; iter < 90; iter += 1) {
    const next = new Map(rating);
    for (const team of teamsInSeason) {
      const games = gamesByTeam.get(team) || [];
      if (!games.length) {
        next.set(team, 0);
        continue;
      }
      let sum = 0;
      for (const g of games) {
        sum += g.margin_adj + finiteOr(rating.get(g.opp), 0);
      }
      const candidate = sum / games.length;
      next.set(team, 0.7 * candidate + 0.3 * finiteOr(rating.get(team), 0));
    }

    const avg = [...next.values()].reduce((acc, v) => acc + v, 0) / Math.max(1, next.size);
    for (const team of teamsInSeason) {
      next.set(team, finiteOr(next.get(team), 0) - avg);
    }

    for (const team of teamsInSeason) {
      rating.set(team, next.get(team));
    }
  }

  const sos = new Map();
  for (const team of teamsInSeason) {
    const games = gamesByTeam.get(team) || [];
    if (!games.length) {
      sos.set(team, 0);
      continue;
    }
    const avgOpp = games.reduce((acc, g) => acc + finiteOr(rating.get(g.opp), 0), 0) / games.length;
    sos.set(team, avgOpp);
  }

  return { rating, sos, gamesByTeam };
}

function buildTeamStatsRows(events, teamStatsBySeasonTeam, seedHints) {
  const seasonToTeams = new Map();
  for (const row of events) {
    if (!seasonToTeams.has(row.season)) seasonToTeams.set(row.season, new Set());
    seasonToTeams.get(row.season).add(row.team_a);
    seasonToTeams.get(row.season).add(row.team_b);
  }

  const teamGames = buildTeamGamesBySeason(events);
  const outRows = [];

  for (const [season, teamSet] of [...seasonToTeams.entries()].sort((a, b) => a[0] - b[0])) {
    const teams = [...teamSet].sort((a, b) => a.localeCompare(b));
    const seasonEvents = events.filter((row) => row.season === season);
    const solved = solveSeasonRatings(seasonEvents, teams, 3.2);
    const rating = solved.rating;
    const sos = solved.sos;

    const ratingSorted = [...teams].sort((a, b) => finiteOr(rating.get(b), 0) - finiteOr(rating.get(a), 0));
    const rank = new Map();
    ratingSorted.forEach((team, idx) => rank.set(team, idx + 1));

    const tierSize = Math.max(8, Math.round(ratingSorted.length / 4));

    const leagueThreeRate = meanFinite(teams.map((team) => {
      const stats = teamStatsBySeasonTeam.get(`${season}|${team}`) || {};
      const fga = finiteOr(stats.fieldGoalsAttempted, Number.NaN);
      const tpa = finiteOr(stats.threePointFieldGoalsAttempted, Number.NaN);
      return isFiniteNumber(fga) && fga > 1 ? (tpa / fga) : Number.NaN;
    }), 0.36);

    const leagueFg3 = meanFinite(teams.map((team) => {
      const stats = teamStatsBySeasonTeam.get(`${season}|${team}`) || {};
      const tpa = finiteOr(stats.threePointFieldGoalsAttempted, Number.NaN);
      const tpm = finiteOr(stats.threePointFieldGoalsMade, Number.NaN);
      return isFiniteNumber(tpa) && tpa > 0 ? (tpm / tpa) : Number.NaN;
    }), 0.335);

    const leagueFtRate = meanFinite(teams.map((team) => {
      const stats = teamStatsBySeasonTeam.get(`${season}|${team}`) || {};
      const fga = finiteOr(stats.fieldGoalsAttempted, Number.NaN);
      const fta = finiteOr(stats.freeThrowsAttempted, Number.NaN);
      return isFiniteNumber(fga) && fga > 1 ? (fta / fga) : Number.NaN;
    }), 0.29);

    for (const team of teams) {
      const key = `${season}|${team}`;
      const stats = teamStatsBySeasonTeam.get(key) || {};
      const games = teamGames.get(key) || [];
      const gp = Math.max(1, Math.round(finiteOr(stats.gamesPlayed, games.length || 1)));

      const pointsFor = finiteOr(stats.points, games.reduce((acc, g) => acc + g.points_for, 0));
      const pointsAgainst = games.reduce((acc, g) => acc + g.points_against, 0);

      const fga = finiteOr(stats.fieldGoalsAttempted, Number.NaN);
      const fgm = finiteOr(stats.fieldGoalsMade, Number.NaN);
      const tpa = finiteOr(stats.threePointFieldGoalsAttempted, Number.NaN);
      const tpm = finiteOr(stats.threePointFieldGoalsMade, Number.NaN);
      const fta = finiteOr(stats.freeThrowsAttempted, Number.NaN);
      const to = finiteOr(stats.turnovers, Number.NaN);
      const or = finiteOr(stats.offensiveRebounds, Number.NaN);
      const dr = finiteOr(stats.defensiveRebounds, Number.NaN);
      const ast = finiteOr(stats.assists, Number.NaN);
      const stl = finiteOr(stats.steals, Number.NaN);
      const blk = finiteOr(stats.blocks, Number.NaN);

      let possessions = Number.NaN;
      if ([fga, or, to, fta].every((v) => isFiniteNumber(v))) {
        possessions = fga - or + to + 0.475 * fta;
      }
      if (!isFiniteNumber(possessions) || possessions <= 1) {
        possessions = gp * 68;
      }
      const tempo = possessions / gp;

      const off = 100 * pointsFor / Math.max(1, possessions);
      const def = 100 * pointsAgainst / Math.max(1, possessions);
      const net = finiteOr(rating.get(team), off - def);
      const sosValue = finiteOr(sos.get(team), 0);

      let q1Wins = 0;
      let q2Wins = 0;
      let q3Losses = 0;
      let q4Losses = 0;
      for (const g of games) {
        const oppRank = finiteOr(rank.get(g.opp), ratingSorted.length);
        if (g.won) {
          if (oppRank <= tierSize) q1Wins += 1;
          else if (oppRank <= tierSize * 2) q2Wins += 1;
        } else {
          if (oppRank > tierSize * 2 && oppRank <= tierSize * 3) q3Losses += 1;
          else if (oppRank > tierSize * 3) q4Losses += 1;
        }
      }

      const recent = games.slice(-10);
      const recentForm = recent.length
        ? clamp(recent.reduce((acc, g) => {
            const margin = g.points_for - g.points_against;
            const winComponent = g.won ? 1 : 0;
            const marginComponent = 0.5 + 0.5 * Math.tanh(margin / 12);
            return acc + (0.65 * winComponent + 0.35 * marginComponent);
          }, 0) / recent.length, 0, 1)
        : 0.5;

      const fg3Pct = (isFiniteNumber(tpm) && isFiniteNumber(tpa) && tpa > 0)
        ? (tpm / tpa)
        : finiteOr(stats.threePointFieldGoalPct, 33.5) / 100;
      const tovPct = (isFiniteNumber(to) && isFiniteNumber(possessions) && possessions > 1)
        ? (to / possessions)
        : 0.17;
      const orbPct = (isFiniteNumber(or) && isFiniteNumber(dr))
        ? clamp(or / Math.max(1, or + dr), 0.15, 0.5)
        : 0.31;
      const drbPct = isFiniteNumber(dr)
        ? clamp(dr / Math.max(1, dr + finiteOr(or, dr)), 0.45, 0.85)
        : 0.69;
      const ftRate = (isFiniteNumber(fta) && isFiniteNumber(fga) && fga > 1)
        ? (fta / fga)
        : 0.29;
      const astRate = (isFiniteNumber(ast) && isFiniteNumber(fgm) && fgm > 1)
        ? (ast / fgm)
        : 0.55;
      const stlRate = (isFiniteNumber(stl) && isFiniteNumber(possessions) && possessions > 1)
        ? (stl / possessions)
        : 0.095;
      const blkRate = (isFiniteNumber(blk) && isFiniteNumber(possessions) && possessions > 1)
        ? (blk / possessions)
        : 0.08;
      const threeRate = (isFiniteNumber(tpa) && isFiniteNumber(fga) && fga > 1)
        ? (tpa / fga)
        : leagueThreeRate;

      const oppGames = games.map((g) => teamStatsBySeasonTeam.get(`${season}|${g.opp}`) || {});
      const oppThreeRate = meanFinite(oppGames.map((opp) => {
        const oppFga = finiteOr(opp.fieldGoalsAttempted, Number.NaN);
        const oppTpa = finiteOr(opp.threePointFieldGoalsAttempted, Number.NaN);
        return isFiniteNumber(oppFga) && oppFga > 1 ? oppTpa / oppFga : Number.NaN;
      }), leagueThreeRate);
      const oppFg3Pct = meanFinite(oppGames.map((opp) => {
        const oppTpa = finiteOr(opp.threePointFieldGoalsAttempted, Number.NaN);
        const oppTpm = finiteOr(opp.threePointFieldGoalsMade, Number.NaN);
        return isFiniteNumber(oppTpa) && oppTpa > 0 ? oppTpm / oppTpa : Number.NaN;
      }), leagueFg3);
      const oppFtRate = meanFinite(oppGames.map((opp) => {
        const oppFga = finiteOr(opp.fieldGoalsAttempted, Number.NaN);
        const oppFta = finiteOr(opp.freeThrowsAttempted, Number.NaN);
        return isFiniteNumber(oppFga) && oppFga > 1 ? oppFta / oppFga : Number.NaN;
      }), leagueFtRate);

      const fallbackSeed = clamp(Math.floor(((finiteOr(rank.get(team), teams.length) - 1) / Math.max(1, teams.length)) * 16) + 1, 1, 16);
      const seed = seedHints.get(`${season}|${team}`) || fallbackSeed;

      outRows.push({
        season,
        team,
        seed,
        adj_offense: off + 0.35 * sosValue,
        adj_defense: def - 0.35 * sosValue,
        tempo,
        sos: sosValue,
        net_rating: net,
        q1_wins: q1Wins,
        q2_wins: q2Wins,
        q3_losses: q3Losses,
        q4_losses: q4Losses,
        recent_form: recentForm,
        injuries_impact: 0,
        fg3_pct: fg3Pct,
        tov_pct: tovPct,
        orb_pct: orbPct,
        drb_pct: drbPct,
        ft_rate: ftRate,
        ast_rate: astRate,
        stl_rate: stlRate,
        blk_rate: blkRate,
        three_rate: threeRate,
        opp_three_rate: oppThreeRate,
        opp_fg3_pct: oppFg3Pct,
        opp_ft_rate: oppFtRate,
      });
    }
  }

  outRows.sort((a, b) => (a.season - b.season) || String(a.team).localeCompare(String(b.team)));
  return outRows;
}

function meanFinite(values, fallback) {
  const clean = values.map((v) => Number(v)).filter((v) => Number.isFinite(v));
  if (!clean.length) return fallback;
  return clean.reduce((acc, v) => acc + v, 0) / clean.length;
}

function maybeRelativePath(workspace, target) {
  return path.isAbsolute(target) ? target : path.join(workspace, target);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const workspace = process.cwd();
  const seasons = [];
  for (let s = args.fromSeason; s <= args.toSeason; s += 1) {
    seasons.push(s);
  }

  const summaryCachePath = args.cacheFile
    ? maybeRelativePath(workspace, args.cacheFile)
    : path.join(workspace, "data", "generated", String(args.targetSeason), "summary_market_cache.json");

  console.log(`seasons: ${seasons.join(", ")}`);
  console.log(`include_postseason: ${args.includePostseason}`);
  console.log(`include_market_lines: ${args.includeMarketLines}`);

  const allEvents = [];
  let fetchedDays = 0;

  for (const season of seasons) {
    const win = seasonWindow(season);
    let days = enumerateDays(win.start, win.end);
    if (args.maxDays > 0) {
      days = days.slice(0, args.maxDays);
    }
    console.log(`\n[season ${season}] days: ${days.length} (${win.start} -> ${win.end})`);

    let dayErrors = 0;
    const dayPayloads = await asyncPool(args.dayConcurrency, days, async (day, idx) => {
      const url = `${SCOREBOARD_URL}?dates=${ymdCompact(day)}&groups=50&limit=1000`;
      let payload = { events: [] };
      try {
        payload = await fetchJsonWithRetry(url, args);
      } catch (err) {
        dayErrors += 1;
        console.warn(`  warn: scoreboard fetch failed for ${day}: ${String(err?.message || err)}`);
      }
      fetchedDays += 1;
      if (fetchedDays % Math.max(1, args.progressEvery) === 0 || idx === days.length - 1) {
        console.log(`  fetched scoreboard days: ${fetchedDays}`);
      }
      return { day, payload };
    });
    if (dayErrors > 0) {
      console.warn(`  scoreboard day fetch warnings: ${dayErrors}`);
    }

    const eventMap = new Map();
    for (const item of dayPayloads) {
      const day = item.day;
      const events = item.payload?.events || [];
      for (const event of events) {
        if (Number(event?.season?.year) !== season) continue;
        if (!eventStatusIsFinal(event)) continue;

        const comp = (event.competitions || [])[0] || null;
        if (!comp) continue;
        const competitors = comp.competitors || [];
        if (competitors.length !== 2) continue;

        const teamA = teamNameFromCompetitor(competitors[0]);
        const teamB = teamNameFromCompetitor(competitors[1]);
        const teamAId = String(competitors[0]?.team?.id || competitors[0]?.id || "").trim();
        const teamBId = String(competitors[1]?.team?.id || competitors[1]?.id || "").trim();

        const scoreA = parseScore(competitors[0]);
        const scoreB = parseScore(competitors[1]);
        if (!teamA || !teamB) continue;
        if (!Number.isFinite(scoreA) || !Number.isFinite(scoreB)) continue;

        const neutral = comp.neutralSite === true ? 1 : 0;
        const homeComp = neutral === 0 ? competitors.find((c) => c?.homeAway === "home") : null;
        const homeTeam = homeComp ? teamNameFromCompetitor(homeComp) : "";

        const roundName = competitionRoundName(event, comp);
        const eventDate = dateToYmd(new Date(event?.date || `${day}T00:00:00Z`));

        if (!args.includePostseason) {
          const regularish = String(event?.season?.slug || "").toLowerCase().includes("regular")
            || /regular season/i.test(roundName);
          if (!regularish) continue;
        }

        const row = {
          event_id: String(event?.id || "").trim(),
          season,
          game_date: eventDate,
          round_name: roundName,
          team_a: teamA,
          team_b: teamB,
          team_a_id: teamAId,
          team_b_id: teamBId,
          score_a: scoreA,
          score_b: scoreB,
          neutral_site: neutral,
          home_team: homeTeam,
        };

        if (!row.event_id) continue;
        eventMap.set(row.event_id, row);
      }
    }

    const seasonEvents = [...eventMap.values()].sort((a, b) => {
      if (a.game_date !== b.game_date) return a.game_date.localeCompare(b.game_date);
      return a.event_id.localeCompare(b.event_id);
    });
    console.log(`  final games kept: ${seasonEvents.length}`);
    allEvents.push(...seasonEvents);
  }

  allEvents.sort((a, b) => {
    if (a.season !== b.season) return a.season - b.season;
    if (a.game_date !== b.game_date) return a.game_date.localeCompare(b.game_date);
    return a.event_id.localeCompare(b.event_id);
  });

  if (args.maxEvents > 0 && allEvents.length > args.maxEvents) {
    allEvents.length = args.maxEvents;
  }

  if (!allEvents.length) {
    throw new Error("No final games found for requested seasons.");
  }

  console.log(`\nTotal final games: ${allEvents.length}`);

  attachRestDays(allEvents);

  const participantMap = summarizeSeasonParticipants(allEvents);
  console.log(`Season-team participants: ${participantMap.size}`);

  let summaryCache = {};
  if (args.includeMarketLines && !args.skipCache) {
    summaryCache = tryReadJson(summaryCachePath, {}) || {};
  }

  if (args.includeMarketLines) {
    const eventIds = [...new Set(allEvents.map((row) => row.event_id))];
    const missing = eventIds.filter((id) => !summaryCache[id]);
    console.log(`Market summary cache hits: ${eventIds.length - missing.length}/${eventIds.length}`);

    let processed = 0;
    let summaryErrors = 0;
    await asyncPool(args.summaryConcurrency, missing, async (eventId, idx) => {
      try {
        const payload = await fetchJsonWithRetry(SUMMARY_URL(eventId), args);
        summaryCache[eventId] = {
          fetched_at: new Date().toISOString(),
          pickcenter: parsePickcenter(payload),
        };
      } catch (err) {
        summaryErrors += 1;
        summaryCache[eventId] = {
          fetched_at: new Date().toISOString(),
          pickcenter: null,
          error: String(err?.message || err || ""),
        };
      }
      processed += 1;
      if (
        processed % Math.max(1, args.progressEvery) === 0
        || idx === missing.length - 1
      ) {
        console.log(`  summary fetched: ${processed}/${missing.length}`);
      }
      if (processed % 250 === 0) {
        writeJson(summaryCachePath, summaryCache);
      }
      return null;
    });

    writeJson(summaryCachePath, summaryCache);
    if (summaryErrors > 0) {
      console.warn(`  summary fetch warnings: ${summaryErrors}`);
    }
  }

  for (const row of allEvents) {
    const cached = summaryCache[row.event_id];
    const pick = cached?.pickcenter || null;
    if (!pick) {
      row.market_prob_a = Number.NaN;
      row.market_spread_a = Number.NaN;
      row.moneyline_a = Number.NaN;
      row.moneyline_b = Number.NaN;
      continue;
    }

    const mlA = toNumber(pick.moneyline_by_team_id?.[row.team_a_id]);
    const mlB = toNumber(pick.moneyline_by_team_id?.[row.team_b_id]);
    const spreadA = toNumber(pick.spread_by_team_id?.[row.team_a_id]);

    const pAFromMl = isFiniteNumber(mlA) && isFiniteNumber(mlB)
      ? (() => {
          const pA = moneylineToProbability(mlA);
          const pB = moneylineToProbability(mlB);
          if (!isFiniteNumber(pA) || !isFiniteNumber(pB) || (pA + pB) <= 1e-9) return Number.NaN;
          return pA / (pA + pB);
        })()
      : Number.NaN;
    const pAFromSpread = spreadToProbability(spreadA);

    row.market_prob_a = isFiniteNumber(pAFromMl) ? pAFromMl : pAFromSpread;
    row.market_spread_a = spreadA;
    row.moneyline_a = mlA;
    row.moneyline_b = mlB;
  }

  const seasonTeamPairs = [...participantMap.entries()].map(([key, teamId]) => {
    const [seasonText, ...teamParts] = key.split("|");
    return {
      key,
      season: Number(seasonText),
      team: teamParts.join("|"),
      team_id: teamId,
    };
  });

  const teamStatsBySeasonTeam = new Map();
  let teamStatsDone = 0;

  let teamStatsErrors = 0;
  await asyncPool(args.teamStatsConcurrency, seasonTeamPairs, async (item, idx) => {
    try {
      const payload = await fetchJsonWithRetry(TEAM_STATS_URL(item.team_id, item.season), args);
      const statMap = statsMapFromTeamStatsPayload(payload);
      teamStatsBySeasonTeam.set(item.key, statMap);
    } catch (err) {
      teamStatsErrors += 1;
      teamStatsBySeasonTeam.set(item.key, {});
    }
    teamStatsDone += 1;
    if (
      teamStatsDone % Math.max(1, args.progressEvery) === 0
      || idx === seasonTeamPairs.length - 1
    ) {
      console.log(`  team stats fetched: ${teamStatsDone}/${seasonTeamPairs.length}`);
    }
    return null;
  });
  if (teamStatsErrors > 0) {
    console.warn(`  team stats fetch warnings: ${teamStatsErrors}`);
  }

  const seedHints = readSeedHints(workspace, args.targetSeason);
  const teamStatsRows = buildTeamStatsRows(allEvents, teamStatsBySeasonTeam, seedHints);

  const historicalRows = allEvents.map((row) => ({
    season: row.season,
    team_a: row.team_a,
    team_b: row.team_b,
    score_a: row.score_a,
    score_b: row.score_b,
    neutral_site: row.neutral_site,
    round_name: row.round_name,
    game_date: row.game_date,
    home_team: row.home_team,
    home_edge_a: row.neutral_site === 0
      ? (canonicalName(row.home_team) === canonicalName(row.team_a) ? 1 : -1)
      : 0,
    rest_days_a: row.rest_days_a,
    rest_days_b: row.rest_days_b,
    market_prob_a: row.market_prob_a,
    market_spread_a: row.market_spread_a,
    moneyline_a: row.moneyline_a,
    moneyline_b: row.moneyline_b,
  }));

  const teamStatsHeader = [
    "season", "team", "seed", "adj_offense", "adj_defense", "tempo", "sos", "net_rating",
    "q1_wins", "q2_wins", "q3_losses", "q4_losses", "recent_form", "injuries_impact",
    "fg3_pct", "tov_pct", "orb_pct", "drb_pct", "ft_rate",
    "ast_rate", "stl_rate", "blk_rate", "three_rate", "opp_three_rate", "opp_fg3_pct", "opp_ft_rate",
  ];
  const historicalHeader = [
    "season", "team_a", "team_b", "score_a", "score_b", "neutral_site", "round_name", "game_date",
    "home_team", "home_edge_a", "rest_days_a", "rest_days_b",
    "market_prob_a", "market_spread_a", "moneyline_a", "moneyline_b",
  ];

  const teamStatsCsv = toCsv(teamStatsRows, teamStatsHeader);
  const historicalCsv = toCsv(historicalRows, historicalHeader);

  const rawSeasonDir = path.join(maybeRelativePath(workspace, args.rawOut), String(args.targetSeason));
  const runtimeSeasonDir = path.join(maybeRelativePath(workspace, args.runtimeOut), String(args.targetSeason));

  if (args.writeRaw) {
    fs.mkdirSync(rawSeasonDir, { recursive: true });
    fs.writeFileSync(path.join(rawSeasonDir, "team_stats.csv"), teamStatsCsv, "utf8");
    fs.writeFileSync(path.join(rawSeasonDir, "historical_games.csv"), historicalCsv, "utf8");
    console.log(`wrote ${path.join(rawSeasonDir, "team_stats.csv")}`);
    console.log(`wrote ${path.join(rawSeasonDir, "historical_games.csv")}`);
  }

  if (args.writeRuntime) {
    fs.mkdirSync(runtimeSeasonDir, { recursive: true });
    fs.writeFileSync(path.join(runtimeSeasonDir, "team_stats.csv"), teamStatsCsv, "utf8");
    fs.writeFileSync(path.join(runtimeSeasonDir, "historical_games.csv"), historicalCsv, "utf8");
    console.log(`wrote ${path.join(runtimeSeasonDir, "team_stats.csv")}`);
    console.log(`wrote ${path.join(runtimeSeasonDir, "historical_games.csv")}`);

    const aliasSrc = path.join(rawSeasonDir, "aliases.csv");
    const injSrc = path.join(rawSeasonDir, "injuries.csv");
    const aliasDst = path.join(runtimeSeasonDir, "aliases.csv");
    const injDst = path.join(runtimeSeasonDir, "injuries.csv");
    if (fs.existsSync(aliasSrc) && !fs.existsSync(aliasDst)) {
      fs.copyFileSync(aliasSrc, aliasDst);
      console.log(`copied ${aliasDst}`);
    }
    if (fs.existsSync(injSrc) && !fs.existsSync(injDst)) {
      fs.copyFileSync(injSrc, injDst);
      console.log(`copied ${injDst}`);
    }
  }

  const report = {
    generated_at: new Date().toISOString(),
    target_season: args.targetSeason,
    seasons,
    include_postseason: args.includePostseason,
    include_market_lines: args.includeMarketLines,
    games: historicalRows.length,
    team_rows: teamStatsRows.length,
    unique_teams: new Set(teamStatsRows.map((row) => `${row.season}|${row.team}`)).size,
    market_rows: historicalRows.filter((row) => isFiniteNumber(toNumber(row.market_prob_a))).length,
    min_game_date: historicalRows[0]?.game_date || null,
    max_game_date: historicalRows[historicalRows.length - 1]?.game_date || null,
    cache_file: args.includeMarketLines ? summaryCachePath : null,
  };

  const reportPath = path.join(workspace, "data", "generated", String(args.targetSeason), "full_d1_generation_report.json");
  writeJson(reportPath, report);
  console.log(`wrote ${reportPath}`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
