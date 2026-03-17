from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import log_loss, roc_auc_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from bracket_logic import resolve_team

DEFAULT_FEATURES = [
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
]


@dataclass
class MatchPrediction:
    slot: str
    round_order: int
    round_name: str
    region: str
    team_a: str
    team_b: str
    p_team_a: float
    p_team_b: float
    winner: str
    is_locked: bool


def normalize_team_stats(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    required = {"season", "team", "seed"}
    missing = required - set(out.columns)
    if missing:
        raise ValueError(f"team_stats.csv missing required columns: {sorted(missing)}")

    out["season"] = out["season"].astype(int)
    out["team"] = out["team"].astype(str).str.strip()

    for col in DEFAULT_FEATURES:
        if col not in out.columns:
            out[col] = np.nan

    if out["net_rating"].isna().all():
        if "adj_offense" in out.columns and "adj_defense" in out.columns:
            out["net_rating"] = out["adj_offense"] - out["adj_defense"]

    return out


def normalize_games(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    required = {"season", "team_a", "team_b", "score_a", "score_b"}
    missing = required - set(out.columns)
    if missing:
        raise ValueError(f"historical_games.csv missing required columns: {sorted(missing)}")
    out["season"] = out["season"].astype(int)
    out["team_a"] = out["team_a"].astype(str).str.strip()
    out["team_b"] = out["team_b"].astype(str).str.strip()
    if "neutral_site" not in out.columns:
        out["neutral_site"] = 1
    return out


def apply_injuries(team_stats: pd.DataFrame, injuries: Optional[pd.DataFrame], season: int) -> pd.DataFrame:
    out = team_stats.copy()
    if injuries is None or injuries.empty:
        return out
    if not {"team", "injuries_impact"}.issubset(injuries.columns):
        raise ValueError("injuries.csv must include team and injuries_impact")
    inj = injuries.copy()
    inj["team"] = inj["team"].astype(str).str.strip()
    inj = inj[["team", "injuries_impact"]].drop_duplicates(subset=["team"], keep="last")
    mask = out["season"] == int(season)
    merged = out.loc[mask, ["team", "injuries_impact"]].merge(
        inj, on="team", how="left", suffixes=("", "_override")
    )
    out.loc[mask, "injuries_impact"] = merged["injuries_impact_override"].combine_first(merged["injuries_impact"]).values
    return out


def build_training_frame(team_stats: pd.DataFrame, historical_games: pd.DataFrame, feature_cols: List[str]) -> pd.DataFrame:
    stats = team_stats.copy()
    games = historical_games.copy()

    a_stats = stats[["season", "team"] + feature_cols].rename(
        columns={c: f"a_{c}" for c in feature_cols} | {"team": "team_a"}
    )
    b_stats = stats[["season", "team"] + feature_cols].rename(
        columns={c: f"b_{c}" for c in feature_cols} | {"team": "team_b"}
    )

    merged = games.merge(a_stats, on=["season", "team_a"], how="inner")
    merged = merged.merge(b_stats, on=["season", "team_b"], how="inner")
    if merged.empty:
        raise ValueError("No historical games matched team_stats.csv. Check team naming.")

    merged["team_a_won"] = (merged["score_a"] > merged["score_b"]).astype(int)
    for col in feature_cols:
        merged[f"diff_{col}"] = merged[f"a_{col}"] - merged[f"b_{col}"]
    merged["seed_gap"] = merged["b_seed"] - merged["a_seed"]
    merged["neutral_site"] = merged.get("neutral_site", 1)

    reverse = merged.copy()
    reverse["team_a"], reverse["team_b"] = merged["team_b"], merged["team_a"]
    reverse["score_a"], reverse["score_b"] = merged["score_b"], merged["score_a"]
    reverse["team_a_won"] = 1 - merged["team_a_won"]
    for col in feature_cols:
        reverse[f"diff_{col}"] = -merged[f"diff_{col}"]
    reverse["seed_gap"] = -merged["seed_gap"]

    return pd.concat([merged, reverse], ignore_index=True)


def build_model(feature_names: List[str]) -> Pipeline:
    preprocessor = ColumnTransformer(
        transformers=[
            (
                "num",
                Pipeline(
                    steps=[
                        ("imputer", SimpleImputer(strategy="median")),
                        ("scaler", StandardScaler()),
                    ]
                ),
                feature_names,
            )
        ],
        remainder="drop",
    )
    return Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            ("model", LogisticRegression(max_iter=600, C=1.0, solver="lbfgs")),
        ]
    )


def train_matchup_model(team_stats: pd.DataFrame, historical_games: pd.DataFrame, feature_cols: List[str]) -> Tuple[Pipeline, List[str], Dict[str, float]]:
    frame = build_training_frame(team_stats, historical_games, feature_cols)
    model_features = [f"diff_{c}" for c in feature_cols] + ["seed_gap", "neutral_site"]
    model = build_model(model_features)
    x = frame[model_features]
    y = frame["team_a_won"]
    model.fit(x, y)
    proba = model.predict_proba(x)[:, 1]
    metrics = {
        "log_loss": float(log_loss(y, proba)),
        "roc_auc": float(roc_auc_score(y, proba)),
        "training_games": int(len(frame)),
    }
    return model, model_features, metrics


def season_snapshot(team_stats: pd.DataFrame, season: int) -> pd.DataFrame:
    snap = team_stats[team_stats["season"] == int(season)].copy()
    if snap.empty:
        raise ValueError(f"No team stats found for season {season}")
    return snap.drop_duplicates(subset=["team"], keep="last")


def matchup_feature_row(snap: pd.DataFrame, team_a: str, team_b: str, feature_cols: List[str]) -> pd.DataFrame:
    row_a = snap[snap["team"] == team_a]
    row_b = snap[snap["team"] == team_b]
    if row_a.empty:
        raise KeyError(f"Missing team in season snapshot: {team_a}")
    if row_b.empty:
        raise KeyError(f"Missing team in season snapshot: {team_b}")
    row_a = row_a.iloc[0]
    row_b = row_b.iloc[0]
    data = {f"diff_{c}": [float(row_a[c]) - float(row_b[c])] for c in feature_cols}
    data["seed_gap"] = [float(row_b["seed"]) - float(row_a["seed"])]
    data["neutral_site"] = [1.0]
    return pd.DataFrame(data)


def predict_matchup(model: Pipeline, snap: pd.DataFrame, team_a: str, team_b: str, feature_cols: List[str]) -> float:
    x = matchup_feature_row(snap, team_a, team_b, feature_cols)
    return float(model.predict_proba(x)[:, 1][0])


def simulate_tournament(
    model: Pipeline,
    bracket: pd.DataFrame,
    snap: pd.DataFrame,
    feature_cols: List[str],
    simulations: int,
    random_seed: int,
    locked_winners: Optional[Dict[str, str]] = None,
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    rng = np.random.default_rng(random_seed)
    locked_winners = dict(locked_winners or {})
    sim_rows: List[Dict[str, object]] = []
    advancement_counts: Dict[Tuple[str, int], int] = {}
    bracket_paths: Dict[str, int] = {}

    ordered = bracket.sort_values(["round_order", "slot"]).reset_index(drop=True)
    max_round = int(ordered["round_order"].max())
    prob_cache: Dict[Tuple[str, str], float] = {}

    def cached_prob(team_a: str, team_b: str) -> float:
        key = (team_a, team_b)
        if key not in prob_cache:
            prob = predict_matchup(model, snap, team_a, team_b, feature_cols)
            prob_cache[(team_a, team_b)] = prob
            prob_cache[(team_b, team_a)] = 1.0 - prob
        return prob_cache[key]

    for sim_id in range(simulations):
        winners: Dict[str, str] = dict(locked_winners)
        path = []
        for _, row in ordered.iterrows():
            slot = str(row["slot"])
            team_a = resolve_team(row["team_a"], winners)
            team_b = resolve_team(row["team_b"], winners)
            p_team_a = cached_prob(team_a, team_b)
            if slot in locked_winners:
                winner = locked_winners[slot]
                is_locked = True
            else:
                winner = team_a if rng.random() < p_team_a else team_b
                winners[slot] = winner
                is_locked = False
            if slot not in winners:
                winners[slot] = winner
            path.append({slot: winner})
            advancement_counts[(winner, int(row["round_order"]))] = advancement_counts.get((winner, int(row["round_order"])), 0) + 1
            sim_rows.append(
                {
                    "simulation": sim_id,
                    "slot": slot,
                    "round_order": int(row["round_order"]),
                    "round_name": str(row["round_name"]),
                    "region": str(row["region"]),
                    "team_a": team_a,
                    "team_b": team_b,
                    "p_team_a": p_team_a,
                    "p_team_b": 1.0 - p_team_a,
                    "winner": winner,
                    "is_locked": is_locked,
                }
            )
        bracket_paths[json.dumps(path, sort_keys=True)] = bracket_paths.get(json.dumps(path, sort_keys=True), 0) + 1

    sim_df = pd.DataFrame(sim_rows)
    teams = sorted(set(snap["team"]))
    advancement_rows: List[Dict[str, object]] = []
    for team in teams:
        row: Dict[str, object] = {"team": team}
        for round_num in range(1, max_round + 1):
            row[f"reach_round_{round_num}"] = advancement_counts.get((team, round_num), 0) / simulations
        advancement_rows.append(row)
    advancement = pd.DataFrame(advancement_rows).sort_values(f"reach_round_{max_round}", ascending=False)

    summary = (
        sim_df.groupby(["slot", "round_order", "round_name", "region", "team_a", "team_b"], as_index=False)
        .agg(
            p_team_a=("p_team_a", "mean"),
            p_team_b=("p_team_b", "mean"),
            team_a_win_rate=("winner", lambda s: (s == s.iloc[0]).mean()),
            is_locked=("is_locked", "max"),
        )
    )
    summary["team_b_win_rate"] = 1.0 - summary["team_a_win_rate"]
    summary["winner"] = np.where(summary["team_a_win_rate"] >= 0.5, summary["team_a"], summary["team_b"])

    best_key = max(bracket_paths, key=bracket_paths.get)
    best_items = json.loads(best_key)
    best_rows = []
    for item in best_items:
        slot, winner = next(iter(item.items()))
        row = ordered[ordered["slot"] == slot].iloc[0]
        best_rows.append(
            {
                "slot": slot,
                "round_order": int(row["round_order"]),
                "round_name": str(row["round_name"]),
                "region": str(row["region"]),
                "winner": winner,
                "is_locked": bool(slot in locked_winners),
            }
        )
    best_bracket = pd.DataFrame(best_rows).sort_values(["round_order", "slot"]).reset_index(drop=True)

    return summary, advancement.reset_index(drop=True), best_bracket
