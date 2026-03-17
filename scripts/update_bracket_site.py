from __future__ import annotations

import argparse
import json
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Dict, Optional

import pandas as pd

from bracket_logic import apply_known_results
from build_site_data import export_site_json
from predictor import (
    DEFAULT_FEATURES,
    apply_injuries,
    normalize_games,
    normalize_team_stats,
    season_snapshot,
    simulate_tournament,
    train_matchup_model,
)
from public_sources import FetchError, fetch_bracket_from_espn, fetch_completed_results, load_alias_map, maybe_alias


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def load_config(root: Path) -> Dict[str, object]:
    with (root / "config.json").open("r", encoding="utf-8") as f:
        return json.load(f)


def determine_season(explicit: Optional[int]) -> int:
    if explicit is not None:
        return int(explicit)
    today = date.today()
    return today.year


def normalize_names(df: pd.DataFrame, columns: list[str], alias_map: Dict[str, str]) -> pd.DataFrame:
    out = df.copy()
    for col in columns:
        if col in out.columns:
            out[col] = out[col].astype(str).map(lambda v: maybe_alias(v, alias_map))
    return out


def load_optional_csv(path: Path) -> Optional[pd.DataFrame]:
    if not path.exists():
        return None
    return pd.read_csv(path)


def default_window_for_season(config: Dict[str, object], season: int) -> tuple[str, str]:
    tournament_windows = config.get("tournament_windows", {})
    season_key = str(season)
    if season_key in tournament_windows:
        info = tournament_windows[season_key]
        return info["first_four_start"], info["championship_date"]
    return f"{season}-03-15", f"{season}-04-08"


def main() -> None:
    parser = argparse.ArgumentParser(description="Update GitHub Pages bracket data")
    parser.add_argument("--season", type=int, default=None)
    parser.add_argument("--simulations", type=int, default=None)
    parser.add_argument("--random-seed", type=int, default=42)
    parser.add_argument("--skip-public-fetch", action="store_true")
    parser.add_argument("--write-bracket-cache", action="store_true")
    args = parser.parse_args()

    root = repo_root()
    config = load_config(root)
    season = determine_season(args.season)
    simulations = int(args.simulations or config.get("default_simulations", 20000))
    raw_dir = root / str(config.get("data_dir", "data/raw")) / str(season)
    docs_data_dir = root / str(config.get("docs_data_dir", "docs/data"))
    generated_dir = root / "data" / "generated" / str(season)
    generated_dir.mkdir(parents=True, exist_ok=True)

    alias_map = load_alias_map(str(raw_dir / "aliases.csv"))

    team_stats = normalize_team_stats(pd.read_csv(raw_dir / "team_stats.csv"))
    historical_games = normalize_games(pd.read_csv(raw_dir / "historical_games.csv"))
    injuries = load_optional_csv(raw_dir / "injuries.csv")

    team_stats = normalize_names(team_stats, ["team"], alias_map)
    historical_games = normalize_names(historical_games, ["team_a", "team_b"], alias_map)
    if injuries is not None:
        injuries = normalize_names(injuries, ["team"], alias_map)

    bracket_cache_path = raw_dir / "bracket.csv"
    if args.skip_public_fetch:
        if not bracket_cache_path.exists():
            raise FileNotFoundError(f"No cached bracket found at {bracket_cache_path}")
        bracket = pd.read_csv(bracket_cache_path)
    else:
        try:
            bracket = fetch_bracket_from_espn(season)
            if args.write_bracket_cache or not bracket_cache_path.exists():
                bracket.to_csv(bracket_cache_path, index=False)
        except Exception as exc:
            if bracket_cache_path.exists():
                print(f"Bracket fetch failed; falling back to cached bracket.csv: {exc}")
                bracket = pd.read_csv(bracket_cache_path)
            else:
                raise FetchError(f"Could not fetch bracket and no fallback exists: {exc}") from exc

    bracket = normalize_names(bracket, ["team_a", "team_b"], alias_map)

    team_stats = apply_injuries(team_stats, injuries, season)

    snapshot = season_snapshot(team_stats, season)
    bracket_teams = sorted(
        {
            team
            for col in ["team_a", "team_b"]
            for team in bracket[col].astype(str)
            if team != "TBD" and not str(team).startswith("@slot:")
        }
    )
    snapshot_teams = set(snapshot["team"].astype(str))
    missing = [team for team in bracket_teams if team not in snapshot_teams]
    if missing:
        raise ValueError(
            "Some bracket teams are missing from team_stats.csv for this season: " + ", ".join(missing)
        )

    model, feature_cols, metrics = train_matchup_model(team_stats, historical_games, DEFAULT_FEATURES)

    start_day, end_day = default_window_for_season(config, season)
    try:
        known_results = {} if args.skip_public_fetch else fetch_completed_results(start_day, end_day, alias_map=alias_map)
    except Exception as exc:
        print(f"Result fetch failed; continuing without locked results: {exc}")
        known_results = {}

    locked_winners = apply_known_results(bracket, known_results)

    matchup_summary, advancement, best_bracket = simulate_tournament(
        model=model,
        bracket=bracket,
        snap=snapshot,
        feature_cols=DEFAULT_FEATURES,
        simulations=simulations,
        random_seed=args.random_seed,
        locked_winners=locked_winners,
    )

    updated_at = datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    matchup_summary.to_csv(generated_dir / "matchup_summary.csv", index=False)
    advancement.to_csv(generated_dir / "team_advancement_odds.csv", index=False)
    best_bracket.to_csv(generated_dir / "best_bracket.csv", index=False)
    with (generated_dir / "training_metrics.json").open("w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2)

    export_site_json(
        docs_data_dir=docs_data_dir,
        season=season,
        simulations=simulations,
        updated_at=updated_at,
        matchup_summary=matchup_summary,
        advancement=advancement,
        best_bracket=best_bracket,
        metrics=metrics,
    )

    champion_col = max((c for c in advancement.columns if c.startswith("reach_round_")), key=lambda c: int(c.split("_")[-1]))
    print("Top title odds")
    print(advancement[["team", champion_col]].sort_values(champion_col, ascending=False).head(10).to_string(index=False))
    print(f"\nWrote site JSON to {docs_data_dir}")
    print(f"Wrote CSV outputs to {generated_dir}")


if __name__ == "__main__":
    main()
