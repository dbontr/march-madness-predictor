const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadRuntime(fetchImpl = async () => { throw new Error("Unexpected fetch in unit test"); }) {
  const runtimePath = path.join(__dirname, "..", "docs", "live-runtime.js");
  const code = fs.readFileSync(runtimePath, "utf8");
  const context = {
    window: {},
    console,
    Date,
    Math,
    URLSearchParams,
    AbortController,
    setTimeout,
    clearTimeout,
    fetch: fetchImpl,
  };
  vm.createContext(context);
  vm.runInContext(code, context, { filename: runtimePath });
  return context.window.LiveBracketRuntime;
}

const internals = loadRuntime().__test;

function teamRow(season, team, overrides = {}) {
  return {
    season,
    team,
    seed: 8,
    adj_offense: 110,
    adj_defense: 110,
    tempo: 68,
    sos: 0,
    net_rating: 0,
    q1_wins: 0,
    q2_wins: 0,
    q3_losses: 0,
    q4_losses: 0,
    recent_form: 0.5,
    injuries_impact: 0,
    fg3_pct: 0.34,
    tov_pct: 0.17,
    orb_pct: 0.3,
    drb_pct: 0.7,
    ft_rate: 0.3,
    ast_rate: 0.55,
    stl_rate: 0.09,
    blk_rate: 0.08,
    three_rate: 0.36,
    opp_three_rate: 0.36,
    opp_fg3_pct: 0.34,
    opp_ft_rate: 0.3,
    ...overrides,
  };
}

test("blend renormalizes around unavailable components", () => {
  const result = internals.blendAvailableProbabilities(
    {
      blend_logistic: 0.4,
      blend_tree: 0.35,
      blend_rating: 0.25,
    },
    {
      blend_logistic: 0.8,
      blend_tree: 0.1,
      blend_rating: 0.6,
    },
    {
      blend_logistic: true,
      blend_tree: false,
      blend_rating: true,
    },
  );
  assert.ok(Math.abs(result - ((0.4 * 0.8 + 0.25 * 0.6) / 0.65)) < 1e-12);
});

test("blend returns the active model instead of a hidden 0.5 vote", () => {
  const result = internals.blendAvailableProbabilities(
    { blend_logistic: 0.2, blend_tree: 0.8 },
    { blend_logistic: 0.73, blend_tree: 0.5 },
    { blend_logistic: true, blend_tree: false },
  );
  assert.ok(Math.abs(result - 0.73) < 1e-12);
});
function game(index, date, scoreA, scoreB) {
  return {
    season: 2024,
    team_a: "Alpha",
    team_b: "Beta",
    score_a: scoreA,
    score_b: scoreB,
    neutral_site: 1,
    home_edge_a: 0,
    game_date: date,
    game_index: index,
    round_name: "Regular Season",
  };
}

test("pregame snapshot ignores every game after its cutoff", () => {
  const teamStats = [
    teamRow(2023, "Alpha", { net_rating: 4, adj_offense: 114, adj_defense: 106 }),
    teamRow(2023, "Beta", { net_rating: -4, adj_offense: 106, adj_defense: 114 }),
    teamRow(2024, "Alpha", { net_rating: -35, adj_offense: 82, adj_defense: 138 }),
    teamRow(2024, "Beta", { net_rating: 35, adj_offense: 138, adj_defense: 82 }),
  ];
  const before = game(0, "2024-01-10", 80, 70);
  const after = game(1, "2024-03-10", 40, 130);
  const changedAfter = { ...after, score_a: 150, score_b: 20 };

  const first = internals.buildLeakageSafeSnapshot(
    teamStats,
    [before, after],
    2024,
    { date: "2024-02-01" },
  );
  const second = internals.buildLeakageSafeSnapshot(
    teamStats,
    [before, changedAfter],
    2024,
    { date: "2024-02-01" },
  );

  assert.deepEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(second)));
  const alpha = first.find((row) => row.team === "Alpha");
  assert.equal(alpha.snapshot_games, 1);
  assert.equal(alpha.as_of_date, "2024-02-01");
  assert.notEqual(alpha.net_rating, -35);
});

test("game-index cutoff is strict", () => {
  assert.equal(internals.gameOccursBeforeCutoff({ game_index: 4 }, { game_index: 5 }), true);
  assert.equal(internals.gameOccursBeforeCutoff({ game_index: 5 }, { game_index: 5 }), false);
});

test("earliest season uses neutral priors, not its own final stats", () => {
  const teamStats = [
    teamRow(2024, "Alpha", { adj_offense: 140, adj_defense: 80, net_rating: 40 }),
    teamRow(2024, "Beta", { adj_offense: 80, adj_defense: 140, net_rating: -40 }),
  ];
  const snapshot = internals.buildLeakageSafeSnapshot(teamStats, [], 2024, { game_index: 0 });
  const alpha = snapshot.find((row) => row.team === "Alpha");
  assert.equal(alpha.adj_offense, 110);
  assert.equal(alpha.adj_defense, 110);
  assert.equal(alpha.net_rating, 0);
});

test("undated games do not pass a date-only cutoff", () => {
  assert.equal(
    internals.gameOccursBeforeCutoff({ game_date: "", game_index: 50 }, { date: "2024-02-01" }),
    false,
  );
});

test("live loader prefers compact history without fetching the full file", async () => {
  const requests = [];
  const teamStatsCsv = [
    "season,team,seed,adj_offense,adj_defense,tempo,sos,net_rating",
    "2026,Alpha,1,120,95,68,5,25",
    "2026,Beta,16,95,120,68,-5,-25",
    "",
  ].join("\n");
  const liveHistoryCsv = [
    "season,team_a,team_b,score_a,score_b,neutral_site,round_name,game_date",
    "2026,Alpha,Beta,80,60,1,Regular Season,2025-11-10",
    "",
  ].join("\n");

  const fetchImpl = async (url) => {
    requests.push(String(url));
    let body = "";
    if (String(url).endsWith("team_stats.csv")) body = teamStatsCsv;
    else if (String(url).endsWith("historical_games_live.csv")) body = liveHistoryCsv;
    else if (String(url).endsWith("historical_games.csv")) throw new Error("full history should not be fetched");
    else return { ok: false, status: 404, text: async () => "" };
    return { ok: true, status: 200, text: async () => body };
  };

  const runtime = loadRuntime(fetchImpl);
  const result = await runtime.__test.loadRuntimeData(2026, { prefer_live_history: true });
  assert.equal(result.historical.length, 1);
  assert.ok(requests.some((url) => url.endsWith("historical_games_live.csv")));
  assert.ok(!requests.some((url) => url.endsWith("/historical_games.csv")));
});

test("tournament context includes the safe current-season snapshot", async () => {
  const teamStats = [
    teamRow(2023, "Alpha", { net_rating: 4, adj_offense: 114, adj_defense: 106 }),
    teamRow(2023, "Beta", { net_rating: -4, adj_offense: 106, adj_defense: 114 }),
    teamRow(2024, "Alpha", { net_rating: -35, adj_offense: 82, adj_defense: 138 }),
    teamRow(2024, "Beta", { net_rating: 35, adj_offense: 138, adj_defense: 82 }),
  ];
  const historical = [
    { ...game(0, "2023-01-10", 75, 70), season: 2023 },
    game(0, "2024-01-10", 80, 70),
    { ...game(1, "2024-03-21", 65, 72), round_name: "Round of 64" },
  ];
  const config = {
    tournament_windows: {
      2024: { first_four_start: "2024-03-19", championship_date: "2024-04-08" },
    },
  };

  const contexts = await internals.prepareBacktestContexts(
    teamStats,
    historical,
    {},
    config,
    2025,
    1,
    { tournament_source: "historical_games", strict_no_leakage: true },
  );

  assert.equal(contexts.length, 1);
  const context = contexts[0];
  const currentRows = context.trainStats.filter((row) => row.season === 2024);
  assert.equal(currentRows.length, 2);
  assert.deepEqual(
    JSON.parse(JSON.stringify(currentRows)),
    JSON.parse(JSON.stringify(context.holdoutSnapshot)),
  );
  assert.notEqual(currentRows.find((row) => row.team === "Alpha").net_rating, -35);
  assert.ok(context.trainGames.every((row) => row.season < 2024));
});
test("scoreboard range uses one ESPN request", async () => {
  const requests = [];
  const runtime = loadRuntime(async (url) => {
    requests.push(String(url));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        events: [
          { id: "a", date: "2026-03-17T22:00:00Z" },
          { id: "b", date: "2026-03-19T01:00:00Z" },
        ],
      }),
    };
  });

  const rows = await runtime.__test.fetchScoreboardRange(
    "2026-03-17", "2026-04-08", { cache_minutes: 0 },
  );
  assert.equal(requests.length, 1);
  assert.match(requests[0], /dates=20260317-20260408/);
  assert.deepEqual(rows.map((row) => row.day), ["2026-03-17", "2026-03-19"]);
});
test("scoreboard range falls back to daily requests", async () => {
  const requests = [];
  const runtime = loadRuntime(async (url) => {
    const target = String(url);
    requests.push(target);
    if (target.includes("dates=20260317-20260318")) {
      return { ok: false, status: 503, json: async () => ({}) };
    }
    const compact = target.match(/dates=(\d{8})/)?.[1] || "";
    const day = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
    return {
      ok: true,
      status: 200,
      json: async () => ({ events: [{ id: compact, date: `${day}T20:00:00Z` }] }),
    };
  });

  const rows = await runtime.__test.fetchScoreboardRange(
    "2026-03-17", "2026-03-18", { cache_minutes: 0, concurrency: 2 },
  );
  assert.equal(requests.length, 3);
  assert.equal(rows.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(rows.map((row) => row.day).sort())), ["2026-03-17", "2026-03-18"]);
});
