const assert = require("node:assert/strict");
const test = require("node:test");

const { buildLiveRows, parseCsv, toCsv } = require("../scripts/build_live_history.js");

function row(season, index) {
  return {
    season: String(season),
    team_a: `A${index}`,
    team_b: `B${index}`,
    score_a: "70",
    score_b: "60",
    game_date: `${season - 1}-11-${String(index + 1).padStart(2, "0")}`,
    round_name: "Regular Season",
    __source_index: index,
  };
}

test("live history keeps only configured seasons and cap", () => {
  const rows = [
    ...Array.from({ length: 4 }, (_, index) => row(2024, index)),
    ...Array.from({ length: 4 }, (_, index) => row(2025, index)),
    ...Array.from({ length: 4 }, (_, index) => row(2026, index)),
  ];
  const result = buildLiveRows(rows, {
    targetSeason: 2026,
    maxSeasons: 2,
    gameCap: 5,
    includePostseason: true,
  });

  assert.equal(result.length, 5);
  assert.deepEqual([...new Set(result.map((item) => Number(item.season)))], [2025, 2026]);
});

test("CSV round-trip preserves quoted values", () => {
  const header = ["season", "team_a", "team_b"];
  const csv = toCsv(header, [{ season: 2026, team_a: "Saint Mary's", team_b: "A, B" }]);
  const parsed = parseCsv(csv);
  assert.equal(parsed.rows[0].team_b, "A, B");
  assert.equal(parsed.rows[0].team_a, "Saint Mary's");
});
