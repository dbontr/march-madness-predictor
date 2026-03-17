from __future__ import annotations

import json
from pathlib import Path
from typing import Dict

import pandas as pd


def percent_rank_notes(row: pd.Series, champ_col: str) -> str:
    prob = float(row.get(champ_col, 0.0))
    if prob >= 0.15:
        return "Tier 1 title profile"
    if prob >= 0.08:
        return "Strong contender"
    if prob >= 0.04:
        return "Live dark horse"
    return "Long-shot path"


def export_site_json(
    docs_data_dir: Path,
    season: int,
    simulations: int,
    updated_at: str,
    matchup_summary: pd.DataFrame,
    advancement: pd.DataFrame,
    best_bracket: pd.DataFrame,
    metrics: Dict[str, float],
    team_logos: Dict[str, str] | None = None,
) -> None:
    docs_data_dir.mkdir(parents=True, exist_ok=True)
    team_logos = team_logos or {}

    max_round = max(int(col.replace("reach_round_", "")) for col in advancement.columns if col.startswith("reach_round_"))
    champ_col = f"reach_round_{max_round}"

    title_odds = (
        advancement[["team", champ_col]]
        .rename(columns={champ_col: "title_prob"})
        .sort_values("title_prob", ascending=False)
        .head(16)
        .reset_index(drop=True)
    )
    title_odds["note"] = title_odds.apply(lambda row: percent_rank_notes(row, "title_prob"), axis=1)

    summary_payload = {
        "meta": {
            "season": int(season),
            "simulations": int(simulations),
            "updated_at": updated_at,
            "training_metrics": metrics,
            "team_logos_count": len(team_logos),
        },
        "matchups": matchup_summary.sort_values(["round_order", "slot"]).to_dict(orient="records"),
    }
    with (docs_data_dir / "summary.json").open("w", encoding="utf-8") as f:
        json.dump(summary_payload, f, indent=2)

    with (docs_data_dir / "title_odds.json").open("w", encoding="utf-8") as f:
        json.dump({"title_odds": title_odds.to_dict(orient="records")}, f, indent=2)

    with (docs_data_dir / "best_bracket.json").open("w", encoding="utf-8") as f:
        json.dump({"best_bracket": best_bracket.sort_values(["round_order", "slot"]).to_dict(orient="records")}, f, indent=2)

    with (docs_data_dir / "team_logos.json").open("w", encoding="utf-8") as f:
        json.dump({"team_logos": team_logos}, f, indent=2)
