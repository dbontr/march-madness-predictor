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
    "ast_rate",
    "stl_rate",
    "blk_rate",
    "three_rate",
    "opp_three_rate",
    "opp_fg3_pct",
    "opp_ft_rate",
  ];
  const MATCHUP_FEATURE_COLS = FEATURE_COLS.filter((feature) => feature !== "seed");

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
    blend_logistic: 0.27,
    blend_tree: 0.18,
    blend_rating: 0.3,
    blend_style: 0.11,
    blend_archetype: 0.07,
    blend_market: 0.07,
    style_scale: 0.9,
    archetype_scale: 0.82,
    form_scale: 6.2,
    form_trend_scale: 1.65,
    matchup_interaction_scale: 0.62,
    context_edge_scale: 1.0,
    quality_win_scale: 4.2,
    bad_loss_scale: 4.9,
    close_game_scale: 2.6,
    blowout_scale: 1.8,
    consistency_scale: 2.1,
    fatigue_scale: 2.2,
    travel_scale: 0.8,
    preseason_shrink_base: 0.34,
    elo_k_base: 0.095,
    elo_k_surprise_scale: 1.35,
    margin_sigma_base: 7.4,
    variance_scale: 0.78,
    archetype_uncertainty_damp: 0.55,
    calibration_isotonic_mix: 0.12,
    uncertainty_confidence_scale: 0.34,
    shock_base: 0.08,
    shock_scale: 0.22,
    home_court_bonus: 2.2,
    market_power_scale: 1.1,
    market_prob_shrink: 0.82,
    stacker_mix: 0.66,
    logistic_lr: 0.06,
    logistic_lambda: 0.001,
    logistic_epochs: 420,
    tree_stumps: 28,
  });
  const BLEND_KEYS = Object.freeze([
    "blend_logistic",
    "blend_tree",
    "blend_rating",
    "blend_style",
    "blend_archetype",
    "blend_market",
  ]);
  const TUNING_PARAM_SPECS = Object.freeze({
    style_scale: { min: 0.4, max: 1.6, integer: false },
    archetype_scale: { min: 0.35, max: 1.7, integer: false },
    form_scale: { min: 0, max: 14, integer: false },
    form_trend_scale: { min: 0, max: 4.5, integer: false },
    matchup_interaction_scale: { min: 0, max: 3.2, integer: false },
    context_edge_scale: { min: 0, max: 3.2, integer: false },
    quality_win_scale: { min: 0, max: 9, integer: false },
    bad_loss_scale: { min: 0, max: 9, integer: false },
    close_game_scale: { min: 0, max: 6, integer: false },
    blowout_scale: { min: 0, max: 5, integer: false },
    consistency_scale: { min: 0, max: 6, integer: false },
    fatigue_scale: { min: 0, max: 6, integer: false },
    travel_scale: { min: 0, max: 3, integer: false },
    preseason_shrink_base: { min: 0.08, max: 0.7, integer: false },
    elo_k_base: { min: 0.02, max: 0.24, integer: false },
    elo_k_surprise_scale: { min: 0.2, max: 2.8, integer: false },
    margin_sigma_base: { min: 4.8, max: 13, integer: false },
    variance_scale: { min: 0.45, max: 1.3, integer: false },
    archetype_uncertainty_damp: { min: 0, max: 1, integer: false },
    calibration_isotonic_mix: { min: 0, max: 0.45, integer: false },
    uncertainty_confidence_scale: { min: 0.08, max: 0.75, integer: false },
    shock_base: { min: 0.03, max: 0.25, integer: false },
    shock_scale: { min: 0.05, max: 0.45, integer: false },
    home_court_bonus: { min: 0, max: 6, integer: false },
    market_power_scale: { min: 0, max: 2.4, integer: false },
    market_prob_shrink: { min: 0, max: 1, integer: false },
    stacker_mix: { min: 0, max: 1, integer: false },
    logistic_lr: { min: 0.012, max: 0.22, integer: false },
    logistic_lambda: { min: 0.00002, max: 0.05, integer: false },
    logistic_epochs: { min: 120, max: 1400, integer: true },
    tree_stumps: { min: 8, max: 96, integer: true },
  });
  const TUNING_CONTINUOUS_KEYS = Object.freeze(Object.keys(TUNING_PARAM_SPECS));
  const ALL_TUNING_KEYS = Object.freeze([...TUNING_CONTINUOUS_KEYS, ...BLEND_KEYS]);
  const OUTCOME_MARGIN_SCALE = 11.5;
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
    ast_rate: [0.35, 0.78],
    stl_rate: [0.03, 0.18],
    blk_rate: [0.02, 0.22],
    three_rate: [0.18, 0.65],
    opp_three_rate: [0.18, 0.65],
    opp_fg3_pct: [0.2, 0.5],
    opp_ft_rate: [0.12, 0.65],
  });

  const NCAA_NOTE_PREFIXES = [
    "NCAA Men's Basketball Championship - ",
    "Men's Basketball Championship - ",
  ];
  const SCOREBOARD_URL =
    "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard";
  const TEAMS_URL =
    "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams?limit=1000";
  const DEFAULT_FINAL_FOUR_PAIRS = Object.freeze([
    ["EAST", "WEST"],
    ["SOUTH", "MIDWEST"],
  ]);
  let LIVE_SOLVER_CONTEXT = null;
  const MANUAL_LOGO_OVERRIDES = Object.freeze({
    queens: "https://dxbhsrqyrr690.cloudfront.net/sidearm.nextgen.sites/queensathletics.com/images/logos/site/site.png",
    "queens university": "https://dxbhsrqyrr690.cloudfront.net/sidearm.nextgen.sites/queensathletics.com/images/logos/site/site.png",
    "queens university of charlotte": "https://dxbhsrqyrr690.cloudfront.net/sidearm.nextgen.sites/queensathletics.com/images/logos/site/site.png",
  });

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

  function firstFiniteValue(...values) {
    for (const value of values) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return Number.NaN;
  }

  function readNumericCandidate(raw, keys) {
    for (const key of keys) {
      const parsed = toNumber(raw?.[key]);
      if (isFiniteNumber(parsed)) {
        return parsed;
      }
    }
    return Number.NaN;
  }

  function moneylineToProbability(moneyline) {
    const ml = toNumber(moneyline);
    if (!isFiniteNumber(ml) || ml === 0) return Number.NaN;
    if (ml < 0) {
      const abs = Math.abs(ml);
      return abs / (abs + 100);
    }
    return 100 / (ml + 100);
  }

  function spreadLineToMarginForTeamA(spreadForTeamA) {
    const spread = toNumber(spreadForTeamA);
    if (!isFiniteNumber(spread)) return Number.NaN;
    // Typical spread format: negative means favored (expected to win by |spread|).
    return -spread;
  }

  function marginToWinProb(marginForTeamA) {
    const margin = toNumber(marginForTeamA);
    if (!isFiniteNumber(margin)) return Number.NaN;
    return clampProb(normalCdf(margin / 11.5));
  }

  function probToApproxMargin(probForTeamA) {
    const p = toNumber(probForTeamA);
    if (!isFiniteNumber(p)) return Number.NaN;
    return clampNumber(logit(clampProb(p)) * 8.5, -40, 40);
  }

  function deriveMarketSignals(raw) {
    const probAExplicit = firstFiniteValue(
      readNumericCandidate(raw, ["market_prob_a", "implied_prob_a", "vegas_prob_a", "closing_prob_a"]),
      Number.NaN,
    );
    const probBExplicit = firstFiniteValue(
      readNumericCandidate(raw, ["market_prob_b", "implied_prob_b", "vegas_prob_b", "closing_prob_b"]),
      Number.NaN,
    );
    const moneylineA = readNumericCandidate(raw, ["moneyline_a", "closing_moneyline_a"]);
    const moneylineB = readNumericCandidate(raw, ["moneyline_b", "closing_moneyline_b"]);
    const mlProbA = moneylineToProbability(moneylineA);
    const mlProbB = moneylineToProbability(moneylineB);
    const spreadA = spreadLineToMarginForTeamA(
      readNumericCandidate(raw, ["market_margin_a", "market_spread_a", "closing_spread_a", "spread_a", "line_a"]),
    );
    const spreadB = spreadLineToMarginForTeamA(
      readNumericCandidate(raw, ["market_margin_b", "market_spread_b", "closing_spread_b", "spread_b", "line_b"]),
    );

    let marketProbA = Number.NaN;
    if (isFiniteNumber(probAExplicit)) {
      marketProbA = clampProb(probAExplicit);
    } else if (isFiniteNumber(probBExplicit)) {
      marketProbA = clampProb(1 - probBExplicit);
    } else if (isFiniteNumber(mlProbA)) {
      marketProbA = clampProb(mlProbA);
    } else if (isFiniteNumber(mlProbB)) {
      marketProbA = clampProb(1 - mlProbB);
    }

    let marketMarginA = Number.NaN;
    if (isFiniteNumber(spreadA)) {
      marketMarginA = spreadA;
    } else if (isFiniteNumber(spreadB)) {
      marketMarginA = -spreadB;
    }

    if (!isFiniteNumber(marketProbA) && isFiniteNumber(marketMarginA)) {
      marketProbA = marginToWinProb(marketMarginA);
    }
    if (!isFiniteNumber(marketMarginA) && isFiniteNumber(marketProbA)) {
      marketMarginA = probToApproxMargin(marketProbA);
    }

    return {
      market_prob_a: isFiniteNumber(marketProbA) ? clampProb(marketProbA) : Number.NaN,
      market_margin_a: isFiniteNumber(marketMarginA) ? clampNumber(marketMarginA, -40, 40) : Number.NaN,
      market_available: isFiniteNumber(marketProbA) || isFiniteNumber(marketMarginA) ? 1 : 0,
    };
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

  async function fetchJson(url, options = {}) {
    const target = String(url || "");
    const cacheMode = options.cache || (target.startsWith("./") ? "default" : "no-store");
    const res = await fetch(url, { cache: cacheMode });
    if (!res.ok) {
      throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
    }
    return res.json();
  }

  async function fetchText(url, options = {}) {
    const target = String(url || "");
    const cacheMode = options.cache || (target.startsWith("./") ? "default" : "no-store");
    const res = await fetch(url, { cache: cacheMode });
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

  function normalizeMaybeYmd(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    const m = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (!m) return "";
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (!Number.isInteger(year) || year < 1900 || year > 2200) return "";
    if (!Number.isInteger(month) || month < 1 || month > 12) return "";
    if (!Number.isInteger(day) || day < 1 || day > 31) return "";
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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

  async function mapWithConcurrency(items, limit, mapper) {
    const pool = Math.max(1, Math.min(items.length || 1, Math.round(finiteOr(limit, 4))));
    const out = new Array(items.length);
    let cursor = 0;

    async function worker() {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        out[index] = await mapper(items[index], index);
      }
    }

    const workers = [];
    for (let i = 0; i < pool; i += 1) {
      workers.push(worker());
    }
    await Promise.all(workers);
    return out;
  }

  async function fetchScoreboardRange(startYmd, endYmd, options = {}) {
    const days = enumerateDays(startYmd, endYmd);
    const cacheMinutes = clampNumber(finiteOr(options.cache_minutes, 20), 0, 24 * 60);
    const cacheKey = `mmp:scoreboard:v2:${startYmd}:${endYmd}`;
    const now = Date.now();
    if (cacheMinutes > 0) {
      const cached = safeReadLocalStorageJson(cacheKey);
      if (
        cached &&
        isFiniteNumber(cached.created_at) &&
        (now - cached.created_at) < cacheMinutes * 60 * 1000 &&
        Array.isArray(cached.rows)
      ) {
        return cached.rows;
      }
    }

    const batches = await mapWithConcurrency(
      days,
      Math.round(clampNumber(finiteOr(options.concurrency, 6), 1, 24)),
      async (day) => {
        try {
          const url = `${SCOREBOARD_URL}?dates=${ymdCompact(day)}&groups=50&limit=1000`;
          const payload = await fetchJson(url, { cache: "no-store" });
          const events = payload.events || [];
          return events.map((event) => ({ day, event }));
        } catch {
          return [];
        }
      },
    );
    const out = batches.flat();
    if (cacheMinutes > 0) {
      safeWriteLocalStorageJson(cacheKey, {
        created_at: now,
        rows: out,
      });
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
      const teamALogo = String(competitors[0]?.team?.logos?.[0]?.href || competitors[0]?.team?.logo || "").trim();
      const teamBLogo = String(competitors[1]?.team?.logos?.[0]?.href || competitors[1]?.team?.logo || "").trim();

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
        team_a_logo: teamALogo,
        team_b_logo: teamBLogo,
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

  function normalizeFinalFourPairs(rawPairs) {
    if (!Array.isArray(rawPairs) || rawPairs.length !== 2) {
      return null;
    }

    const out = [];
    const usedRegions = new Set();
    const seenPairKeys = new Set();

    for (const rawPair of rawPairs) {
      if (!Array.isArray(rawPair) || rawPair.length !== 2) {
        return null;
      }

      const regionA = String(rawPair[0] || "").trim().toUpperCase();
      const regionB = String(rawPair[1] || "").trim().toUpperCase();
      if (!REGION_ORDER.includes(regionA) || !REGION_ORDER.includes(regionB) || regionA === regionB) {
        return null;
      }

      if (usedRegions.has(regionA) || usedRegions.has(regionB)) {
        return null;
      }
      usedRegions.add(regionA);
      usedRegions.add(regionB);

      const key = [regionA, regionB].sort().join("|");
      if (seenPairKeys.has(key)) {
        return null;
      }
      seenPairKeys.add(key);
      out.push([regionA, regionB]);
    }

    if (usedRegions.size !== REGION_ORDER.length) {
      return null;
    }

    return out;
  }

  function configuredFinalFourPairs(config, season) {
    const raw = config?.final_four_pairs || {};
    const seasonKey = String(Number(season));
    return normalizeFinalFourPairs(raw?.[seasonKey] || raw?.default || null);
  }

  function inferFinalFourPairsFromEvents(finalFourEvents, regionSeedTeam) {
    const teamRegionLookup = {};
    REGION_ORDER.forEach((region) => {
      const bySeed = regionSeedTeam?.[region] || {};
      Object.values(bySeed).forEach((team) => {
        const key = canonicalName(team);
        if (key) {
          teamRegionLookup[key] = region;
        }
      });
    });

    const inferred = [];
    const seenPairs = new Set();
    for (const event of finalFourEvents || []) {
      const teamA = String(event?.team_a || "").trim();
      const teamB = String(event?.team_b || "").trim();
      if (!teamA || !teamB || teamA === "TBD" || teamB === "TBD") {
        continue;
      }

      const regionA = teamRegionLookup[canonicalName(teamA)];
      const regionB = teamRegionLookup[canonicalName(teamB)];
      if (!regionA || !regionB || regionA === regionB) {
        continue;
      }

      const key = [regionA, regionB].sort().join("|");
      if (seenPairs.has(key)) {
        continue;
      }
      seenPairs.add(key);
      inferred.push([regionA, regionB]);
    }

    return normalizeFinalFourPairs(inferred);
  }

  function resolveFinalFourPairs(regionSeedTeam, options = {}) {
    const configured = normalizeFinalFourPairs(options?.finalFourPairs);
    if (configured) {
      return { pairs: configured, source: "config" };
    }

    const inferred = inferFinalFourPairsFromEvents(options?.finalFourEvents || [], regionSeedTeam);
    if (inferred) {
      return { pairs: inferred, source: "events" };
    }

    return {
      pairs: DEFAULT_FINAL_FOUR_PAIRS.map((pair) => [pair[0], pair[1]]),
      source: "default",
    };
  }

  function counterpartSeedInFirstRound(seed) {
    const s = Number(seed);
    for (const pair of FIRST_ROUND_SEED_PAIRS) {
      if (pair[0] === s) return pair[1];
      if (pair[1] === s) return pair[0];
    }
    return Number.NaN;
  }

  function buildBracketFromEvents(ncaaEvents, snapshot, options = {}) {
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

    const finalFourResolution = resolveFinalFourPairs(regionSeedTeam, options);
    const finalFourPairs = finalFourResolution.pairs;

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

    return {
      rows: rows.sort((a, b) => (a.round_order - b.round_order) || a.slot.localeCompare(b.slot)),
      finalFourPairs,
      finalFourPairSource: finalFourResolution.source,
    };
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
      const market = deriveMarketSignals(raw);
      return {
        season,
        team_a: String(raw.team_a || "").trim(),
        team_b: String(raw.team_b || "").trim(),
        score_a: Number(raw.score_a),
        score_b: Number(raw.score_b),
        neutral_site: Number(raw.neutral_site || 1),
        home_team: String(raw.home_team || "").trim(),
        home_edge_a: readNumericCandidate(raw, ["home_edge_a", "home_advantage_a"]),
        rest_days_a: readNumericCandidate(raw, ["rest_days_a", "days_rest_a"]),
        rest_days_b: readNumericCandidate(raw, ["rest_days_b", "days_rest_b"]),
        travel_distance_a: readNumericCandidate(raw, ["travel_distance_a", "travel_miles_a"]),
        travel_distance_b: readNumericCandidate(raw, ["travel_distance_b", "travel_miles_b"]),
        injuries_impact_a: readNumericCandidate(raw, ["injuries_impact_a", "injury_delta_a"]),
        injuries_impact_b: readNumericCandidate(raw, ["injuries_impact_b", "injury_delta_b"]),
        market_prob_a: market.market_prob_a,
        market_margin_a: market.market_margin_a,
        market_available: market.market_available,
        game_date: String(raw.game_date || "").trim(),
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
      market_rows: 0,
      context_rows: 0,
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
      const gameDate = normalizeMaybeYmd(row.game_date);
      const market = deriveMarketSignals(row);
      const homeTeam = canonicalName(row.home_team);
      let homeEdgeA = toNumber(row.home_edge_a);
      if (!isFiniteNumber(homeEdgeA) && homeTeam) {
        if (homeTeam === canonicalName(teamA)) homeEdgeA = 1;
        else if (homeTeam === canonicalName(teamB)) homeEdgeA = -1;
      }
      if (!isFiniteNumber(homeEdgeA)) {
        homeEdgeA = neutral === 0 ? 1 : 0;
      }
      homeEdgeA = clampNumber(homeEdgeA, -1.5, 1.5);

      const restA = toNumber(row.rest_days_a);
      const restB = toNumber(row.rest_days_b);
      const travelA = toNumber(row.travel_distance_a);
      const travelB = toNumber(row.travel_distance_b);
      const injuriesA = toNumber(row.injuries_impact_a);
      const injuriesB = toNumber(row.injuries_impact_b);
      const normalized = {
        season,
        team_a: teamA,
        team_b: teamB,
        score_a: clampNumber(scoreA, 20, 150),
        score_b: clampNumber(scoreB, 20, 150),
        neutral_site: neutral === 0 ? 0 : 1,
        home_team: String(row.home_team || "").trim(),
        home_edge_a: homeEdgeA,
        rest_days_a: isFiniteNumber(restA) ? clampNumber(restA, 0, 10) : Number.NaN,
        rest_days_b: isFiniteNumber(restB) ? clampNumber(restB, 0, 10) : Number.NaN,
        travel_distance_a: isFiniteNumber(travelA) ? clampNumber(travelA, 0, 5000) : Number.NaN,
        travel_distance_b: isFiniteNumber(travelB) ? clampNumber(travelB, 0, 5000) : Number.NaN,
        injuries_impact_a: isFiniteNumber(injuriesA) ? clampNumber(injuriesA, -1, 1) : Number.NaN,
        injuries_impact_b: isFiniteNumber(injuriesB) ? clampNumber(injuriesB, -1, 1) : Number.NaN,
        market_prob_a: market.market_prob_a,
        market_margin_a: market.market_margin_a,
        market_available: market.market_available,
        game_date: gameDate,
        round_name: String(row.round_name || "").trim(),
        game_index: Number(row.game_index || 0),
      };
      if (normalized.market_available) {
        report.market_rows += 1;
      }
      if (
        isFiniteNumber(normalized.rest_days_a) ||
        isFiniteNumber(normalized.rest_days_b) ||
        isFiniteNumber(normalized.travel_distance_a) ||
        isFiniteNumber(normalized.travel_distance_b) ||
        isFiniteNumber(normalized.injuries_impact_a) ||
        isFiniteNumber(normalized.injuries_impact_b)
      ) {
        report.context_rows += 1;
      }

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
    const weights = {};
    let total = 0;
    for (const key of BLEND_KEYS) {
      const value = Math.max(0, finiteOr(tuning?.[key], DEFAULT_TUNING[key]));
      weights[key] = value;
      total += value;
    }
    if (total <= 1e-9) {
      const fallback = {};
      for (const key of BLEND_KEYS) {
        fallback[key] = DEFAULT_TUNING[key];
      }
      return fallback;
    }
    const normalized = {};
    for (const key of BLEND_KEYS) {
      normalized[key] = weights[key] / total;
    }
    return normalized;
  }

  function normalizeTuningParams(tuning) {
    const base = { ...DEFAULT_TUNING, ...(tuning || {}) };
    const blend = normalizeBlendWeights(base);
    const out = {
      ...base,
      ...blend,
    };
    for (const [key, spec] of Object.entries(TUNING_PARAM_SPECS)) {
      const clamped = clampNumber(base[key], spec.min, spec.max);
      out[key] = spec.integer ? Math.round(clamped) : clamped;
    }
    return out;
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

  function erfApprox(x) {
    const sign = x < 0 ? -1 : 1;
    const ax = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * ax);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax));
    return sign * y;
  }

  function normalCdf(z) {
    return 0.5 * (1 + erfApprox(z / Math.sqrt(2)));
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
    const certaintyWeight = 0.52 + 0.74 * marginSignal;
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

  function buildMatchupContextFromGame(game, flip = false) {
    const neutralSite = toNumber(game?.neutral_site) === 0 ? 0 : 1;
    const homeEdgeRaw = isFiniteNumber(toNumber(game?.home_edge_a))
      ? toNumber(game?.home_edge_a)
      : (neutralSite === 0 ? 1 : 0);
    const restA = toNumber(game?.rest_days_a);
    const restB = toNumber(game?.rest_days_b);
    const travelA = toNumber(game?.travel_distance_a);
    const travelB = toNumber(game?.travel_distance_b);
    const injuryA = toNumber(game?.injuries_impact_a);
    const injuryB = toNumber(game?.injuries_impact_b);
    const marketProbA = toNumber(game?.market_prob_a);
    const marketMarginA = toNumber(game?.market_margin_a);
    const marketAvailable = toNumber(game?.market_available) >= 1
      || isFiniteNumber(marketProbA)
      || isFiniteNumber(marketMarginA);

    const ctx = {
      neutral_site: neutralSite,
      home_edge_for_team_a: clampNumber(homeEdgeRaw, -1.5, 1.5),
      rest_edge_for_team_a: isFiniteNumber(restA) && isFiniteNumber(restB) ? clampNumber((restA - restB) / 3, -2, 2) : 0,
      travel_edge_for_team_a: isFiniteNumber(travelA) && isFiniteNumber(travelB) ? clampNumber((travelB - travelA) / 900, -4, 4) : 0,
      injury_edge_for_team_a: isFiniteNumber(injuryA) && isFiniteNumber(injuryB) ? clampNumber(injuryA - injuryB, -1.8, 1.8) : 0,
      market_prob_for_team_a: isFiniteNumber(marketProbA) ? clampProb(marketProbA) : Number.NaN,
      market_margin_for_team_a: isFiniteNumber(marketMarginA) ? clampNumber(marketMarginA, -40, 40) : Number.NaN,
      market_available: marketAvailable ? 1 : 0,
    };
    ctx.market_prob_edge_for_team_a = isFiniteNumber(ctx.market_prob_for_team_a)
      ? ctx.market_prob_for_team_a - 0.5
      : 0;
    ctx.market_spread_edge_for_team_a = isFiniteNumber(ctx.market_margin_for_team_a)
      ? clampNumber(ctx.market_margin_for_team_a / 11.5, -3.5, 3.5)
      : 0;

    if (!flip) {
      return ctx;
    }
    return {
      ...ctx,
      home_edge_for_team_a: -ctx.home_edge_for_team_a,
      rest_edge_for_team_a: -ctx.rest_edge_for_team_a,
      travel_edge_for_team_a: -ctx.travel_edge_for_team_a,
      injury_edge_for_team_a: -ctx.injury_edge_for_team_a,
      market_prob_for_team_a: isFiniteNumber(ctx.market_prob_for_team_a) ? (1 - ctx.market_prob_for_team_a) : Number.NaN,
      market_margin_for_team_a: isFiniteNumber(ctx.market_margin_for_team_a) ? -ctx.market_margin_for_team_a : Number.NaN,
      market_prob_edge_for_team_a: -ctx.market_prob_edge_for_team_a,
      market_spread_edge_for_team_a: -ctx.market_spread_edge_for_team_a,
    };
  }

  function matchupInteractionEdge(rowA, rowB) {
    const offA = finiteOr(toNumber(rowA.adj_offense), 110);
    const defA = finiteOr(toNumber(rowA.adj_defense), 110);
    const offB = finiteOr(toNumber(rowB.adj_offense), 110);
    const defB = finiteOr(toNumber(rowB.adj_defense), 110);
    const orbA = finiteOr(toNumber(rowA.orb_pct), 0.28);
    const drbA = finiteOr(toNumber(rowA.drb_pct), 0.67);
    const orbB = finiteOr(toNumber(rowB.orb_pct), 0.28);
    const drbB = finiteOr(toNumber(rowB.drb_pct), 0.67);
    const fg3A = finiteOr(toNumber(rowA.fg3_pct), 0.34);
    const fg3B = finiteOr(toNumber(rowB.fg3_pct), 0.34);
    const opp3A = finiteOr(toNumber(rowA.opp_fg3_pct), 0.34);
    const opp3B = finiteOr(toNumber(rowB.opp_fg3_pct), 0.34);
    const ftA = finiteOr(toNumber(rowA.ft_rate), 0.27);
    const ftB = finiteOr(toNumber(rowB.ft_rate), 0.27);
    const oppFtA = finiteOr(toNumber(rowA.opp_ft_rate), 0.27);
    const oppFtB = finiteOr(toNumber(rowB.opp_ft_rate), 0.27);
    const astA = finiteOr(toNumber(rowA.ast_rate), 0.55);
    const astB = finiteOr(toNumber(rowB.ast_rate), 0.55);
    const stlA = finiteOr(toNumber(rowA.stl_rate), 0.085);
    const stlB = finiteOr(toNumber(rowB.stl_rate), 0.085);

    const glassEdge = ((orbA - drbB) - (orbB - drbA)) * 5.2;
    const offDefEdge = ((offA - defB) - (offB - defA)) / 19;
    const perimeterEdge = ((fg3A - opp3B) - (fg3B - opp3A)) * 7.8;
    const foulEdge = ((ftA - oppFtB) - (ftB - oppFtA)) * 6.6;
    const playmakingEdge = ((astA - stlB) - (astB - stlA)) * 3.8;
    return clampNumber(
      0.34 * glassEdge + 0.28 * offDefEdge + 0.2 * perimeterEdge + 0.12 * foulEdge + 0.06 * playmakingEdge,
      -8,
      8,
    );
  }

  function buildMatchupRawVector(rowA, rowB, neutralSite = 1, homeEdgeForTeamA = 0, context = {}) {
    const diff = MATCHUP_FEATURE_COLS.map((feature) => toNumber(rowA[feature]) - toNumber(rowB[feature]));
    const tempoA = finiteOr(toNumber(rowA.tempo), 68);
    const tempoB = finiteOr(toNumber(rowB.tempo), 68);
    const tempoClash = Math.abs(tempoA - tempoB) / 10;
    const interactionEdge = matchupInteractionEdge(rowA, rowB) / 8;
    const restEdge = finiteOr(context?.rest_edge_for_team_a, 0);
    const travelEdge = finiteOr(context?.travel_edge_for_team_a, 0);
    const injuryEdge = finiteOr(context?.injury_edge_for_team_a, 0);
    const marketProbEdge = finiteOr(context?.market_prob_edge_for_team_a, 0);
    const marketSpreadEdge = finiteOr(context?.market_spread_edge_for_team_a, 0);
    const marketAvailable = finiteOr(context?.market_available, 0);
    const seedGap = 0;
    return [
      ...diff,
      seedGap,
      interactionEdge,
      tempoClash,
      restEdge,
      travelEdge,
      injuryEdge,
      marketProbEdge,
      marketSpreadEdge,
      marketAvailable,
      toNumber(neutralSite),
      toNumber(homeEdgeForTeamA),
    ];
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

      const ctxA = buildMatchupContextFromGame(game, false);
      const ctxB = buildMatchupContextFromGame(game, true);
      const forward = buildMatchupRawVector(
        rowA,
        rowB,
        ctxA.neutral_site,
        ctxA.home_edge_for_team_a,
        ctxA,
      );
      const reverse = buildMatchupRawVector(
        rowB,
        rowA,
        ctxB.neutral_site,
        ctxB.home_edge_for_team_a,
        ctxB,
      );

      const rawMargin = finiteOr(toNumber(game.score_a), 0) - finiteOr(toNumber(game.score_b), 0);
      const adjustedMargin = tempoAdjustedMargin(rawMargin, rowA, rowB);
      const outcomeSoft = softOutcomeFromMargin(adjustedMargin, OUTCOME_MARGIN_SCALE);
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
    const maxStumps = Math.round(clampNumber(finiteOr(tuning?.tree_stumps, 28), 8, 96));

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

  function trainModel(teamStats, games, tuning = DEFAULT_TUNING) {
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
    const lr = clampNumber(finiteOr(tuning?.logistic_lr, DEFAULT_TUNING.logistic_lr), 0.012, 0.22);
    const lambda = clampNumber(finiteOr(tuning?.logistic_lambda, DEFAULT_TUNING.logistic_lambda), 0.00002, 0.05);
    const epochs = Math.round(clampNumber(finiteOr(tuning?.logistic_epochs, DEFAULT_TUNING.logistic_epochs), 120, 1400));
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
    const net = finiteOr(toNumber(row.net_rating), 0);
    const sos = finiteOr(toNumber(row.sos), 0);
    const recent = finiteOr(toNumber(row.recent_form), 0.5);
    const injuries = finiteOr(toNumber(row.injuries_impact), 0);
    const q1Wins = finiteOr(toNumber(row.q1_wins), 0);
    const q2Wins = finiteOr(toNumber(row.q2_wins), 0);
    const q3Losses = finiteOr(toNumber(row.q3_losses), 0);
    const q4Losses = finiteOr(toNumber(row.q4_losses), 0);
    const off = finiteOr(toNumber(row.adj_offense), 0);
    const def = finiteOr(toNumber(row.adj_defense), 0);
    const tov = finiteOr(toNumber(row.tov_pct), 0.19);
    const drb = finiteOr(toNumber(row.drb_pct), 0.67);
    const orb = finiteOr(toNumber(row.orb_pct), 0.28);
    const ast = finiteOr(toNumber(row.ast_rate), 0.55);
    const stl = finiteOr(toNumber(row.stl_rate), 0.085);
    const blk = finiteOr(toNumber(row.blk_rate), 0.08);
    const threeRate = finiteOr(toNumber(row.three_rate), finiteOr(toNumber(row.fg3_pct), 0.34) * 1.52);
    const qualityResume = 0.72 * q1Wins + 0.42 * q2Wins - 0.64 * q3Losses - 1.02 * q4Losses;
    const possessionControl = 16 * ((drb - 0.67) + 0.55 * (orb - 0.28) - 0.7 * (tov - 0.19));
    const pressureProfile = 8.8 * ((ast - 0.55) + 1.2 * (stl - 0.085) + 0.8 * (blk - 0.08));
    const spacingProfile = 6.8 * (threeRate - 0.36);
    const efficiencyGap = off - def;

    return (
      0.74 * net +
      0.56 * sos +
      0.42 * efficiencyGap +
      1.35 * qualityResume +
      possessionControl +
      pressureProfile +
      spacingProfile +
      6.3 * (recent - 0.5) +
      10 * injuries
    );
  }

  function styleKeyMetrics(row) {
    const tempo = finiteOr(toNumber(row.tempo), 0);
    const fg3 = finiteOr(toNumber(row.fg3_pct), 0);
    const threeRate = finiteOr(toNumber(row.three_rate), fg3 * 1.52);
    const oppThreeRate = finiteOr(toNumber(row.opp_three_rate), threeRate);
    const tov = finiteOr(toNumber(row.tov_pct), 0);
    const orb = finiteOr(toNumber(row.orb_pct), 0);
    const drb = finiteOr(toNumber(row.drb_pct), 0);
    const ftRate = finiteOr(toNumber(row.ft_rate), 0);
    const astRate = finiteOr(toNumber(row.ast_rate), 0.55);
    const stlRate = finiteOr(toNumber(row.stl_rate), 0.085);
    const blkRate = finiteOr(toNumber(row.blk_rate), 0.08);
    const off = finiteOr(toNumber(row.adj_offense), 0);
    const def = -finiteOr(toNumber(row.adj_defense), 0);
    return {
      tempo,
      fg3,
      threeRate,
      oppThreeRate,
      tovControl: -tov,
      orb,
      drb,
      ftRate,
      astRate,
      stlRate,
      blkRate,
      off,
      def,
    };
  }

  function buildStyleNorm(teamStats) {
    const sums = {
      tempo: 0,
      fg3: 0,
      threeRate: 0,
      oppThreeRate: 0,
      tovControl: 0,
      orb: 0,
      drb: 0,
      ftRate: 0,
      astRate: 0,
      stlRate: 0,
      blkRate: 0,
      off: 0,
      def: 0,
    };
    const sumsSq = {
      tempo: 0,
      fg3: 0,
      threeRate: 0,
      oppThreeRate: 0,
      tovControl: 0,
      orb: 0,
      drb: 0,
      ftRate: 0,
      astRate: 0,
      stlRate: 0,
      blkRate: 0,
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
    const threeRate = zStyle(m.threeRate, styleNorm, "threeRate");
    const oppThreeRate = zStyle(m.oppThreeRate, styleNorm, "oppThreeRate");
    const tovControl = zStyle(m.tovControl, styleNorm, "tovControl");
    const orb = zStyle(m.orb, styleNorm, "orb");
    const drb = zStyle(m.drb, styleNorm, "drb");
    const ftRate = zStyle(m.ftRate, styleNorm, "ftRate");
    const astRate = zStyle(m.astRate, styleNorm, "astRate");
    const stlRate = zStyle(m.stlRate, styleNorm, "stlRate");
    const blkRate = zStyle(m.blkRate, styleNorm, "blkRate");
    const off = zStyle(m.off, styleNorm, "off");
    const def = zStyle(m.def, styleNorm, "def");

    const scores = {
      pace_space: 0.78 * tempo + 0.75 * fg3 + 0.68 * threeRate + 0.45 * off - 0.35 * orb,
      power_glass: -0.45 * tempo + 0.95 * orb + 0.75 * ftRate + 0.35 * drb,
      grind_defense: -0.75 * tempo + 0.95 * def + 0.7 * drb + 0.35 * (stlRate + blkRate),
      pressure_chaos: 0.7 * tempo + 0.65 * def + 0.6 * tovControl + 0.55 * stlRate + 0.38 * oppThreeRate,
      balanced_execution: 0.52 * off + 0.48 * def + 0.45 * tovControl + 0.42 * astRate + 0.28 * drb,
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
      zStyle(m.threeRate, styleNorm, "threeRate"),
      zStyle(m.oppThreeRate, styleNorm, "oppThreeRate"),
      zStyle(m.tovControl, styleNorm, "tovControl"),
      zStyle(m.orb, styleNorm, "orb"),
      zStyle(m.drb, styleNorm, "drb"),
      zStyle(m.ftRate, styleNorm, "ftRate"),
      zStyle(m.astRate, styleNorm, "astRate"),
      zStyle(m.stlRate, styleNorm, "stlRate"),
      zStyle(m.blkRate, styleNorm, "blkRate"),
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

  function fitArchetypeMatchupModel(validGames, archetypeByTeam, ratingByTeam, baseRating, baseMean) {
    const sumByPair = new Map();
    const weightByPair = new Map();

    for (const game of validGames) {
      const typeA = archetypeByTeam.get(game.keyA) || "balanced_execution";
      const typeB = archetypeByTeam.get(game.keyB) || "balanced_execution";
      const ratingA = ratingByTeam.get(game.keyA) ?? baseRating.get(game.keyA) ?? baseMean;
      const ratingB = ratingByTeam.get(game.keyB) ?? baseRating.get(game.keyB) ?? baseMean;
      const expected = sigmoid((ratingA - ratingB) / 11.5);
      const residual = game.outcomeSoft - expected;
      const weight = game.weight;

      const key = `${typeA}||${typeB}`;
      const rev = `${typeB}||${typeA}`;
      sumByPair.set(key, (sumByPair.get(key) || 0) + weight * residual);
      weightByPair.set(key, (weightByPair.get(key) || 0) + weight);
      sumByPair.set(rev, (sumByPair.get(rev) || 0) - weight * residual);
      weightByPair.set(rev, (weightByPair.get(rev) || 0) + weight);
    }

    const edgeByPair = new Map();
    for (const [pair, sum] of sumByPair.entries()) {
      const w = weightByPair.get(pair) || 0;
      if (w <= 1e-9) continue;
      const raw = sum / w;
      const shrink = w / (w + 20);
      edgeByPair.set(pair, clampNumber(raw * shrink, -0.26, 0.26));
    }

    return {
      edgeByPair,
      weightByPair,
      pairs: edgeByPair.size,
    };
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

  function archetypeEdgeFromContext(performanceStyle, keyA, keyB) {
    const typeA = performanceStyle?.archetypeBySeasonTeam?.get(keyA);
    const typeB = performanceStyle?.archetypeBySeasonTeam?.get(keyB);
    const archetypeModel = performanceStyle?.archetypeModel;
    const edgeByPair = archetypeModel?.edgeByPair;
    if (!typeA || !typeB || !edgeByPair?.size) {
      return 0;
    }
    const pairKey = `${typeA}||${typeB}`;
    const edge = finiteOr(edgeByPair.get(pairKey), 0);
    const pairWeight = finiteOr(archetypeModel?.weightByPair?.get(pairKey), 0);
    const reliability = clampNumber(pairWeight / (pairWeight + 28), 0.08, 1);
    const uncertaintyA = finiteOr(performanceStyle?.uncertaintyBySeasonTeam?.get(keyA), 0.55);
    const uncertaintyB = finiteOr(performanceStyle?.uncertaintyBySeasonTeam?.get(keyB), 0.55);
    const uncertaintyDamp = 1 - finiteOr(performanceStyle?.tuning?.archetype_uncertainty_damp, 0.55) * ((uncertaintyA + uncertaintyB) / 2);
    return clampNumber(edge * reliability * clampNumber(uncertaintyDamp, 0.25, 1), -0.3, 0.3);
  }

  function computeQualityProfileByTeam(gamesByTeam, ratingByTeam, baseRating, baseMean) {
    const out = new Map();

    for (const [key, teamGames] of gamesByTeam.entries()) {
      if (!teamGames.length) {
        out.set(key, {
          quality_win: 0,
          bad_loss: 0,
          close_resilience: 0,
          blowout_dominance: 0,
          consistency: 0.5,
          mean_surprise: 0,
        });
        continue;
      }

      const selfRating = ratingByTeam.get(key) ?? baseRating.get(key) ?? baseMean;
      let weightTotal = 0;
      let qualityWin = 0;
      let badLoss = 0;
      let closeResilience = 0;
      let blowoutDominance = 0;
      let surpriseSum = 0;
      let surpriseSq = 0;

      for (const g of teamGames) {
        const oppRating = ratingByTeam.get(g.oppKey) ?? baseRating.get(g.oppKey) ?? baseMean;
        const expected = sigmoid((selfRating - oppRating) / 12);
        const surprise = g.outcomeSoft - expected;
        const oppStrength = sigmoid((oppRating - baseMean) / 9.5);
        const weakOpp = 1 - oppStrength;
        const winShare = Math.max(0, g.outcomeSoft - 0.5) * 2;
        const lossShare = Math.max(0, 0.5 - g.outcomeSoft) * 2;
        const marginAbs = Math.abs(g.adjustedMargin);
        const closeSignal = Math.max(0, 1 - marginAbs / 8.5);
        const blowoutSignal = Math.max(0, Math.tanh((marginAbs - 6) / 10));
        const weight = g.weight;

        qualityWin += weight * (winShare ** 1.35) * (oppStrength ** 1.4);
        badLoss += weight * (lossShare ** 1.45) * (weakOpp ** 1.5);
        closeResilience += weight * closeSignal * (0.72 * surprise + 0.28 * (oppStrength - 0.5));
        blowoutDominance += weight * blowoutSignal * Math.sign(g.adjustedMargin) * (0.45 + 0.55 * oppStrength);
        surpriseSum += weight * surprise;
        surpriseSq += weight * surprise * surprise;
        weightTotal += weight;
      }

      if (weightTotal <= 1e-9) {
        out.set(key, {
          quality_win: 0,
          bad_loss: 0,
          close_resilience: 0,
          blowout_dominance: 0,
          consistency: 0.5,
          mean_surprise: 0,
        });
        continue;
      }

      const meanSurprise = surpriseSum / weightTotal;
      const variance = Math.max(0, surpriseSq / weightTotal - meanSurprise * meanSurprise);
      const consistency = 1 / (1 + Math.sqrt(variance) * 3.4);

      out.set(key, {
        quality_win: qualityWin / weightTotal,
        bad_loss: badLoss / weightTotal,
        close_resilience: closeResilience / weightTotal,
        blowout_dominance: blowoutDominance / weightTotal,
        consistency,
        mean_surprise: meanSurprise,
      });
    }

    return out;
  }

  function computeRollingFormByTeam(gamesByTeam, ratingByTeam, baseRating, baseMean) {
    const result = new Map();
    for (const [key, teamGames] of gamesByTeam.entries()) {
      const ordered = [...teamGames].sort((a, b) => b.game_index - a.game_index);
      if (!ordered.length) {
        result.set(key, {
          last3: 0,
          last5: 0,
          last10: 0,
          blend: 0,
          trend: 0,
          volatility: 0,
        });
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

      const w3 = windowScore(3, 0.4);
      const w5 = windowScore(5, 0.33);
      const w10 = windowScore(10, 0.21);
      const trend = clampNumber((w3.mean - w10.mean) * 1.75, -0.65, 0.65);
      result.set(key, {
        last3: w3.mean,
        last5: w5.mean,
        last10: w10.mean,
        blend: 0.52 * w3.mean + 0.33 * w5.mean + 0.15 * w10.mean,
        trend,
        volatility: 0.6 * w5.sd + 0.4 * w10.sd,
      });
    }
    return result;
  }

  function baseOffDefenseFromRow(row) {
    const off = finiteOr(toNumber(row.adj_offense), 110) - 110;
    const def = 110 - finiteOr(toNumber(row.adj_defense), 110);
    const net = finiteOr(toNumber(row.net_rating), 0);
    const sos = finiteOr(toNumber(row.sos), 0);
    const q1Wins = finiteOr(toNumber(row.q1_wins), 0);
    const q4Losses = finiteOr(toNumber(row.q4_losses), 0);
    const resume = q1Wins - 1.1 * q4Losses;
    return {
      off: off + 0.1 * net + 0.05 * sos + 0.05 * resume,
      def: def + 0.08 * net - 0.04 * sos + 0.03 * resume,
    };
  }

  function buildPreseasonPriors(teamStats, baseOffByKey, baseDefByKey) {
    const rows = [...teamStats].sort((a, b) =>
      (Number(a.season) - Number(b.season)) || String(a.team || "").localeCompare(String(b.team || "")));
    const priors = new Map();
    for (const row of rows) {
      const season = Number(row.season);
      const team = String(row.team || "");
      const key = teamSeasonKey(season, team);
      const prevKey = teamSeasonKey(season - 1, team);
      const baseOff = baseOffByKey.get(key) ?? 0;
      const baseDef = baseDefByKey.get(key) ?? 0;
      const prevOff = baseOffByKey.get(prevKey);
      const prevDef = baseDefByKey.get(prevKey);
      priors.set(key, {
        off: isFiniteNumber(prevOff) ? 0.7 * baseOff + 0.3 * prevOff : baseOff,
        def: isFiniteNumber(prevDef) ? 0.7 * baseDef + 0.3 * prevDef : baseDef,
      });
    }
    return priors;
  }

  function applyRestContext(gamesByTeam) {
    for (const teamGames of gamesByTeam.values()) {
      const ordered = [...teamGames].sort((a, b) => a.game_index - b.game_index);
      let prevIdx = Number.NaN;
      ordered.forEach((g) => {
        const idx = Number(g.game_index || 0);
        const explicitRest = toNumber(g.rest_days);
        const gap = isFiniteNumber(explicitRest)
          ? clampNumber(explicitRest, 0, 10)
          : (isFiniteNumber(prevIdx) ? Math.max(0, idx - prevIdx - 1) : 4);
        g.rest_gap = gap;
        g.short_rest = gap <= 1 ? 1 : 0;
        g.back_to_back = gap <= 0 ? 1 : 0;
        prevIdx = idx;
      });
    }
  }

  function fitOffDefenseRatings(validGames, baseOffByKey, baseDefByKey, preseasonByKey, tuning) {
    const off = new Map();
    const def = new Map();
    const gamesPlayedByTeam = new Map();
    const keys = [...baseOffByKey.keys()];
    for (const key of keys) {
      const prior = preseasonByKey.get(key) || { off: baseOffByKey.get(key) ?? 0, def: baseDefByKey.get(key) ?? 0 };
      off.set(key, prior.off);
      def.set(key, prior.def);
      gamesPlayedByTeam.set(key, 0);
    }

    const orderedGames = [...validGames].sort((a, b) =>
      (Number(a.season) - Number(b.season)) || (Number(a.game_index) - Number(b.game_index)));
    for (const game of orderedGames) {
      const keyA = game.keyA;
      const keyB = game.keyB;
      if (!off.has(keyA) || !off.has(keyB)) continue;

      const offA = off.get(keyA) ?? 0;
      const defA = def.get(keyA) ?? 0;
      const offB = off.get(keyB) ?? 0;
      const defB = def.get(keyB) ?? 0;

      const expectedMargin = (offA + defA) - (offB + defB);
      const expectedWin = normalCdf(
        expectedMargin / Math.max(3, finiteOr(tuning.margin_sigma_base, DEFAULT_TUNING.margin_sigma_base)),
      );
      const surprise = Math.abs(game.outcomeSoft - expectedWin);
      const marginSignal = Math.abs(Math.tanh(game.adjustedMargin / 13));
      const baseK = finiteOr(tuning.elo_k_base, 0.095);
      const surpriseScale = finiteOr(tuning.elo_k_surprise_scale, 1.35);
      const kRaw =
        baseK *
        finiteOr(game.round_importance, 1) *
        (0.6 + 0.55 * finiteOr(game.recency_weight, 1)) *
        (1 + surpriseScale * surprise) *
        (0.72 + 0.38 * marginSignal);
      const k = clampNumber(kRaw, 0.012, 0.85);
      const err = game.adjustedMargin - expectedMargin;
      const offDelta = 0.52 * k * err;
      const defDelta = 0.48 * k * err;

      off.set(keyA, offA + offDelta);
      def.set(keyA, defA + defDelta);
      off.set(keyB, offB - offDelta);
      def.set(keyB, defB - defDelta);

      gamesPlayedByTeam.set(keyA, (gamesPlayedByTeam.get(keyA) || 0) + 1);
      gamesPlayedByTeam.set(keyB, (gamesPlayedByTeam.get(keyB) || 0) + 1);
    }

    const shrinkBase = finiteOr(tuning.preseason_shrink_base, 0.34);
    const rating = new Map();
    for (const key of keys) {
      const preseason = preseasonByKey.get(key) || { off: baseOffByKey.get(key) ?? 0, def: baseDefByKey.get(key) ?? 0 };
      const gp = gamesPlayedByTeam.get(key) || 0;
      const shrink = clampNumber(shrinkBase / Math.sqrt(gp + 1), 0.06, 0.72);
      const finalOff = (1 - shrink) * (off.get(key) ?? preseason.off) + shrink * preseason.off;
      const finalDef = (1 - shrink) * (def.get(key) ?? preseason.def) + shrink * preseason.def;
      off.set(key, finalOff);
      def.set(key, finalDef);
      rating.set(key, finalOff + finalDef);
    }

    return {
      offenseRatingBySeasonTeam: off,
      defenseRatingBySeasonTeam: def,
      ratingBySeasonTeam: rating,
      gamesPlayedBySeasonTeam: gamesPlayedByTeam,
      preseasonBySeasonTeam: preseasonByKey,
    };
  }

  function computeScheduleProfileByTeam(gamesByTeam, ratingByTeam, baseRating, baseMean, statMap) {
    const out = new Map();
    for (const [key, teamGames] of gamesByTeam.entries()) {
      if (!teamGames.length) {
        out.set(key, {
          short_rest_rate: 0,
          back_to_back_rate: 0,
          fatigue_pressure: 0,
          travel_resilience: 0,
          short_rest_resilience: 0,
          context_resilience: 0,
        });
        continue;
      }

      const selfRating = ratingByTeam.get(key) ?? baseRating.get(key) ?? baseMean;
      const row = statMap.get(key) || {};
      const tempo = finiteOr(toNumber(row.tempo), 68);
      let wSum = 0;
      let shortW = 0;
      let b2bW = 0;
      let neutralW = 0;
      let travelMilesW = 0;
      let shortResilienceAcc = 0;
      let contextEdgeAcc = 0;
      let contextEdgeW = 0;

      for (const g of teamGames) {
        const oppRating = ratingByTeam.get(g.oppKey) ?? baseRating.get(g.oppKey) ?? baseMean;
        const expected = sigmoid((selfRating - oppRating) / 12);
        const surprise = g.outcomeSoft - expected;
        const w = g.weight;
        const shortRest = finiteOr(g.short_rest, 0);
        const backToBack = finiteOr(g.back_to_back, 0);
        shortW += w * shortRest;
        b2bW += w * backToBack;
        neutralW += w * finiteOr(g.neutral_site, 1);
        travelMilesW += w * finiteOr(g.travel_distance, 0);
        shortResilienceAcc += w * shortRest * surprise;
        const contextEdge = finiteOr(g.rest_edge, 0) + finiteOr(g.travel_edge, 0) + finiteOr(g.injury_edge, 0);
        contextEdgeAcc += w * contextEdge * surprise;
        contextEdgeW += w * Math.abs(contextEdge);
        wSum += w;
      }

      const shortRestRate = wSum > 0 ? shortW / wSum : 0;
      const backToBackRate = wSum > 0 ? b2bW / wSum : 0;
      const neutralRate = wSum > 0 ? neutralW / wSum : 0;
      const avgTravelMiles = wSum > 0 ? travelMilesW / wSum : 0;
      const tempoStress = Math.max(0, (tempo - 68) / 10);
      const fatiguePressure = 1.25 * backToBackRate + 0.75 * shortRestRate + 0.2 * tempoStress;
      const shortRestResilience = shortW > 1e-9 ? shortResilienceAcc / shortW : 0;
      const travelResilience = neutralRate - 0.45 - avgTravelMiles / 2200;
      const contextResilience = contextEdgeW > 1e-9 ? contextEdgeAcc / contextEdgeW : 0;

      out.set(key, {
        short_rest_rate: shortRestRate,
        back_to_back_rate: backToBackRate,
        fatigue_pressure: fatiguePressure,
        travel_resilience: travelResilience,
        short_rest_resilience: shortRestResilience,
        context_resilience: contextResilience,
      });
    }
    return out;
  }

  function fitMarketPowerRatings(validGames, baseRating, baseMean, tuning) {
    const marketGames = (validGames || []).filter((game) =>
      isFiniteNumber(game.market_prob_a) || isFiniteNumber(game.market_margin_a));
    if (!marketGames.length) {
      return {
        marketPowerBySeasonTeam: new Map(),
        marketGamesBySeasonTeam: new Map(),
        market_rows: 0,
      };
    }

    const power = new Map();
    const marketGamesBySeasonTeam = new Map();
    for (const [key, rating] of baseRating.entries()) {
      power.set(key, finiteOr(rating, baseMean) * 0.32);
      marketGamesBySeasonTeam.set(key, 0);
    }

    const ordered = [...marketGames].sort((a, b) =>
      (Number(a.season) - Number(b.season)) || (Number(a.game_index) - Number(b.game_index)));

    for (const game of ordered) {
      const keyA = game.keyA;
      const keyB = game.keyB;
      if (!power.has(keyA)) power.set(keyA, finiteOr(baseRating.get(keyA), baseMean) * 0.32);
      if (!power.has(keyB)) power.set(keyB, finiteOr(baseRating.get(keyB), baseMean) * 0.32);
      marketGamesBySeasonTeam.set(keyA, (marketGamesBySeasonTeam.get(keyA) || 0) + 1);
      marketGamesBySeasonTeam.set(keyB, (marketGamesBySeasonTeam.get(keyB) || 0) + 1);

      const marketProbA = isFiniteNumber(game.market_prob_a)
        ? clampProb(game.market_prob_a)
        : marginToWinProb(game.market_margin_a);
      if (!isFiniteNumber(marketProbA)) continue;
      const pObs = clampProb(marketProbA);

      const a = power.get(keyA) ?? 0;
      const b = power.get(keyB) ?? 0;
      const pPred = sigmoid((a - b) / 10.5);
      const err = pObs - pPred;
      const k = clampNumber(
        0.22
        * finiteOr(game.weight, 1)
        * (0.75 + 0.25 * finiteOr(game.round_importance, 1))
        * (0.75 + 0.25 * finiteOr(tuning.market_prob_shrink, 0.82)),
        0.02,
        1.2,
      );
      power.set(keyA, a + 9.5 * k * err);
      power.set(keyB, b - 9.5 * k * err);
    }

    for (const [key, value] of power.entries()) {
      const base = finiteOr(baseRating.get(key), baseMean) * 0.28;
      const games = marketGamesBySeasonTeam.get(key) || 0;
      const shrink = clampNumber(36 / (36 + games), 0.12, 0.96);
      power.set(key, (1 - shrink) * value + shrink * base);
    }

    return {
      marketPowerBySeasonTeam: power,
      marketGamesBySeasonTeam,
      market_rows: marketGames.length,
    };
  }

  function computeTeamVarianceByTeam(gamesByTeam, offByTeam, defByTeam, tuning) {
    const out = new Map();
    const baseSigma = finiteOr(tuning.margin_sigma_base, DEFAULT_TUNING.margin_sigma_base);
    for (const [key, teamGames] of gamesByTeam.entries()) {
      if (!teamGames.length) {
        out.set(key, baseSigma);
        continue;
      }

      let wSum = 0;
      let sqErr = 0;
      for (const g of teamGames) {
        const offSelf = offByTeam.get(key) ?? 0;
        const defSelf = defByTeam.get(key) ?? 0;
        const offOpp = offByTeam.get(g.oppKey) ?? 0;
        const defOpp = defByTeam.get(g.oppKey) ?? 0;
        const expectedMargin = (offSelf + defSelf) - (offOpp + defOpp);
        const err = g.adjustedMargin - expectedMargin;
        const w = g.weight;
        wSum += w;
        sqErr += w * err * err;
      }
      const rmse = Math.sqrt(sqErr / Math.max(wSum, 1e-9));
      const sigma =
        (0.54 * rmse + 0.46 * baseSigma) *
        finiteOr(tuning.variance_scale, 1);
      out.set(key, clampNumber(sigma, 4.8, 15.8));
    }
    return out;
  }

  function buildPerformanceStyleContext(teamStats, games, tuningInput = DEFAULT_TUNING) {
    const tuning = normalizeTuningParams(tuningInput || {});
    const statMap = new Map();
    teamStats.forEach((row) => {
      statMap.set(teamSeasonKey(row.season, row.team), row);
    });

    const baseRating = new Map();
    const baseOffByKey = new Map();
    const baseDefByKey = new Map();
    const baseValues = [];
    for (const row of teamStats) {
      const key = teamSeasonKey(row.season, row.team);
      const rating = teamPowerScore(row);
      const base = baseOffDefenseFromRow(row);
      baseRating.set(key, rating);
      baseOffByKey.set(key, base.off);
      baseDefByKey.set(key, base.def);
      baseValues.push(rating);
    }
    const baseMean = mean(baseValues);
    const recencyInfo = buildSeasonGameIndex(games);

    const styleNorm = buildStyleNorm(teamStats);
    const styleVectorByTeam = new Map();
    const archetypeByTeam = new Map();
    for (const row of teamStats) {
      const key = teamSeasonKey(row.season, row.team);
      styleVectorByTeam.set(key, styleVectorForRow(row, styleNorm));
      archetypeByTeam.set(key, archetypeForRow(row, styleNorm));
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
      const outcomeSoft = softOutcomeFromMargin(adjustedMargin, OUTCOME_MARGIN_SCALE);
      const weight = gameSampleWeight(game, adjustedMargin, recencyInfo);
      const gameIndex = Number(game.game_index || 0);
      const recencyWeight = gameRecencyWeight(game, recencyInfo);
      const roundWeight = roundImportance(game.round_name);
      const ctxA = buildMatchupContextFromGame(game, false);
      const ctxB = buildMatchupContextFromGame(game, true);

      validGames.push({
        season: Number(game.season),
        keyA,
        keyB,
        adjustedMargin,
        outcomeSoft,
        weight,
        game_index: gameIndex,
        recency_weight: recencyWeight,
        round_importance: roundWeight,
        market_prob_a: ctxA.market_prob_for_team_a,
        market_margin_a: ctxA.market_margin_for_team_a,
        market_available: ctxA.market_available,
      });

      if (!gamesByTeam.has(keyA)) gamesByTeam.set(keyA, []);
      if (!gamesByTeam.has(keyB)) gamesByTeam.set(keyB, []);
      gamesByTeam.get(keyA).push({
        oppKey: keyB,
        adjustedMargin,
        outcomeSoft,
        weight,
        game_index: gameIndex,
        neutral_site: ctxA.neutral_site,
        home_edge: ctxA.home_edge_for_team_a,
        rest_edge: ctxA.rest_edge_for_team_a,
        travel_edge: ctxA.travel_edge_for_team_a,
        injury_edge: ctxA.injury_edge_for_team_a,
        rest_days: toNumber(game.rest_days_a),
        travel_distance: toNumber(game.travel_distance_a),
        market_prob: ctxA.market_prob_for_team_a,
        market_margin: ctxA.market_margin_for_team_a,
        market_available: ctxA.market_available,
      });
      gamesByTeam.get(keyB).push({
        oppKey: keyA,
        adjustedMargin: -adjustedMargin,
        outcomeSoft: 1 - outcomeSoft,
        weight,
        game_index: gameIndex,
        neutral_site: ctxB.neutral_site,
        home_edge: ctxB.home_edge_for_team_a,
        rest_edge: ctxB.rest_edge_for_team_a,
        travel_edge: ctxB.travel_edge_for_team_a,
        injury_edge: ctxB.injury_edge_for_team_a,
        rest_days: toNumber(game.rest_days_b),
        travel_distance: toNumber(game.travel_distance_b),
        market_prob: ctxB.market_prob_for_team_a,
        market_margin: ctxB.market_margin_for_team_a,
        market_available: ctxB.market_available,
      });
    }

    applyRestContext(gamesByTeam);
    const preseasonByKey = buildPreseasonPriors(teamStats, baseOffByKey, baseDefByKey);
    const offDef = fitOffDefenseRatings(validGames, baseOffByKey, baseDefByKey, preseasonByKey, tuning);
    const rating = offDef.ratingBySeasonTeam;

    const formByTeam = computeRollingFormByTeam(gamesByTeam, rating, baseRating, baseMean);
    const scheduleByTeam = computeScheduleProfileByTeam(gamesByTeam, rating, baseRating, baseMean, statMap);
    const marketModel = fitMarketPowerRatings(validGames, rating, baseMean, tuning);
    const varianceByTeam = computeTeamVarianceByTeam(
      gamesByTeam,
      offDef.offenseRatingBySeasonTeam,
      offDef.defenseRatingBySeasonTeam,
      tuning,
    );

    const uncertaintyByTeam = new Map();
    for (const [key] of baseRating.entries()) {
      const teamGames = gamesByTeam.get(key) || [];
      if (!teamGames.length) {
        uncertaintyByTeam.set(key, 0.75);
        continue;
      }
      const offSelf = offDef.offenseRatingBySeasonTeam.get(key) ?? 0;
      const defSelf = offDef.defenseRatingBySeasonTeam.get(key) ?? 0;
      let wSum = 0;
      let sqErr = 0;
      for (const g of teamGames) {
        const offOpp = offDef.offenseRatingBySeasonTeam.get(g.oppKey) ?? 0;
        const defOpp = offDef.defenseRatingBySeasonTeam.get(g.oppKey) ?? 0;
        const expectedMargin = (offSelf + defSelf) - (offOpp + defOpp);
        const sigmaSelf = varianceByTeam.get(key) ?? tuning.margin_sigma_base;
        const sigmaOpp = varianceByTeam.get(g.oppKey) ?? tuning.margin_sigma_base;
        const sigma = Math.sqrt(
          0.34 * sigmaSelf * sigmaSelf +
          0.34 * sigmaOpp * sigmaOpp +
          0.32 * tuning.margin_sigma_base * tuning.margin_sigma_base,
        );
        const expected = normalCdf(expectedMargin / Math.max(1e-6, sigma));
        const err = g.outcomeSoft - expected;
        const w = g.weight;
        wSum += w;
        sqErr += w * err * err;
      }
      const rmse = Math.sqrt(sqErr / Math.max(wSum, 1e-9));
      const formVol = finiteOr(formByTeam.get(key)?.volatility, 0);
      const sigmaNorm = (varianceByTeam.get(key) ?? tuning.margin_sigma_base) / Math.max(1e-6, tuning.margin_sigma_base);
      const uncertainty = Math.min(0.9, 0.18 + 1.05 / Math.sqrt(wSum + 2) + 0.38 * rmse + 0.48 * formVol + 0.16 * sigmaNorm);
      uncertaintyByTeam.set(key, uncertainty);
    }

    const styleModel = fitStyleInteractionModel(validGames, styleVectorByTeam, rating, baseRating, baseMean);
    const archetypeModel = fitArchetypeMatchupModel(validGames, archetypeByTeam, rating, baseRating, baseMean);
    const qualityByTeam = computeQualityProfileByTeam(gamesByTeam, rating, baseRating, baseMean);

    return {
      tuning,
      ratingBySeasonTeam: rating,
      offenseRatingBySeasonTeam: offDef.offenseRatingBySeasonTeam,
      defenseRatingBySeasonTeam: offDef.defenseRatingBySeasonTeam,
      marginSigmaBySeasonTeam: varianceByTeam,
      uncertaintyBySeasonTeam: uncertaintyByTeam,
      scheduleBySeasonTeam: scheduleByTeam,
      marketPowerBySeasonTeam: marketModel.marketPowerBySeasonTeam,
      marketGamesBySeasonTeam: marketModel.marketGamesBySeasonTeam,
      styleVectorBySeasonTeam: styleVectorByTeam,
      archetypeBySeasonTeam: archetypeByTeam,
      formBySeasonTeam: formByTeam,
      qualityBySeasonTeam: qualityByTeam,
      market_rows: marketModel.market_rows,
      styleModel,
      archetypeModel,
      gamesPlayedBySeasonTeam: offDef.gamesPlayedBySeasonTeam,
      preseasonBySeasonTeam: offDef.preseasonBySeasonTeam,
    };
  }

  function computeRawBlendProb(
    model,
    rowA,
    rowB,
    teamA,
    teamB,
    performanceStyle,
    neutralSite = 1,
    homeEdgeForTeamA = 0,
    matchupContext = {},
  ) {
    const normalizedContext = {
      neutral_site: isFiniteNumber(toNumber(matchupContext?.neutral_site))
        ? (toNumber(matchupContext.neutral_site) === 0 ? 0 : 1)
        : (toNumber(neutralSite) === 0 ? 0 : 1),
      home_edge_for_team_a: isFiniteNumber(toNumber(matchupContext?.home_edge_for_team_a))
        ? clampNumber(toNumber(matchupContext.home_edge_for_team_a), -1.5, 1.5)
        : clampNumber(toNumber(homeEdgeForTeamA), -1.5, 1.5),
      rest_edge_for_team_a: finiteOr(matchupContext?.rest_edge_for_team_a, 0),
      travel_edge_for_team_a: finiteOr(matchupContext?.travel_edge_for_team_a, 0),
      injury_edge_for_team_a: finiteOr(matchupContext?.injury_edge_for_team_a, 0),
      market_prob_for_team_a: toNumber(matchupContext?.market_prob_for_team_a),
      market_margin_for_team_a: toNumber(matchupContext?.market_margin_for_team_a),
      market_prob_edge_for_team_a: 0,
      market_spread_edge_for_team_a: 0,
      market_available: (
        finiteOr(matchupContext?.market_available, 0) > 0
        || isFiniteNumber(toNumber(matchupContext?.market_prob_for_team_a))
        || isFiniteNumber(toNumber(matchupContext?.market_margin_for_team_a))
      ) ? 1 : 0,
    };
    normalizedContext.market_prob_edge_for_team_a = isFiniteNumber(normalizedContext.market_prob_for_team_a)
      ? (normalizedContext.market_prob_for_team_a - 0.5)
      : finiteOr(matchupContext?.market_prob_edge_for_team_a, 0);
    normalizedContext.market_spread_edge_for_team_a = isFiniteNumber(normalizedContext.market_margin_for_team_a)
      ? (normalizedContext.market_margin_for_team_a / 11.5)
      : finiteOr(matchupContext?.market_spread_edge_for_team_a, 0);

    const raw = buildMatchupRawVector(
      rowA,
      rowB,
      normalizedContext.neutral_site,
      normalizedContext.home_edge_for_team_a,
      normalizedContext,
    );
    const transformed = transformFeatureVector(raw, model);
    const modelProb = sigmoid(dot(model.weights, transformed) + model.bias);
    const treeProb = predictTreeProb(performanceStyle?.treeModel, raw);

    const keyA = teamSeasonKey(rowA.season, teamA);
    const keyB = teamSeasonKey(rowB.season, teamB);
    const tuning = performanceStyle?.tuning || DEFAULT_TUNING;

    const formA = performanceStyle?.formBySeasonTeam?.get(keyA) || {};
    const formB = performanceStyle?.formBySeasonTeam?.get(keyB) || {};
    const formBlendEdge = finiteOr(formA.blend, 0) - finiteOr(formB.blend, 0);
    const formTrendEdge = finiteOr(formA.trend, 0) - finiteOr(formB.trend, 0);

    const qualityA = performanceStyle?.qualityBySeasonTeam?.get(keyA) || {};
    const qualityB = performanceStyle?.qualityBySeasonTeam?.get(keyB) || {};
    const qualityAdjA =
      tuning.quality_win_scale * finiteOr(qualityA.quality_win, 0) -
      tuning.bad_loss_scale * finiteOr(qualityA.bad_loss, 0) +
      tuning.close_game_scale * finiteOr(qualityA.close_resilience, 0) +
      tuning.blowout_scale * finiteOr(qualityA.blowout_dominance, 0) +
      tuning.consistency_scale * (finiteOr(qualityA.consistency, 0.5) - 0.5);
    const qualityAdjB =
      tuning.quality_win_scale * finiteOr(qualityB.quality_win, 0) -
      tuning.bad_loss_scale * finiteOr(qualityB.bad_loss, 0) +
      tuning.close_game_scale * finiteOr(qualityB.close_resilience, 0) +
      tuning.blowout_scale * finiteOr(qualityB.blowout_dominance, 0) +
      tuning.consistency_scale * (finiteOr(qualityB.consistency, 0.5) - 0.5);

    const scheduleA = performanceStyle?.scheduleBySeasonTeam?.get(keyA) || {};
    const scheduleB = performanceStyle?.scheduleBySeasonTeam?.get(keyB) || {};
    const fatigueEdge =
      -tuning.fatigue_scale * (finiteOr(scheduleA.fatigue_pressure, 0) - finiteOr(scheduleB.fatigue_pressure, 0)) +
      0.9 * (finiteOr(scheduleA.short_rest_resilience, 0) - finiteOr(scheduleB.short_rest_resilience, 0));
    const travelEdge = tuning.travel_scale * (finiteOr(scheduleA.travel_resilience, 0) - finiteOr(scheduleB.travel_resilience, 0));
    const contextResilienceEdge = finiteOr(scheduleA.context_resilience, 0) - finiteOr(scheduleB.context_resilience, 0);

    const offA = performanceStyle?.offenseRatingBySeasonTeam?.get(keyA) ?? 0;
    const defA = performanceStyle?.defenseRatingBySeasonTeam?.get(keyA) ?? 0;
    const offB = performanceStyle?.offenseRatingBySeasonTeam?.get(keyB) ?? 0;
    const defB = performanceStyle?.defenseRatingBySeasonTeam?.get(keyB) ?? 0;
    const baseMargin = (offA + defA) - (offB + defB);
    const matchupEdge = matchupInteractionEdge(rowA, rowB);
    const contextEdgeNow =
      finiteOr(normalizedContext.rest_edge_for_team_a, 0) +
      finiteOr(normalizedContext.travel_edge_for_team_a, 0) +
      finiteOr(normalizedContext.injury_edge_for_team_a, 0) +
      0.4 * contextResilienceEdge;
    const contextualMargin =
      baseMargin +
      tuning.form_scale * formBlendEdge +
      tuning.form_trend_scale * formTrendEdge +
      (qualityAdjA - qualityAdjB) +
      fatigueEdge +
      travelEdge +
      tuning.matchup_interaction_scale * matchupEdge +
      tuning.context_edge_scale * contextEdgeNow +
      finiteOr(tuning.home_court_bonus, DEFAULT_TUNING.home_court_bonus) * finiteOr(normalizedContext.home_edge_for_team_a, 0);
    const sigmaA = finiteOr(performanceStyle?.marginSigmaBySeasonTeam?.get(keyA), tuning.margin_sigma_base);
    const sigmaB = finiteOr(performanceStyle?.marginSigmaBySeasonTeam?.get(keyB), tuning.margin_sigma_base);
    const matchupSigma = Math.sqrt(
      0.34 * sigmaA * sigmaA +
      0.34 * sigmaB * sigmaB +
      0.32 * tuning.margin_sigma_base * tuning.margin_sigma_base,
    );
    const performanceProb = clampProb(normalCdf(contextualMargin / Math.max(1e-6, matchupSigma)));

    const styleEdge = styleEdgeFromContext(performanceStyle, keyA, keyB);
    const styleProb = clampProb(0.5 + tuning.style_scale * styleEdge);
    const archetypeEdge = archetypeEdgeFromContext(performanceStyle, keyA, keyB);
    const archetypeProb = clampProb(0.5 + tuning.archetype_scale * archetypeEdge);

    const marketPowerA = finiteOr(performanceStyle?.marketPowerBySeasonTeam?.get(keyA), 0);
    const marketPowerB = finiteOr(performanceStyle?.marketPowerBySeasonTeam?.get(keyB), 0);
    const marketPowerMargin = tuning.market_power_scale * (marketPowerA - marketPowerB);
    const spreadMargin = isFiniteNumber(normalizedContext.market_margin_for_team_a)
      ? normalizedContext.market_margin_for_team_a
      : finiteOr(normalizedContext.market_spread_edge_for_team_a, 0) * 11.5;
    const marketPriorProb = clampProb(sigmoid((marketPowerMargin + 0.8 * spreadMargin) / 10.5));
    let marketProb = marketPriorProb;
    if (isFiniteNumber(normalizedContext.market_prob_for_team_a)) {
      const shrink = clampNumber(finiteOr(tuning.market_prob_shrink, 0.82), 0, 1);
      marketProb = clampProb(
        shrink * normalizedContext.market_prob_for_team_a + (1 - shrink) * marketPriorProb,
      );
    }
    const marketAvailable = normalizedContext.market_available > 0 ? 1 : 0;

    const legacyBlend = clampProb(
      tuning.blend_logistic * modelProb +
      tuning.blend_tree * treeProb +
      tuning.blend_rating * performanceProb +
      tuning.blend_style * styleProb +
      tuning.blend_archetype * archetypeProb +
      tuning.blend_market * marketProb,
    );

    const stacker = performanceStyle?.stacker;
    if (!stacker?.weights?.length) {
      return legacyBlend;
    }
    const stackerX = [
      logit(legacyBlend),
      logit(1 - legacyBlend),
      marketAvailable,
      finiteOr(normalizedContext.market_prob_edge_for_team_a, 0),
    ];
    const stackerProb = clampProb(sigmoid(dot(stacker.weights, stackerX) + finiteOr(stacker.bias, 0)));
    const mix = clampNumber(finiteOr(tuning.stacker_mix, 0.66), 0, 1);
    return clampProb((1 - mix) * legacyBlend + mix * stackerProb);
  }

  function trainBlendStacker(teamStats, games, model, performanceStyle) {
    const statMap = new Map();
    teamStats.forEach((row) => {
      statMap.set(teamSeasonKey(row.season, row.team), row);
    });
    const recencyInfo = buildSeasonGameIndex(games);
    const rows = [];

    for (const game of games || []) {
      const rowA = statMap.get(teamSeasonKey(game.season, game.team_a));
      const rowB = statMap.get(teamSeasonKey(game.season, game.team_b));
      if (!rowA || !rowB) continue;
      const rawMargin = finiteOr(toNumber(game.score_a), 0) - finiteOr(toNumber(game.score_b), 0);
      const adjustedMargin = tempoAdjustedMargin(rawMargin, rowA, rowB);
      const target = softOutcomeFromMargin(adjustedMargin, OUTCOME_MARGIN_SCALE);
      const weight = gameSampleWeight(game, adjustedMargin, recencyInfo);

      const ctxA = buildMatchupContextFromGame(game, false);
      const ctxB = buildMatchupContextFromGame(game, true);
      const pA = computeRawBlendProb(
        model,
        rowA,
        rowB,
        game.team_a,
        game.team_b,
        { ...performanceStyle, stacker: null },
        ctxA.neutral_site,
        ctxA.home_edge_for_team_a,
        ctxA,
      );
      const pB = computeRawBlendProb(
        model,
        rowB,
        rowA,
        game.team_b,
        game.team_a,
        { ...performanceStyle, stacker: null },
        ctxB.neutral_site,
        ctxB.home_edge_for_team_a,
        ctxB,
      );

      rows.push({
        x: [
          logit(clampProb(pA)),
          logit(clampProb(1 - pA)),
          finiteOr(ctxA.market_available, 0),
          finiteOr(ctxA.market_prob_edge_for_team_a, 0),
        ],
        target,
        weight,
      });
      rows.push({
        x: [
          logit(clampProb(pB)),
          logit(clampProb(1 - pB)),
          finiteOr(ctxB.market_available, 0),
          finiteOr(ctxB.market_prob_edge_for_team_a, 0),
        ],
        target: 1 - target,
        weight,
      });
    }

    if (rows.length < 80) {
      return { weights: [], bias: 0, rows: rows.length };
    }

    const dim = rows[0].x.length;
    const weights = new Array(dim).fill(0);
    let bias = 0;
    const lr = 0.08;
    const lambda = 0.03;
    const totalWeight = rows.reduce((acc, row) => acc + finiteOr(row.weight, 1), 0) || 1;

    for (let epoch = 0; epoch < 260; epoch += 1) {
      const gradW = new Array(dim).fill(0);
      let gradB = 0;
      for (const row of rows) {
        const pred = sigmoid(dot(weights, row.x) + bias);
        const err = pred - row.target;
        const w = finiteOr(row.weight, 1);
        gradB += w * err;
        for (let j = 0; j < dim; j += 1) {
          gradW[j] += w * err * row.x[j];
        }
      }
      gradB /= totalWeight;
      for (let j = 0; j < dim; j += 1) {
        const g = gradW[j] / totalWeight + lambda * weights[j];
        weights[j] -= lr * g;
      }
      bias -= lr * gradB;
    }

    return {
      weights,
      bias,
      rows: rows.length,
    };
  }

  function teamUncertainty(performanceStyle, season, team) {
    const key = teamSeasonKey(season, team);
    const raw = performanceStyle?.uncertaintyBySeasonTeam?.get(key);
    if (!isFiniteNumber(raw)) {
      return 0.55;
    }
    return Math.min(0.95, Math.max(0.08, Number(raw)));
  }

  function fitPlattCalibratorRows(rows) {
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

  function fitIsotonicCalibratorRows(rows) {
    if (!rows.length) return null;
    const sorted = [...rows]
      .map((row) => ({
        x: clampProb(row.baseProb),
        y: clampProb(row.target),
        w: Math.max(1e-6, finiteOr(row.weight, 1)),
      }))
      .sort((a, b) => a.x - b.x);

    const stack = [];
    for (const point of sorted) {
      stack.push({
        sumW: point.w,
        sumY: point.y * point.w,
        sumX: point.x * point.w,
      });
      while (stack.length >= 2) {
        const last = stack[stack.length - 1];
        const prev = stack[stack.length - 2];
        const prevMean = prev.sumY / prev.sumW;
        const lastMean = last.sumY / last.sumW;
        if (prevMean <= lastMean + 1e-12) break;
        prev.sumW += last.sumW;
        prev.sumY += last.sumY;
        prev.sumX += last.sumX;
        stack.pop();
      }
    }

    const points = stack.map((block) => ({
      x: clampProb(block.sumX / block.sumW),
      y: clampProb(block.sumY / block.sumW),
    }));

    return points.length ? { points } : null;
  }

  function applyIsotonicCalibrator(calibrator, prob) {
    if (!calibrator?.points?.length) {
      return clampProb(prob);
    }
    const p = clampProb(prob);
    const points = calibrator.points;
    if (p <= points[0].x) return points[0].y;
    if (p >= points[points.length - 1].x) return points[points.length - 1].y;

    for (let i = 0; i < points.length - 1; i += 1) {
      const left = points[i];
      const right = points[i + 1];
      if (p < left.x || p > right.x) continue;
      const dx = Math.max(1e-9, right.x - left.x);
      const t = (p - left.x) / dx;
      return clampProb(left.y * (1 - t) + right.y * t);
    }
    return points[points.length - 1].y;
  }

  function fitCalibratorRows(rows, tuning = DEFAULT_TUNING) {
    if (!rows.length) {
      return { alpha: 1, beta: 0, isotonic: null, iso_mix: 0, rows: 0 };
    }
    const platt = fitPlattCalibratorRows(rows);
    const isotonic = fitIsotonicCalibratorRows(rows);
    const baseMix = clampNumber(finiteOr(tuning.calibration_isotonic_mix, 0.12), 0, 0.45);
    const sampleScale = clampNumber(1 - 40 / (rows.length + 80), 0.18, 1);
    return {
      alpha: platt.alpha,
      beta: platt.beta,
      isotonic,
      iso_mix: isotonic ? baseMix * sampleScale : 0,
      rows: rows.length,
    };
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
      const target = softOutcomeFromMargin(adjustedMargin, OUTCOME_MARGIN_SCALE);
      const weight = gameSampleWeight(game, adjustedMargin, recencyInfo);

      const ctxA = buildMatchupContextFromGame(game, false);
      const baseProb = computeRawBlendProb(
        model,
        rowA,
        rowB,
        game.team_a,
        game.team_b,
        performanceStyle,
        ctxA.neutral_site,
        ctxA.home_edge_for_team_a,
        ctxA,
      );
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

    const tuning = performanceStyle?.tuning || DEFAULT_TUNING;
    return {
      global: fitCalibratorRows(rows, tuning),
      early: fitCalibratorRows(earlyRows.length ? earlyRows : rows, tuning),
      late: fitCalibratorRows(lateRows.length ? lateRows : rows, tuning),
    };
  }

  function pickRoundCalibrator(calibration, roundOrder, baseProb, tuning = DEFAULT_TUNING) {
    if (!calibration || !calibration.global) {
      return { alpha: 1, beta: 0, isotonic: null, iso_mix: 0 };
    }
    const early = calibration.early || calibration.global;
    const late = calibration.late || calibration.global;
    const difficulty = 1 - Math.abs(baseProb - 0.5) * 2;

    if (roundOrder >= 5) return { ...late, iso_mix: clampNumber(finiteOr(late.iso_mix, 0), 0, 0.45) };
    if (roundOrder <= 2) return { ...early, iso_mix: clampNumber(finiteOr(early.iso_mix, 0), 0, 0.45) };
    const lateWeight = roundOrder >= 4 ? 0.75 + 0.2 * difficulty : 0.45 + 0.35 * difficulty;
    const w = clampNumber(lateWeight, 0, 1);
    const isoSource = w >= 0.5 ? late : early;
    const isoMix = clampNumber(finiteOr(tuning.calibration_isotonic_mix, 0.12), 0, 0.45);
    return {
      alpha: early.alpha * (1 - w) + late.alpha * w,
      beta: early.beta * (1 - w) + late.beta * w,
      isotonic: isoSource?.isotonic || calibration.global?.isotonic || null,
      iso_mix: isoSource?.isotonic ? isoMix : 0,
    };
  }

  function predictMatchup(
    model,
    snapshotMap,
    teamA,
    teamB,
    performanceStyle,
    roundOrder = 1,
    neutralSite = 1,
    homeEdgeForTeamA = 0,
    matchupContext = {},
  ) {
    if (!teamA || !teamB || teamA === "TBD" || teamB === "TBD") {
      return 0.5;
    }

    const rowA = snapshotMap.get(teamA);
    const rowB = snapshotMap.get(teamB);
    if (!rowA || !rowB) {
      return 0.5;
    }

    const tuning = performanceStyle?.tuning || DEFAULT_TUNING;
    const blended = computeRawBlendProb(
      model,
      rowA,
      rowB,
      teamA,
      teamB,
      performanceStyle,
      neutralSite,
      homeEdgeForTeamA,
      matchupContext,
    );
    const calib = pickRoundCalibrator(performanceStyle?.calibrator, roundOrder, blended, tuning);
    const calibratedLogit = calib.alpha * logit(blended) + calib.beta;
    const plattProb = sigmoid(calibratedLogit);
    const isotonicProb = applyIsotonicCalibrator(calib.isotonic, blended);
    const calibratedProb = clampProb(
      (1 - finiteOr(calib.iso_mix, 0)) * plattProb + finiteOr(calib.iso_mix, 0) * isotonicProb,
    );
    const uncertaintyA = teamUncertainty(performanceStyle, rowA.season, teamA);
    const uncertaintyB = teamUncertainty(performanceStyle, rowB.season, teamB);
    const matchupUncertainty = (uncertaintyA + uncertaintyB) / 2;
    const confidenceScale = clampNumber(1 - tuning.uncertainty_confidence_scale * matchupUncertainty, 0.35, 1);
    const roundSharpen = 1 + 0.07 * Math.max(0, roundOrder - 1);
    const confidenceAdjusted = sigmoid(logit(calibratedProb) * confidenceScale * roundSharpen);
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

  function isNcaaTournamentRoundName(roundName) {
    const name = canonicalName(roundName);
    if (!name) return false;
    const isMensChampionship = name.includes("basketball championship");
    const hasNcaaRoundMarker = (
      name.includes("first four") ||
      name.includes("play in") ||
      name.includes("1st round") ||
      name.includes("2nd round") ||
      name.includes("sweet 16") ||
      name.includes("elite 8") ||
      name.includes("elite eight") ||
      name.includes("final four") ||
      name.includes("national semifinal") ||
      name.includes("national championship") ||
      name.includes("round of 64") ||
      name.includes("round of 32")
    );
    return (
      (isMensChampionship && hasNcaaRoundMarker) ||
      name.includes("first four") ||
      name.includes("play in") ||
      name.includes("round of 64") ||
      name.includes("round of 32") ||
      name.includes("sweet 16") ||
      name.includes("elite eight") ||
      name.includes("final four") ||
      name.includes("national semifinal") ||
      name.includes("national championship") ||
      name.includes("ncaa tournament") ||
      name.includes("ncaa championship")
    );
  }

  function ncaaRoundOrderFromRoundName(roundName) {
    const name = canonicalName(roundName);
    if (!name) return null;
    if (name.includes("first four") || name.includes("play in")) return 0;
    if (name.includes("1st round") || name.includes("round of 64")) return 1;
    if (name.includes("2nd round") || name.includes("round of 32")) return 2;
    if (name.includes("sweet 16")) return 3;
    if (name.includes("elite 8") || name.includes("elite eight")) return 4;
    if (name.includes("final four") || name.includes("national semifinal")) return 5;
    if (name.includes("national championship")) return 6;
    return null;
  }

  function isPreTournamentHoldoutGame(game, holdoutSeason, firstFourStart) {
    const season = Number(game?.season);
    if (!isFiniteNumber(season) || season > holdoutSeason) {
      return false;
    }
    if (season < holdoutSeason) {
      return true;
    }
    const gameDate = normalizeMaybeYmd(game?.game_date);
    if (gameDate) {
      return gameDate < firstFourStart;
    }
    return !isNcaaTournamentRoundName(game?.round_name);
  }

  function buildTrainingSplitForHoldout(teamStats, historical, holdoutSeason, firstFourStart) {
    return {
      trainStats: teamStats.filter((row) => Number(row.season) <= holdoutSeason),
      trainGames: historical.filter((row) => isPreTournamentHoldoutGame(row, holdoutSeason, firstFourStart)),
    };
  }

  function scoreActualWinnerProbabilities(slotOdds, bracketRows, actualBySlot) {
    let weightedSum = 0;
    let weightedTotal = 0;
    let slots = 0;

    for (const row of bracketRows || []) {
      const roundPoints = ESPN_ROUND_POINTS[row.round_order] || 0;
      if (roundPoints <= 0) continue;
      const actual = actualBySlot?.[row.slot];
      if (!actual) continue;

      const odds = slotOdds?.[row.slot] || {};
      const actualKey = canonicalName(actual);
      let prob = 0;
      for (const [team, p] of Object.entries(odds)) {
        if (canonicalName(team) === actualKey) {
          prob = clampProb(Number(p || 0));
          break;
        }
      }
      weightedSum += roundPoints * prob;
      weightedTotal += roundPoints;
      slots += 1;
    }

    return {
      avg_prob: weightedTotal > 0 ? weightedSum / weightedTotal : 0,
      slots_scored: slots,
    };
  }

  function holdoutSeasonWeight(targetSeason, holdoutSeason, recencyDecay) {
    const decay = clampNumber(recencyDecay, 0, 1.5);
    const gap = Math.max(0, Number(targetSeason) - Number(holdoutSeason) - 1);
    return Math.exp(-decay * gap);
  }

  function capRowsEvenly(rows, maxRows) {
    if (!Array.isArray(rows)) return [];
    const cap = Math.round(finiteOr(maxRows, 0));
    if (!cap || cap < 0 || rows.length <= cap) {
      return rows;
    }
    if (cap === 1) {
      return [rows[rows.length - 1]];
    }
    const out = [];
    const used = new Set();
    const step = (rows.length - 1) / (cap - 1);
    for (let i = 0; i < cap; i += 1) {
      const idx = Math.max(0, Math.min(rows.length - 1, Math.round(i * step)));
      if (!used.has(idx)) {
        out.push(rows[idx]);
        used.add(idx);
      }
    }
    if (out.length < cap) {
      for (let idx = 0; idx < rows.length && out.length < cap; idx += 1) {
        if (used.has(idx)) continue;
        out.push(rows[idx]);
        used.add(idx);
      }
    }
    return out;
  }

  async function prepareBacktestContexts(teamStats, historical, aliasMap, config, targetSeason, maxSeasons, options = {}) {
    const seasons = [...new Set(teamStats.map((row) => Number(row.season)))]
      .filter((season) => season < targetSeason)
      .sort((a, b) => a - b)
      .slice(-maxSeasons);
    const rawContextLimit = Math.round(clampNumber(
      finiteOr(options.tournament_context_limit, seasons.length),
      0,
      seasons.length,
    ));
    const contextLimit = rawContextLimit > 0 ? rawContextLimit : seasons.length;
    const selectedSeasons = seasons.slice(-contextLimit);
    const trainGameCap = Math.round(clampNumber(finiteOr(options.tournament_train_game_cap, 0), 0, 50000));
    const tournamentGameCap = Math.round(clampNumber(finiteOr(options.tournament_game_cap, 0), 0, 5000));
    const tournamentSource = String(options.tournament_source || "hybrid").trim().toLowerCase();
    const preferHistoricalOnly = tournamentSource === "historical_games" || tournamentSource === "historical";
    const allowScoreboardBuild = !preferHistoricalOnly && tournamentSource !== "none";

    const contexts = [];
    for (const season of selectedSeasons) {
      let snapshot = [];
      try {
        snapshot = seasonSnapshot(teamStats, season);
      } catch {
        continue;
      }

      const window = pickWindow(config, season);
      const split = buildTrainingSplitForHoldout(
        teamStats,
        historical || [],
        season,
        window.first_four_start,
      );
      const trainGames = trainGameCap > 0 ? capRowsEvenly(split.trainGames, trainGameCap) : split.trainGames;
      const seasonTournamentGames = capRowsEvenly(
        (historical || [])
          .filter((game) => Number(game?.season) === season && ncaaRoundOrderFromRoundName(game?.round_name) >= 1)
          .sort((a, b) => Number(a.game_index || 0) - Number(b.game_index || 0)),
        tournamentGameCap,
      );
      const baseContext = {
        season,
        first_four_start: window.first_four_start,
        trainStats: split.trainStats,
        trainGames,
        holdoutSnapshot: snapshot,
        tournament_games: seasonTournamentGames,
        source: "historical_games",
      };

      if (!allowScoreboardBuild) {
        if (seasonTournamentGames.length) {
          contexts.push({
            ...baseContext,
            bracket: [],
            actualBySlot: {},
            max_points: 0,
            actual_slots: seasonTournamentGames.length,
          });
        }
        continue;
      }

      const firstRoundCaptureEnd = addDays(window.first_four_start, 5);
      try {
        const scoreboardRows = await fetchScoreboardRange(window.first_four_start, window.championship_date);
        const ncaaEvents = extractNcaaEvents(scoreboardRows, aliasMap);

        let bracketEvents = ncaaEvents.filter(
          (event) => event.round_order <= 1 && event.day >= window.first_four_start && event.day <= firstRoundCaptureEnd,
        );
        if (bracketEvents.length < 20) {
          bracketEvents = ncaaEvents.filter((event) => event.round_order <= 1);
        }
        if (bracketEvents.length) {
          const bracketBuild = buildBracketFromEvents(bracketEvents, snapshot, {
            finalFourPairs: configuredFinalFourPairs(config, season),
            finalFourEvents: ncaaEvents.filter((event) => event.round_order === 5),
          });
          const bracket = bracketBuild.rows;
          const knownResults = {};
          ncaaEvents.forEach((event) => {
            if (event.is_final && event.winner && event.day <= window.championship_date) {
              knownResults[gamePairKey(event.team_a, event.team_b)] = event.winner;
            }
          });
          const actualBySlot = applyKnownResults(bracket, knownResults);
          let maxPoints = 0;
          let actualSlots = 0;
          for (const row of bracket || []) {
            const points = Number(ESPN_ROUND_POINTS[row?.round_order] || 0);
            if (points <= 0) continue;
            if (!actualBySlot[row?.slot]) continue;
            maxPoints += points;
            actualSlots += 1;
          }
          if (maxPoints > 0 && actualSlots > 0) {
            contexts.push({
              ...baseContext,
              bracket,
              actualBySlot,
              max_points: maxPoints,
              actual_slots: actualSlots,
              source: "scoreboard",
            });
            continue;
          }
        }
      } catch {
        // Fall through to historical-games tournament fallback.
      }

      if (seasonTournamentGames.length) {
        contexts.push({
          ...baseContext,
          bracket: [],
          actualBySlot: {},
          max_points: 0,
          actual_slots: seasonTournamentGames.length,
        });
      }
    }
    return contexts;
  }

  function sampleTuningParams(rng, base) {
    const a = 0.05 + rng.next();
    const b = 0.05 + rng.next();
    const c = 0.05 + rng.next();
    const d = 0.05 + rng.next();
    const e = 0.05 + rng.next();
    const f = 0.05 + rng.next();
    const total = a + b + c + d + e + f;
    return normalizeTuningParams({
      ...base,
      blend_logistic: a / total,
      blend_tree: b / total,
      blend_rating: c / total,
      blend_style: d / total,
      blend_archetype: e / total,
      blend_market: f / total,
      style_scale: 0.55 + 0.95 * rng.next(),
      archetype_scale: 0.4 + 1.25 * rng.next(),
      form_scale: 2 + 10 * rng.next(),
      form_trend_scale: 0.2 + 3.8 * rng.next(),
      matchup_interaction_scale: 0.2 + 2.8 * rng.next(),
      context_edge_scale: 0.2 + 2.8 * rng.next(),
      quality_win_scale: 1 + 7 * rng.next(),
      bad_loss_scale: 1 + 7 * rng.next(),
      close_game_scale: 0.4 + 4.2 * rng.next(),
      blowout_scale: 0.2 + 3.2 * rng.next(),
      consistency_scale: 0.4 + 3.9 * rng.next(),
      fatigue_scale: 0.2 + 4.8 * rng.next(),
      travel_scale: 0.1 + 2.4 * rng.next(),
      preseason_shrink_base: 0.12 + 0.5 * rng.next(),
      elo_k_base: 0.035 + 0.17 * rng.next(),
      elo_k_surprise_scale: 0.35 + 2.1 * rng.next(),
      margin_sigma_base: 5.4 + 6.4 * rng.next(),
      variance_scale: 0.52 + 0.56 * rng.next(),
      archetype_uncertainty_damp: 0.15 + 0.75 * rng.next(),
      calibration_isotonic_mix: 0.02 + 0.26 * rng.next(),
      uncertainty_confidence_scale: 0.16 + 0.5 * rng.next(),
      shock_base: 0.05 + 0.14 * rng.next(),
      shock_scale: 0.08 + 0.3 * rng.next(),
      home_court_bonus: 0.4 + 4.8 * rng.next(),
      market_power_scale: 0.05 + 2.2 * rng.next(),
      market_prob_shrink: 0.05 + 0.9 * rng.next(),
      stacker_mix: 0.05 + 0.9 * rng.next(),
      logistic_lr: 0.015 + 0.16 * rng.next(),
      logistic_lambda: 0.00005 + 0.012 * rng.next(),
      logistic_epochs: 180 + 900 * rng.next(),
      tree_stumps: 10 + 72 * rng.next(),
    });
  }

  function benchmarkModelParams(params, fastMode = false) {
    const normalized = normalizeTuningParams(params || {});
    if (!fastMode) {
      return normalized;
    }
    return normalizeTuningParams({
      ...normalized,
      logistic_epochs: Math.min(150, Math.round(finiteOr(
        normalized.logistic_epochs,
        DEFAULT_TUNING.logistic_epochs,
      ))),
      tree_stumps: Math.min(14, Math.round(finiteOr(
        normalized.tree_stumps,
        DEFAULT_TUNING.tree_stumps,
      ))),
      calibration_isotonic_mix: Math.min(0.12, finiteOr(
        normalized.calibration_isotonic_mix,
        DEFAULT_TUNING.calibration_isotonic_mix,
      )),
      stacker_mix: Math.min(0.55, finiteOr(normalized.stacker_mix, DEFAULT_TUNING.stacker_mix)),
    });
  }

  function evaluateTournamentGameSet(model, performanceStyle, snapshot, games) {
    const snapshotMap = new Map((snapshot || []).map((row) => [row.team, row]));
    let points = 0;
    let maxPoints = 0;
    let weightedActualProb = 0;
    let weightedTotal = 0;
    let gamesScored = 0;

    for (const game of games || []) {
      const roundOrder = ncaaRoundOrderFromRoundName(game?.round_name);
      if (!isFiniteNumber(roundOrder) || roundOrder < 1) {
        continue;
      }
      const roundPoints = Number(ESPN_ROUND_POINTS[roundOrder] || 0);
      if (roundPoints <= 0) {
        continue;
      }
      const scoreA = finiteOr(toNumber(game.score_a), Number.NaN);
      const scoreB = finiteOr(toNumber(game.score_b), Number.NaN);
      if (!isFiniteNumber(scoreA) || !isFiniteNumber(scoreB) || scoreA === scoreB) {
        continue;
      }
      const teamA = String(game.team_a || "").trim();
      const teamB = String(game.team_b || "").trim();
      if (!teamA || !teamB || !snapshotMap.has(teamA) || !snapshotMap.has(teamB)) {
        continue;
      }
      const ctxA = buildMatchupContextFromGame(game, false);
      const pA = clampProb(predictMatchup(
        model,
        snapshotMap,
        teamA,
        teamB,
        performanceStyle,
        roundOrder,
        ctxA.neutral_site,
        ctxA.home_edge_for_team_a,
        ctxA,
      ));
      const actualWinnerA = scoreA > scoreB ? 1 : 0;
      const predictedWinnerA = pA >= 0.5 ? 1 : 0;
      if (predictedWinnerA === actualWinnerA) {
        points += roundPoints;
      }
      maxPoints += roundPoints;
      weightedActualProb += roundPoints * (actualWinnerA ? pA : (1 - pA));
      weightedTotal += roundPoints;
      gamesScored += 1;
    }

    if (maxPoints <= 0 || weightedTotal <= 0 || gamesScored <= 0) {
      return null;
    }
    return {
      points,
      max_points: maxPoints,
      normalized: points / maxPoints,
      avg_actual_winner_prob: weightedActualProb / weightedTotal,
      slots_scored: gamesScored,
    };
  }

  function evaluateTuningCandidate(params, contexts, teamStats, historical, targetSeason, tuningCfg = {}) {
    const recencyDecay = clampNumber(finiteOr(tuningCfg.season_recency_decay, 0.35), 0, 1.5);
    const probWeight = clampNumber(finiteOr(tuningCfg.objective_actual_prob_weight, 0.18), 0, 1);
    const stabilityPenalty = clampNumber(finiteOr(tuningCfg.objective_stability_penalty, 0.08), 0, 1);
    const fastModels = tuningCfg.fast_models === true;
    const trainGameCap = Math.round(clampNumber(finiteOr(tuningCfg.tournament_train_game_cap, 0), 0, 50000));
    const modelParams = benchmarkModelParams(params, fastModels);
    const perSeason = [];
    let weightedPoints = 0;
    let weightedNorm = 0;
    let weightedActualProb = 0;
    let weightTotal = 0;
    let scored = 0;

    for (const context of contexts) {
      const split = (
        Array.isArray(context?.trainStats) &&
        Array.isArray(context?.trainGames)
      )
        ? null
        : buildTrainingSplitForHoldout(
            teamStats,
            historical,
            context.season,
            context.first_four_start,
          );
      const trainStats = Array.isArray(context?.trainStats) ? context.trainStats : split?.trainStats || [];
      let trainGames = Array.isArray(context?.trainGames) ? context.trainGames : split?.trainGames || [];
      if (trainGameCap > 0 && trainGames.length > trainGameCap) {
        trainGames = capRowsEvenly(trainGames, trainGameCap);
      }
      if (!trainStats.length || !trainGames.length) {
        continue;
      }

      const model = trainModel(trainStats, trainGames, modelParams);
      const performanceStyle = buildPerformanceStyleContext(trainStats, trainGames, modelParams);
      performanceStyle.tuning = modelParams;
      if (!fastModels) {
        performanceStyle.treeModel = trainTreeModel(trainStats, trainGames, modelParams);
        performanceStyle.stacker = trainBlendStacker(trainStats, trainGames, model, performanceStyle);
        performanceStyle.calibrator = fitProbabilityCalibrator(trainStats, trainGames, model, performanceStyle);
      }

      const holdoutSnapshot = Array.isArray(context?.holdoutSnapshot)
        ? context.holdoutSnapshot
        : seasonSnapshot(teamStats, context.season);
      let score = null;
      let actualProb = null;
      if (Array.isArray(context?.bracket) && context.bracket.length && context?.actualBySlot) {
        const solved = solveTournamentDeterministic(
          model,
          context.bracket,
          holdoutSnapshot,
          {},
          performanceStyle,
        );
        score = scoreBracketAgainstActual(solved.bestBracket, context.bracket, context.actualBySlot);
        actualProb = scoreActualWinnerProbabilities(solved.slotOdds, context.bracket, context.actualBySlot);
      }
      if (!isFiniteNumber(score?.max_points) || score.max_points <= 0 || actualProb?.slots_scored <= 0) {
        const fallback = evaluateTournamentGameSet(
          model,
          performanceStyle,
          holdoutSnapshot,
          context?.tournament_games || [],
        );
        if (!fallback) {
          continue;
        }
        score = {
          points: fallback.points,
          max_points: fallback.max_points,
          normalized: fallback.normalized,
        };
        actualProb = {
          avg_prob: fallback.avg_actual_winner_prob,
          slots_scored: fallback.slots_scored,
        };
      }
      const seasonWeight = holdoutSeasonWeight(targetSeason, context.season, recencyDecay);

      weightedPoints += seasonWeight * score.points;
      weightedNorm += seasonWeight * score.normalized;
      weightedActualProb += seasonWeight * actualProb.avg_prob;
      weightTotal += seasonWeight;
      perSeason.push({
        season: context.season,
        weight: seasonWeight,
        points: score.points,
        max_points: score.max_points,
        normalized: score.normalized,
        avg_actual_winner_prob: actualProb.avg_prob,
        actual_slots_scored: actualProb.slots_scored,
      });
      scored += 1;
    }

    if (!scored || weightTotal <= 1e-9) {
      return {
        objective: Number.NEGATIVE_INFINITY,
        avg_points: 0,
        avg_normalized: 0,
        avg_actual_winner_prob: 0,
        normalized_stddev: 0,
        seasons_scored: 0,
        per_season: [],
      };
    }

    const avgNorm = weightedNorm / weightTotal;
    const avgPoints = weightedPoints / weightTotal;
    const avgActualProb = weightedActualProb / weightTotal;
    const weightedNormVariance = perSeason.reduce((acc, row) => {
      const delta = row.normalized - avgNorm;
      return acc + row.weight * delta * delta;
    }, 0) / weightTotal;
    const normalizedStd = Math.sqrt(Math.max(0, weightedNormVariance));
    return {
      objective: avgNorm + probWeight * avgActualProb - stabilityPenalty * normalizedStd,
      avg_points: avgPoints,
      avg_normalized: avgNorm,
      avg_actual_winner_prob: avgActualProb,
      normalized_stddev: normalizedStd,
      seasons_scored: scored,
      per_season: perSeason.sort((a, b) => a.season - b.season),
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
    const tuningFingerprint = [
      fingerprint,
      Math.round(clampNumber(finiteOr(tuningCfg.holdout_max_seasons, 6), 1, 12)),
      Math.round(clampNumber(finiteOr(tuningCfg.trials, 28), 6, 96)),
      clampNumber(finiteOr(tuningCfg.season_recency_decay, 0.35), 0, 1.5).toFixed(3),
      clampNumber(finiteOr(tuningCfg.objective_actual_prob_weight, 0.18), 0, 1).toFixed(3),
      clampNumber(finiteOr(tuningCfg.objective_stability_penalty, 0.08), 0, 1).toFixed(3),
    ].join("|");
    const cacheHours = clampNumber(finiteOr(tuningCfg.cache_hours, 18), 1, 240);
    const cacheKey = `mmp:tuning:v9:${season}:${tuningFingerprint}`;
    const cached = safeReadLocalStorageJson(cacheKey);
    const now = Date.now();
    if (cached && isFiniteNumber(cached.created_at) && (now - cached.created_at) < cacheHours * 3600 * 1000) {
      return {
        params: normalizeTuningParams(cached.params || {}),
        source: "cache",
        backtest: cached.backtest || null,
      };
    }

    const maxSeasons = Math.round(clampNumber(finiteOr(tuningCfg.holdout_max_seasons, 6), 1, 12));
    const contexts = await prepareBacktestContexts(teamStats, historical, aliasMap, config, season, maxSeasons);
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

    const trials = Math.round(clampNumber(finiteOr(tuningCfg.trials, 28), 6, 96));
    const rng = new SeededRandom(Math.round(clampNumber(finiteOr(tuningCfg.random_seed, 9337), 1, 2147483646)));
    const candidates = [baseParams];
    for (let i = 0; i < trials; i += 1) {
      candidates.push(sampleTuningParams(rng, baseParams));
    }

    let bestParams = baseParams;
    let bestScore = evaluateTuningCandidate(bestParams, contexts, teamStats, historical, season, tuningCfg);
    for (let i = 1; i < candidates.length; i += 1) {
      const score = evaluateTuningCandidate(candidates[i], contexts, teamStats, historical, season, tuningCfg);
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
      avg_actual_winner_prob: bestScore.avg_actual_winner_prob,
      normalized_stddev: bestScore.normalized_stddev,
      seasons_scored: bestScore.seasons_scored,
      per_season: bestScore.per_season,
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

  function benchmarkSplitFractions(rawSplits) {
    const defaults = [0.65, 0.8, 0.9];
    const source = Array.isArray(rawSplits) ? rawSplits : defaults;
    const clean = source
      .map((value) => Number(value))
      .filter((value) => isFiniteNumber(value) && value >= 0.5 && value <= 0.95)
      .sort((a, b) => a - b);
    return clean.length ? [...new Set(clean)] : defaults;
  }

  function resolveSeasonSpan(rawValue, fallback, available) {
    const avail = Math.max(0, Math.round(finiteOr(available, 0)));
    if (avail <= 0) return 0;
    const text = String(rawValue ?? "").trim().toLowerCase();
    if (text === "all") {
      return avail;
    }
    const parsed = Number(rawValue);
    if (isFiniteNumber(parsed)) {
      return Math.round(clampNumber(parsed, 1, avail));
    }
    const fb = Number(fallback);
    if (isFiniteNumber(fb)) {
      return Math.round(clampNumber(fb, 1, avail));
    }
    return avail;
  }

  function isLikelyPostseasonRoundName(roundName) {
    if (isNcaaTournamentRoundName(roundName)) return true;
    const name = canonicalName(roundName);
    if (!name) return false;
    return (
      name.includes("conference tournament") ||
      name.includes("conference championship") ||
      name.includes("tournament semifinal") ||
      name.includes("tournament quarterfinal") ||
      name.includes("tournament final") ||
      name.includes("quarterfinal") ||
      name.includes("semifinal") ||
      name.includes("championship game") ||
      name.includes("nit") ||
      name.includes("cbi")
    );
  }

  function tuningParamSpanForKey(key) {
    if (TUNING_PARAM_SPECS[key]) {
      return Math.max(1e-9, TUNING_PARAM_SPECS[key].max - TUNING_PARAM_SPECS[key].min);
    }
    if (BLEND_KEYS.includes(key)) {
      return 1;
    }
    return 1;
  }

  function blendTuningParams(paramsA, paramsB, mix = 0.5) {
    const a = normalizeTuningParams(paramsA || {});
    const b = normalizeTuningParams(paramsB || {});
    const t = clampNumber(finiteOr(mix, 0.5), 0, 1);
    const out = {};
    for (const key of ALL_TUNING_KEYS) {
      out[key] =
        t * finiteOr(a[key], DEFAULT_TUNING[key]) +
        (1 - t) * finiteOr(b[key], DEFAULT_TUNING[key]);
    }
    return normalizeTuningParams(out);
  }

  function collectEliteDistribution(scoredRows, eliteFraction = 0.18) {
    const ranked = (scoredRows || [])
      .filter((row) => row && row.params && isFiniteNumber(row.objective))
      .sort((a, b) => b.objective - a.objective);
    if (!ranked.length) {
      return null;
    }
    const frac = clampNumber(finiteOr(eliteFraction, 0.18), 0.05, 0.5);
    const eliteCount = Math.max(1, Math.min(ranked.length, Math.round(ranked.length * frac)));
    const elite = ranked.slice(0, eliteCount);
    const center = {};
    const spread = {};
    for (const key of ALL_TUNING_KEYS) {
      const values = elite
        .map((row) => finiteOr(row.params?.[key], DEFAULT_TUNING[key]))
        .filter((value) => isFiniteNumber(value));
      if (!values.length) continue;
      const mu = mean(values);
      const variance = values.reduce((acc, value) => {
        const delta = value - mu;
        return acc + delta * delta;
      }, 0) / values.length;
      const sigma = Math.sqrt(Math.max(0, variance));
      const span = tuningParamSpanForKey(key);
      const spec = TUNING_PARAM_SPECS[key];
      const floor = spec?.integer
        ? 1
        : (BLEND_KEYS.includes(key) ? 0.02 : Math.max(0.004, span * 0.02));
      const ceil = BLEND_KEYS.includes(key) ? 0.42 : span * 0.45;
      center[key] = mu;
      spread[key] = clampNumber(1.25 * sigma + 0.2 * floor, floor, ceil);
    }
    return {
      center: normalizeTuningParams(center),
      spread,
      elite_count: eliteCount,
    };
  }

  function sampleFromEliteDistribution(centerParams, spreadByKey, rng, exploreRate = 0.14, exploreBase = null) {
    if (rng.next() < clampNumber(finiteOr(exploreRate, 0.14), 0, 0.95)) {
      return sampleTuningParams(rng, exploreBase || centerParams || DEFAULT_TUNING);
    }
    const center = normalizeTuningParams(centerParams || {});
    const out = { ...center };
    for (const key of TUNING_CONTINUOUS_KEYS) {
      const spec = TUNING_PARAM_SPECS[key];
      const mu = finiteOr(center[key], DEFAULT_TUNING[key]);
      const sigma = Math.max(
        spec?.integer ? 1 : 1e-6,
        finiteOr(spreadByKey?.[key], tuningParamSpanForKey(key) * 0.2),
      );
      out[key] = mu + randomNormal(rng) * sigma;
    }
    for (const key of BLEND_KEYS) {
      const mu = finiteOr(center[key], DEFAULT_TUNING[key]);
      const sigma = Math.max(1e-6, finiteOr(spreadByKey?.[key], 0.22));
      out[key] = mu + randomNormal(rng) * sigma;
    }
    return normalizeTuningParams(out);
  }

  function perturbTuningParams(baseParams, rng, scale = 0.4) {
    const base = normalizeTuningParams(baseParams || {});
    const sampled = sampleTuningParams(rng, base);
    const s = clampNumber(finiteOr(scale, 0.4), 0.03, 1.25);
    const out = { ...base };
    for (const [key, sampledValue] of Object.entries(sampled)) {
      const baseValue = base[key];
      if (!isFiniteNumber(baseValue) || !isFiniteNumber(sampledValue)) {
        continue;
      }
      const mix = s * (0.6 + 0.8 * rng.next());
      out[key] = baseValue + (sampledValue - baseValue) * mix;
    }
    return normalizeTuningParams(out);
  }

  function crossoverTuningParams(parentA, parentB, rng, noiseScale = 0.12) {
    const a = normalizeTuningParams(parentA || {});
    const b = normalizeTuningParams(parentB || {});
    const out = { ...a };
    const noise = clampNumber(finiteOr(noiseScale, 0.12), 0, 0.5);

    for (const [key, spec] of Object.entries(TUNING_PARAM_SPECS)) {
      const mix = 0.2 + 0.6 * rng.next();
      const span = Math.max(1e-9, spec.max - spec.min);
      const jitter = (rng.next() * 2 - 1) * noise * span;
      out[key] = mix * finiteOr(a[key], 0) + (1 - mix) * finiteOr(b[key], 0) + jitter;
    }
    for (const key of BLEND_KEYS) {
      const mix = 0.2 + 0.6 * rng.next();
      const jitter = (rng.next() * 2 - 1) * noise * 0.4;
      out[key] = mix * finiteOr(a[key], 0) + (1 - mix) * finiteOr(b[key], 0) + jitter;
    }
    return normalizeTuningParams(out);
  }

  function coordinateNeighborhood(baseParams, stepFraction = 0.1) {
    const base = normalizeTuningParams(baseParams || {});
    const out = [];
    const step = clampNumber(finiteOr(stepFraction, 0.1), 0.0025, 0.75);

    for (const [key, spec] of Object.entries(TUNING_PARAM_SPECS)) {
      const span = Math.max(1e-9, spec.max - spec.min);
      const delta = spec.integer
        ? Math.max(1, Math.round(span * step))
        : Math.max(span * 0.015, span * step);
      out.push(normalizeTuningParams({
        ...base,
        [key]: finiteOr(base[key], 0) + delta,
      }));
      out.push(normalizeTuningParams({
        ...base,
        [key]: finiteOr(base[key], 0) - delta,
      }));
    }

    const blendDelta = Math.max(0.02, 0.24 * step);
    for (const key of BLEND_KEYS) {
      out.push(normalizeTuningParams({
        ...base,
        [key]: finiteOr(base[key], 0) + blendDelta,
      }));
      out.push(normalizeTuningParams({
        ...base,
        [key]: finiteOr(base[key], 0) - blendDelta,
      }));
    }
    return out;
  }

  function regularSeasonObjective(logLoss, brierScore, accuracy, benchCfg = {}) {
    const wLog = Math.max(0, finiteOr(benchCfg.regular_objective_logloss_weight, 0.55));
    const wBrier = Math.max(0, finiteOr(benchCfg.regular_objective_brier_weight, 0.25));
    const wAcc = Math.max(0, finiteOr(benchCfg.regular_objective_accuracy_weight, 0.2));
    const wTotal = wLog + wBrier + wAcc;
    const wl = wTotal > 1e-9 ? wLog / wTotal : 0.55;
    const wb = wTotal > 1e-9 ? wBrier / wTotal : 0.25;
    const wa = wTotal > 1e-9 ? wAcc / wTotal : 0.2;
    const logLossSkill = (Math.log(2) - finiteOr(logLoss, Math.log(2))) / Math.log(2);
    const brierSkill = (0.25 - finiteOr(brierScore, 0.25)) / 0.25;
    return wl * logLossSkill + wb * brierSkill + wa * finiteOr(accuracy, 0.5);
  }

  function evaluateRegularSeasonGameSet(model, performanceStyle, snapshot, games) {
    const snapshotMap = new Map(snapshot.map((row) => [row.team, row]));
    let count = 0;
    let logLoss = 0;
    let brier = 0;
    let correct = 0;

    for (const game of games || []) {
      const scoreA = finiteOr(toNumber(game.score_a), Number.NaN);
      const scoreB = finiteOr(toNumber(game.score_b), Number.NaN);
      if (!isFiniteNumber(scoreA) || !isFiniteNumber(scoreB) || scoreA === scoreB) {
        continue;
      }
      const teamA = String(game.team_a || "").trim();
      const teamB = String(game.team_b || "").trim();
      if (!teamA || !teamB || !snapshotMap.has(teamA) || !snapshotMap.has(teamB)) {
        continue;
      }

      const ctxA = buildMatchupContextFromGame(game, false);
      const pA = clampProb(predictMatchup(
        model,
        snapshotMap,
        teamA,
        teamB,
        performanceStyle,
        1,
        ctxA.neutral_site,
        ctxA.home_edge_for_team_a,
        ctxA,
      ));
      const y = scoreA > scoreB ? 1 : 0;
      logLoss += -(y * Math.log(pA) + (1 - y) * Math.log(1 - pA));
      brier += (pA - y) ** 2;
      if ((pA >= 0.5 ? 1 : 0) === y) {
        correct += 1;
      }
      count += 1;
    }

    if (!count) {
      return null;
    }
    return {
      games: count,
      log_loss: logLoss / count,
      brier_score: brier / count,
      accuracy: correct / count,
    };
  }

  function prepareRegularSeasonBenchmarkContexts(teamStats, historical, targetSeason, benchCfg = {}) {
    const seasons = [...new Set(teamStats.map((row) => Number(row.season)))]
      .filter((season) => season < targetSeason)
      .sort((a, b) => a - b);
    const maxSeasons = resolveSeasonSpan(
      benchCfg.regular_max_seasons,
      seasons.length,
      seasons.length,
    );
    const holdoutSeasons = seasons.slice(-maxSeasons);
    const splitFractions = benchmarkSplitFractions(benchCfg.regular_split_fractions);
    const minTrainGames = Math.round(clampNumber(finiteOr(benchCfg.regular_min_train_games, 160), 40, 2000));
    const minTestGames = Math.round(clampNumber(finiteOr(benchCfg.regular_min_test_games, 30), 10, 1000));
    const recencyDecay = clampNumber(finiteOr(benchCfg.regular_recency_decay, 0.25), 0, 1.5);
    const withinSeasonWeight = clampNumber(finiteOr(benchCfg.within_season_weight, 0.75), 0.1, 2);
    const includePostseason = benchCfg.include_postseason !== false;
    const filteredHistorical = includePostseason
      ? historical
      : (historical || []).filter((game) => !isLikelyPostseasonRoundName(game?.round_name));

    const gamesBySeason = new Map();
    for (const game of filteredHistorical || []) {
      const season = Number(game.season);
      if (!gamesBySeason.has(season)) {
        gamesBySeason.set(season, []);
      }
      gamesBySeason.get(season).push(game);
    }
    for (const games of gamesBySeason.values()) {
      games.sort((a, b) => Number(a.game_index || 0) - Number(b.game_index || 0));
    }

    let contexts = [];
    for (const season of holdoutSeasons) {
      const seasonGames = gamesBySeason.get(season) || [];
      if (seasonGames.length < minTestGames) {
        continue;
      }
      let snapshot = [];
      try {
        snapshot = seasonSnapshot(teamStats, season);
      } catch {
        continue;
      }
      const trainStats = teamStats.filter((row) => Number(row.season) <= season);
      const priorGames = (filteredHistorical || []).filter((row) => Number(row.season) < season);

      if (priorGames.length >= minTrainGames) {
        contexts.push({
          season,
          label: "prior_seasons",
          split: null,
          trainStats,
          trainGames: priorGames,
          testGames: seasonGames,
          snapshot,
          weight: holdoutSeasonWeight(targetSeason, season, recencyDecay),
        });
      }

      for (const split of splitFractions) {
        const cutoff = Math.floor(seasonGames.length * split);
        const early = seasonGames.slice(0, cutoff);
        const late = seasonGames.slice(cutoff);
        if (early.length < minTrainGames || late.length < minTestGames) {
          continue;
        }
        contexts.push({
          season,
          label: "within_season",
          split,
          trainStats,
          trainGames: [...priorGames, ...early],
          testGames: late,
          snapshot,
          weight: holdoutSeasonWeight(targetSeason, season, recencyDecay) * withinSeasonWeight,
        });
      }
    }

    const contextLimit = Math.round(clampNumber(finiteOr(benchCfg.regular_context_limit, 0), 0, contexts.length));
    if (contextLimit > 0 && contexts.length > contextLimit) {
      contexts = contexts
        .sort((a, b) => {
          if (b.weight !== a.weight) return b.weight - a.weight;
          if (b.season !== a.season) return b.season - a.season;
          return String(a.label).localeCompare(String(b.label));
        })
        .slice(0, contextLimit);
    }

    const trainGameCap = Math.round(clampNumber(finiteOr(benchCfg.regular_train_game_cap, 0), 0, 50000));
    const testGameCap = Math.round(clampNumber(finiteOr(benchCfg.regular_test_game_cap, 0), 0, 50000));
    contexts = contexts.map((context) => ({
      ...context,
      trainGames: trainGameCap > 0 ? capRowsEvenly(context.trainGames, trainGameCap) : context.trainGames,
      testGames: testGameCap > 0 ? capRowsEvenly(context.testGames, testGameCap) : context.testGames,
    }));
    return contexts;
  }

  function evaluateRegularSeasonCandidate(params, teamStats, historical, targetSeason, benchCfg = {}) {
    const contexts = Array.isArray(benchCfg.regular_contexts)
      ? benchCfg.regular_contexts
      : prepareRegularSeasonBenchmarkContexts(teamStats, historical, targetSeason, benchCfg);
    const fastModels = benchCfg.fast_models === true;
    const modelParams = benchmarkModelParams(params, fastModels);

    if (!contexts.length) {
      return {
        objective: Number.NEGATIVE_INFINITY,
        contexts_scored: 0,
        games_scored: 0,
        avg_log_loss: null,
        avg_brier_score: null,
        avg_accuracy: null,
        by_context: [],
      };
    }

    let weightTotal = 0;
    let weightedObjective = 0;
    let weightedLogLoss = 0;
    let weightedBrier = 0;
    let weightedAccuracy = 0;
    let gamesTotal = 0;
    const byContext = [];

    for (const context of contexts) {
      if (!context.trainStats.length || !context.trainGames.length || !context.testGames.length) {
        continue;
      }
      const model = trainModel(context.trainStats, context.trainGames, modelParams);
      const performanceStyle = buildPerformanceStyleContext(context.trainStats, context.trainGames, modelParams);
      performanceStyle.tuning = modelParams;
      if (!fastModels) {
        performanceStyle.treeModel = trainTreeModel(context.trainStats, context.trainGames, modelParams);
        performanceStyle.stacker = trainBlendStacker(context.trainStats, context.trainGames, model, performanceStyle);
        performanceStyle.calibrator = fitProbabilityCalibrator(context.trainStats, context.trainGames, model, performanceStyle);
      }

      const metrics = evaluateRegularSeasonGameSet(model, performanceStyle, context.snapshot, context.testGames);
      if (!metrics || !metrics.games) {
        continue;
      }

      const objective = regularSeasonObjective(
        metrics.log_loss,
        metrics.brier_score,
        metrics.accuracy,
        benchCfg,
      );
      const weight = Math.max(1e-6, context.weight);
      weightTotal += weight;
      weightedObjective += weight * objective;
      weightedLogLoss += weight * metrics.log_loss;
      weightedBrier += weight * metrics.brier_score;
      weightedAccuracy += weight * metrics.accuracy;
      gamesTotal += metrics.games;

      byContext.push({
        season: context.season,
        label: context.label,
        split: context.split,
        weight,
        games: metrics.games,
        log_loss: metrics.log_loss,
        brier_score: metrics.brier_score,
        accuracy: metrics.accuracy,
        objective,
      });
    }

    if (weightTotal <= 1e-9) {
      return {
        objective: Number.NEGATIVE_INFINITY,
        contexts_scored: 0,
        games_scored: 0,
        avg_log_loss: null,
        avg_brier_score: null,
        avg_accuracy: null,
        by_context: [],
      };
    }

    return {
      objective: weightedObjective / weightTotal,
      contexts_scored: byContext.length,
      games_scored: gamesTotal,
      avg_log_loss: weightedLogLoss / weightTotal,
      avg_brier_score: weightedBrier / weightTotal,
      avg_accuracy: weightedAccuracy / weightTotal,
      by_context: byContext,
    };
  }

  function benchmarkCombinedObjective(tournamentScore, regularScore, benchCfg = {}) {
    const tournamentWeight = clampNumber(finiteOr(benchCfg.tournament_weight, 0.62), 0, 1);
    const regularWeight = clampNumber(finiteOr(benchCfg.regular_weight, 0.38), 0, 1);
    const tAvail = tournamentScore && isFiniteNumber(tournamentScore.objective);
    const rAvail = regularScore && isFiniteNumber(regularScore.objective);
    if (tAvail && !rAvail) {
      return { objective: tournamentScore.objective, weights: { tournament: 1, regular: 0 } };
    }
    if (!tAvail && rAvail) {
      return { objective: regularScore.objective, weights: { tournament: 0, regular: 1 } };
    }
    if (!tAvail && !rAvail) {
      return { objective: Number.NEGATIVE_INFINITY, weights: { tournament: 0, regular: 0 } };
    }
    const weightSum = tournamentWeight + regularWeight;
    const t = weightSum > 1e-9 ? tournamentWeight / weightSum : 0.5;
    const r = weightSum > 1e-9 ? regularWeight / weightSum : 0.5;
    return {
      objective: t * tournamentScore.objective + r * regularScore.objective,
      weights: { tournament: t, regular: r },
    };
  }

  async function runBenchmark(options = {}) {
    const config = await fetchJson("./data/runtime/config.json").catch(() => ({}));
    const season = Number(options.season || config.default_season || new Date().getUTCFullYear());
    const benchmarkCfg = {
      ...(config?.benchmark || {}),
      ...(options || {}),
    };
    const onProgress = typeof benchmarkCfg.onProgress === "function" ? benchmarkCfg.onProgress : null;

    const { teamStats, historical, injuries, aliasMap } = await loadRuntimeData(season);
    const adjustedTeamStats = applyInjuries(teamStats, injuries, season);
    const baseParams = normalizeTuningParams(config?.model_params || {});
    const tuningCfg = config?.model_tuning || {};

    let includeTournament = benchmarkCfg.include_tournament !== false;
    let includeRegular = benchmarkCfg.include_regular !== false;
    const allPriorSeasons = [...new Set(adjustedTeamStats.map((row) => Number(row.season)))]
      .filter((s) => s < season)
      .sort((a, b) => a - b);
    const holdoutMaxSeasons = resolveSeasonSpan(
      benchmarkCfg.holdout_max_seasons,
      tuningCfg.holdout_max_seasons ?? allPriorSeasons.length,
      allPriorSeasons.length,
    );
    const regularMaxSeasons = resolveSeasonSpan(
      benchmarkCfg.regular_max_seasons,
      holdoutMaxSeasons || allPriorSeasons.length,
      allPriorSeasons.length,
    );
    const searchFastModels = benchmarkCfg.fast_models !== false;
    const fullRescoreTopK = Math.round(clampNumber(
      finiteOr(benchmarkCfg.full_rescore_top_k, searchFastModels ? 10 : 0),
      0,
      120,
    ));
    const fullRescoreFastModels = benchmarkCfg.full_rescore_fast_models !== false;
    const evalCfg = {
      ...benchmarkCfg,
      regular_max_seasons: regularMaxSeasons,
      fast_models: searchFastModels,
    };
    const tournamentEvalCfg = {
      ...tuningCfg,
      ...benchmarkCfg,
      fast_models: searchFastModels,
    };
    const fullEvalCfg = {
      ...evalCfg,
      fast_models: fullRescoreFastModels,
    };
    const fullTournamentCfg = {
      ...tournamentEvalCfg,
      fast_models: fullRescoreFastModels,
    };

    const trials = Math.round(clampNumber(finiteOr(benchmarkCfg.trials, tuningCfg.trials ?? 28), 3, 1200));
    const refineRounds = Math.round(clampNumber(finiteOr(benchmarkCfg.refine_rounds, 2), 0, 8));
    const refineTopK = Math.round(clampNumber(finiteOr(benchmarkCfg.refine_top_k, 6), 1, 30));
    const refinePerTop = Math.round(clampNumber(finiteOr(benchmarkCfg.refine_per_top, 10), 1, 80));
    const refineScaleStart = clampNumber(finiteOr(benchmarkCfg.refine_scale_start, 0.42), 0.05, 1.2);
    const refineScaleDecay = clampNumber(finiteOr(benchmarkCfg.refine_scale_decay, 0.58), 0.2, 0.98);
    const crossoverRounds = Math.round(clampNumber(finiteOr(benchmarkCfg.crossover_rounds, 1), 0, 8));
    const crossoverTopK = Math.round(clampNumber(finiteOr(benchmarkCfg.crossover_top_k, 8), 2, 30));
    const crossoverChildren = Math.round(clampNumber(finiteOr(benchmarkCfg.crossover_children, 16), 2, 120));
    const crossoverNoiseScale = clampNumber(finiteOr(benchmarkCfg.crossover_noise_scale, 0.12), 0, 0.5);
    const cemRounds = Math.round(clampNumber(finiteOr(benchmarkCfg.cem_rounds, 2), 0, 16));
    const cemSamples = Math.round(clampNumber(finiteOr(benchmarkCfg.cem_samples, 48), 4, 1200));
    const cemEliteFraction = clampNumber(finiteOr(benchmarkCfg.cem_elite_fraction, 0.18), 0.05, 0.5);
    const cemExploreFloor = clampNumber(finiteOr(benchmarkCfg.cem_explore_floor, 0.14), 0, 0.85);
    const cemSpreadDecay = clampNumber(finiteOr(benchmarkCfg.cem_spread_decay, 0.82), 0.35, 0.99);
    const cemSpreadMin = clampNumber(finiteOr(benchmarkCfg.cem_spread_min, 0.02), 0.002, 0.25);
    const cemSpreadMax = clampNumber(finiteOr(benchmarkCfg.cem_spread_max, 0.42), 0.05, 1);
    const localSearchPasses = Math.round(clampNumber(finiteOr(benchmarkCfg.local_search_passes, 2), 0, 8));
    const localSearchStepStart = clampNumber(finiteOr(benchmarkCfg.local_search_step_start, 0.18), 0.01, 0.7);
    const localSearchStepDecay = clampNumber(finiteOr(benchmarkCfg.local_search_step_decay, 0.58), 0.2, 0.98);
    const localSearchMinStep = clampNumber(finiteOr(benchmarkCfg.local_search_min_step, 0.016), 0.002, 0.3);
    const localSearchMaxCandidates = Math.round(clampNumber(finiteOr(benchmarkCfg.local_search_max_candidates, 300), 0, 5000));
    const earlyStopPatience = Math.round(clampNumber(finiteOr(benchmarkCfg.early_stop_patience, 220), 0, 100000));
    const earlyStopMinImprovement = clampNumber(finiteOr(benchmarkCfg.early_stop_min_improvement, 0.00006), 0, 1);
    const earlyStopMinFraction = clampNumber(finiteOr(benchmarkCfg.early_stop_min_fraction, 0.55), 0, 1);
    const phaseStagnationPatience = Math.round(clampNumber(finiteOr(benchmarkCfg.phase_stagnation_patience, 2), 0, 10));
    const phaseStagnationMinGain = clampNumber(
      finiteOr(benchmarkCfg.phase_stagnation_min_gain, earlyStopMinImprovement * 0.85),
      0,
      1,
    );
    const randomSeed = Math.round(clampNumber(finiteOr(benchmarkCfg.random_seed, 9337), 1, 2147483646));
    const rng = new SeededRandom(randomSeed);
    const progressEvery = Math.round(clampNumber(finiteOr(benchmarkCfg.progress_every, 8), 1, 1000));
    const totalEstimated = 1
      + trials
      + (refineRounds * refineTopK * refinePerTop)
      + (crossoverRounds * crossoverChildren)
      + (cemRounds * cemSamples)
      + localSearchMaxCandidates;
    const earlyStopMinEvaluated = Math.round(clampNumber(
      finiteOr(benchmarkCfg.early_stop_min_evaluated, Math.ceil(totalEstimated * earlyStopMinFraction)),
      0,
      Math.max(0, totalEstimated),
    ));
    const startedAt = Date.now();
    let evaluatedCount = 0;

    function emitProgress(phase, force = false, extra = {}) {
      if (!onProgress) return;
      if (!force && phase === "search" && (evaluatedCount % progressEvery !== 0)) {
        return;
      }
      const elapsedMs = Date.now() - startedAt;
      const etaMs = evaluatedCount > 0
        ? Math.max(0, Math.round((elapsedMs / evaluatedCount) * Math.max(0, totalEstimated - evaluatedCount)))
        : null;
      onProgress({
        phase,
        evaluated: evaluatedCount,
        total_estimated: totalEstimated,
        elapsed_ms: elapsedMs,
        eta_ms: etaMs,
        ...extra,
      });
    }

    emitProgress("init", true, {
      trials,
      fast_models: searchFastModels,
      full_rescore_top_k: fullRescoreTopK,
      refine_rounds: refineRounds,
      refine_top_k: refineTopK,
      refine_per_top: refinePerTop,
      crossover_rounds: crossoverRounds,
      crossover_children: crossoverChildren,
      cem_rounds: cemRounds,
      cem_samples: cemSamples,
      local_search_passes: localSearchPasses,
      local_search_max_candidates: localSearchMaxCandidates,
      early_stop_min_evaluated: earlyStopMinEvaluated,
    });

    let tournamentContexts = [];
    if (includeTournament) {
      emitProgress("prepare_tournament_contexts", true, {
        target_contexts: holdoutMaxSeasons,
      });
      tournamentContexts = await prepareBacktestContexts(
        adjustedTeamStats,
        historical,
        aliasMap,
        config,
        season,
        holdoutMaxSeasons,
        tournamentEvalCfg,
      );
      emitProgress("prepared_tournament_contexts", true, {
        contexts_found: tournamentContexts.length,
      });
      if (!tournamentContexts.length) {
        includeTournament = false;
      }
    }

    let regularContexts = [];
    if (includeRegular) {
      emitProgress("prepare_regular_contexts", true, {
        target_contexts: regularMaxSeasons,
      });
      regularContexts = prepareRegularSeasonBenchmarkContexts(
        adjustedTeamStats,
        historical,
        season,
        evalCfg,
      );
      emitProgress("prepared_regular_contexts", true, {
        contexts_found: regularContexts.length,
      });
      if (!regularContexts.length) {
        includeRegular = false;
      }
    }
    const searchRegularEvalCfg = includeRegular
      ? { ...evalCfg, regular_contexts: regularContexts }
      : evalCfg;

    const scored = [];
    const seen = new Set();
    const phaseSummary = [];
    let bestObjectiveSoFar = Number.NEGATIVE_INFINITY;
    let lastImprovementAt = 0;
    let stoppedEarly = false;

    function runPhase(phase, fn, meta = {}) {
      const evaluatedStart = evaluatedCount;
      const bestStart = bestObjectiveSoFar;
      const result = typeof fn === "function" ? fn() : null;
      const evaluated = Math.max(0, evaluatedCount - evaluatedStart);
      const bestEnd = bestObjectiveSoFar;
      const gain = (isFiniteNumber(bestStart) && isFiniteNumber(bestEnd))
        ? (bestEnd - bestStart)
        : (isFiniteNumber(bestEnd) && !isFiniteNumber(bestStart) ? bestEnd : null);
      phaseSummary.push({
        phase,
        evaluated,
        gain,
        best_objective: isFiniteNumber(bestEnd) ? bestEnd : null,
        stopped_early: stoppedEarly,
        ...meta,
      });
      return result;
    }

    function shouldStopEarly() {
      if (earlyStopPatience <= 0 || !isFiniteNumber(bestObjectiveSoFar)) return false;
      if (evaluatedCount < earlyStopMinEvaluated) return false;
      return (evaluatedCount - lastImprovementAt) >= earlyStopPatience;
    }

    function scoreCandidate(rawParams, sourceLabel) {
      const params = normalizeTuningParams(rawParams || {});
      const key = JSON.stringify(params);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      const tournamentScore = includeTournament
        ? evaluateTuningCandidate(
            params,
            tournamentContexts,
            adjustedTeamStats,
            historical,
            season,
            tournamentEvalCfg,
          )
        : null;
      const regularScore = includeRegular
        ? evaluateRegularSeasonCandidate(params, adjustedTeamStats, historical, season, searchRegularEvalCfg)
        : null;
      const combined = benchmarkCombinedObjective(tournamentScore, regularScore, benchmarkCfg);
      scored.push({
        index: scored.length,
        source: sourceLabel,
        objective: combined.objective,
        objective_weights: combined.weights,
        tournament: tournamentScore,
        regular_season: regularScore,
        params,
      });
      if (combined.objective > bestObjectiveSoFar + earlyStopMinImprovement) {
        bestObjectiveSoFar = combined.objective;
        lastImprovementAt = evaluatedCount + 1;
      }
      evaluatedCount += 1;
      emitProgress("search", false, {
        last_source: sourceLabel,
        best_objective: bestObjectiveSoFar,
      });
      return true;
    }

    runPhase("base", () => {
      scoreCandidate(baseParams, "base");
    });

    runPhase("random", () => {
      for (let i = 0; i < trials; i += 1) {
        scoreCandidate(sampleTuningParams(rng, baseParams), "random");
        if (shouldStopEarly()) {
          stoppedEarly = true;
          emitProgress("early_stop", true, {
            after_phase: "random",
            evaluated: evaluatedCount,
            best_objective: bestObjectiveSoFar,
          });
          break;
        }
      }
    }, { trials });

    let refineStagnation = 0;
    for (let round = 0; round < refineRounds; round += 1) {
      if (stoppedEarly) break;
      scored.sort((a, b) => b.objective - a.objective);
      const parents = scored.slice(0, Math.min(refineTopK, scored.length));
      if (!parents.length) break;
      const scale = refineScaleStart * (refineScaleDecay ** round);
      const roundBestStart = bestObjectiveSoFar;
      emitProgress("refine_round_start", true, {
        round: round + 1,
        round_scale: scale,
        parent_count: parents.length,
      });
      runPhase(`refine_r${round + 1}`, () => {
        for (const parent of parents) {
          for (let n = 0; n < refinePerTop; n += 1) {
            scoreCandidate(
              perturbTuningParams(parent.params, rng, scale),
              `refine_r${round + 1}`,
            );
            if (shouldStopEarly()) {
              stoppedEarly = true;
              emitProgress("early_stop", true, {
                after_phase: `refine_r${round + 1}`,
                evaluated: evaluatedCount,
                best_objective: bestObjectiveSoFar,
              });
              return;
            }
          }
        }
      }, {
        round: round + 1,
        round_scale: scale,
        parent_count: parents.length,
      });
      emitProgress("refine_round_done", true, {
        round: round + 1,
        best_objective: bestObjectiveSoFar,
      });
      const roundGain = (isFiniteNumber(roundBestStart) && isFiniteNumber(bestObjectiveSoFar))
        ? (bestObjectiveSoFar - roundBestStart)
        : 0;
      if (!stoppedEarly && phaseStagnationPatience > 0 && roundGain <= phaseStagnationMinGain) {
        refineStagnation += 1;
        if (refineStagnation >= phaseStagnationPatience) {
          emitProgress("refine_stagnation_stop", true, {
            round: round + 1,
            best_objective: bestObjectiveSoFar,
          });
          break;
        }
      } else {
        refineStagnation = 0;
      }
    }

    let crossoverStagnation = 0;
    for (let round = 0; round < crossoverRounds; round += 1) {
      if (stoppedEarly) break;
      scored.sort((a, b) => b.objective - a.objective);
      const parents = scored.slice(0, Math.min(crossoverTopK, scored.length));
      if (parents.length < 2) break;
      const roundBestStart = bestObjectiveSoFar;
      emitProgress("crossover_round_start", true, {
        round: round + 1,
        parent_count: parents.length,
        children_target: crossoverChildren,
      });
      runPhase(`crossover_r${round + 1}`, () => {
        for (let i = 0; i < crossoverChildren; i += 1) {
          const parentA = parents[Math.floor(rng.next() * parents.length)];
          let parentB = parents[Math.floor(rng.next() * parents.length)];
          if (parents.length > 1) {
            let guard = 0;
            while (parentA === parentB && guard < 8) {
              parentB = parents[Math.floor(rng.next() * parents.length)];
              guard += 1;
            }
          }
          if (!parentA || !parentB) {
            continue;
          }
          scoreCandidate(
            crossoverTuningParams(parentA.params, parentB.params, rng, crossoverNoiseScale),
            `crossover_r${round + 1}`,
          );
          if (shouldStopEarly()) {
            stoppedEarly = true;
            emitProgress("early_stop", true, {
              after_phase: `crossover_r${round + 1}`,
              evaluated: evaluatedCount,
              best_objective: bestObjectiveSoFar,
            });
            return;
          }
        }
      }, {
        round: round + 1,
        parent_count: parents.length,
        children_target: crossoverChildren,
      });
      emitProgress("crossover_round_done", true, {
        round: round + 1,
        best_objective: bestObjectiveSoFar,
      });
      const roundGain = (isFiniteNumber(roundBestStart) && isFiniteNumber(bestObjectiveSoFar))
        ? (bestObjectiveSoFar - roundBestStart)
        : 0;
      if (!stoppedEarly && phaseStagnationPatience > 0 && roundGain <= phaseStagnationMinGain) {
        crossoverStagnation += 1;
        if (crossoverStagnation >= phaseStagnationPatience) {
          emitProgress("crossover_stagnation_stop", true, {
            round: round + 1,
            best_objective: bestObjectiveSoFar,
          });
          break;
        }
      } else {
        crossoverStagnation = 0;
      }
    }

    const cemSpread = {};
    for (const key of ALL_TUNING_KEYS) {
      const span = tuningParamSpanForKey(key);
      const minSpread = BLEND_KEYS.includes(key) ? cemSpreadMin : cemSpreadMin * span;
      const maxSpread = BLEND_KEYS.includes(key) ? cemSpreadMax : cemSpreadMax * span;
      const initSpread = BLEND_KEYS.includes(key) ? 0.2 : 0.26 * span;
      cemSpread[key] = clampNumber(initSpread, minSpread, Math.max(minSpread, maxSpread));
    }
    let cemCenter = normalizeTuningParams(scored[0]?.params || baseParams);
    let cemExploreBoost = 0;
    let cemStagnation = 0;

    for (let round = 0; round < cemRounds; round += 1) {
      if (stoppedEarly) break;
      scored.sort((a, b) => b.objective - a.objective);
      if (!scored.length) break;
      const elite = collectEliteDistribution(scored, cemEliteFraction);
      if (elite?.center) {
        const progress = cemRounds <= 1 ? 1 : (round / (cemRounds - 1));
        const centerMix = 0.58 + 0.34 * progress;
        cemCenter = blendTuningParams(elite.center, cemCenter, centerMix);
        for (const key of ALL_TUNING_KEYS) {
          const span = tuningParamSpanForKey(key);
          const minSpread = BLEND_KEYS.includes(key) ? cemSpreadMin : cemSpreadMin * span;
          const maxSpread = BLEND_KEYS.includes(key) ? cemSpreadMax : cemSpreadMax * span;
          const eliteSpread = finiteOr(elite.spread?.[key], cemSpread[key]);
          const mixed = 0.65 * eliteSpread + 0.35 * cemSpread[key];
          cemSpread[key] = clampNumber(mixed, minSpread, Math.max(minSpread, maxSpread));
        }
      }
      const roundBestStart = bestObjectiveSoFar;
      const exploreRate = clampNumber(cemExploreFloor + cemExploreBoost, 0, 0.92);
      emitProgress("cem_round_start", true, {
        round: round + 1,
        samples: cemSamples,
        explore_rate: exploreRate,
        elite_fraction: cemEliteFraction,
      });
      runPhase(`cem_r${round + 1}`, () => {
        for (let i = 0; i < cemSamples; i += 1) {
          scoreCandidate(
            sampleFromEliteDistribution(cemCenter, cemSpread, rng, exploreRate, baseParams),
            `cem_r${round + 1}`,
          );
          if (shouldStopEarly()) {
            stoppedEarly = true;
            emitProgress("early_stop", true, {
              after_phase: `cem_r${round + 1}`,
              evaluated: evaluatedCount,
              best_objective: bestObjectiveSoFar,
            });
            return;
          }
        }
      }, {
        round: round + 1,
        samples: cemSamples,
        explore_rate: exploreRate,
      });
      const roundGain = (isFiniteNumber(roundBestStart) && isFiniteNumber(bestObjectiveSoFar))
        ? (bestObjectiveSoFar - roundBestStart)
        : 0;
      if (roundGain <= phaseStagnationMinGain) {
        cemExploreBoost = Math.min(0.36, cemExploreBoost + 0.06);
        cemStagnation += 1;
        for (const key of ALL_TUNING_KEYS) {
          const span = tuningParamSpanForKey(key);
          const minSpread = BLEND_KEYS.includes(key) ? cemSpreadMin : cemSpreadMin * span;
          const maxSpread = BLEND_KEYS.includes(key) ? cemSpreadMax : cemSpreadMax * span;
          cemSpread[key] = clampNumber(cemSpread[key] * 1.15, minSpread, Math.max(minSpread, maxSpread));
        }
      } else {
        cemExploreBoost *= 0.55;
        cemStagnation = 0;
        for (const key of ALL_TUNING_KEYS) {
          const span = tuningParamSpanForKey(key);
          const minSpread = BLEND_KEYS.includes(key) ? cemSpreadMin : cemSpreadMin * span;
          const maxSpread = BLEND_KEYS.includes(key) ? cemSpreadMax : cemSpreadMax * span;
          cemSpread[key] = clampNumber(cemSpread[key] * cemSpreadDecay, minSpread, Math.max(minSpread, maxSpread));
        }
      }
      emitProgress("cem_round_done", true, {
        round: round + 1,
        gain: roundGain,
        best_objective: bestObjectiveSoFar,
      });
      if (!stoppedEarly && phaseStagnationPatience > 0 && cemStagnation >= phaseStagnationPatience) {
        emitProgress("cem_stagnation_stop", true, {
          round: round + 1,
          best_objective: bestObjectiveSoFar,
        });
        break;
      }
    }

    let localCandidatesEvaluated = 0;
    let localStagnation = 0;
    for (let pass = 0; pass < localSearchPasses; pass += 1) {
      if (stoppedEarly || localCandidatesEvaluated >= localSearchMaxCandidates) break;
      scored.sort((a, b) => b.objective - a.objective);
      let anchor = scored[0] || null;
      if (!anchor) break;
      let step = localSearchStepStart * (localSearchStepDecay ** pass);
      const passBestStart = bestObjectiveSoFar;
      emitProgress("local_search_pass_start", true, {
        pass: pass + 1,
        anchor_objective: anchor.objective,
        step_start: step,
      });
      runPhase(`local_p${pass + 1}`, () => {
        while (
          step >= localSearchMinStep &&
          !stoppedEarly &&
          localCandidatesEvaluated < localSearchMaxCandidates
        ) {
          const beforeObjective = anchor.objective;
          const neighbors = coordinateNeighborhood(anchor.params, step);
          if (!neighbors.length) break;
          for (const neighbor of neighbors) {
            if (localCandidatesEvaluated >= localSearchMaxCandidates) break;
            const scoredNow = scoreCandidate(neighbor, `local_p${pass + 1}`);
            if (scoredNow) {
              localCandidatesEvaluated += 1;
            }
            if (shouldStopEarly()) {
              stoppedEarly = true;
              emitProgress("early_stop", true, {
                after_phase: `local_p${pass + 1}`,
                evaluated: evaluatedCount,
                best_objective: bestObjectiveSoFar,
              });
              return;
            }
          }
          scored.sort((a, b) => b.objective - a.objective);
          anchor = scored[0] || anchor;
          const improved = anchor.objective > (beforeObjective + earlyStopMinImprovement);
          emitProgress("local_search_step_done", true, {
            pass: pass + 1,
            step_scale: step,
            improved,
            best_objective: anchor.objective,
            local_candidates: localCandidatesEvaluated,
          });
          if (improved) {
            step *= 0.82;
          } else {
            step *= 0.5;
          }
        }
      }, {
        pass: pass + 1,
        step_start: localSearchStepStart * (localSearchStepDecay ** pass),
      });
      emitProgress("local_search_pass_done", true, {
        pass: pass + 1,
        best_objective: scored[0]?.objective ?? null,
        local_candidates: localCandidatesEvaluated,
      });
      const passGain = (isFiniteNumber(passBestStart) && isFiniteNumber(bestObjectiveSoFar))
        ? (bestObjectiveSoFar - passBestStart)
        : 0;
      if (!stoppedEarly && phaseStagnationPatience > 0 && passGain <= phaseStagnationMinGain) {
        localStagnation += 1;
        if (localStagnation >= phaseStagnationPatience) {
          emitProgress("local_stagnation_stop", true, {
            pass: pass + 1,
            best_objective: bestObjectiveSoFar,
          });
          break;
        }
      } else {
        localStagnation = 0;
      }
    }

    if (fullRescoreTopK > 0 && scored.length > 0) {
      const rescoreCount = Math.min(fullRescoreTopK, scored.length);
      const fullStartBest = bestObjectiveSoFar;
      let fullTournamentContexts = tournamentContexts;
      let fullRegularContexts = regularContexts;
      const searchTournamentTrainCap = Math.round(clampNumber(finiteOr(tournamentEvalCfg.tournament_train_game_cap, 0), 0, 50000));
      const fullTournamentTrainCap = Math.round(clampNumber(finiteOr(fullTournamentCfg.tournament_train_game_cap, 0), 0, 50000));
      const searchTournamentContextLimit = Math.round(clampNumber(
        finiteOr(tournamentEvalCfg.tournament_context_limit, holdoutMaxSeasons),
        0,
        holdoutMaxSeasons,
      ));
      const fullTournamentContextLimit = Math.round(clampNumber(
        finiteOr(fullTournamentCfg.tournament_context_limit, holdoutMaxSeasons),
        0,
        holdoutMaxSeasons,
      ));
      const searchTournamentSource = String(tournamentEvalCfg.tournament_source || "hybrid").trim().toLowerCase();
      const fullTournamentSource = String(fullTournamentCfg.tournament_source || "hybrid").trim().toLowerCase();
      const needFullTournamentContexts = includeTournament && (
        searchTournamentTrainCap !== fullTournamentTrainCap ||
        searchTournamentContextLimit !== fullTournamentContextLimit ||
        searchTournamentSource !== fullTournamentSource
      );

      if (needFullTournamentContexts) {
        emitProgress("prepare_tournament_contexts_full", true, {
          target_contexts: holdoutMaxSeasons,
        });
        fullTournamentContexts = await prepareBacktestContexts(
          adjustedTeamStats,
          historical,
          aliasMap,
          config,
          season,
          holdoutMaxSeasons,
          fullTournamentCfg,
        );
      }
      const searchRegularContextLimit = Math.round(clampNumber(finiteOr(evalCfg.regular_context_limit, 0), 0, 9999));
      const fullRegularContextLimit = Math.round(clampNumber(finiteOr(fullEvalCfg.regular_context_limit, 0), 0, 9999));
      const searchRegularTrainCap = Math.round(clampNumber(finiteOr(evalCfg.regular_train_game_cap, 0), 0, 50000));
      const fullRegularTrainCap = Math.round(clampNumber(finiteOr(fullEvalCfg.regular_train_game_cap, 0), 0, 50000));
      const searchRegularTestCap = Math.round(clampNumber(finiteOr(evalCfg.regular_test_game_cap, 0), 0, 50000));
      const fullRegularTestCap = Math.round(clampNumber(finiteOr(fullEvalCfg.regular_test_game_cap, 0), 0, 50000));
      const needFullRegularContexts = includeRegular && (
        (evalCfg.fast_models === true) !== (fullEvalCfg.fast_models === true) ||
        searchRegularContextLimit !== fullRegularContextLimit ||
        searchRegularTrainCap !== fullRegularTrainCap ||
        searchRegularTestCap !== fullRegularTestCap
      );
      if (
        needFullRegularContexts
      ) {
        emitProgress("prepare_regular_contexts_full", true, {
          target_contexts: regularMaxSeasons,
        });
        fullRegularContexts = prepareRegularSeasonBenchmarkContexts(
          adjustedTeamStats,
          historical,
          season,
          fullEvalCfg,
        );
      }
      const fullRegularEvalCfg = includeRegular
        ? { ...fullEvalCfg, regular_contexts: fullRegularContexts }
        : fullEvalCfg;
      scored.sort((a, b) => b.objective - a.objective);
      const shortlist = scored.slice(0, rescoreCount);
      emitProgress("full_rescore_start", true, {
        top_k: shortlist.length,
      });
      for (let i = 0; i < shortlist.length; i += 1) {
        const row = shortlist[i];
        const tournamentScore = includeTournament
          ? evaluateTuningCandidate(
              row.params,
              fullTournamentContexts,
              adjustedTeamStats,
              historical,
              season,
              fullTournamentCfg,
            )
          : null;
        const regularScore = includeRegular
          ? evaluateRegularSeasonCandidate(
              row.params,
              adjustedTeamStats,
              historical,
              season,
              fullRegularEvalCfg,
            )
          : null;
        const combined = benchmarkCombinedObjective(tournamentScore, regularScore, benchmarkCfg);
        row.objective = combined.objective;
        row.objective_weights = combined.weights;
        row.tournament = tournamentScore;
        row.regular_season = regularScore;
        row.rescored_full = true;
        emitProgress("full_rescore", true, {
          rescored: i + 1,
          top_k: shortlist.length,
          best_objective: combined.objective,
        });
      }
      scored.sort((a, b) => b.objective - a.objective);
      bestObjectiveSoFar = scored[0]?.objective ?? bestObjectiveSoFar;
      phaseSummary.push({
        phase: "full_rescore",
        evaluated: shortlist.length,
        gain: (isFiniteNumber(fullStartBest) && isFiniteNumber(bestObjectiveSoFar))
          ? (bestObjectiveSoFar - fullStartBest)
          : null,
        best_objective: isFiniteNumber(bestObjectiveSoFar) ? bestObjectiveSoFar : null,
        stopped_early: stoppedEarly,
        top_k: shortlist.length,
      });
    }

    scored.sort((a, b) => b.objective - a.objective);
    const best = scored[0] || null;
    const base = scored.find((row) => row.source === "base") || null;
    emitProgress("done", true, {
      best_objective: best?.objective ?? null,
      candidates_evaluated: scored.length,
    });

    return {
      generated_at: nowIsoNoMillis(),
      season,
      trials_requested: trials,
      candidates_evaluated: scored.length,
      include_tournament: includeTournament,
      include_regular: includeRegular,
      include_postseason: evalCfg.include_postseason !== false,
      tournament_contexts: tournamentContexts.map((ctx) => ctx.season),
      settings: {
        holdout_max_seasons: holdoutMaxSeasons,
        regular_max_seasons: regularMaxSeasons,
        fast_models: searchFastModels,
        full_rescore_fast_models: fullRescoreFastModels,
        full_rescore_top_k: fullRescoreTopK,
        tournament_context_limit: (() => {
          const raw = Math.round(clampNumber(
            finiteOr(tournamentEvalCfg.tournament_context_limit, holdoutMaxSeasons),
            0,
            holdoutMaxSeasons,
          ));
          return raw > 0 ? raw : holdoutMaxSeasons;
        })(),
        tournament_train_game_cap: Math.round(clampNumber(
          finiteOr(tournamentEvalCfg.tournament_train_game_cap, 0),
          0,
          50000,
        )),
        regular_context_limit: (() => {
          const raw = Math.round(clampNumber(finiteOr(evalCfg.regular_context_limit, 0), 0, 1000));
          return raw > 0 ? raw : regularContexts.length;
        })(),
        regular_train_game_cap: Math.round(clampNumber(finiteOr(evalCfg.regular_train_game_cap, 0), 0, 50000)),
        regular_test_game_cap: Math.round(clampNumber(finiteOr(evalCfg.regular_test_game_cap, 0), 0, 50000)),
        regular_split_fractions: benchmarkSplitFractions(evalCfg.regular_split_fractions),
        regular_min_train_games: Math.round(clampNumber(finiteOr(evalCfg.regular_min_train_games, 160), 40, 2000)),
        regular_min_test_games: Math.round(clampNumber(finiteOr(evalCfg.regular_min_test_games, 30), 10, 1000)),
        refine_rounds: refineRounds,
        refine_top_k: refineTopK,
        refine_per_top: refinePerTop,
        refine_scale_start: refineScaleStart,
        refine_scale_decay: refineScaleDecay,
        crossover_rounds: crossoverRounds,
        crossover_top_k: crossoverTopK,
        crossover_children: crossoverChildren,
        crossover_noise_scale: crossoverNoiseScale,
        cem_rounds: cemRounds,
        cem_samples: cemSamples,
        cem_elite_fraction: cemEliteFraction,
        cem_explore_floor: cemExploreFloor,
        cem_spread_decay: cemSpreadDecay,
        cem_spread_min: cemSpreadMin,
        cem_spread_max: cemSpreadMax,
        local_search_passes: localSearchPasses,
        local_search_step_start: localSearchStepStart,
        local_search_step_decay: localSearchStepDecay,
        local_search_min_step: localSearchMinStep,
        local_search_max_candidates: localSearchMaxCandidates,
        phase_stagnation_patience: phaseStagnationPatience,
        phase_stagnation_min_gain: phaseStagnationMinGain,
        early_stop_patience: earlyStopPatience,
        early_stop_min_improvement: earlyStopMinImprovement,
        early_stop_min_fraction: earlyStopMinFraction,
        early_stop_min_evaluated: earlyStopMinEvaluated,
        regular_objective_logloss_weight: finiteOr(evalCfg.regular_objective_logloss_weight, 0.55),
        regular_objective_brier_weight: finiteOr(evalCfg.regular_objective_brier_weight, 0.25),
        regular_objective_accuracy_weight: finiteOr(evalCfg.regular_objective_accuracy_weight, 0.2),
        tournament_weight: clampNumber(finiteOr(benchmarkCfg.tournament_weight, 0.62), 0, 1),
        regular_weight: clampNumber(finiteOr(benchmarkCfg.regular_weight, 0.38), 0, 1),
        random_seed: randomSeed,
      },
      stopped_early: stoppedEarly,
      phase_summary: phaseSummary,
      base,
      best,
      leaderboard: scored.slice(0, Math.min(10, scored.length)).map((row, idx) => ({
        rank: idx + 1,
        objective: row.objective,
        tournament_objective: row.tournament?.objective ?? null,
        regular_objective: row.regular_season?.objective ?? null,
        avg_tournament_normalized: row.tournament?.avg_normalized ?? null,
        avg_regular_log_loss: row.regular_season?.avg_log_loss ?? null,
        avg_regular_accuracy: row.regular_season?.avg_accuracy ?? null,
      })),
    };
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

  function logoInitials(name) {
    const words = String(name || "")
      .replace(/[^a-zA-Z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean);
    if (!words.length) return "NA";
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }

  function escapeXml(text) {
    return String(text || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  function fallbackLogoDataUri(team) {
    const clean = String(team || "Team").trim() || "Team";
    const initials = logoInitials(clean);
    let hash = 0;
    for (let i = 0; i < clean.length; i += 1) {
      hash = ((hash << 5) - hash + clean.charCodeAt(i)) | 0;
    }
    const hue = Math.abs(hash) % 360;
    const bg = `hsl(${hue} 45% 92%)`;
    const stroke = `hsl(${hue} 32% 78%)`;
    const fg = `hsl(${hue} 44% 26%)`;
    const svg = [
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'>`,
      `<rect x='4' y='4' width='112' height='112' rx='24' fill='${bg}' stroke='${stroke}' stroke-width='4'/>`,
      `<text x='60' y='72' text-anchor='middle' font-family='Arial, sans-serif' font-size='42' font-weight='700' fill='${fg}'>${escapeXml(initials)}</text>`,
      `</svg>`,
    ].join("");
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  function logoMapFromEvents(ncaaEvents, aliasMap) {
    const out = {};
    for (const event of ncaaEvents || []) {
      const teamA = String(event?.team_a || "").trim();
      const teamB = String(event?.team_b || "").trim();
      const logoA = String(event?.team_a_logo || "").trim();
      const logoB = String(event?.team_b_logo || "").trim();
      if (teamA && logoA) {
        out[maybeAlias(teamA, aliasMap)] = logoA;
      }
      if (teamB && logoB) {
        out[maybeAlias(teamB, aliasMap)] = logoB;
      }
    }
    return out;
  }

  async function fetchStaticLogoOverrides(aliasMap) {
    const payload = await fetchJson("./data/team_logos.json").catch(() => ({}));
    const rawMap = payload?.team_logos && typeof payload.team_logos === "object"
      ? payload.team_logos
      : payload;
    if (!rawMap || typeof rawMap !== "object") {
      return {};
    }

    const out = {};
    for (const [teamRaw, logoRaw] of Object.entries(rawMap)) {
      const team = String(teamRaw || "").trim();
      const logo = String(logoRaw || "").trim();
      if (!team || !logo) continue;
      out[maybeAlias(team, aliasMap)] = logo;
    }
    return out;
  }

  function ensureLogoCoverage(targetTeams, logos, aliasMap) {
    const out = { ...(logos || {}) };
    const canonicalLookup = {};
    Object.entries(out).forEach(([team, logo]) => {
      const key = canonicalName(maybeAlias(team, aliasMap));
      if (key && logo) {
        canonicalLookup[key] = logo;
      }
    });

    [...new Set((targetTeams || []).map((name) => String(name || "").trim()).filter(Boolean))].forEach((team) => {
      if (out[team]) return;
      const key = canonicalName(maybeAlias(team, aliasMap));
      if (key && canonicalLookup[key]) {
        out[team] = canonicalLookup[key];
        return;
      }
      const fallback = fallbackLogoDataUri(team);
      out[team] = fallback;
      if (key) canonicalLookup[key] = fallback;
    });

    return out;
  }

  async function fetchTeamLogos(targetTeams, aliasMap, options = {}) {
    const cacheMinutes = clampNumber(finiteOr(options.cache_minutes, 12 * 60), 0, 7 * 24 * 60);
    const cacheKey = "mmp:team-logos:v2";
    const now = Date.now();
    let lookup = null;

    if (cacheMinutes > 0) {
      const cached = safeReadLocalStorageJson(cacheKey);
      if (
        cached &&
        isFiniteNumber(cached.created_at) &&
        (now - cached.created_at) < cacheMinutes * 60 * 1000 &&
        cached.lookup &&
        typeof cached.lookup === "object"
      ) {
        lookup = cached.lookup;
      }
    }

    if (!lookup) {
      const payload = await fetchJson(TEAMS_URL, { cache: "no-store" });
      const entries = payload?.sports?.[0]?.leagues?.[0]?.teams || [];
      lookup = {};

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
      Object.entries(MANUAL_LOGO_OVERRIDES).forEach(([name, logo]) => {
        const key = canonicalName(maybeAlias(name, aliasMap));
        if (!lookup[key] && logo) {
          lookup[key] = logo;
        }
      });

      if (cacheMinutes > 0) {
        safeWriteLocalStorageJson(cacheKey, {
          created_at: now,
          lookup,
        });
      }
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

  function selectLiveTrainingGames(historical, targetSeason, liveCfg = {}) {
    const maxSeasons = Math.round(clampNumber(finiteOr(liveCfg.max_seasons, 5), 1, 20));
    const gameCap = Math.round(clampNumber(finiteOr(liveCfg.game_cap, 2600), 200, 50000));
    const includePostseason = liveCfg.include_postseason !== false;

    const seasons = [...new Set((historical || []).map((row) => Number(row.season)))]
      .filter((season) => isFiniteNumber(season) && season <= targetSeason)
      .sort((a, b) => a - b)
      .slice(-maxSeasons);
    const seasonSet = new Set(seasons);

    const filtered = (historical || [])
      .filter((game) => seasonSet.has(Number(game.season)))
      .filter((game) => includePostseason || !isLikelyPostseasonRoundName(game?.round_name))
      .sort((a, b) => {
        const sa = Number(a.season || 0);
        const sb = Number(b.season || 0);
        if (sa !== sb) return sa - sb;
        return Number(a.game_index || 0) - Number(b.game_index || 0);
      });
    return capRowsEvenly(filtered, gameCap);
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

  function sourceSlotFromRef(ref) {
    const clean = String(ref || "").trim();
    if (!clean.startsWith("@slot:")) return "";
    return clean.split(":", 2)[1] || "";
  }

  function contenderSetForRef(ref, contendersBySlot) {
    const slotRef = sourceSlotFromRef(ref);
    if (slotRef) {
      const slotContenders = contendersBySlot.get(slotRef);
      if (slotContenders && slotContenders.size) {
        return new Set(slotContenders);
      }
      return new Set(["TBD"]);
    }
    const clean = String(ref || "").trim();
    return new Set([clean || "TBD"]);
  }

  function buildContendersBySlot(bracketRows, lockedWinners = {}) {
    const ordered = [...(bracketRows || [])].sort(
      (a, b) => (Number(a?.round_order || 0) - Number(b?.round_order || 0)) || String(a?.slot || "").localeCompare(String(b?.slot || "")),
    );
    const contendersBySlot = new Map();

    for (const row of ordered) {
      const slot = String(row?.slot || "").trim();
      if (!slot) continue;

      const locked = String(lockedWinners?.[slot] || "").trim();
      if (locked && canonicalName(locked) !== "tbd") {
        contendersBySlot.set(slot, new Set([locked]));
        continue;
      }

      const contenders = new Set();
      const sideA = contenderSetForRef(row?.team_a, contendersBySlot);
      const sideB = contenderSetForRef(row?.team_b, contendersBySlot);

      for (const team of [...sideA, ...sideB]) {
        const clean = String(team || "").trim();
        if (!clean || canonicalName(clean) === "tbd") continue;
        contenders.add(clean);
      }
      if (!contenders.size) {
        contenders.add("TBD");
      }
      contendersBySlot.set(slot, contenders);
    }

    return contendersBySlot;
  }

  function sanitizeUserPicks(rawPicks, context) {
    if (!rawPicks || typeof rawPicks !== "object" || !context) {
      return {};
    }
    const requested = [];
    for (const [slotRaw, teamRaw] of Object.entries(rawPicks)) {
      const slot = String(slotRaw || "").trim();
      if (!slot || !context.bracketSlotSet?.has(slot)) {
        continue;
      }
      if (context.lockedResults?.[slot]) {
        continue;
      }
      const teamText = String(teamRaw || "").trim();
      if (!teamText || canonicalName(teamText) === "tbd") {
        continue;
      }
      const canonical = canonicalName(teamText);
      const resolved = context.teamLookup?.[canonical] || teamText;
      if (!context.snapshotMap?.has(resolved)) {
        continue;
      }
      requested.push({ slot, team: resolved });
    }

    if (!requested.length) {
      return {};
    }

    requested.sort((a, b) => {
      const rankA = Number(context.slotOrderRank?.[a.slot]);
      const rankB = Number(context.slotOrderRank?.[b.slot]);
      if (isFiniteNumber(rankA) && isFiniteNumber(rankB) && rankA !== rankB) {
        return rankA - rankB;
      }
      return a.slot.localeCompare(b.slot);
    });

    const accepted = {};
    for (const pick of requested) {
      const locked = { ...(context.lockedResults || {}), ...accepted };
      const contendersBySlot = buildContendersBySlot(context.bracket, locked);
      const contenders = contendersBySlot.get(pick.slot);
      if (!contenders || !contenders.size) {
        continue;
      }
      let isFeasible = false;
      for (const contender of contenders) {
        if (canonicalName(contender) === canonicalName(pick.team)) {
          isFeasible = true;
          break;
        }
      }
      if (isFeasible) {
        accepted[pick.slot] = pick.team;
      }
    }
    return accepted;
  }

  async function buildUserBracketPayload(userPicks = {}, options = {}) {
    const requestedSeason = Number(options.season || LIVE_SOLVER_CONTEXT?.season || Number.NaN);
    if (
      !LIVE_SOLVER_CONTEXT ||
      (isFiniteNumber(requestedSeason) && LIVE_SOLVER_CONTEXT.season !== requestedSeason)
    ) {
      await buildLivePayload(options || {});
    }
    const context = LIVE_SOLVER_CONTEXT;
    if (!context) {
      throw new Error("Live solver context is unavailable");
    }

    const cleanPicks = sanitizeUserPicks(userPicks, context);
    const locked = { ...(context.lockedResults || {}), ...cleanPicks };
    const { summary, advancement, bestBracket, maxRound } = solveTournamentDeterministic(
      context.model,
      context.bracket,
      context.snapshot,
      locked,
      context.performanceStyle,
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

    return {
      meta: {
        ...(context.baseMeta || {}),
        updated_at: nowIsoNoMillis(),
        user_bracket: {
          picks: cleanPicks,
          picks_count: Object.keys(cleanPicks).length,
        },
      },
      matchups: summary,
      title_odds: titleOdds,
      best_bracket: bestBracket,
      team_logos: context.teamLogos || {},
    };
  }

  async function buildLivePayload(options = {}) {
    const config = await fetchJson("./data/runtime/config.json").catch(() => ({}));

    const season = Number(options.season || config.default_season || new Date().getUTCFullYear());
    const liveCfg = config?.live_runtime || {};

    const { teamStats, historical, injuries, aliasMap, quality_report: qualityReport } = await loadRuntimeData(season);
    const adjustedTeamStats = applyInjuries(teamStats, injuries, season);
    const snapshot = seasonSnapshot(adjustedTeamStats, season);

    const tuningResult = await resolveTuningParams(config, adjustedTeamStats, historical, aliasMap, season);
    const tunedParams = normalizeTuningParams(tuningResult.params || {});
    const liveFastModels = liveCfg.fast_models !== false;
    const liveTrainingGames = selectLiveTrainingGames(historical, season, liveCfg);
    const trainingGames = liveTrainingGames.length ? liveTrainingGames : historical;
    const liveParams = benchmarkModelParams(tunedParams, liveFastModels);

    const model = trainModel(adjustedTeamStats, trainingGames, liveParams);
    const performanceStyle = buildPerformanceStyleContext(adjustedTeamStats, trainingGames, liveParams);
    performanceStyle.tuning = liveParams;
    if (!liveFastModels) {
      performanceStyle.treeModel = trainTreeModel(adjustedTeamStats, trainingGames, liveParams);
      performanceStyle.stacker = trainBlendStacker(adjustedTeamStats, trainingGames, model, performanceStyle);
      performanceStyle.calibrator = fitProbabilityCalibrator(adjustedTeamStats, trainingGames, model, performanceStyle);
    }

    const window = pickWindow(config, season);
    const firstFourStart = window.first_four_start;
    const championshipDate = window.championship_date;
    const firstRoundCaptureEnd = addDays(firstFourStart, 5);
    const resultsEnd = minYmd(todayYmdUtc(), championshipDate);
    const fetchEnd = maxYmd(firstRoundCaptureEnd, resultsEnd);

    const scoreboardRows = await fetchScoreboardRange(firstFourStart, fetchEnd, {
      cache_minutes: clampNumber(finiteOr(liveCfg.scoreboard_cache_minutes, 20), 0, 24 * 60),
      concurrency: Math.round(clampNumber(finiteOr(liveCfg.scoreboard_concurrency, 6), 1, 24)),
    });
    const ncaaEvents = extractNcaaEvents(scoreboardRows, aliasMap);

    let bracketEvents = ncaaEvents.filter(
      (event) => event.round_order <= 1 && event.day >= firstFourStart && event.day <= firstRoundCaptureEnd,
    );
    if (bracketEvents.length < 20) {
      bracketEvents = ncaaEvents.filter((event) => event.round_order <= 1);
    }

    const bracketBuild = buildBracketFromEvents(bracketEvents, snapshot, {
      finalFourPairs: configuredFinalFourPairs(config, season),
      finalFourEvents: ncaaEvents.filter((event) => event.round_order === 5),
    });
    const bracket = bracketBuild.rows;

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
    const fetchTeamLogosEnabled = liveCfg.fetch_team_logos !== false;
    if (fetchTeamLogosEnabled) {
      try {
        teamLogos = await fetchTeamLogos(snapshot.map((row) => row.team), aliasMap, {
          cache_minutes: clampNumber(finiteOr(liveCfg.team_logo_cache_minutes, 12 * 60), 0, 7 * 24 * 60),
        });
      } catch {
        teamLogos = {};
      }
    }
    const eventLogos = logoMapFromEvents(ncaaEvents, aliasMap);
    const staticLogoOverrides = await fetchStaticLogoOverrides(aliasMap).catch(() => ({}));
    teamLogos = ensureLogoCoverage(
      snapshot.map((row) => row.team),
      { ...teamLogos, ...eventLogos, ...staticLogoOverrides },
      aliasMap,
    );

    const { summary, advancement, bestBracket, maxRound } = solveTournamentDeterministic(
      model,
      bracket,
      snapshot,
      lockedWinners,
      performanceStyle,
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

    const sigmaValues = [...(performanceStyle.marginSigmaBySeasonTeam?.values() || [])];
    const meanTeamSigma = sigmaValues.length ? mean(sigmaValues) : 0;

    const baseMeta = {
      season,
      simulations: 0,
      prediction_mode: "deterministic_elo",
      updated_at: nowIsoNoMillis(),
      training_metrics: {
        logistic: model.metrics,
        tree: performanceStyle.treeModel?.metrics || {},
        stacker_rows: performanceStyle.stacker?.rows || 0,
        stacker_features: performanceStyle.stacker?.weights?.length || 0,
        calibrator_rows: performanceStyle.calibrator?.global?.rows || 0,
        calibrator_isotonic_points: performanceStyle.calibrator?.global?.isotonic?.points?.length || 0,
        archetype_pairs: performanceStyle.archetypeModel?.pairs || 0,
        mean_team_margin_sigma: meanTeamSigma,
        off_def_rated_teams: performanceStyle.offenseRatingBySeasonTeam?.size || 0,
        market_training_rows: performanceStyle.market_rows || 0,
        live_fast_models: liveFastModels,
        live_training_games: trainingGames.length,
        live_training_max_seasons: Math.round(clampNumber(finiteOr(liveCfg.max_seasons, 5), 1, 20)),
        live_training_game_cap: Math.round(clampNumber(finiteOr(liveCfg.game_cap, 2600), 200, 50000)),
      },
      model_tuning: {
        source: tuningResult.source,
        params: tunedParams,
        backtest: tuningResult.backtest,
      },
      final_four_pairs: bracketBuild.finalFourPairs,
      final_four_pair_source: bracketBuild.finalFourPairSource,
      data_quality: qualityReport,
      grading_factors: {
        tempo_adjusted_margin: true,
        soft_outcomes: true,
        recency_weighting: true,
        round_importance_weighting: true,
        continuous_style_vectors: true,
        anti_symmetric_style_interactions: true,
        archetype_matchup_matrix: true,
        archetype_uncertainty_weighting: true,
        rolling_form_last5_last10: true,
        quality_win_bad_loss_profile: true,
        close_game_resilience_profile: true,
        nonlinear_quality_scaling: true,
        close_vs_blowout_separation: true,
        off_def_elo_margin_model: true,
        team_variance_sigma_model: true,
        dynamic_k_factor_updates: true,
        preseason_bayesian_shrinkage: true,
        fatigue_travel_schedule_effects: true,
        hybrid_platt_isotonic_calibration: true,
        ensemble_logistic_tree_rating_style: true,
        home_court_aware_game_modeling: true,
        tuned_logistic_hyperparameters: true,
        uncertainty_aware_probs: true,
        round_aware_probability_calibration: true,
        market_priors_optional: true,
        game_context_edges_optional: true,
        matchup_interaction_features: true,
        rolling_form_trend: true,
        stacked_meta_blend: true,
        backtest_espn_points_optimized: true,
        data_quality_guards: true,
        live_bracket_solver: "deterministic",
        seed_inputs_removed_from_model: true,
        seed_gap_feature: false,
      },
      team_logos_count: Object.keys(teamLogos).length,
      team_logo_coverage: {
        available: Object.keys(teamLogos).length,
        total: snapshot.length,
      },
    };

    const snapshotMap = new Map(snapshot.map((row) => [String(row.team || "").trim(), row]));
    const snapshotTeams = new Set(snapshotMap.keys());
    const teamLookup = {};
    for (const team of snapshotTeams) {
      teamLookup[canonicalName(team)] = team;
    }
    for (const [alias, canonical] of Object.entries(aliasMap || {})) {
      const canonicalTeam = String(canonical || "").trim();
      if (!canonicalTeam || !snapshotTeams.has(canonicalTeam)) continue;
      teamLookup[canonicalName(alias)] = canonicalTeam;
      teamLookup[canonicalName(canonicalTeam)] = canonicalTeam;
    }

    const orderedBracket = [...(bracket || [])].sort(
      (a, b) => (Number(a?.round_order || 0) - Number(b?.round_order || 0)) || String(a?.slot || "").localeCompare(String(b?.slot || "")),
    );
    const slotOrderRank = {};
    for (let i = 0; i < orderedBracket.length; i += 1) {
      const slotName = String(orderedBracket[i]?.slot || "").trim();
      if (!slotName) continue;
      slotOrderRank[slotName] = i;
    }

    LIVE_SOLVER_CONTEXT = {
      season,
      model,
      performanceStyle,
      bracket,
      snapshot,
      snapshotMap,
      teamLookup,
      teamLogos,
      lockedResults: { ...lockedWinners },
      bracketSlotSet: new Set(orderedBracket.map((row) => String(row?.slot || "").trim()).filter(Boolean)),
      slotOrderRank,
      baseMeta,
    };

    return {
      meta: {
        ...baseMeta,
        user_bracket: {
          picks: {},
          picks_count: 0,
        },
      },
      matchups: summary,
      title_odds: titleOdds,
      best_bracket: bestBracket,
      team_logos: teamLogos,
    };
  }

  window.LiveBracketRuntime = {
    buildLivePayload,
    buildUserBracketPayload,
    runBenchmark,
  };
})();
