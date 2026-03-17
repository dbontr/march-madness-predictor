from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Tuple

import pandas as pd

REGION_ORDER = ["EAST", "WEST", "SOUTH", "MIDWEST"]
FIRST_ROUND_SEED_PAIRS = [
    (1, 16),
    (8, 9),
    (5, 12),
    (4, 13),
    (6, 11),
    (3, 14),
    (7, 10),
    (2, 15),
]
ROUND_NAMES = {
    0: "First Four",
    1: "Round of 64",
    2: "Round of 32",
    3: "Sweet 16",
    4: "Elite Eight",
    5: "Final Four",
    6: "Championship",
}


@dataclass
class BracketGame:
    slot: str
    round_order: int
    round_name: str
    region: str
    team_a: str
    team_b: str


def _slot(region: str, prefix: str, idx: int) -> str:
    return f"{prefix}_{region}_{idx}"


def build_bracket_from_region_seed_map(
    region_seed_map: Dict[str, Dict[int, str]],
    first_four_pairs: Optional[List[Tuple[str, str, str, int]]] = None,
) -> pd.DataFrame:
    """
    Parameters
    ----------
    region_seed_map:
        {"EAST": {1: "Duke", 16: "Siena", ...}, ...}
    first_four_pairs:
        list of tuples: (team_a, team_b, region, seed)

    Returns
    -------
    DataFrame with columns:
        slot, round_order, round_name, region, team_a, team_b
    """
    first_four_pairs = first_four_pairs or []
    ff_lookup: Dict[Tuple[str, int], str] = {}
    rows: List[Dict[str, str | int]] = []

    for idx, (team_a, team_b, region, seed) in enumerate(first_four_pairs, start=1):
        slot = f"FF_{idx}"
        ff_lookup[(region.upper(), int(seed))] = f"@slot:{slot}"
        rows.append(
            {
                "slot": slot,
                "round_order": 0,
                "round_name": ROUND_NAMES[0],
                "region": region.upper(),
                "team_a": team_a,
                "team_b": team_b,
            }
        )

    for region in REGION_ORDER:
        seeds = region_seed_map[region]
        first_round_slots = []
        for idx, (seed_a, seed_b) in enumerate(FIRST_ROUND_SEED_PAIRS, start=1):
            slot = _slot(region, "R1", idx)
            first_round_slots.append(slot)
            team_a = ff_lookup.get((region, seed_a), seeds.get(seed_a, "TBD"))
            team_b = ff_lookup.get((region, seed_b), seeds.get(seed_b, "TBD"))
            rows.append(
                {
                    "slot": slot,
                    "round_order": 1,
                    "round_name": ROUND_NAMES[1],
                    "region": region,
                    "team_a": team_a,
                    "team_b": team_b,
                }
            )

        r2_slots = []
        for idx in range(0, len(first_round_slots), 2):
            slot = _slot(region, "R2", idx // 2 + 1)
            r2_slots.append(slot)
            rows.append(
                {
                    "slot": slot,
                    "round_order": 2,
                    "round_name": ROUND_NAMES[2],
                    "region": region,
                    "team_a": f"@slot:{first_round_slots[idx]}",
                    "team_b": f"@slot:{first_round_slots[idx + 1]}",
                }
            )

        r3_slots = []
        for idx in range(0, len(r2_slots), 2):
            slot = _slot(region, "R3", idx // 2 + 1)
            r3_slots.append(slot)
            rows.append(
                {
                    "slot": slot,
                    "round_order": 3,
                    "round_name": ROUND_NAMES[3],
                    "region": region,
                    "team_a": f"@slot:{r2_slots[idx]}",
                    "team_b": f"@slot:{r2_slots[idx + 1]}",
                }
            )

        rows.append(
            {
                "slot": _slot(region, "R4", 1),
                "round_order": 4,
                "round_name": ROUND_NAMES[4],
                "region": region,
                "team_a": f"@slot:{r3_slots[0]}",
                "team_b": f"@slot:{r3_slots[1]}",
            }
        )

    final_four_pairs = [("EAST", "WEST"), ("SOUTH", "MIDWEST")]
    ff_slots: List[str] = []
    for idx, (region_a, region_b) in enumerate(final_four_pairs, start=1):
        slot = f"R5_{idx}"
        ff_slots.append(slot)
        rows.append(
            {
                "slot": slot,
                "round_order": 5,
                "round_name": ROUND_NAMES[5],
                "region": "FINAL_FOUR",
                "team_a": f"@slot:{_slot(region_a, 'R4', 1)}",
                "team_b": f"@slot:{_slot(region_b, 'R4', 1)}",
            }
        )

    rows.append(
        {
            "slot": "TITLE",
            "round_order": 6,
            "round_name": ROUND_NAMES[6],
            "region": "TITLE",
            "team_a": f"@slot:{ff_slots[0]}",
            "team_b": f"@slot:{ff_slots[1]}",
        }
    )

    return pd.DataFrame(rows).sort_values(["round_order", "slot"]).reset_index(drop=True)


def resolve_team(ref: str, winners: Dict[str, str]) -> str:
    ref = str(ref).strip()
    if ref.startswith("@slot:"):
        slot = ref.split(":", 1)[1]
        return winners[slot]
    return ref


def game_pair_key(team_a: str, team_b: str) -> frozenset[str]:
    return frozenset([str(team_a).strip().lower(), str(team_b).strip().lower()])


def apply_known_results(bracket: pd.DataFrame, known_winners: Dict[frozenset[str], str]) -> Dict[str, str]:
    winners: Dict[str, str] = {}
    ordered = bracket.sort_values(["round_order", "slot"])
    for _, row in ordered.iterrows():
        try:
            team_a = resolve_team(row["team_a"], winners)
            team_b = resolve_team(row["team_b"], winners)
        except KeyError:
            continue
        key = game_pair_key(team_a, team_b)
        if key in known_winners:
            winners[str(row["slot"])] = known_winners[key]
    return winners


def bracket_state_rows(bracket: pd.DataFrame, winners: Dict[str, str]) -> List[Dict[str, str | int | bool]]:
    rows = []
    resolved: Dict[str, str] = {}
    ordered = bracket.sort_values(["round_order", "slot"])
    for _, row in ordered.iterrows():
        slot = str(row["slot"])
        try:
            team_a = resolve_team(row["team_a"], resolved)
            team_b = resolve_team(row["team_b"], resolved)
        except KeyError:
            team_a = str(row["team_a"])
            team_b = str(row["team_b"])
        winner = winners.get(slot)
        if winner:
            resolved[slot] = winner
        rows.append(
            {
                "slot": slot,
                "round_order": int(row["round_order"]),
                "round_name": str(row["round_name"]),
                "region": str(row["region"]),
                "team_a": team_a,
                "team_b": team_b,
                "winner": winner or "",
                "is_final": bool(winner),
            }
        )
    return rows


def seed_summary_from_bracket(bracket: pd.DataFrame) -> List[Tuple[str, str]]:
    rows: List[Tuple[str, str]] = []
    for _, row in bracket[bracket["round_order"] == 1].iterrows():
        rows.append((str(row["team_a"]), str(row["team_b"])))
    return rows
