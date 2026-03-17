(() => {
  const FEATURE_COLS = [
    "seed",
    "adj_offense",
    "adj_defense",
    "tempo",
    "sos",
    "net_rating",
    "q1_wins",
    "q2_wins",
    "q3_losses",
    "q4_losses",
    "recent_form",
    "injuries_impact",
    "fg3_pct",
    "tov_pct",
    "orb_pct",
    "drb_pct",
    "ft_rate",
  ];

  const FIRST_ROUND_SEED_PAIRS = [
    [1, 16],
    [8, 9],
    [5, 12],
    [4, 13],
    [6, 11],
    [3, 14],
    [7, 10],
    [2, 15],
  ];

  const REGION_ORDER = ["EAST", "WEST", "SOUTH", "MIDWEST"];
  const ROUND_NAMES = {
    0: "First Four",
    1: "Round of 64",
    2: "Round of 32",
    3: "Sweet 16",
    4: "Elite Eight",
    5: "Final Four",
    6: "Championship",
  };
  const ESPN_ROUND_POINTS = {
    0: 0,
    1: 10,
    2: 20,
    3: 40,
    4: 80,
    5: 160,
    6: 320,
  };
  const DEFAULT_TUNING = Object.freeze({
    blend_logistic: 0.31,
    blend_tree: 0.23,
    blend_rating: 0.35,
    blend_style: 0.11,
    style_scale: 0.9,
    form_scale: 6.2,
    uncertainty_confidence_scale: 0.34,
    shock_base: 0.08,
    shock_scale: 0.22,
    portfolio_size: 3,
    portfolio_candidates: 140,
    portfolio_leverage_weight: 34,
    portfolio_diversity_penalty: 58,
  });
  const DATA_QUALITY_LIMITS = Object.freeze({
    seed: [1, 16],
    adj_offense: [80, 140],
    adj_defense: [80, 140],
    tempo: [58, 78],
    sos: [-20, 20],
    net_rating: [-40, 40],
    q1_wins: [0, 25],
    q2_wins: [0, 25],
    q3_losses: [0, 25],
    q4_losses: [0, 25],
    recent_form: [0, 1],
    injuries_impact: [-1, 1],
    fg3_pct: [0.2, 0.5],
    tov_pct: [0.08, 0.3],
    orb_pct: [0.15, 0.5],
    drb_pct: [0.45, 0.85],
    ft_rate: [0.12, 0.65],
  });

  const NCAA_NOTE_PREFIXES = [
    "NCAA Men's Basketball Championship - ",
    "Men's Basketball Championship - ",
  ];
  const SCOREBOARD_URL =
    "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard";
  const TEAMS_URL =
    "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams?limit=1000";

  function canonicalName(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replaceAll("&", " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function maybeAlias(name, aliasMap) {
    const key = canonicalName(name);
    return aliasMap[key] || String(name || "").trim();
  }

  function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }

  function isFiniteNumber(value) {
    return Number.isFinite(value);
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    const data = String(text || "").replace(/^\uFEFF/, "");

    for (let i = 0; i < data.length; i += 1) {
      const ch = data[i];

      if (ch === '"') {
        if (inQuotes && data[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (ch === "," && !inQuotes) {
        row.push(field);
        field = "";
        continue;
      }

      if ((ch === "\n" || ch === "\r") && !inQuotes) {
        if (ch === "\r" && data[i + 1] === "\n") {
          i += 1;
        }
        row.push(field);
        field = "";
        if (row.some((cell) => cell.length > 0)) {
          rows.push(row);
        }
        row = [];
        continue;
      }

      field += ch;
    }

    if (field.length > 0 || row.length > 0) {
      row.push(field);
      if (row.some((cell) => cell.length > 0)) {
        rows.push(row);
      }
    }

    if (!rows.length) {
      return [];
    }

    const headers = rows[0].map((h) => h.trim());
    return rows.slice(1).map((values) => {
      const out = {};
      headers.forEach((header, idx) => {
        out[header] = (values[idx] || "").trim();
      });
      return out;
    });
  }

  async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
    }
    return res.json();
  }

  async function fetchText(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
    }
    return res.text();
  }

  function ymdToDate(ymd) {
    const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) {
      throw new Error(`Invalid date: ${ymd}`);
    }
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  }

  function dateToYmd(date) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function ymdCompact(ymd) {
    return ymd.replaceAll("-", "");
  }

  function addDays(ymd, days) {
    const date = ymdToDate(ymd);
    date.setUTCDate(date.getUTCDate() + days);
    return dateToYmd(date);
  }

  function todayYmdUtc() {
    return dateToYmd(new Date());
  }

  function minYmd(a, b) {
    return a <= b ? a : b;
  }

  function maxYmd(a, b) {
    return a >= b ? a : b;
  }

  function enumerateDays(startYmd, endYmd) {
    const out = [];
    for (let current = startYmd; current <= endYmd; current = addDays(current, 1)) {
      out.push(current);
    }
    return out;
  }

  async function fetchScoreboardRange(startYmd, endYmd) {
    const out = [];
    const days = enumerateDays(startYmd, endYmd);

    for (const day of days) {
      const url = `${SCOREBOARD_URL}?dates=${ymdCompact(day)}&groups=50&limit=1000`;
      const payload = await fetchJson(url);
      const events = payload.events || [];
      for (const event of events) {
        out.push({ day, event });
      }
    }

    return out;
  }

  function parseNcaaNoteHeadline(headline) {
    const text = String(headline || "").trim();
    const matchedPrefix = NCAA_NOTE_PREFIXES.find((prefix) => text.startsWith(prefix));
    if (!matchedPrefix) {
      return null;
    }

    const rest = text.slice(matchedPrefix.length).trim();
    const parts = rest.split(" - ").map((part) => part.trim()).filter(Boolean);

    let regionToken = "";
    let roundToken = "";

    if (parts.length === 1) {
      roundToken = parts[0];
    } else {
      regionToken = parts[0];
      roundToken = parts[1];
    }

    let roundOrder = -1;
    let roundName = "";

    if (roundToken === "First Four") {
      roundOrder = 0;
      roundName = ROUND_NAMES[0];
    } else if (roundToken === "1st Round") {
      roundOrder = 1;
      roundName = ROUND_NAMES[1];
    } else if (roundToken === "2nd Round") {
      roundOrder = 2;
      roundName = ROUND_NAMES[2];
    } else if (roundToken === "Sweet 16") {
      roundOrder = 3;
      roundName = ROUND_NAMES[3];
    } else if (roundToken === "Elite 8") {
      roundOrder = 4;
      roundName = ROUND_NAMES[4];
    } else if (roundToken === "Final Four" || /semifinal/i.test(roundToken) || rest === "Final Four") {
      roundOrder = 5;
      roundName = ROUND_NAMES[5];
    } else if (roundToken === "National Championship" || rest === "National Championship") {
      roundOrder = 6;
      roundName = ROUND_NAMES[6];
    }

    if (roundOrder < 0) {
      return null;
    }

    let region = "";
    if (roundOrder === 5) {
      region = "FINAL_FOUR";
    } else if (roundOrder === 6) {
      region = "TITLE";
    } else {
      region = regionToken.replace(/\s*Region$/i, "").toUpperCase();
    }

    if (!region) {
      return null;
    }

    return {
      round_order: roundOrder,
      round_name: roundName,
      region,
    };
  }

  function extractNcaaEvents(scoreboardRows, aliasMap) {
    const seen = new Set();
    const out = [];

    for (const row of scoreboardRows) {
      const event = row.event || {};
      const eventId = String(event.id || "");
      if (!eventId || seen.has(eventId)) {
        continue;
      }

      const competition = (event.competitions || [])[0] || {};
      const noteHeadline = (((competition.notes || [])[0] || {}).headline || "").trim();
      const noteInfo = parseNcaaNoteHeadline(noteHeadline);
      if (!noteInfo) {
        continue;
      }

      const competitors = competition.competitors || [];
      if (competitors.length !== 2) {
        continue;
      }

      const teamA = maybeAlias(
        competitors[0]?.team?.shortDisplayName ||
          competitors[0]?.team?.displayName ||
          competitors[0]?.team?.name ||
          "TBD",
        aliasMap,
      );
      const teamB = maybeAlias(
        competitors[1]?.team?.shortDisplayName ||
          competitors[1]?.team?.displayName ||
          competitors[1]?.team?.name ||
          "TBD",
        aliasMap,
      );

      let winner = "";
      for (const comp of competitors) {
        if (comp?.winner) {
          winner = maybeAlias(
            comp?.team?.shortDisplayName || comp?.team?.displayName || comp?.team?.name || "",
            aliasMap,
          );
        }
      }

      out.push({
        id: eventId,
        day: row.day,
        slot_hint: event.shortName || event.name || eventId,
        round_order: noteInfo.round_order,
        round_name: noteInfo.round_name,
        region: noteInfo.region,
        team_a: teamA,
        team_b: teamB,
        winner,
        is_final: event?.status?.type?.name === "STATUS_FINAL",
      });

      seen.add(eventId);
    }

    return out;
  }

  function getSeedMap(snapshot) {
    const map = new Map();
    for (const row of snapshot) {
      const seed = toNumber(row.seed);
      if (isFiniteNumber(seed)) {
        map.set(row.team, seed);
      }
    }
    return map;
  }

  function sortByRegionThenSeed(a, b, seedMap) {
    const regionRankA = REGION_ORDER.indexOf(a.region);
    const regionRankB = REGION_ORDER.indexOf(b.region);
    if (regionRankA !== regionRankB) {
      return regionRankA - regionRankB;
    }
    const seedA = toNumber(seedMap.get(a.team_a));
    const seedB = toNumber(seedMap.get(b.team_a));
    if (seedA !== seedB && isFiniteNumber(seedA) && isFiniteNumber(seedB)) {
      return seedA - seedB;
    }
    return String(a.team_a).localeCompare(String(b.team_a));
  }

  function slot(region, prefix, idx) {
    return `${prefix}_${region}_${idx}`;
  }

  function counterpartSeedInFirstRound(seed) {
    const s = Number(seed);
    for (const pair of FIRST_ROUND_SEED_PAIRS) {
      if (pair[0] === s) return pair[1];
      if (pair[1] === s) return pair[0];
    }
    return Number.NaN;
  }

  function buildBracketFromEvents(ncaaEvents, snapshot) {
    const seedMap = getSeedMap(snapshot);
    const rows = [];

    const firstFour = ncaaEvents.filter((event) => event.round_order === 0);
    firstFour.sort((a, b) => sortByRegionThenSeed(a, b, seedMap));

    const firstFourLookup = new Map();
    firstFour.forEach((game, index) => {
      const sA = toNumber(seedMap.get(game.team_a));
      const sB = toNumber(seedMap.get(game.team_b));
      const seed =
        isFiniteNumber(sA) && isFiniteNumber(sB) && sA === sB
          ? sA
          : (isFiniteNumber(sA) ? sA : (isFiniteNumber(sB) ? sB : 16));

      const slotName = `FF_${index + 1}`;
      firstFourLookup.set(`${game.region}|${seed}`, `@slot:${slotName}`);
      rows.push({
        slot: slotName,
        round_order: 0,
        round_name: ROUND_NAMES[0],
        region: game.region,
        team_a: game.team_a,
        team_b: game.team_b,
      });
    });

    const firstRound = ncaaEvents.filter((event) => event.round_order === 1);
    const regionSeedTeam = {
      EAST: {},
      WEST: {},
      SOUTH: {},
      MIDWEST: {},
    };

    for (const game of firstRound) {
      if (!REGION_ORDER.includes(game.region)) {
        continue;
      }

      const seedA = toNumber(seedMap.get(game.team_a));
      const seedB = toNumber(seedMap.get(game.team_b));
      for (const team of [game.team_a, game.team_b]) {
        const seed = toNumber(seedMap.get(team));
        if (isFiniteNumber(seed) && seed >= 1 && seed <= 16) {
          if (!regionSeedTeam[game.region][seed]) {
            regionSeedTeam[game.region][seed] = team;
          }
        }
      }

      if (isFiniteNumber(seedA) && !isFiniteNumber(seedB) && game.team_b && game.team_b !== "TBD") {
        const inferred = counterpartSeedInFirstRound(seedA);
        if (isFiniteNumber(inferred) && inferred >= 1 && inferred <= 16 && !regionSeedTeam[game.region][inferred]) {
          regionSeedTeam[game.region][inferred] = game.team_b;
        }
      }
      if (isFiniteNumber(seedB) && !isFiniteNumber(seedA) && game.team_a && game.team_a !== "TBD") {
        const inferred = counterpartSeedInFirstRound(seedB);
        if (isFiniteNumber(inferred) && inferred >= 1 && inferred <= 16 && !regionSeedTeam[game.region][inferred]) {
          regionSeedTeam[game.region][inferred] = game.team_a;
        }
      }
    }

    for (const region of REGION_ORDER) {
      const firstRoundSlots = [];
      FIRST_ROUND_SEED_PAIRS.forEach((pair, idx) => {
        const [seedA, seedB] = pair;
        const slotName = slot(region, "R1", idx + 1);
        firstRoundSlots.push(slotName);
        rows.push({
          slot: slotName,
          round_order: 1,
          round_name: ROUND_NAMES[1],
          region,
          team_a:
            firstFourLookup.get(`${region}|${seedA}`) ||
            regionSeedTeam[region][seedA] ||
            "TBD",
          team_b:
            firstFourLookup.get(`${region}|${seedB}`) ||
            regionSeedTeam[region][seedB] ||
            "TBD",
        });
      });

      const r2Slots = [];
      for (let i = 0; i < firstRoundSlots.length; i += 2) {
        const slotName = slot(region, "R2", i / 2 + 1);
        r2Slots.push(slotName);
        rows.push({
          slot: slotName,
          round_order: 2,
          round_name: ROUND_NAMES[2],
          region,
          team_a: `@slot:${firstRoundSlots[i]}`,
          team_b: `@slot:${firstRoundSlots[i + 1]}`,
        });
      }

      const r3Slots = [];
      for (let i = 0; i < r2Slots.length; i += 2) {
        const slotName = slot(region, "R3", i / 2 + 1);
        r3Slots.push(slotName);
        rows.push({
          slot: slotName,
          round_order: 3,
          round_name: ROUND_NAMES[3],
          region,
          team_a: `@slot:${r2Slots[i]}`,
          team_b: `@slot:${r2Slots[i + 1]}`,
        });
      }

      rows.push({
        slot: slot(region, "R4", 1),
        round_order: 4,
        round_name: ROUND_NAMES[4],
        region,
        team_a: `@slot:${r3Slots[0]}`,
        team_b: `@slot:${r3Slots[1]}`,
      });
    }

    const finalFourPairs = [
      ["EAST", "WEST"],
      ["SOUTH", "MIDWEST"],
    ];

    const ffSlots = [];
    finalFourPairs.forEach((pair, idx) => {
      const [regionA, regionB] = pair;
      const slotName = `R5_${idx + 1}`;
      ffSlots.push(slotName);
      rows.push({
        slot: slotName,
        round_order: 5,
        round_name: ROUND_NAMES[5],
        region: "FINAL_FOUR",
        team_a: `@slot:${slot(regionA, "R4", 1)}`,
        team_b: `@slot:${slot(regionB, "R4", 1)}`,
      });
    });

    rows.push({
      slot: "TITLE",
      round_order: 6,
      round_name: ROUND_NAMES[6],
      region: "TITLE",
      team_a: `@slot:${ffSlots[0]}`,
      team_b: `@slot:${ffSlots[1]}`,
    });

    return rows.sort((a, b) => (a.round_order - b.round_order) || a.slot.localeCompare(b.slot));
  }

  function normalizeTeamStats(rows) {
    if (!rows.length) {
      throw new Error("team_stats.csv is empty");
    }

    return rows.map((raw) => {
      const row = {
        season: Number(raw.season),
        team: String(raw.team || "").trim(),
      };
      FEATURE_COLS.forEach((col) => {
        row[col] = toNumber(raw[col]);
      });
      return row;
    });
  }

  function normalizeGames(rows) {
    const seasonCounters = new Map();
    return rows.map((raw) => {
      const season = Number(raw.season);
      const gameIndex = seasonCounters.get(season) || 0;
      seasonCounters.set(season, gameIndex + 1);
      return {
        season,
        team_a: String(raw.team_a || "").trim(),
        team_b: String(raw.team_b || "").trim(),
        score_a: Number(raw.score_a),
        score_b: Number(raw.score_b),
        neutral_site: Number(raw.neutral_site || 1),
        round_name: String(raw.round_name || "").trim(),
        game_index: gameIndex,
      };
    });
  }

  function reindexGamesBySeason(games) {
    const seasonCounters = new Map();
    return games.map((row) => {
      const season = Number(row.season);
      const index = seasonCounters.get(season) || 0;
      seasonCounters.set(season, index + 1);
      return { ...row, game_index: index };
    });
  }

  function sanitizeTeamStatsRows(teamStats) {
    const report = {
      dropped_missing_team_or_season: 0,
      imputed_values: 0,
      clipped_values: 0,
      deduped_rows: 0,
    };

    const dedup = new Map();
    for (const row of teamStats) {
      const season = Number(row.season);
      const team = String(row.team || "").trim();
      if (!isFiniteNumber(season) || !team) {
        report.dropped_missing_team_or_season += 1;
        continue;
      }
      dedup.set(`${season}|${team}`, { ...row, season, team });
    }
    report.deduped_rows = teamStats.length - dedup.size - report.dropped_missing_team_or_season;

    const rows = [...dedup.values()];
    const featureBounds = {};
    FEATURE_COLS.forEach((feature) => {
      const vals = rows
        .map((row) => toNumber(row[feature]))
        .filter((value) => isFiniteNumber(value));
      const limit = DATA_QUALITY_LIMITS[feature] || [-1e6, 1e6];
      const p01 = vals.length ? percentile(vals, 0.01) : limit[0];
      const p99 = vals.length ? percentile(vals, 0.99) : limit[1];
      const lo = Math.max(limit[0], Math.min(p01, p99));
      const hi = Math.min(limit[1], Math.max(p01, p99));
      const med = vals.length ? median(vals) : (lo + hi) / 2;
      featureBounds[feature] = {
        lo: lo < hi ? lo : limit[0],
        hi: lo < hi ? hi : limit[1],
        median: med,
      };
    });

    const clean = rows.map((row) => {
      const out = { season: row.season, team: row.team };
      FEATURE_COLS.forEach((feature) => {
        const bounds = featureBounds[feature];
        let value = toNumber(row[feature]);
        if (!isFiniteNumber(value)) {
          value = bounds.median;
          report.imputed_values += 1;
        }
        const clipped = clampNumber(value, bounds.lo, bounds.hi);
        if (Math.abs(clipped - value) > 1e-12) {
          report.clipped_values += 1;
        }
        out[feature] = clipped;
      });
      return out;
    });

    return { rows: clean, report };
  }

  function sanitizeHistoricalGamesRows(historical, teamStats) {
    const validTeams = new Set(teamStats.map((row) => `${Number(row.season)}|${String(row.team || "").trim()}`));
    const seen = new Set();
    const report = {
      dropped_invalid_team: 0,
      dropped_invalid_score: 0,
      dropped_unknown_team: 0,
      deduped_rows: 0,
    };

    const clean = [];
    for (const row of historical) {
      const season = Number(row.season);
      const teamA = String(row.team_a || "").trim();
      const teamB = String(row.team_b || "").trim();
      if (!isFiniteNumber(season) || !teamA || !teamB || teamA === teamB) {
        report.dropped_invalid_team += 1;
        continue;
      }

      const scoreA = toNumber(row.score_a);
      const scoreB = toNumber(row.score_b);
      if (!isFiniteNumber(scoreA) || !isFiniteNumber(scoreB) || scoreA < 20 || scoreB < 20 || scoreA > 150 || scoreB > 150) {
        report.dropped_invalid_score += 1;
        continue;
      }

      const teamKeyA = `${season}|${teamA}`;
      const teamKeyB = `${season}|${teamB}`;
      if (!validTeams.has(teamKeyA) || !validTeams.has(teamKeyB)) {
        report.dropped_unknown_team += 1;
        continue;
      }

      const neutral = toNumber(row.neutral_site);
      const normalized = {
        season,
        team_a: teamA,
        team_b: teamB,
        score_a: clampNumber(scoreA, 20, 150),
        score_b: clampNumber(scoreB, 20, 150),
        neutral_site: neutral === 0 ? 0 : 1,
        round_name: String(row.round_name || "").trim(),
        game_index: Number(row.game_index || 0),
      };

      const dedupeKey = [
        season,
        canonicalName(teamA),
        canonicalName(teamB),
        normalized.score_a,
        normalized.score_b,
        normalized.neutral_site,
      ].join("|");
      if (seen.has(dedupeKey)) {
        report.deduped_rows += 1;
        continue;
      }
      seen.add(dedupeKey);
      clean.push(normalized);
    }

    clean.sort((a, b) => (a.season - b.season) || (a.game_index - b.game_index));
    return { rows: reindexGamesBySeason(clean), report };
  }

  function runDataQualityGuards(teamStats, historical) {
    const teamStatsResult = sanitizeTeamStatsRows(teamStats);
    const gamesResult = sanitizeHistoricalGamesRows(historical, teamStatsResult.rows);
    return {
      teamStats: teamStatsResult.rows,
      historical: gamesResult.rows,
      report: {
        team_stats: teamStatsResult.report,
        historical_games: gamesResult.report,
      },
    };
  }

  function applyInjuries(teamStats, injuriesRows, season) {
    if (!injuriesRows || !injuriesRows.length) {
      return teamStats;
    }

    const override = new Map();
    injuriesRows.forEach((row) => {
      const team = String(row.team || "").trim();
      const impact = toNumber(row.injuries_impact);
      if (team && isFiniteNumber(impact)) {
        override.set(team, impact);
      }
    });

    return teamStats.map((row) => {
      if (row.season !== season) {
        return row;
      }
      if (!override.has(row.team)) {
        return row;
      }
      return { ...row, injuries_impact: override.get(row.team) };
    });
  }

  function seasonSnapshot(teamStats, season) {
    const rows = teamStats.filter((row) => row.season === season);
    if (!rows.length) {
      throw new Error(`No team stats found for season ${season}`);
    }
    const dedup = new Map();
    rows.forEach((row) => dedup.set(row.team, row));
    return [...dedup.values()];
  }

  function median(values) {
    if (!values.length) {
      return 0;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  function mean(values) {
    if (!values.length) {
      return 0;
    }
    return values.reduce((acc, val) => acc + val, 0) / values.length;
  }

  function std(values, avg) {
    if (!values.length) {
      return 1;
    }
    const variance = values.reduce((acc, val) => acc + (val - avg) ** 2, 0) / values.length;
    const s = Math.sqrt(variance);
    return s > 1e-9 ? s : 1;
  }

  function clampNumber(value, minValue, maxValue) {
    const num = Number(value);
    if (!isFiniteNumber(num)) {
      return minValue;
    }
    if (num < minValue) return minValue;
    if (num > maxValue) return maxValue;
    return num;
  }

  function percentile(values, p) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = clampNumber((sorted.length - 1) * p, 0, sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) {
      return sorted[lo];
    }
    const t = idx - lo;
    return sorted[lo] * (1 - t) + sorted[hi] * t;
  }

  function normalizeBlendWeights(tuning) {
    const wLog = Math.max(0, finiteOr(tuning?.blend_logistic, DEFAULT_TUNING.blend_logistic));
    const wTree = Math.max(0, finiteOr(tuning?.blend_tree, DEFAULT_TUNING.blend_tree));
    const wRate = Math.max(0, finiteOr(tuning?.blend_rating, DEFAULT_TUNING.blend_rating));
    const wStyle = Math.max(0, finiteOr(tuning?.blend_style, DEFAULT_TUNING.blend_style));
    const total = wLog + wTree + wRate + wStyle;
    if (total <= 1e-9) {
      return {
        blend_logistic: DEFAULT_TUNING.blend_logistic,
        blend_tree: DEFAULT_TUNING.blend_tree,
        blend_rating: DEFAULT_TUNING.blend_rating,
        blend_style: DEFAULT_TUNING.blend_style,
      };
    }
    return {
      blend_logistic: wLog / total,
      blend_tree: wTree / total,
      blend_rating: wRate / total,
      blend_style: wStyle / total,
    };
  }

  function normalizeTuningParams(tuning) {
    const base = { ...DEFAULT_TUNING, ...(tuning || {}) };
    const blend = normalizeBlendWeights(base);
    return {
      ...base,
      ...blend,
      style_scale: clampNumber(base.style_scale, 0.4, 1.6),
      form_scale: clampNumber(base.form_scale, 0, 14),
      uncertainty_confidence_scale: clampNumber(base.uncertainty_confidence_scale, 0.08, 0.75),
      shock_base: clampNumber(base.shock_base, 0.03, 0.25),
      shock_scale: clampNumber(base.shock_scale, 0.05, 0.45),
      portfolio_size: Math.round(clampNumber(base.portfolio_size, 1, 8)),
      portfolio_candidates: Math.round(clampNumber(base.portfolio_candidates, 30, 500)),
      portfolio_leverage_weight: clampNumber(base.portfolio_leverage_weight, 0, 140),
      portfolio_diversity_penalty: clampNumber(base.portfolio_diversity_penalty, 0, 220),
    };
  }

  function dataFingerprint(teamStats, historical) {
    const seasons = [...new Set(teamStats.map((row) => Number(row.season)))].sort((a, b) => a - b);
    const hSeasons = [...new Set(historical.map((row) => Number(row.season)))].sort((a, b) => a - b);
    return `${seasons.join(",")}|${teamStats.length}|${hSeasons.join(",")}|${historical.length}`;
  }

  function sigmoid(z) {
    if (z >= 0) {
      const ex = Math.exp(-z);
      return 1 / (1 + ex);
    }
    const ex = Math.exp(z);
    return ex / (1 + ex);
  }

  function softOutcomeFromMargin(margin, scale = 11) {
    return 0.5 + 0.5 * Math.tanh(finiteOr(margin, 0) / scale);
  }

  function roundImportance(roundName) {
    const text = String(roundName || "").toLowerCase();
    if (!text) return 1.0;
    if (text.includes("championship")) return 1.42;
    if (text.includes("final four")) return 1.36;
    if (text.includes("elite")) return 1.26;
    if (text.includes("sweet")) return 1.2;
    if (text.includes("round of 32")) return 1.16;
    if (text.includes("round of 64")) return 1.12;
    if (text.includes("first four")) return 1.1;
    if (text.includes("tournament")) return 1.15;
    return 1.0;
  }

  function buildSeasonGameIndex(games) {
    const maxIdx = new Map();
    let maxSeason = 0;
    for (const game of games) {
      const season = Number(game.season);
      const idx = Number(game.game_index || 0);
      if (!maxIdx.has(season) || idx > maxIdx.get(season)) {
        maxIdx.set(season, idx);
      }
      if (season > maxSeason) {
        maxSeason = season;
      }
    }
    return { maxSeason, maxIdxBySeason: maxIdx };
  }

  function gameRecencyWeight(game, recencyInfo) {
    const season = Number(game.season);
    const seasonGap = Math.max(0, Number(recencyInfo.maxSeason || season) - season);
    const seasonWeight = Math.exp(-0.55 * seasonGap);

    const maxIdx = recencyInfo.maxIdxBySeason.get(season) || 0;
    const idx = Number(game.game_index || 0);
    const withinSeason = maxIdx > 0 ? idx / maxIdx : 0.5;
    const withinWeight = 0.82 + 0.36 * withinSeason;

    return seasonWeight * withinWeight;
  }

  function estimatedPossessions(rowA, rowB) {
    const tempoA = isFiniteNumber(toNumber(rowA?.tempo)) ? toNumber(rowA?.tempo) : 68;
    const tempoB = isFiniteNumber(toNumber(rowB?.tempo)) ? toNumber(rowB?.tempo) : 68;
    return Math.max(58, (tempoA + tempoB) / 2);
  }

  function tempoAdjustedMargin(rawMargin, rowA, rowB) {
    const poss = estimatedPossessions(rowA, rowB);
    return (finiteOr(rawMargin, 0) / poss) * 100;
  }

  function gameSampleWeight(game, adjustedMargin, recencyInfo) {
    const recency = gameRecencyWeight(game, recencyInfo);
    const importance = roundImportance(game.round_name);
    const marginSignal = Math.abs(Math.tanh(adjustedMargin / 14));
    const certaintyWeight = 0.75 + 0.45 * marginSignal;
    return recency * importance * certaintyWeight;
  }

  function logit(p) {
    const clamped = Math.min(1 - 1e-9, Math.max(1e-9, finiteOr(p, 0.5)));
    return Math.log(clamped / (1 - clamped));
  }

  function randomNormal(rng) {
    let u1 = 0;
    let u2 = 0;
    while (u1 <= 1e-12) {
      u1 = rng.next();
    }
    u2 = rng.next();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function dot(a, b) {
    let total = 0;
    for (let i = 0; i < a.length; i += 1) {
      total += a[i] * b[i];
    }
    return total;
  }

  function buildMatchupRawVector(rowA, rowB, neutralSite = 1) {
    const diff = FEATURE_COLS.map((feature) => toNumber(rowA[feature]) - toNumber(rowB[feature]));
    const seedGap = 0;
    return [...diff, seedGap, toNumber(neutralSite)];
  }

  function collectTrainingSamples(teamStats, games) {
    const statMap = new Map();
    teamStats.forEach((row) => statMap.set(`${row.season}|${row.team}`, row));

    const recencyInfo = buildSeasonGameIndex(games);
    const samples = [];

    for (const game of games) {
      const rowA = statMap.get(`${game.season}|${game.team_a}`);
      const rowB = statMap.get(`${game.season}|${game.team_b}`);
      if (!rowA || !rowB) {
        continue;
      }

      const neutral = toNumber(game.neutral_site);
      const forward = buildMatchupRawVector(rowA, rowB, neutral);
      const reverse = buildMatchupRawVector(rowB, rowA, neutral);

      const rawMargin = finiteOr(toNumber(game.score_a), 0) - finiteOr(toNumber(game.score_b), 0);
      const adjustedMargin = tempoAdjustedMargin(rawMargin, rowA, rowB);
      const outcomeSoft = softOutcomeFromMargin(adjustedMargin, 9.5);
      const weight = gameSampleWeight(game, adjustedMargin, recencyInfo);

      samples.push({
        x_raw: forward,
        target: outcomeSoft,
        weight,
        season: Number(game.season),
        round_name: String(game.round_name || ""),
      });
      samples.push({
        x_raw: reverse,
        target: 1 - outcomeSoft,
        weight,
        season: Number(game.season),
        round_name: String(game.round_name || ""),
      });
    }

    return samples;
  }

  function trainTreeModel(teamStats, games, tuning = DEFAULT_TUNING) {
    const samples = collectTrainingSamples(teamStats, games);
    if (!samples.length) {
      return { stumps: [], metrics: { stumps: 0 } };
    }

    const xRaw = samples.map((row) => row.x_raw);
    const y = samples.map((row) => row.target);
    const sampleWeights = samples.map((row) => row.weight);
    const featureCount = xRaw[0].length;
    const stumps = [];
    const maxStumps = Math.round(clampNumber(finiteOr(tuning?.tree_stumps, 28), 8, 64));

    for (let feature = 0; feature < featureCount; feature += 1) {
      const values = xRaw.map((row) => row[feature]).filter((value) => isFiniteNumber(value));
      if (!values.length) continue;
      const thresholds = [...new Set([0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9].map((q) => percentile(values, q)))];
      for (const threshold of thresholds) {
        let leftW = 0;
        let rightW = 0;
        let leftY = 0;
        let rightY = 0;

        for (let i = 0; i < xRaw.length; i += 1) {
          const w = sampleWeights[i] || 1;
          const target = y[i];
          if (xRaw[i][feature] <= threshold) {
            leftW += w;
            leftY += w * target;
          } else {
            rightW += w;
            rightY += w * target;
          }
        }

        const leftProb = leftW > 0 ? leftY / leftW : 0.5;
        const rightProb = rightW > 0 ? rightY / rightW : 0.5;
        let mse = 0;
        for (let i = 0; i < xRaw.length; i += 1) {
          const pred = xRaw[i][feature] <= threshold ? leftProb : rightProb;
          const err = pred - y[i];
          mse += (sampleWeights[i] || 1) * err * err;
        }

        stumps.push({
          feature,
          threshold,
          left_prob: clampProb(leftProb),
          right_prob: clampProb(rightProb),
          mse,
        });
      }
    }

    stumps.sort((a, b) => a.mse - b.mse);
    const selected = stumps.slice(0, Math.min(maxStumps, stumps.length));
    return {
      stumps: selected,
      metrics: {
        stumps: selected.length,
        weighted_mse: selected.length ? mean(selected.map((row) => row.mse)) : 0,
      },
    };
  }

  function predictTreeProb(treeModel, rawVector) {
    if (!treeModel || !treeModel.stumps || !treeModel.stumps.length) {
      return 0.5;
    }
    let total = 0;
    for (const stump of treeModel.stumps) {
      total += rawVector[stump.feature] <= stump.threshold ? stump.left_prob : stump.right_prob;
    }
    return clampProb(total / treeModel.stumps.length);
  }

  function trainModel(teamStats, games) {
    const samples = collectTrainingSamples(teamStats, games);
    const xRaw = samples.map((row) => row.x_raw);
    const y = samples.map((row) => row.target);
    const sampleWeights = samples.map((row) => row.weight);

    if (!xRaw.length) {
      throw new Error("No training rows matched team stats");
    }

    const featureCount = xRaw[0].length;
    const medians = [];
    for (let col = 0; col < featureCount; col += 1) {
      const vals = xRaw.map((row) => row[col]).filter((value) => isFiniteNumber(value));
      medians.push(median(vals));
    }

    const imputed = xRaw.map((row) => row.map((value, col) => (isFiniteNumber(value) ? value : medians[col])));
    const means = [];
    const stds = [];
    for (let col = 0; col < featureCount; col += 1) {
      const vals = imputed.map((row) => row[col]);
      const avg = mean(vals);
      means.push(avg);
      stds.push(std(vals, avg));
    }

    const x = imputed.map((row) => row.map((value, col) => (value - means[col]) / stds[col]));

    const weights = new Array(featureCount).fill(0);
    let bias = 0;
    const lr = 0.06;
    const lambda = 0.001;
    const epochs = 420;
    const totalWeight = sampleWeights.reduce((acc, val) => acc + val, 0) || x.length;

    for (let epoch = 0; epoch < epochs; epoch += 1) {
      const gradW = new Array(featureCount).fill(0);
      let gradB = 0;

      for (let i = 0; i < x.length; i += 1) {
        const pred = sigmoid(dot(weights, x[i]) + bias);
        const err = pred - y[i];
        const w = sampleWeights[i] || 1;
        gradB += w * err;
        for (let j = 0; j < featureCount; j += 1) {
          gradW[j] += w * err * x[i][j];
        }
      }

      gradB /= totalWeight;
      for (let j = 0; j < featureCount; j += 1) {
        const finalGrad = gradW[j] / totalWeight + lambda * weights[j];
        weights[j] -= lr * finalGrad;
      }
      bias -= lr * gradB;
    }

    const probabilities = x.map((row) => sigmoid(dot(weights, row) + bias));

    function clamp01(value) {
      if (value < 1e-9) return 1e-9;
      if (value > 1 - 1e-9) return 1 - 1e-9;
      return value;
    }

    let loss = 0;
    let brier = 0;
    let lossWeight = 0;
    for (let i = 0; i < y.length; i += 1) {
      const p = clamp01(probabilities[i]);
      const w = sampleWeights[i] || 1;
      loss += w * (-(y[i] * Math.log(p) + (1 - y[i]) * Math.log(1 - p)));
      brier += w * ((p - y[i]) ** 2);
      lossWeight += w;
    }
    loss /= Math.max(lossWeight, 1e-9);
    brier /= Math.max(lossWeight, 1e-9);

    const hardY = y.map((label) => (label >= 0.5 ? 1 : 0));
    const pairs = hardY.map((label, index) => ({ label, score: probabilities[index] })).sort((a, b) => a.score - b.score);
    let nPos = 0;
    let nNeg = 0;
    pairs.forEach((pair) => {
      if (pair.label === 1) nPos += 1;
      else nNeg += 1;
    });
    let auc = 0.5;
    if (nPos > 0 && nNeg > 0) {
      let rankSumPos = 0;
      let i = 0;
      while (i < pairs.length) {
        let j = i;
        while (j + 1 < pairs.length && pairs[j + 1].score === pairs[i].score) j += 1;
        const avgRank = (i + 1 + (j + 1)) / 2;
        for (let k = i; k <= j; k += 1) {
          if (pairs[k].label === 1) rankSumPos += avgRank;
        }
        i = j + 1;
      }
      auc = (rankSumPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
    }

    return {
      weights,
      bias,
      medians,
      means,
      stds,
      metrics: {
        log_loss: loss,
        brier_score: brier,
        roc_auc: auc,
        training_games: x.length,
      },
    };
  }

  function transformFeatureVector(raw, model) {
    return raw.map((value, idx) => {
      const imputed = isFiniteNumber(value) ? value : model.medians[idx];
      return (imputed - model.means[idx]) / model.stds[idx];
    });
  }

  function finiteOr(value, fallback = 0) {
    return isFiniteNumber(value) ? Number(value) : fallback;
  }

  function clampProb(prob) {
    const p = Number(prob);
    if (!isFiniteNumber(p)) return 0.5;
    if (p <= 1e-6) return 1e-6;
    if (p >= 1 - 1e-6) return 1 - 1e-6;
    return p;
  }

  function temperedProb(prob, factor = 0.9) {
    const p = clampProb(prob);
    const logit = Math.log(p / (1 - p));
    return sigmoid(logit * factor);
  }

  function teamSeasonKey(season, team) {
    return `${Number(season)}|${String(team || "").trim()}`;
  }

  function teamPowerScore(row) {
    const seed = finiteOr(toNumber(row.seed), 8.5);
    const net = finiteOr(toNumber(row.net_rating), 0);
    const sos = finiteOr(toNumber(row.sos), 0);
    const recent = finiteOr(toNumber(row.recent_form), 0.5);
    const injuries = finiteOr(toNumber(row.injuries_impact), 0);

    return (
      0.82 * net +
      0.62 * sos +
      0.55 * (17 - seed) +
      5.5 * (recent - 0.5) +
      10 * injuries
    );
  }

  function styleKeyMetrics(row) {
    const tempo = finiteOr(toNumber(row.tempo), 0);
    const fg3 = finiteOr(toNumber(row.fg3_pct), 0);
    const tov = finiteOr(toNumber(row.tov_pct), 0);
    const orb = finiteOr(toNumber(row.orb_pct), 0);
    const drb = finiteOr(toNumber(row.drb_pct), 0);
    const ftRate = finiteOr(toNumber(row.ft_rate), 0);
    const off = finiteOr(toNumber(row.adj_offense), 0);
    const def = -finiteOr(toNumber(row.adj_defense), 0);
    return {
      tempo,
      fg3,
      tovControl: -tov,
      orb,
      drb,
      ftRate,
      off,
      def,
    };
  }

  function buildStyleNorm(teamStats) {
    const sums = {
      tempo: 0,
      fg3: 0,
      tovControl: 0,
      orb: 0,
      drb: 0,
      ftRate: 0,
      off: 0,
      def: 0,
    };
    const sumsSq = {
      tempo: 0,
      fg3: 0,
      tovControl: 0,
      orb: 0,
      drb: 0,
      ftRate: 0,
      off: 0,
      def: 0,
    };
    let count = 0;
    for (const row of teamStats) {
      const m = styleKeyMetrics(row);
      Object.keys(sums).forEach((key) => {
        const val = finiteOr(m[key], 0);
        sums[key] += val;
        sumsSq[key] += val * val;
      });
      count += 1;
    }
    const out = {};
    Object.keys(sums).forEach((key) => {
      const meanVal = count > 0 ? sums[key] / count : 0;
      const variance = count > 0 ? (sumsSq[key] / count) - meanVal * meanVal : 1;
      out[key] = {
        mean: meanVal,
        std: Math.sqrt(Math.max(variance, 1e-6)),
      };
    });
    return out;
  }

  function zStyle(value, stats, key) {
    const m = stats[key] || { mean: 0, std: 1 };
    return (finiteOr(value, m.mean) - m.mean) / (m.std || 1);
  }

  function archetypeForRow(row, styleNorm) {
    const m = styleKeyMetrics(row);
    const tempo = zStyle(m.tempo, styleNorm, "tempo");
    const fg3 = zStyle(m.fg3, styleNorm, "fg3");
    const tovControl = zStyle(m.tovControl, styleNorm, "tovControl");
    const orb = zStyle(m.orb, styleNorm, "orb");
    const drb = zStyle(m.drb, styleNorm, "drb");
    const ftRate = zStyle(m.ftRate, styleNorm, "ftRate");
    const off = zStyle(m.off, styleNorm, "off");
    const def = zStyle(m.def, styleNorm, "def");

    const scores = {
      pace_space: 0.85 * tempo + 0.9 * fg3 + 0.45 * off - 0.35 * orb,
      power_glass: -0.45 * tempo + 0.95 * orb + 0.75 * ftRate + 0.35 * drb,
      grind_defense: -0.75 * tempo + 0.95 * def + 0.7 * drb + 0.25 * tovControl,
      pressure_chaos: 0.7 * tempo + 0.85 * def + 0.8 * tovControl,
      balanced_execution: 0.55 * off + 0.55 * def + 0.55 * tovControl + 0.35 * drb,
    };

    let bestType = "balanced_execution";
    let bestScore = Number.NEGATIVE_INFINITY;
    Object.entries(scores).forEach(([type, score]) => {
      if (score > bestScore) {
        bestScore = score;
        bestType = type;
      }
    });
    return bestType;
  }

  function styleVectorForRow(row, styleNorm) {
    const m = styleKeyMetrics(row);
    return [
      zStyle(m.tempo, styleNorm, "tempo"),
      zStyle(m.fg3, styleNorm, "fg3"),
      zStyle(m.tovControl, styleNorm, "tovControl"),
      zStyle(m.orb, styleNorm, "orb"),
      zStyle(m.drb, styleNorm, "drb"),
      zStyle(m.ftRate, styleNorm, "ftRate"),
      zStyle(m.off, styleNorm, "off"),
      zStyle(m.def, styleNorm, "def"),
    ];
  }

  function antiSymmetricStyleFeatures(vecA, vecB) {
    const out = [];
    for (let i = 0; i < vecA.length; i += 1) {
      for (let j = i + 1; j < vecA.length; j += 1) {
        out.push(vecA[i] * vecB[j] - vecA[j] * vecB[i]);
      }
    }
    for (let i = 0; i < vecA.length; i += 1) {
      out.push(vecA[i] - vecB[i]);
    }
    return out;
  }

  function fitStyleInteractionModel(validGames, styleVectorByTeam, ratingByTeam, baseRating, baseMean) {
    const rows = [];
    for (const game of validGames) {
      const vecA = styleVectorByTeam.get(game.keyA);
      const vecB = styleVectorByTeam.get(game.keyB);
      if (!vecA || !vecB) continue;
      const ratingA = ratingByTeam.get(game.keyA) ?? baseRating.get(game.keyA) ?? baseMean;
      const ratingB = ratingByTeam.get(game.keyB) ?? baseRating.get(game.keyB) ?? baseMean;
      const expected = sigmoid((ratingA - ratingB) / 11.5);
      const residual = game.outcomeSoft - expected;
      const x = antiSymmetricStyleFeatures(vecA, vecB);
      rows.push({ x, target: residual, weight: game.weight });
    }

    if (!rows.length) {
      return { weights: [] };
    }

    const dim = rows[0].x.length;
    const weights = new Array(dim).fill(0);
    const lr = 0.085;
    const reg = 0.06;
    const weightTotal = rows.reduce((acc, row) => acc + row.weight, 0) || 1;

    for (let epoch = 0; epoch < 240; epoch += 1) {
      const grad = new Array(dim).fill(0);
      for (const row of rows) {
        const pred = dot(weights, row.x);
        const err = pred - row.target;
        for (let k = 0; k < dim; k += 1) {
          grad[k] += row.weight * err * row.x[k];
        }
      }
      for (let k = 0; k < dim; k += 1) {
        const g = grad[k] / weightTotal + reg * weights[k];
        weights[k] -= lr * g;
      }
    }

    return { weights };
  }

  function styleEdgeFromContext(performanceStyle, keyA, keyB) {
    const vecA = performanceStyle?.styleVectorBySeasonTeam?.get(keyA);
    const vecB = performanceStyle?.styleVectorBySeasonTeam?.get(keyB);
    const styleModel = performanceStyle?.styleModel;
    if (!vecA || !vecB || !styleModel?.weights?.length) {
      return 0;
    }
    const x = antiSymmetricStyleFeatures(vecA, vecB);
    return Math.tanh(dot(styleModel.weights, x) * 2.4) * 0.22;
  }

  function computeRollingFormByTeam(gamesByTeam, ratingByTeam, baseRating, baseMean) {
    const result = new Map();
    for (const [key, teamGames] of gamesByTeam.entries()) {
      const ordered = [...teamGames].sort((a, b) => b.game_index - a.game_index);
      if (!ordered.length) {
        result.set(key, { last5: 0, last10: 0, blend: 0, volatility: 0 });
        continue;
      }

      function windowScore(limit, decay) {
        let weighted = 0;
        let weightTotal = 0;
        let sq = 0;
        for (let i = 0; i < Math.min(limit, ordered.length); i += 1) {
          const g = ordered[i];
          const oppRating = ratingByTeam.get(g.oppKey) ?? baseRating.get(g.oppKey) ?? baseMean;
          const selfRating = ratingByTeam.get(key) ?? baseRating.get(key) ?? baseMean;
          const expected = sigmoid((selfRating - oppRating) / 12);
          const surprise = g.outcomeSoft - expected;
          const oppStrength = Math.max(0, sigmoid((oppRating - baseMean) / 10) - 0.5);
          const w = g.weight * Math.exp(-decay * i);
          const signal = surprise * (1 + 0.8 * oppStrength);
          weighted += signal * w;
          sq += signal * signal * w;
          weightTotal += w;
        }
        if (weightTotal <= 1e-9) {
          return { mean: 0, sd: 0 };
        }
        const avg = weighted / weightTotal;
        const variance = Math.max(0, sq / weightTotal - avg * avg);
        return { mean: avg, sd: Math.sqrt(variance) };
      }

      const w5 = windowScore(5, 0.33);
      const w10 = windowScore(10, 0.21);
      result.set(key, {
        last5: w5.mean,
        last10: w10.mean,
        blend: 0.62 * w5.mean + 0.38 * w10.mean,
        volatility: 0.6 * w5.sd + 0.4 * w10.sd,
      });
    }
    return result;
  }

  function buildPerformanceStyleContext(teamStats, games) {
    const statMap = new Map();
    teamStats.forEach((row) => {
      statMap.set(teamSeasonKey(row.season, row.team), row);
    });

    const baseRating = new Map();
    const baseValues = [];
    for (const row of teamStats) {
      const key = teamSeasonKey(row.season, row.team);
      const rating = teamPowerScore(row);
      baseRating.set(key, rating);
      baseValues.push(rating);
    }
    const baseMean = mean(baseValues);
    const recencyInfo = buildSeasonGameIndex(games);

    const styleNorm = buildStyleNorm(teamStats);
    const styleVectorByTeam = new Map();
    for (const row of teamStats) {
      styleVectorByTeam.set(teamSeasonKey(row.season, row.team), styleVectorForRow(row, styleNorm));
    }

    const gamesByTeam = new Map();
    const validGames = [];
    for (const game of games) {
      const keyA = teamSeasonKey(game.season, game.team_a);
      const keyB = teamSeasonKey(game.season, game.team_b);
      const rowA = statMap.get(keyA);
      const rowB = statMap.get(keyB);
      if (!rowA || !rowB) {
        continue;
      }

      const rawMargin = finiteOr(toNumber(game.score_a), 0) - finiteOr(toNumber(game.score_b), 0);
      const adjustedMargin = tempoAdjustedMargin(rawMargin, rowA, rowB);
      const outcomeSoft = softOutcomeFromMargin(adjustedMargin, 9.5);
      const weight = gameSampleWeight(game, adjustedMargin, recencyInfo);
      const gameIndex = Number(game.game_index || 0);
      validGames.push({ keyA, keyB, adjustedMargin, outcomeSoft, weight, game_index: gameIndex });

      if (!gamesByTeam.has(keyA)) gamesByTeam.set(keyA, []);
      if (!gamesByTeam.has(keyB)) gamesByTeam.set(keyB, []);
      gamesByTeam.get(keyA).push({ oppKey: keyB, adjustedMargin, outcomeSoft, weight, game_index: gameIndex });
      gamesByTeam.get(keyB).push({
        oppKey: keyA,
        adjustedMargin: -adjustedMargin,
        outcomeSoft: 1 - outcomeSoft,
        weight,
        game_index: gameIndex,
      });
    }

    let rating = new Map(baseRating);
    for (let iter = 0; iter < 12; iter += 1) {
      const next = new Map();
      for (const [key, base] of baseRating.entries()) {
        const teamGames = gamesByTeam.get(key) || [];
        if (!teamGames.length) {
          next.set(key, base);
          continue;
        }
        let acc = 0;
        let weightTotal = 0;
        const selfRating = rating.get(key) ?? base;
        for (const g of teamGames) {
          const oppRating = rating.get(g.oppKey) ?? baseRating.get(g.oppKey) ?? baseMean;
          const actualSoft = g.outcomeSoft;
          const expected = sigmoid((selfRating - oppRating) / 12);
          const surprise = actualSoft - expected;
          const oppStrength = sigmoid((oppRating - baseMean) / 12) - 0.5;
          const performance = oppRating + surprise * (20 + 10 * Math.abs(oppStrength));
          const marginSignal = Math.abs(Math.tanh(g.adjustedMargin / 12));
          const weight = g.weight * (0.85 + 0.3 * marginSignal);
          acc += performance * weight;
          weightTotal += weight;
        }
        const oppAdjusted = weightTotal > 0 ? acc / weightTotal : base;
        next.set(key, 0.46 * base + 0.54 * oppAdjusted);
      }
      rating = next;
    }

    const formByTeam = computeRollingFormByTeam(gamesByTeam, rating, baseRating, baseMean);
    const uncertaintyByTeam = new Map();
    for (const [key] of baseRating.entries()) {
      const teamGames = gamesByTeam.get(key) || [];
      if (!teamGames.length) {
        uncertaintyByTeam.set(key, 0.75);
        continue;
      }
      const selfRating = rating.get(key) ?? baseRating.get(key) ?? baseMean;
      let wSum = 0;
      let sqErr = 0;
      for (const g of teamGames) {
        const oppRating = rating.get(g.oppKey) ?? baseRating.get(g.oppKey) ?? baseMean;
        const expected = sigmoid((selfRating - oppRating) / 12);
        const err = g.outcomeSoft - expected;
        const w = g.weight;
        wSum += w;
        sqErr += w * err * err;
      }
      const rmse = Math.sqrt(sqErr / Math.max(wSum, 1e-9));
      const formVol = finiteOr(formByTeam.get(key)?.volatility, 0);
      const uncertainty = Math.min(0.9, 0.2 + 1.1 / Math.sqrt(wSum + 2) + 0.42 * rmse + 0.55 * formVol);
      uncertaintyByTeam.set(key, uncertainty);
    }

    const styleModel = fitStyleInteractionModel(validGames, styleVectorByTeam, rating, baseRating, baseMean);

    return {
      ratingBySeasonTeam: rating,
      uncertaintyBySeasonTeam: uncertaintyByTeam,
      styleVectorBySeasonTeam: styleVectorByTeam,
      formBySeasonTeam: formByTeam,
      styleModel,
    };
  }

  function computeRawBlendProb(model, rowA, rowB, teamA, teamB, performanceStyle) {
    const raw = buildMatchupRawVector(rowA, rowB, 1);
    const transformed = transformFeatureVector(raw, model);
    const modelProb = sigmoid(dot(model.weights, transformed) + model.bias);
    const treeProb = predictTreeProb(performanceStyle?.treeModel, raw);

    const keyA = teamSeasonKey(rowA.season, teamA);
    const keyB = teamSeasonKey(rowB.season, teamB);
    const tuning = performanceStyle?.tuning || DEFAULT_TUNING;

    const formA = finiteOr(performanceStyle?.formBySeasonTeam?.get(keyA)?.blend, 0);
    const formB = finiteOr(performanceStyle?.formBySeasonTeam?.get(keyB)?.blend, 0);
    const perfA = (performanceStyle?.ratingBySeasonTeam?.get(keyA) ?? teamPowerScore(rowA)) + tuning.form_scale * formA;
    const perfB = (performanceStyle?.ratingBySeasonTeam?.get(keyB) ?? teamPowerScore(rowB)) + tuning.form_scale * formB;
    const performanceProb = sigmoid((perfA - perfB) / 10.4);

    const styleEdge = styleEdgeFromContext(performanceStyle, keyA, keyB);
    const styleProb = clampProb(0.5 + tuning.style_scale * styleEdge);

    const blended =
      tuning.blend_logistic * modelProb +
      tuning.blend_tree * treeProb +
      tuning.blend_rating * performanceProb +
      tuning.blend_style * styleProb;
    return clampProb(blended);
  }

  function teamUncertainty(performanceStyle, season, team) {
    const key = teamSeasonKey(season, team);
    const raw = performanceStyle?.uncertaintyBySeasonTeam?.get(key);
    if (!isFiniteNumber(raw)) {
      return 0.55;
    }
    return Math.min(0.95, Math.max(0.08, Number(raw)));
  }

  function fitCalibratorRows(rows) {
    if (!rows.length) {
      return { alpha: 1, beta: 0, rows: 0 };
    }

    let alpha = 1;
    let beta = 0;
    const lr = 0.06;
    const reg = 0.02;
    for (let epoch = 0; epoch < 220; epoch += 1) {
      let gradA = reg * (alpha - 1);
      let gradB = reg * beta;
      let wSum = reg;

      for (const row of rows) {
        const z = logit(row.baseProb);
        const pred = sigmoid(alpha * z + beta);
        const err = pred - row.target;
        const w = row.weight;
        gradA += w * err * z;
        gradB += w * err;
        wSum += w;
      }

      alpha -= lr * (gradA / wSum);
      beta -= lr * (gradB / wSum);

      alpha = Math.min(1.8, Math.max(0.65, alpha));
      beta = Math.min(1.2, Math.max(-1.2, beta));
    }

    return { alpha, beta, rows: rows.length };
  }

  function fitProbabilityCalibrator(teamStats, games, model, performanceStyle) {
    const statMap = new Map();
    teamStats.forEach((row) => {
      statMap.set(teamSeasonKey(row.season, row.team), row);
    });

    const recencyInfo = buildSeasonGameIndex(games);
    const rows = [];
    const earlyRows = [];
    const lateRows = [];
    for (const game of games) {
      const keyA = teamSeasonKey(game.season, game.team_a);
      const keyB = teamSeasonKey(game.season, game.team_b);
      const rowA = statMap.get(keyA);
      const rowB = statMap.get(keyB);
      if (!rowA || !rowB) continue;

      const rawMargin = finiteOr(toNumber(game.score_a), 0) - finiteOr(toNumber(game.score_b), 0);
      const adjustedMargin = tempoAdjustedMargin(rawMargin, rowA, rowB);
      const target = softOutcomeFromMargin(adjustedMargin, 9.5);
      const weight = gameSampleWeight(game, adjustedMargin, recencyInfo);

      const baseProb = computeRawBlendProb(model, rowA, rowB, game.team_a, game.team_b, performanceStyle);
      const item = { baseProb, target, weight };
      rows.push(item);
      const difficulty = 1 - Math.abs(baseProb - 0.5) * 2;
      if (difficulty >= 0.42) {
        lateRows.push(item);
      } else {
        earlyRows.push(item);
      }
    }

    if (!rows.length) {
      return {
        global: { alpha: 1, beta: 0, rows: 0 },
        early: { alpha: 1, beta: 0, rows: 0 },
        late: { alpha: 1, beta: 0, rows: 0 },
      };
    }

    return {
      global: fitCalibratorRows(rows),
      early: fitCalibratorRows(earlyRows.length ? earlyRows : rows),
      late: fitCalibratorRows(lateRows.length ? lateRows : rows),
    };
  }

  function pickRoundCalibrator(calibration, roundOrder, baseProb) {
    if (!calibration || !calibration.global) {
      return { alpha: 1, beta: 0 };
    }
    const early = calibration.early || calibration.global;
    const late = calibration.late || calibration.global;
    const difficulty = 1 - Math.abs(baseProb - 0.5) * 2;

    if (roundOrder >= 5) return late;
    if (roundOrder <= 2) return early;
    const lateWeight = roundOrder >= 4 ? 0.75 + 0.2 * difficulty : 0.45 + 0.35 * difficulty;
    const w = clampNumber(lateWeight, 0, 1);
    return {
      alpha: early.alpha * (1 - w) + late.alpha * w,
      beta: early.beta * (1 - w) + late.beta * w,
    };
  }

  function predictMatchup(model, snapshotMap, teamA, teamB, performanceStyle, roundOrder = 1) {
    if (!teamA || !teamB || teamA === "TBD" || teamB === "TBD") {
      return 0.5;
    }

    const rowA = snapshotMap.get(teamA);
    const rowB = snapshotMap.get(teamB);
    if (!rowA || !rowB) {
      return 0.5;
    }

    const tuning = performanceStyle?.tuning || DEFAULT_TUNING;
    const blended = computeRawBlendProb(model, rowA, rowB, teamA, teamB, performanceStyle);
    const calib = pickRoundCalibrator(performanceStyle?.calibrator, roundOrder, blended);
    const calibratedLogit = calib.alpha * logit(blended) + calib.beta;
    const uncertaintyA = teamUncertainty(performanceStyle, rowA.season, teamA);
    const uncertaintyB = teamUncertainty(performanceStyle, rowB.season, teamB);
    const matchupUncertainty = (uncertaintyA + uncertaintyB) / 2;
    const confidenceScale = clampNumber(1 - tuning.uncertainty_confidence_scale * matchupUncertainty, 0.35, 1);
    const confidenceAdjusted = sigmoid(calibratedLogit * confidenceScale);
    return temperedProb(confidenceAdjusted, 0.98);
  }

  class SeededRandom {
    constructor(seed) {
      this.state = seed >>> 0;
    }

    next() {
      this.state += 0x6d2b79f5;
      let t = this.state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
  }

  function resolveTeam(ref, winners) {
    const clean = String(ref || "").trim();
    if (clean.startsWith("@slot:")) {
      const slotRef = clean.split(":", 2)[1];
      return winners[slotRef] || "TBD";
    }
    return clean;
  }

  function gamePairKey(teamA, teamB) {
    return [canonicalName(teamA), canonicalName(teamB)].sort().join("||");
  }

  function applyKnownResults(bracket, knownWinners) {
    const winners = {};
    const ordered = [...bracket].sort((a, b) => (a.round_order - b.round_order) || a.slot.localeCompare(b.slot));

    for (const row of ordered) {
      const teamA = resolveTeam(row.team_a, winners);
      const teamB = resolveTeam(row.team_b, winners);
      const key = gamePairKey(teamA, teamB);
      const known = knownWinners[key];
      if (known) {
        winners[row.slot] = known;
      }
    }

    return winners;
  }

  function seedAdjustedProb(baseProb) {
    return clampProb(baseProb);
  }

  function chooseWinnerFromProb(probTeamA, teamA, teamB, snapshotMap, performanceStyle) {
    if (teamA === "TBD" && teamB === "TBD") {
      return "TBD";
    }
    if (teamA === "TBD") {
      return teamB;
    }
    if (teamB === "TBD") {
      return teamA;
    }

    if (probTeamA > 0.5 + 1e-9) {
      return teamA;
    }
    if (probTeamA < 0.5 - 1e-9) {
      return teamB;
    }

    const rowA = snapshotMap.get(teamA);
    const rowB = snapshotMap.get(teamB);
    if (rowA && rowB) {
      const keyA = teamSeasonKey(rowA.season, teamA);
      const keyB = teamSeasonKey(rowB.season, teamB);
      const perfA = performanceStyle?.ratingBySeasonTeam?.get(keyA) ?? teamPowerScore(rowA);
      const perfB = performanceStyle?.ratingBySeasonTeam?.get(keyB) ?? teamPowerScore(rowB);
      if (perfA !== perfB) {
        return perfA > perfB ? teamA : teamB;
      }
    }

    return teamA.localeCompare(teamB) <= 0 ? teamA : teamB;
  }

  function simulateTournament(model, bracket, snapshot, simulations, randomSeed, lockedWinners, performanceStyle) {
    const rng = new SeededRandom(randomSeed);
    const tuning = performanceStyle?.tuning || DEFAULT_TUNING;
    const snapshotMap = new Map(snapshot.map((row) => [row.team, row]));
    const ordered = [...bracket].sort((a, b) => (a.round_order - b.round_order) || a.slot.localeCompare(b.slot));
    const maxRound = Math.max(...ordered.map((row) => row.round_order));

    const probCache = new Map();
    const advancementCounts = new Map();
    const slotWinnerCounts = new Map();
    const summaryAgg = new Map();

    function cachedProb(teamA, teamB, roundOrder) {
      const key = `${teamA}||${teamB}||${roundOrder}`;
      const reverse = `${teamB}||${teamA}||${roundOrder}`;
      if (!probCache.has(key)) {
        const pA = predictMatchup(model, snapshotMap, teamA, teamB, performanceStyle, roundOrder);
        probCache.set(key, pA);
        probCache.set(reverse, 1 - pA);
      }
      return probCache.get(key);
    }

    function uncertaintyShockStdDev(teamA, teamB) {
      const rowA = snapshotMap.get(teamA);
      const rowB = snapshotMap.get(teamB);
      if (!rowA || !rowB) {
        return 0.12;
      }
      const uncertaintyA = teamUncertainty(performanceStyle, rowA.season, teamA);
      const uncertaintyB = teamUncertainty(performanceStyle, rowB.season, teamB);
      const avg = (uncertaintyA + uncertaintyB) / 2;
      return tuning.shock_base + tuning.shock_scale * avg;
    }

    for (let sim = 0; sim < simulations; sim += 1) {
      const winners = { ...lockedWinners };

      for (const row of ordered) {
        const slotName = row.slot;
        const teamA = resolveTeam(row.team_a, winners);
        const teamB = resolveTeam(row.team_b, winners);
        const baseProb = cachedProb(teamA, teamB, row.round_order);
        const pTeamA = seedAdjustedProb(baseProb);

        let winner = "";
        if (lockedWinners[slotName]) {
          winner = lockedWinners[slotName];
        } else if (teamA === "TBD" && teamB === "TBD") {
          winner = "TBD";
        } else if (teamA === "TBD") {
          winner = teamB;
        } else if (teamB === "TBD") {
          winner = teamA;
        } else {
          const shockStd = uncertaintyShockStdDev(teamA, teamB);
          const shockedProb = clampProb(sigmoid(logit(pTeamA) + randomNormal(rng) * shockStd));
          winner = rng.next() < shockedProb ? teamA : teamB;
        }

        winners[slotName] = winner;

        const advKey = `${winner}||${row.round_order}`;
        advancementCounts.set(advKey, (advancementCounts.get(advKey) || 0) + 1);
        const slotWinKey = `${slotName}||${winner}`;
        slotWinnerCounts.set(slotWinKey, (slotWinnerCounts.get(slotWinKey) || 0) + 1);

        const aggKey = [
          slotName,
          String(row.round_order),
          row.round_name,
          row.region,
          teamA,
          teamB,
        ].join("\u0001");

        const current = summaryAgg.get(aggKey);
        if (!current) {
          summaryAgg.set(aggKey, {
            slot: slotName,
            round_order: row.round_order,
            round_name: row.round_name,
            region: row.region,
            team_a: teamA,
            team_b: teamB,
            p_sum: pTeamA,
            wins_a: winner === teamA ? 1 : 0,
            count: 1,
            is_locked: Boolean(lockedWinners[slotName]),
          });
        } else {
          current.p_sum += pTeamA;
          current.wins_a += winner === teamA ? 1 : 0;
          current.count += 1;
          current.is_locked = current.is_locked || Boolean(lockedWinners[slotName]);
        }
      }
    }

    const teams = [...new Set(snapshot.map((row) => row.team))].sort((a, b) => a.localeCompare(b));
    const advancement = teams.map((team) => {
      const row = { team };
      for (let round = 1; round <= maxRound; round += 1) {
        row[`reach_round_${round}`] = (advancementCounts.get(`${team}||${round}`) || 0) / simulations;
      }
      return row;
    });

    const championCol = `reach_round_${maxRound}`;
    advancement.sort((a, b) => Number(b[championCol] || 0) - Number(a[championCol] || 0));

    const summary = [...summaryAgg.values()]
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
          matchup_count: agg.count,
          matchup_share: agg.count / simulations,
          is_locked: agg.is_locked,
        };
      })
      .sort((a, b) => (a.round_order - b.round_order) || a.slot.localeCompare(b.slot));

    const projectedWinners = { ...lockedWinners };
    const bestBracket = [];
    for (const row of ordered) {
      const teamA = resolveTeam(row.team_a, projectedWinners);
      const teamB = resolveTeam(row.team_b, projectedWinners);
      const baseProb = cachedProb(teamA, teamB, row.round_order);
      const adjustedProb = seedAdjustedProb(baseProb);
      let winner = lockedWinners[row.slot] || "";
      if (!winner) {
        const countA = slotWinnerCounts.get(`${row.slot}||${teamA}`) || 0;
        const countB = slotWinnerCounts.get(`${row.slot}||${teamB}`) || 0;
        if (countA > countB) {
          winner = teamA;
        } else if (countB > countA) {
          winner = teamB;
        } else {
          winner = chooseWinnerFromProb(adjustedProb, teamA, teamB, snapshotMap, performanceStyle);
        }
      }
      projectedWinners[row.slot] = winner;

      bestBracket.push({
        slot: row.slot,
        round_order: row.round_order,
        round_name: row.round_name,
        region: row.region,
        team_a: teamA,
        team_b: teamB,
        p_team_a: adjustedProb,
        p_team_b: 1 - adjustedProb,
        winner,
        is_locked: Boolean(lockedWinners[row.slot]),
      });
    }

    const slotOdds = {};
    for (const [key, count] of slotWinnerCounts.entries()) {
      const [slotName, winner] = key.split("||");
      if (!slotOdds[slotName]) {
        slotOdds[slotName] = {};
      }
      slotOdds[slotName][winner] = count / simulations;
    }

    return { summary, advancement, bestBracket, maxRound, slotOdds };
  }

  function addProb(map, key, value) {
    if (!key) return;
    const delta = finiteOr(value, 0);
    if (delta <= 0) return;
    map.set(key, (map.get(key) || 0) + delta);
  }

  function contenderDistribution(ref, distBySlot) {
    const clean = String(ref || "").trim();
    if (!clean) {
      return new Map([["TBD", 1]]);
    }
    if (clean.startsWith("@slot:")) {
      const slotRef = clean.split(":", 2)[1];
      return new Map(distBySlot.get(slotRef) || [["TBD", 1]]);
    }
    return new Map([[clean, 1]]);
  }

  function normalizeDistribution(dist) {
    const total = [...dist.values()].reduce((acc, val) => acc + finiteOr(val, 0), 0);
    if (total <= 1e-12) {
      return new Map([["TBD", 1]]);
    }
    const out = new Map();
    for (const [team, prob] of dist.entries()) {
      const p = finiteOr(prob, 0) / total;
      if (p > 1e-9) {
        out.set(team, p);
      }
    }
    return out.size ? out : new Map([["TBD", 1]]);
  }

  function solveTournamentDeterministic(model, bracket, snapshot, lockedWinners, performanceStyle) {
    const snapshotMap = new Map(snapshot.map((row) => [row.team, row]));
    const ordered = [...bracket].sort((a, b) => (a.round_order - b.round_order) || a.slot.localeCompare(b.slot));
    const maxRound = Math.max(...ordered.map((row) => row.round_order));
    const distBySlot = new Map();

    for (const row of ordered) {
      const slotName = String(row.slot || "");
      const locked = lockedWinners[slotName];
      if (locked) {
        distBySlot.set(slotName, new Map([[locked, 1]]));
        continue;
      }

      const distA = contenderDistribution(row.team_a, distBySlot);
      const distB = contenderDistribution(row.team_b, distBySlot);
      const winnerDist = new Map();

      for (const [teamA, probA] of distA.entries()) {
        for (const [teamB, probB] of distB.entries()) {
          const matchupProb = finiteOr(probA, 0) * finiteOr(probB, 0);
          if (matchupProb <= 1e-12) continue;

          if (teamA === "TBD" && teamB === "TBD") {
            addProb(winnerDist, "TBD", matchupProb);
            continue;
          }
          if (teamA === "TBD") {
            addProb(winnerDist, teamB, matchupProb);
            continue;
          }
          if (teamB === "TBD") {
            addProb(winnerDist, teamA, matchupProb);
            continue;
          }

          const pA = predictMatchup(model, snapshotMap, teamA, teamB, performanceStyle, row.round_order);
          addProb(winnerDist, teamA, matchupProb * pA);
          addProb(winnerDist, teamB, matchupProb * (1 - pA));
        }
      }

      distBySlot.set(slotName, normalizeDistribution(winnerDist));
    }

    const advancementProb = new Map();
    for (const row of ordered) {
      const slotDist = distBySlot.get(row.slot) || new Map();
      for (const [team, prob] of slotDist.entries()) {
        addProb(advancementProb, `${team}||${row.round_order}`, prob);
      }
    }

    const teams = [...new Set(snapshot.map((row) => row.team))].sort((a, b) => a.localeCompare(b));
    const advancement = teams.map((team) => {
      const out = { team };
      for (let round = 1; round <= maxRound; round += 1) {
        out[`reach_round_${round}`] = finiteOr(advancementProb.get(`${team}||${round}`), 0);
      }
      return out;
    });
    const championCol = `reach_round_${maxRound}`;
    advancement.sort((a, b) => Number(b[championCol] || 0) - Number(a[championCol] || 0));

    const projectedWinners = { ...lockedWinners };
    const bestBracket = [];
    for (const row of ordered) {
      const teamA = resolveTeam(row.team_a, projectedWinners);
      const teamB = resolveTeam(row.team_b, projectedWinners);
      const pTeamA = predictMatchup(model, snapshotMap, teamA, teamB, performanceStyle, row.round_order);
      let winner = lockedWinners[row.slot] || "";
      if (!winner) {
        winner = chooseWinnerFromProb(pTeamA, teamA, teamB, snapshotMap, performanceStyle);
      }
      projectedWinners[row.slot] = winner;

      bestBracket.push({
        slot: row.slot,
        round_order: row.round_order,
        round_name: row.round_name,
        region: row.region,
        team_a: teamA,
        team_b: teamB,
        p_team_a: pTeamA,
        p_team_b: 1 - pTeamA,
        winner,
        is_locked: Boolean(lockedWinners[row.slot]),
      });
    }

    const summary = bestBracket.map((row) => ({
      slot: row.slot,
      round_order: row.round_order,
      round_name: row.round_name,
      region: row.region,
      team_a: row.team_a,
      team_b: row.team_b,
      p_team_a: row.p_team_a,
      p_team_b: row.p_team_b,
      team_a_win_rate: row.p_team_a,
      team_b_win_rate: row.p_team_b,
      winner: row.winner,
      matchup_count: 1,
      matchup_share: 1,
      is_locked: row.is_locked,
    }));

    const slotOdds = {};
    for (const row of ordered) {
      const slotDist = distBySlot.get(row.slot) || new Map();
      slotOdds[row.slot] = {};
      for (const [team, prob] of slotDist.entries()) {
        slotOdds[row.slot][team] = prob;
      }
    }

    return { summary, advancement, bestBracket, maxRound, slotOdds };
  }

  function rankNote(prob) {
    if (prob >= 0.15) return "Tier 1 title profile";
    if (prob >= 0.08) return "Strong contender";
    if (prob >= 0.04) return "Live dark horse";
    return "Long-shot path";
  }

  function bracketWinnerMap(bestBracket) {
    const out = {};
    for (const row of bestBracket || []) {
      if (row && row.slot) {
        out[row.slot] = row.winner;
      }
    }
    return out;
  }

  function scoreBracketAgainstActual(bestBracket, bracketRows, actualBySlot) {
    const picks = bracketWinnerMap(bestBracket);
    let points = 0;
    let maxPoints = 0;
    for (const row of bracketRows || []) {
      const roundPoints = ESPN_ROUND_POINTS[row.round_order] || 0;
      if (roundPoints <= 0) continue;
      const actual = actualBySlot[row.slot];
      if (!actual) continue;
      maxPoints += roundPoints;
      if (canonicalName(picks[row.slot]) === canonicalName(actual)) {
        points += roundPoints;
      }
    }
    return {
      points,
      max_points: maxPoints,
      normalized: maxPoints > 0 ? points / maxPoints : 0,
    };
  }

  function safeReadLocalStorageJson(key) {
    try {
      if (typeof localStorage === "undefined") return null;
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function safeWriteLocalStorageJson(key, value) {
    try {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore storage write failures.
    }
  }

  async function prepareBacktestContexts(teamStats, aliasMap, config, targetSeason, maxSeasons, simulations) {
    const seasons = [...new Set(teamStats.map((row) => Number(row.season)))]
      .filter((season) => season < targetSeason)
      .sort((a, b) => a - b)
      .slice(-maxSeasons);

    const contexts = [];
    for (const season of seasons) {
      let snapshot = [];
      try {
        snapshot = seasonSnapshot(teamStats, season);
      } catch {
        continue;
      }

      const window = pickWindow(config, season);
      const firstRoundCaptureEnd = addDays(window.first_four_start, 5);
      const scoreboardRows = await fetchScoreboardRange(window.first_four_start, window.championship_date);
      const ncaaEvents = extractNcaaEvents(scoreboardRows, aliasMap);

      let bracketEvents = ncaaEvents.filter(
        (event) => event.round_order <= 1 && event.day >= window.first_four_start && event.day <= firstRoundCaptureEnd,
      );
      if (bracketEvents.length < 20) {
        bracketEvents = ncaaEvents.filter((event) => event.round_order <= 1);
      }
      if (!bracketEvents.length) {
        continue;
      }

      const bracket = buildBracketFromEvents(bracketEvents, snapshot);
      const knownResults = {};
      ncaaEvents.forEach((event) => {
        if (event.is_final && event.winner && event.day <= window.championship_date) {
          knownResults[gamePairKey(event.team_a, event.team_b)] = event.winner;
        }
      });
      const actualBySlot = applyKnownResults(bracket, knownResults);
      if (Object.keys(actualBySlot).length < 1) {
        continue;
      }

      contexts.push({
        season,
        bracket,
        actualBySlot,
        simulations,
      });
    }
    return contexts;
  }

  function sampleTuningParams(rng, base) {
    const a = 0.05 + rng.next();
    const b = 0.05 + rng.next();
    const c = 0.05 + rng.next();
    const d = 0.05 + rng.next();
    const total = a + b + c + d;
    return normalizeTuningParams({
      ...base,
      blend_logistic: a / total,
      blend_tree: b / total,
      blend_rating: c / total,
      blend_style: d / total,
      style_scale: 0.55 + 0.95 * rng.next(),
      form_scale: 2 + 10 * rng.next(),
      uncertainty_confidence_scale: 0.16 + 0.5 * rng.next(),
      shock_base: 0.05 + 0.14 * rng.next(),
      shock_scale: 0.08 + 0.3 * rng.next(),
    });
  }

  function evaluateTuningCandidate(params, contexts, teamStats, historical) {
    let pointsTotal = 0;
    let normTotal = 0;
    let scored = 0;

    for (const context of contexts) {
      const trainStats = teamStats.filter((row) => Number(row.season) <= context.season);
      const trainGames = historical.filter((row) => Number(row.season) <= context.season);
      if (!trainStats.length || !trainGames.length) {
        continue;
      }

      const model = trainModel(trainStats, trainGames);
      const performanceStyle = buildPerformanceStyleContext(trainStats, trainGames);
      performanceStyle.tuning = params;
      performanceStyle.treeModel = trainTreeModel(trainStats, trainGames, params);
      performanceStyle.calibrator = fitProbabilityCalibrator(trainStats, trainGames, model, performanceStyle);

      const holdoutSnapshot = seasonSnapshot(teamStats, context.season);
      const solved = solveTournamentDeterministic(
        model,
        context.bracket,
        holdoutSnapshot,
        {},
        performanceStyle,
      );
      const score = scoreBracketAgainstActual(solved.bestBracket, context.bracket, context.actualBySlot);
      pointsTotal += score.points;
      normTotal += score.normalized;
      scored += 1;
    }

    if (!scored) {
      return { objective: Number.NEGATIVE_INFINITY, avg_points: 0, avg_normalized: 0, seasons_scored: 0 };
    }

    return {
      objective: normTotal / scored,
      avg_points: pointsTotal / scored,
      avg_normalized: normTotal / scored,
      seasons_scored: scored,
    };
  }

  async function resolveTuningParams(config, teamStats, historical, aliasMap, season) {
    const baseParams = normalizeTuningParams(config?.model_params || {});
    const tuningCfg = config?.model_tuning || {};
    const enabled = tuningCfg.enabled !== false;
    if (!enabled) {
      return {
        params: baseParams,
        source: "config",
        backtest: null,
      };
    }

    const fingerprint = dataFingerprint(teamStats, historical);
    const cacheHours = clampNumber(finiteOr(tuningCfg.cache_hours, 18), 1, 240);
    const cacheKey = `mmp:tuning:v2:${season}:${fingerprint}`;
    const cached = safeReadLocalStorageJson(cacheKey);
    const now = Date.now();
    if (cached && isFiniteNumber(cached.created_at) && (now - cached.created_at) < cacheHours * 3600 * 1000) {
      return {
        params: normalizeTuningParams(cached.params || {}),
        source: "cache",
        backtest: cached.backtest || null,
      };
    }

    const maxSeasons = Math.round(clampNumber(finiteOr(tuningCfg.holdout_max_seasons, 2), 1, 4));
    const backtestSims = Math.round(clampNumber(finiteOr(tuningCfg.backtest_simulations, 360), 120, 900));
    const contexts = await prepareBacktestContexts(teamStats, aliasMap, config, season, maxSeasons, backtestSims);
    if (!contexts.length) {
      return {
        params: baseParams,
        source: "config_no_backtest",
        backtest: {
          seasons_tested: [],
          objective: null,
        },
      };
    }

    const trials = Math.round(clampNumber(finiteOr(tuningCfg.trials, 14), 3, 48));
    const rng = new SeededRandom(Math.round(clampNumber(finiteOr(tuningCfg.random_seed, 9337), 1, 2147483646)));
    const candidates = [baseParams];
    for (let i = 0; i < trials; i += 1) {
      candidates.push(sampleTuningParams(rng, baseParams));
    }

    let bestParams = baseParams;
    let bestScore = evaluateTuningCandidate(bestParams, contexts, teamStats, historical);
    for (let i = 1; i < candidates.length; i += 1) {
      const score = evaluateTuningCandidate(candidates[i], contexts, teamStats, historical);
      if (score.objective > bestScore.objective) {
        bestScore = score;
        bestParams = candidates[i];
      }
    }

    const summary = {
      seasons_tested: contexts.map((context) => context.season),
      objective: bestScore.objective,
      avg_points: bestScore.avg_points,
      avg_normalized: bestScore.avg_normalized,
      seasons_scored: bestScore.seasons_scored,
    };
    safeWriteLocalStorageJson(cacheKey, {
      created_at: now,
      params: bestParams,
      backtest: summary,
    });

    return {
      params: bestParams,
      source: "autotune",
      backtest: summary,
    };
  }

  function buildPortfolioBrackets(
    model,
    bracket,
    snapshot,
    randomSeed,
    lockedWinners,
    performanceStyle,
    slotOdds,
  ) {
    const tuning = performanceStyle?.tuning || DEFAULT_TUNING;
    const snapshotMap = new Map(snapshot.map((row) => [row.team, row]));
    const ordered = [...bracket].sort((a, b) => (a.round_order - b.round_order) || a.slot.localeCompare(b.slot));
    const totalSlots = ordered.length || 1;

    function sampleCandidate(seedOffset, temperature, contrarianBias) {
      const rng = new SeededRandom(randomSeed + seedOffset);
      const winners = { ...lockedWinners };
      const picks = [];
      let expectedPoints = 0;
      let leverage = 0;

      for (const row of ordered) {
        const teamA = resolveTeam(row.team_a, winners);
        const teamB = resolveTeam(row.team_b, winners);
        let winner = lockedWinners[row.slot] || "";
        if (!winner) {
          const baseProb = predictMatchup(model, snapshotMap, teamA, teamB, performanceStyle, row.round_order);
          const adjusted = clampProb(
            sigmoid(logit(baseProb) / Math.max(temperature, 0.01) + contrarianBias * (0.5 - baseProb) * 2.6),
          );
          winner = rng.next() < adjusted ? teamA : teamB;
        }

        winners[row.slot] = winner;
        picks.push({
          slot: row.slot,
          round_order: row.round_order,
          round_name: row.round_name,
          region: row.region,
          winner,
        });

        const roundPoints = ESPN_ROUND_POINTS[row.round_order] || 0;
        const slotProb = finiteOr(slotOdds?.[row.slot]?.[winner], 0);
        expectedPoints += roundPoints * slotProb;
        leverage += roundPoints * Math.max(0, 0.5 - slotProb);
      }

      return {
        picks,
        expected_points: expectedPoints,
        leverage,
      };
    }

    const temps = [0.86, 0.95, 1.02, 1.12, 1.24, 1.38];
    const contrarian = [0, 0.08, 0.16, 0.24];
    const maxCandidates = tuning.portfolio_candidates;
    const generated = [];
    let seedOffset = 101;
    while (generated.length < maxCandidates) {
      for (const t of temps) {
        for (const c of contrarian) {
          generated.push(sampleCandidate(seedOffset, t, c));
          seedOffset += 73;
          if (generated.length >= maxCandidates) break;
        }
        if (generated.length >= maxCandidates) break;
      }
    }

    const dedup = new Map();
    for (const item of generated) {
      const key = item.picks.map((pick) => `${pick.slot}:${pick.winner}`).join("|");
      if (!dedup.has(key)) {
        dedup.set(key, item);
      }
    }
    const candidates = [...dedup.values()];

    const selected = [];
    while (selected.length < tuning.portfolio_size && selected.length < candidates.length) {
      let best = null;
      let bestObjective = Number.NEGATIVE_INFINITY;

      for (const candidate of candidates) {
        if (selected.includes(candidate)) continue;
        let overlapPenalty = 0;
        for (const chosen of selected) {
          let overlap = 0;
          for (let i = 0; i < candidate.picks.length; i += 1) {
            if (candidate.picks[i].winner === chosen.picks[i].winner) {
              overlap += 1;
            }
          }
          overlapPenalty = Math.max(overlapPenalty, overlap / totalSlots);
        }
        const objective =
          candidate.expected_points +
          tuning.portfolio_leverage_weight * candidate.leverage -
          tuning.portfolio_diversity_penalty * overlapPenalty;

        if (objective > bestObjective) {
          bestObjective = objective;
          best = {
            ...candidate,
            objective,
            overlap_penalty: overlapPenalty,
          };
        }
      }

      if (!best) break;
      selected.push(best);
    }

    return selected.map((item, idx) => ({
      rank: idx + 1,
      expected_points: item.expected_points,
      leverage: item.leverage,
      objective: item.objective,
      overlap_penalty: item.overlap_penalty,
      picks: item.picks,
    }));
  }

  function normalizeNameColumns(rows, columns, aliasMap) {
    return rows.map((row) => {
      const out = { ...row };
      columns.forEach((column) => {
        if (column in out) {
          out[column] = maybeAlias(out[column], aliasMap);
        }
      });
      return out;
    });
  }

  async function fetchTeamLogos(targetTeams, aliasMap) {
    const payload = await fetchJson(TEAMS_URL);
    const entries = payload?.sports?.[0]?.leagues?.[0]?.teams || [];
    const lookup = {};

    for (const entry of entries) {
      const team = entry?.team || {};
      const logo = (team?.logos?.[0]?.href || "").trim();
      if (!logo) continue;

      const names = [
        team.displayName,
        team.shortDisplayName,
        team.nickname,
        team.location,
        team.abbreviation,
        [team.location, team.name].filter(Boolean).join(" "),
      ].filter(Boolean);

      names.forEach((name) => {
        lookup[canonicalName(maybeAlias(name, aliasMap))] = logo;
      });
    }

    const result = {};
    [...new Set(targetTeams.map((name) => String(name || "").trim()).filter(Boolean))].forEach((team) => {
      const key = canonicalName(maybeAlias(team, aliasMap));
      if (lookup[key]) {
        result[team] = lookup[key];
      }
    });

    return result;
  }

  async function loadRuntimeData(season) {
    const base = `./data/runtime/${season}`;
    const [teamStatsText, historicalText, aliasesText, injuriesText] = await Promise.all([
      fetchText(`${base}/team_stats.csv`),
      fetchText(`${base}/historical_games.csv`),
      fetchText(`${base}/aliases.csv`).catch(() => "canonical,alias\n"),
      fetchText(`${base}/injuries.csv`).catch(() => "team,injuries_impact\n"),
    ]);

    const aliasRows = parseCsv(aliasesText);
    const aliasMap = {};
    aliasRows.forEach((row) => {
      const canonical = String(row.canonical || "").trim();
      const alias = String(row.alias || "").trim();
      if (!canonical || !alias) return;
      aliasMap[canonicalName(alias)] = canonical;
      aliasMap[canonicalName(canonical)] = canonical;
    });

    let teamStats = normalizeTeamStats(parseCsv(teamStatsText));
    let historical = normalizeGames(parseCsv(historicalText));
    let injuries = parseCsv(injuriesText);

    teamStats = normalizeNameColumns(teamStats, ["team"], aliasMap);
    historical = normalizeNameColumns(historical, ["team_a", "team_b"], aliasMap);
    injuries = normalizeNameColumns(injuries, ["team"], aliasMap);
    const quality = runDataQualityGuards(teamStats, historical);

    return {
      teamStats: quality.teamStats,
      historical: quality.historical,
      injuries,
      aliasMap,
      quality_report: quality.report,
    };
  }

  function pickWindow(config, season) {
    const windows = (config && config.tournament_windows) || {};
    const key = String(season);
    if (windows[key]) {
      return {
        first_four_start: windows[key].first_four_start,
        championship_date: windows[key].championship_date,
      };
    }
    return {
      first_four_start: `${season}-03-15`,
      championship_date: `${season}-04-08`,
    };
  }

  function nowIsoNoMillis() {
    return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  }

  async function buildLivePayload(options = {}) {
    const config = await fetchJson("./data/runtime/config.json").catch(() => ({}));

    const season = Number(options.season || config.default_season || new Date().getUTCFullYear());
    const randomSeed = Number(options.random_seed || 42);

    const { teamStats, historical, injuries, aliasMap, quality_report: qualityReport } = await loadRuntimeData(season);
    const adjustedTeamStats = applyInjuries(teamStats, injuries, season);
    const snapshot = seasonSnapshot(adjustedTeamStats, season);

    const tuningResult = await resolveTuningParams(config, adjustedTeamStats, historical, aliasMap, season);
    const tunedParams = normalizeTuningParams(tuningResult.params || {});

    const model = trainModel(adjustedTeamStats, historical);
    const performanceStyle = buildPerformanceStyleContext(adjustedTeamStats, historical);
    performanceStyle.tuning = tunedParams;
    performanceStyle.treeModel = trainTreeModel(adjustedTeamStats, historical, tunedParams);
    performanceStyle.calibrator = fitProbabilityCalibrator(adjustedTeamStats, historical, model, performanceStyle);

    const window = pickWindow(config, season);
    const firstFourStart = window.first_four_start;
    const championshipDate = window.championship_date;
    const firstRoundCaptureEnd = addDays(firstFourStart, 5);
    const resultsEnd = minYmd(todayYmdUtc(), championshipDate);
    const fetchEnd = maxYmd(firstRoundCaptureEnd, resultsEnd);

    const scoreboardRows = await fetchScoreboardRange(firstFourStart, fetchEnd);
    const ncaaEvents = extractNcaaEvents(scoreboardRows, aliasMap);

    let bracketEvents = ncaaEvents.filter(
      (event) => event.round_order <= 1 && event.day >= firstFourStart && event.day <= firstRoundCaptureEnd,
    );
    if (bracketEvents.length < 20) {
      bracketEvents = ncaaEvents.filter((event) => event.round_order <= 1);
    }

    const bracket = buildBracketFromEvents(bracketEvents, snapshot);

    const knownResults = {};
    ncaaEvents.forEach((event) => {
      if (!event.is_final || !event.winner || event.day > resultsEnd) {
        return;
      }
      const key = gamePairKey(event.team_a, event.team_b);
      knownResults[key] = event.winner;
    });

    const lockedWinners = applyKnownResults(bracket, knownResults);

    let teamLogos = {};
    try {
      teamLogos = await fetchTeamLogos(snapshot.map((row) => row.team), aliasMap);
    } catch {
      teamLogos = {};
    }

    const { summary, advancement, bestBracket, maxRound, slotOdds } = solveTournamentDeterministic(
      model,
      bracket,
      snapshot,
      lockedWinners,
      performanceStyle,
    );
    const portfolioBrackets = buildPortfolioBrackets(
      model,
      bracket,
      snapshot,
      randomSeed + 9001,
      lockedWinners,
      performanceStyle,
      slotOdds,
    );

    const championCol = `reach_round_${maxRound}`;
    const titleOdds = advancement
      .map((row) => {
        const prob = Number(row[championCol] || 0);
        return {
          team: String(row.team),
          title_prob: prob,
          note: rankNote(prob),
        };
      })
      .sort((a, b) => b.title_prob - a.title_prob)
      .slice(0, 16);

    const teamSeeds = {};
    snapshot.forEach((row) => {
      const team = String(row.team || "").trim();
      const seed = toNumber(row.seed);
      if (team && isFiniteNumber(seed)) {
        teamSeeds[team] = seed;
      }
    });

    return {
      meta: {
        season,
        simulations: 0,
        prediction_mode: "deterministic_elo",
        updated_at: nowIsoNoMillis(),
        training_metrics: {
          logistic: model.metrics,
          tree: performanceStyle.treeModel?.metrics || {},
          calibrator_rows: performanceStyle.calibrator?.global?.rows || 0,
        },
        model_tuning: {
          source: tuningResult.source,
          params: tunedParams,
          backtest: tuningResult.backtest,
        },
        data_quality: qualityReport,
        grading_factors: {
          tempo_adjusted_margin: true,
          soft_outcomes: true,
          recency_weighting: true,
          round_importance_weighting: true,
          continuous_style_vectors: true,
          anti_symmetric_style_interactions: true,
          rolling_form_last5_last10: true,
          ensemble_logistic_tree_rating_style: true,
          uncertainty_aware_probs: true,
          round_aware_probability_calibration: true,
          backtest_espn_points_optimized: true,
          portfolio_bracket_generation: true,
          data_quality_guards: true,
          live_bracket_solver: "deterministic",
          seed_gap_feature: false,
        },
        team_logos_count: Object.keys(teamLogos).length,
      },
      matchups: summary,
      title_odds: titleOdds,
      best_bracket: bestBracket,
      portfolio_brackets: portfolioBrackets,
      team_logos: teamLogos,
      team_seeds: teamSeeds,
    };
  }

  window.LiveBracketRuntime = {
    buildLivePayload,
  };
})();
