from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional, Tuple

import pandas as pd
import requests
from bs4 import BeautifulSoup

from bracket_logic import REGION_ORDER, build_bracket_from_region_seed_map, game_pair_key

ESPN_BRACKET_URL = "https://www.espn.com/mens-college-basketball/bracket/_/season/{season}/{season}-ncaa-tournament"
ESPN_SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard"
ESPN_TEAMS_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams"


class FetchError(RuntimeError):
    pass


def canonical_name(value: str) -> str:
    text = str(value).strip().lower()
    text = text.replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def load_alias_map(path: Optional[str]) -> Dict[str, str]:
    if not path:
        return {}
    try:
        df = pd.read_csv(path)
    except FileNotFoundError:
        return {}
    required = {"canonical", "alias"}
    if not required.issubset(df.columns):
        raise ValueError("aliases.csv must have canonical and alias columns")
    mapping: Dict[str, str] = {}
    for _, row in df.iterrows():
        canonical = str(row["canonical"]).strip()
        alias = canonical_name(str(row["alias"]))
        mapping[alias] = canonical
        mapping[canonical_name(canonical)] = canonical
    return mapping


def maybe_alias(name: str, alias_map: Dict[str, str]) -> str:
    norm = canonical_name(name)
    return alias_map.get(norm, str(name).strip())


def parse_matchup_line(text: str) -> Optional[Dict[str, object]]:
    line = " ".join(str(text).replace("\xa0", " ").split())
    if not line:
        return None
    tokens = line.split()
    cutoff = None
    for idx, token in enumerate(tokens):
        if token in {"Mar", "Apr"}:
            cutoff = idx
            break
    if cutoff is not None:
        tokens = tokens[:cutoff]
    seed_positions = [i for i, tok in enumerate(tokens) if tok.isdigit() and 1 <= int(tok) <= 16]
    if len(seed_positions) < 2:
        return None
    p1, p2 = seed_positions[0], seed_positions[1]
    seed_a = int(tokens[p1])
    seed_b = int(tokens[p2])
    team_a = " ".join(tokens[p1 + 1 : p2]).strip()
    team_b = " ".join(tokens[p2 + 1 :]).strip()
    if not team_a or not team_b:
        return None
    return {
        "seed_a": seed_a,
        "seed_b": seed_b,
        "team_a": team_a,
        "team_b": team_b,
        "raw": line,
    }


def fetch_bracket_from_espn(season: int) -> pd.DataFrame:
    url = ESPN_BRACKET_URL.format(season=season)
    response = requests.get(url, timeout=30)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")
    lines = [line.strip() for line in soup.get_text("\n").splitlines() if line.strip()]

    current_section: Optional[str] = None
    current_region: Optional[str] = None
    pending_first_four: Optional[Dict[str, object]] = None
    region_games: Dict[str, List[Dict[str, object]]] = {region: [] for region in REGION_ORDER}
    first_four: List[Tuple[str, str, str, int]] = []

    for line in lines:
        upper = line.upper()
        if line == "First Four":
            current_section = "FIRST_FOUR"
            current_region = None
            continue
        if upper in REGION_ORDER:
            if current_section == "FIRST_FOUR" and pending_first_four:
                first_four.append(
                    (
                        str(pending_first_four["team_a"]),
                        str(pending_first_four["team_b"]),
                        upper,
                        int(pending_first_four["seed"]),
                    )
                )
                pending_first_four = None
            else:
                current_region = upper
                current_section = "MAIN"
            continue
        parsed = parse_matchup_line(line)
        if not parsed:
            continue
        if current_section == "FIRST_FOUR":
            if parsed["seed_a"] != parsed["seed_b"]:
                continue
            pending_first_four = {
                "team_a": parsed["team_a"],
                "team_b": parsed["team_b"],
                "seed": parsed["seed_a"],
            }
            continue
        if current_section == "MAIN" and current_region in REGION_ORDER and len(region_games[current_region]) < 8:
            region_games[current_region].append(parsed)

    if pending_first_four:
        raise FetchError("Bracket scrape found an unassigned First Four game.")
    if any(len(region_games[region]) != 8 for region in REGION_ORDER):
        counts = {region: len(items) for region, items in region_games.items()}
        raise FetchError(f"Bracket scrape failed to capture all regions: {counts}")

    region_seed_map: Dict[str, Dict[int, str]] = {}
    for region in REGION_ORDER:
        seed_map: Dict[int, str] = {}
        for game in region_games[region]:
            seed_map[int(game["seed_a"])] = str(game["team_a"])
            seed_map[int(game["seed_b"])] = str(game["team_b"])
        region_seed_map[region] = seed_map

    return build_bracket_from_region_seed_map(region_seed_map, first_four_pairs=first_four)


def fetch_completed_results(first_day: str, last_day: str, alias_map: Optional[Dict[str, str]] = None) -> Dict[frozenset[str], str]:
    alias_map = alias_map or {}
    start = datetime.strptime(first_day, "%Y-%m-%d").date()
    end = datetime.strptime(last_day, "%Y-%m-%d").date()
    known: Dict[frozenset[str], str] = {}
    day = start
    while day <= end:
        params = {
            "dates": day.strftime("%Y%m%d"),
            "groups": 50,
            "limit": 500,
        }
        response = requests.get(ESPN_SCOREBOARD_URL, params=params, timeout=30)
        response.raise_for_status()
        payload = response.json()
        for event in payload.get("events", []):
            status = event.get("status", {}).get("type", {}).get("name", "")
            if status != "STATUS_FINAL":
                continue
            competitors = event.get("competitions", [{}])[0].get("competitors", [])
            if len(competitors) != 2:
                continue
            names = []
            winner = None
            for comp in competitors:
                team = comp.get("team", {})
                display = team.get("shortDisplayName") or team.get("displayName") or team.get("name")
                if not display:
                    continue
                display = maybe_alias(display, alias_map)
                names.append(display)
                if comp.get("winner"):
                    winner = display
            if len(names) == 2 and winner:
                known[game_pair_key(names[0], names[1])] = winner
        day += timedelta(days=1)
    return known


def fetch_team_logo_map(target_teams: List[str], alias_map: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    alias_map = alias_map or {}
    response = requests.get(ESPN_TEAMS_URL, params={"limit": 1000}, timeout=30)
    response.raise_for_status()
    payload = response.json()

    team_entries = payload.get("sports", [{}])[0].get("leagues", [{}])[0].get("teams", [])
    lookup: Dict[str, str] = {}

    for entry in team_entries:
        team = entry.get("team", {})
        logos = team.get("logos") or []
        if not logos:
            continue
        logo_url = str(logos[0].get("href", "")).strip()
        if not logo_url:
            continue

        candidate_names = {
            team.get("displayName"),
            team.get("shortDisplayName"),
            team.get("nickname"),
            team.get("location"),
            team.get("abbreviation"),
        }
        location = str(team.get("location", "")).strip()
        mascot = str(team.get("name", "")).strip()
        if location and mascot:
            candidate_names.add(f"{location} {mascot}")

        for raw_name in candidate_names:
            if not raw_name:
                continue
            aliased = maybe_alias(str(raw_name), alias_map)
            lookup[canonical_name(aliased)] = logo_url

    result: Dict[str, str] = {}
    for team_name in sorted(set(str(t).strip() for t in target_teams if str(t).strip())):
        key = canonical_name(maybe_alias(team_name, alias_map))
        logo = lookup.get(key)
        if logo:
            result[team_name] = logo

    return result
