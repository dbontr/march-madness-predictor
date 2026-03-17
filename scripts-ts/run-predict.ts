import { runLivePrediction } from "../src/server/pipeline";

async function main(): Promise<void> {
  const payload = await runLivePrediction();
  console.log(
    JSON.stringify(
      {
        meta: payload.meta,
        matchup_rows: payload.matchups.length,
        title_rows: payload.title_odds.length,
        best_rows: payload.best_bracket.length,
        logo_rows: Object.keys(payload.team_logos).length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
