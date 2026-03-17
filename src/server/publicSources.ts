import * as cheerio from "cheerio";

import { buildBracketFromRegionSeedMap, gamePairKey, REGION_ORDER } from "./bracket";
import { BracketGame } from "./types";

const ESPN_BRACKET_URL =
  "https://www.espn.com/mens-college-basketball/bracket/_/season/{season}/{season}-ncaa-tournament";
const ESPN_SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard";
const ESPN_TEAMS_URL =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams";

export class FetchError extends Error {}

export function canonicalName(value: string): string {
  return String(value)
    .trim()
    .toLowerCase()
    .replaceAll("&", " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function loadAliasMap(aliasRows: Array<Record<string, string>>): Record<string, string> {
  const map: Record<string, string> = {};
  for (const row of aliasRows) {
    const canonical = String(row.canonical ?? "").trim();
    const alias = String(row.alias ?? "").trim();
    if (!canonical || !alias) {
      continue;
    }
    map[canonicalName(alias)] = canonical;
    map[canonicalName(canonical)] = canonical;
  }
  return map;
}

export function maybeAlias(name: string, aliasMap: Record<string, string>): string {
  const key = canonicalName(name);
  return aliasMap[key] ?? String(name).trim();
}

interface ParsedMatchupLine {
  seed_a: number;
  seed_b: number;
  team_a: string;
  team_b: string;
}

function parseMatchupLine(text: string): ParsedMatchupLine | null {
  let line = String(text).replaceAll("\u00A0", " ");
  line = line.split(/\s+/).filter(Boolean).join(" ");
  if (!line) {
    return null;
  }

  let tokens = line.split(" ");
  const monthIndex = tokens.findIndex((token) => token === "Mar" || token === "Apr");
  if (monthIndex >= 0) {
    tokens = tokens.slice(0, monthIndex);
  }

  const seedPositions = tokens
    .map((token, index) => ({ token, index }))
    .filter(({ token }) => /^\d+$/.test(token) && Number(token) >= 1 && Number(token) <= 16)
    .map(({ index }) => index);

  if (seedPositions.length < 2) {
    return null;
  }

  const [p1, p2] = seedPositions;
  const seedA = Number(tokens[p1]);
  const seedB = Number(tokens[p2]);
  const teamA = tokens.slice(p1 + 1, p2).join(" ").trim();
  const teamB = tokens.slice(p2 + 1).join(" ").trim();

  if (!teamA || !teamB) {
    return null;
  }

  return {
    seed_a: seedA,
    seed_b: seedB,
    team_a: teamA,
    team_b: teamB,
  };
}

function extractHtmlLines(html: string): string[] {
  const $ = cheerio.load(html);
  const text = $.root().text();
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function fetchBracketFromEspn(season: number): Promise<BracketGame[]> {
  const url = ESPN_BRACKET_URL.replaceAll("{season}", String(season));
  const response = await fetch(url);
  if (!response.ok) {
    throw new FetchError(`Failed to fetch bracket page: HTTP ${response.status}`);
  }

  const html = await response.text();
  const lines = extractHtmlLines(html);

  let currentSection: "FIRST_FOUR" | "MAIN" | null = null;
  let currentRegion: string | null = null;
  let pendingFirstFour: ParsedMatchupLine | null = null;

  const regionGames: Record<string, ParsedMatchupLine[]> = {
    EAST: [],
    WEST: [],
    SOUTH: [],
    MIDWEST: [],
  };

  const firstFour: Array<[string, string, string, number]> = [];

  for (const line of lines) {
    const upper = line.toUpperCase();

    if (line === "First Four") {
      currentSection = "FIRST_FOUR";
      currentRegion = null;
      continue;
    }

    if (REGION_ORDER.includes(upper as (typeof REGION_ORDER)[number])) {
      if (currentSection === "FIRST_FOUR" && pendingFirstFour) {
        firstFour.push([
          pendingFirstFour.team_a,
          pendingFirstFour.team_b,
          upper,
          pendingFirstFour.seed_a,
        ]);
        pendingFirstFour = null;
      } else {
        currentRegion = upper;
        currentSection = "MAIN";
      }
      continue;
    }

    const parsed = parseMatchupLine(line);
    if (!parsed) {
      continue;
    }

    if (currentSection === "FIRST_FOUR") {
      if (parsed.seed_a !== parsed.seed_b) {
        continue;
      }
      pendingFirstFour = parsed;
      continue;
    }

    if (
      currentSection === "MAIN" &&
      currentRegion &&
      REGION_ORDER.includes(currentRegion as (typeof REGION_ORDER)[number]) &&
      regionGames[currentRegion].length < 8
    ) {
      regionGames[currentRegion].push(parsed);
    }
  }

  if (pendingFirstFour) {
    throw new FetchError("Bracket scrape found an unassigned First Four game.");
  }

  const badRegion = Object.entries(regionGames).find(([, games]) => games.length !== 8);
  if (badRegion) {
    const counts = Object.fromEntries(Object.entries(regionGames).map(([region, games]) => [region, games.length]));
    throw new FetchError(`Bracket scrape failed to capture all regions: ${JSON.stringify(counts)}`);
  }

  const regionSeedMap: Record<string, Record<number, string>> = {};
  for (const region of REGION_ORDER) {
    const seedMap: Record<number, string> = {};
    for (const game of regionGames[region]) {
      seedMap[game.seed_a] = game.team_a;
      seedMap[game.seed_b] = game.team_b;
    }
    regionSeedMap[region] = seedMap;
  }

  return buildBracketFromRegionSeedMap(regionSeedMap, firstFour);
}

function toYmdCompact(day: Date): string {
  const yyyy = day.getUTCFullYear();
  const mm = String(day.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(day.getUTCDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function parseYmd(ymd: string): Date {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    throw new Error(`Invalid date format: ${ymd}`);
  }
  const [, y, mo, d] = m;
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
}

export async function fetchCompletedResults(
  firstDay: string,
  lastDay: string,
  aliasMap: Record<string, string> = {},
): Promise<Record<string, string>> {
  const start = parseYmd(firstDay);
  const end = parseYmd(lastDay);
  const known: Record<string, string> = {};

  for (let day = new Date(start); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
    const params = new URLSearchParams({
      dates: toYmdCompact(day),
      groups: "50",
      limit: "500",
    });

    const response = await fetch(`${ESPN_SCOREBOARD_URL}?${params.toString()}`);
    if (!response.ok) {
      throw new FetchError(`Scoreboard request failed on ${toYmdCompact(day)}: HTTP ${response.status}`);
    }

    const payload = (await response.json()) as {
      events?: Array<{
        status?: { type?: { name?: string } };
        competitions?: Array<{
          competitors?: Array<{
            winner?: boolean;
            team?: {
              shortDisplayName?: string;
              displayName?: string;
              name?: string;
            };
          }>;
        }>;
      }>;
    };

    for (const event of payload.events ?? []) {
      const status = event.status?.type?.name ?? "";
      if (status !== "STATUS_FINAL") {
        continue;
      }

      const competitors = event.competitions?.[0]?.competitors ?? [];
      if (competitors.length !== 2) {
        continue;
      }

      const names: string[] = [];
      let winner = "";

      for (const competitor of competitors) {
        const team = competitor.team ?? {};
        const display = team.shortDisplayName ?? team.displayName ?? team.name;
        if (!display) {
          continue;
        }

        const aliased = maybeAlias(display, aliasMap);
        names.push(aliased);
        if (competitor.winner) {
          winner = aliased;
        }
      }

      if (names.length === 2 && winner) {
        known[gamePairKey(names[0], names[1])] = winner;
      }
    }
  }

  return known;
}

export async function fetchTeamLogoMap(
  targetTeams: string[],
  aliasMap: Record<string, string> = {},
): Promise<Record<string, string>> {
  const response = await fetch(`${ESPN_TEAMS_URL}?limit=1000`);
  if (!response.ok) {
    throw new FetchError(`Team logo request failed: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as {
    sports?: Array<{
      leagues?: Array<{
        teams?: Array<{
          team?: {
            displayName?: string;
            shortDisplayName?: string;
            nickname?: string;
            location?: string;
            abbreviation?: string;
            name?: string;
            logos?: Array<{ href?: string }>;
          };
        }>;
      }>;
    }>;
  };

  const teamEntries = payload.sports?.[0]?.leagues?.[0]?.teams ?? [];
  const lookup: Record<string, string> = {};

  for (const entry of teamEntries) {
    const team = entry.team ?? {};
    const logoUrl = team.logos?.[0]?.href?.trim();
    if (!logoUrl) {
      continue;
    }

    const candidateNames = new Set<string>([
      team.displayName ?? "",
      team.shortDisplayName ?? "",
      team.nickname ?? "",
      team.location ?? "",
      team.abbreviation ?? "",
      [team.location, team.name].filter(Boolean).join(" "),
    ]);

    for (const rawName of candidateNames) {
      if (!rawName) {
        continue;
      }
      const aliased = maybeAlias(rawName, aliasMap);
      lookup[canonicalName(aliased)] = logoUrl;
    }
  }

  const result: Record<string, string> = {};
  for (const team of [...new Set(targetTeams.map((t) => t.trim()).filter(Boolean))]) {
    const key = canonicalName(maybeAlias(team, aliasMap));
    const logo = lookup[key];
    if (logo) {
      result[team] = logo;
    }
  }

  return result;
}
