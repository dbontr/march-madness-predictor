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

  const NCAA_NOTE_PREFIX = "NCAA Men's Basketball Championship - ";
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
    if (!text.startsWith(NCAA_NOTE_PREFIX)) {
      return null;
    }

    const rest = text.slice(NCAA_NOTE_PREFIX.length).trim();
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
      for (const team of [game.team_a, game.team_b]) {
        const seed = toNumber(seedMap.get(team));
        if (isFiniteNumber(seed) && seed >= 1 && seed <= 16) {
          if (!regionSeedTeam[game.region][seed]) {
            regionSeedTeam[game.region][seed] = team;
          }
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
    return rows.map((raw) => ({
      season: Number(raw.season),
      team_a: String(raw.team_a || "").trim(),
      team_b: String(raw.team_b || "").trim(),
      score_a: Number(raw.score_a),
      score_b: Number(raw.score_b),
      neutral_site: Number(raw.neutral_site || 1),
    }));
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

  function sigmoid(z) {
    if (z >= 0) {
      const ex = Math.exp(-z);
      return 1 / (1 + ex);
    }
    const ex = Math.exp(z);
    return ex / (1 + ex);
  }

  function dot(a, b) {
    let total = 0;
    for (let i = 0; i < a.length; i += 1) {
      total += a[i] * b[i];
    }
    return total;
  }

  function trainModel(teamStats, games) {
    const statMap = new Map();
    teamStats.forEach((row) => statMap.set(`${row.season}|${row.team}`, row));

    const xRaw = [];
    const y = [];

    for (const game of games) {
      const rowA = statMap.get(`${game.season}|${game.team_a}`);
      const rowB = statMap.get(`${game.season}|${game.team_b}`);
      if (!rowA || !rowB) {
        continue;
      }

      const diff = FEATURE_COLS.map((feature) => toNumber(rowA[feature]) - toNumber(rowB[feature]));
      const seedGap = toNumber(rowB.seed) - toNumber(rowA.seed);
      const neutral = toNumber(game.neutral_site);
      const forward = [...diff, seedGap, neutral];
      const reverse = [...diff.map((value) => -value), -seedGap, neutral];

      xRaw.push(forward);
      y.push(game.score_a > game.score_b ? 1 : 0);
      xRaw.push(reverse);
      y.push(game.score_b > game.score_a ? 1 : 0);
    }

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
    const lr = 0.08;
    const lambda = 0.001;
    const epochs = 360;

    for (let epoch = 0; epoch < epochs; epoch += 1) {
      const gradW = new Array(featureCount).fill(0);
      let gradB = 0;

      for (let i = 0; i < x.length; i += 1) {
        const pred = sigmoid(dot(weights, x[i]) + bias);
        const err = pred - y[i];
        gradB += err;
        for (let j = 0; j < featureCount; j += 1) {
          gradW[j] += err * x[i][j];
        }
      }

      gradB /= x.length;
      for (let j = 0; j < featureCount; j += 1) {
        const finalGrad = gradW[j] / x.length + lambda * weights[j];
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
    for (let i = 0; i < y.length; i += 1) {
      const p = clamp01(probabilities[i]);
      loss += -(y[i] * Math.log(p) + (1 - y[i]) * Math.log(1 - p));
    }
    loss /= y.length;

    const pairs = y.map((label, index) => ({ label, score: probabilities[index] })).sort((a, b) => a.score - b.score);
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

  function teamPowerScore(row) {
    const seed = finiteOr(toNumber(row.seed), 8.5);
    const net = finiteOr(toNumber(row.net_rating), 0);
    const sos = finiteOr(toNumber(row.sos), 0);
    const recent = finiteOr(toNumber(row.recent_form), 0.5);
    const injuries = finiteOr(toNumber(row.injuries_impact), 0);

    return (
      0.72 * net +
      0.5 * sos +
      1.9 * (17 - seed) +
      7 * (recent - 0.5) +
      15 * injuries
    );
  }

  function predictMatchup(model, snapshotMap, teamA, teamB) {
    if (!teamA || !teamB || teamA === "TBD" || teamB === "TBD") {
      return 0.5;
    }

    const rowA = snapshotMap.get(teamA);
    const rowB = snapshotMap.get(teamB);
    if (!rowA || !rowB) {
      return 0.5;
    }

    const diff = FEATURE_COLS.map((feature) => toNumber(rowA[feature]) - toNumber(rowB[feature]));
    const seedGap = toNumber(rowB.seed) - toNumber(rowA.seed);
    const raw = [...diff, seedGap, 1];
    const transformed = transformFeatureVector(raw, model);
    const modelProb = sigmoid(dot(model.weights, transformed) + model.bias);

    const powerDelta = teamPowerScore(rowA) - teamPowerScore(rowB);
    const powerProb = sigmoid(powerDelta / 8.5);

    const seedA = toNumber(rowA.seed);
    const seedB = toNumber(rowB.seed);
    const seedProb =
      isFiniteNumber(seedA) && isFiniteNumber(seedB)
        ? sigmoid((seedB - seedA) * 0.22)
        : 0.5;

    const blended = 0.48 * modelProb + 0.37 * powerProb + 0.15 * seedProb;
    return temperedProb(blended, 0.9);
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

  function seedAdjustedProb(baseProb, snapshotMap, teamA, teamB, roundOrder) {
    if (roundOrder > 2) {
      return baseProb;
    }
    const rowA = snapshotMap.get(teamA);
    const rowB = snapshotMap.get(teamB);
    if (!rowA || !rowB) {
      return baseProb;
    }

    const seedA = toNumber(rowA.seed);
    const seedB = toNumber(rowB.seed);
    if (!isFiniteNumber(seedA) || !isFiniteNumber(seedB) || seedA === seedB) {
      return baseProb;
    }

    const gap = Math.abs(seedA - seedB);
    let floor = 0;

    if (roundOrder === 1) {
      if (gap >= 10) floor = 0.9;
      else if (gap >= 8) floor = 0.84;
      else if (gap >= 6) floor = 0.77;
      else if (gap >= 4) floor = 0.68;
    } else if (roundOrder === 2) {
      if (gap >= 8) floor = 0.8;
      else if (gap >= 6) floor = 0.74;
      else if (gap >= 4) floor = 0.66;
    }

    if (!floor) {
      return baseProb;
    }

    if (seedA < seedB) {
      return Math.max(baseProb, floor);
    }
    return Math.min(baseProb, 1 - floor);
  }

  function chooseWinnerFromProb(probTeamA, teamA, teamB, snapshotMap) {
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
    const seedA = toNumber(rowA?.seed);
    const seedB = toNumber(rowB?.seed);
    if (isFiniteNumber(seedA) && isFiniteNumber(seedB) && seedA !== seedB) {
      return seedA < seedB ? teamA : teamB;
    }

    return teamA.localeCompare(teamB) <= 0 ? teamA : teamB;
  }

  function simulateTournament(model, bracket, snapshot, simulations, randomSeed, lockedWinners) {
    const rng = new SeededRandom(randomSeed);
    const snapshotMap = new Map(snapshot.map((row) => [row.team, row]));
    const ordered = [...bracket].sort((a, b) => (a.round_order - b.round_order) || a.slot.localeCompare(b.slot));
    const maxRound = Math.max(...ordered.map((row) => row.round_order));

    const probCache = new Map();
    const advancementCounts = new Map();
    const slotWinnerCounts = new Map();
    const summaryAgg = new Map();

    function cachedProb(teamA, teamB) {
      const key = `${teamA}||${teamB}`;
      const reverse = `${teamB}||${teamA}`;
      if (!probCache.has(key)) {
        const pA = predictMatchup(model, snapshotMap, teamA, teamB);
        probCache.set(key, pA);
        probCache.set(reverse, 1 - pA);
      }
      return probCache.get(key);
    }

    for (let sim = 0; sim < simulations; sim += 1) {
      const winners = { ...lockedWinners };

      for (const row of ordered) {
        const slotName = row.slot;
        const teamA = resolveTeam(row.team_a, winners);
        const teamB = resolveTeam(row.team_b, winners);
        const baseProb = cachedProb(teamA, teamB);
        const pTeamA = seedAdjustedProb(baseProb, snapshotMap, teamA, teamB, row.round_order);

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
          winner = rng.next() < pTeamA ? teamA : teamB;
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
      const baseProb = cachedProb(teamA, teamB);
      const adjustedProb = seedAdjustedProb(baseProb, snapshotMap, teamA, teamB, row.round_order);
      let winner = lockedWinners[row.slot] || "";
      if (!winner) {
        const countA = slotWinnerCounts.get(`${row.slot}||${teamA}`) || 0;
        const countB = slotWinnerCounts.get(`${row.slot}||${teamB}`) || 0;
        if (countA > countB) {
          winner = teamA;
        } else if (countB > countA) {
          winner = teamB;
        } else {
          winner = chooseWinnerFromProb(adjustedProb, teamA, teamB, snapshotMap);
        }
      }
      projectedWinners[row.slot] = winner;

      bestBracket.push({
        slot: row.slot,
        round_order: row.round_order,
        round_name: row.round_name,
        region: row.region,
        winner,
        is_locked: Boolean(lockedWinners[row.slot]),
      });
    }

    return { summary, advancement, bestBracket, maxRound };
  }

  function rankNote(prob) {
    if (prob >= 0.15) return "Tier 1 title profile";
    if (prob >= 0.08) return "Strong contender";
    if (prob >= 0.04) return "Live dark horse";
    return "Long-shot path";
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

    return { teamStats, historical, injuries, aliasMap };
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
    const simulations = Number(options.simulations || config.default_simulations || 1600);
    const randomSeed = Number(options.random_seed || 42);

    const { teamStats, historical, injuries, aliasMap } = await loadRuntimeData(season);
    const adjustedTeamStats = applyInjuries(teamStats, injuries, season);
    const snapshot = seasonSnapshot(adjustedTeamStats, season);

    const model = trainModel(adjustedTeamStats, historical);

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

    const { summary, advancement, bestBracket, maxRound } = simulateTournament(
      model,
      bracket,
      snapshot,
      simulations,
      randomSeed,
      lockedWinners,
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
        simulations,
        updated_at: nowIsoNoMillis(),
        training_metrics: model.metrics,
        team_logos_count: Object.keys(teamLogos).length,
      },
      matchups: summary,
      title_odds: titleOdds,
      best_bracket: bestBracket,
      team_logos: teamLogos,
      team_seeds: teamSeeds,
    };
  }

  window.LiveBracketRuntime = {
    buildLivePayload,
  };
})();
