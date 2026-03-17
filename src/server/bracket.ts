import { BracketGame } from "./types";

export const REGION_ORDER = ["EAST", "WEST", "SOUTH", "MIDWEST"] as const;
export const FIRST_ROUND_SEED_PAIRS: Array<[number, number]> = [
  [1, 16],
  [8, 9],
  [5, 12],
  [4, 13],
  [6, 11],
  [3, 14],
  [7, 10],
  [2, 15],
];

export const ROUND_NAMES: Record<number, string> = {
  0: "First Four",
  1: "Round of 64",
  2: "Round of 32",
  3: "Sweet 16",
  4: "Elite Eight",
  5: "Final Four",
  6: "Championship",
};

function slot(region: string, prefix: string, idx: number): string {
  return `${prefix}_${region}_${idx}`;
}

export function buildBracketFromRegionSeedMap(
  regionSeedMap: Record<string, Record<number, string>>,
  firstFourPairs: Array<[string, string, string, number]> = [],
): BracketGame[] {
  const rows: BracketGame[] = [];
  const firstFourLookup = new Map<string, string>();

  firstFourPairs.forEach(([teamA, teamB, region, seed], index) => {
    const slotName = `FF_${index + 1}`;
    firstFourLookup.set(`${region.toUpperCase()}|${seed}`, `@slot:${slotName}`);
    rows.push({
      slot: slotName,
      round_order: 0,
      round_name: ROUND_NAMES[0],
      region: region.toUpperCase(),
      team_a: teamA,
      team_b: teamB,
    });
  });

  for (const region of REGION_ORDER) {
    const seeds = regionSeedMap[region] ?? {};
    const firstRoundSlots: string[] = [];

    FIRST_ROUND_SEED_PAIRS.forEach(([seedA, seedB], idx) => {
      const slotName = slot(region, "R1", idx + 1);
      firstRoundSlots.push(slotName);
      rows.push({
        slot: slotName,
        round_order: 1,
        round_name: ROUND_NAMES[1],
        region,
        team_a: firstFourLookup.get(`${region}|${seedA}`) ?? seeds[seedA] ?? "TBD",
        team_b: firstFourLookup.get(`${region}|${seedB}`) ?? seeds[seedB] ?? "TBD",
      });
    });

    const r2Slots: string[] = [];
    for (let idx = 0; idx < firstRoundSlots.length; idx += 2) {
      const slotName = slot(region, "R2", idx / 2 + 1);
      r2Slots.push(slotName);
      rows.push({
        slot: slotName,
        round_order: 2,
        round_name: ROUND_NAMES[2],
        region,
        team_a: `@slot:${firstRoundSlots[idx]}`,
        team_b: `@slot:${firstRoundSlots[idx + 1]}`,
      });
    }

    const r3Slots: string[] = [];
    for (let idx = 0; idx < r2Slots.length; idx += 2) {
      const slotName = slot(region, "R3", idx / 2 + 1);
      r3Slots.push(slotName);
      rows.push({
        slot: slotName,
        round_order: 3,
        round_name: ROUND_NAMES[3],
        region,
        team_a: `@slot:${r2Slots[idx]}`,
        team_b: `@slot:${r2Slots[idx + 1]}`,
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

  const finalFourPairs: Array<[string, string]> = [
    ["EAST", "WEST"],
    ["SOUTH", "MIDWEST"],
  ];

  const finalFourSlots: string[] = [];
  finalFourPairs.forEach(([regionA, regionB], idx) => {
    const slotName = `R5_${idx + 1}`;
    finalFourSlots.push(slotName);
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
    team_a: `@slot:${finalFourSlots[0]}`,
    team_b: `@slot:${finalFourSlots[1]}`,
  });

  return rows.sort((a, b) => (a.round_order - b.round_order) || a.slot.localeCompare(b.slot));
}

export function resolveTeam(ref: string, winners: Record<string, string>): string {
  const clean = String(ref).trim();
  if (clean.startsWith("@slot:")) {
    const slotRef = clean.split(":", 2)[1];
    const winner = winners[slotRef];
    if (!winner) {
      throw new Error(`Missing winner for slot ${slotRef}`);
    }
    return winner;
  }
  return clean;
}

export function gamePairKey(teamA: string, teamB: string): string {
  const a = teamA.trim().toLowerCase();
  const b = teamB.trim().toLowerCase();
  return [a, b].sort().join("||");
}

export function applyKnownResults(
  bracket: BracketGame[],
  knownWinners: Record<string, string>,
): Record<string, string> {
  const winners: Record<string, string> = {};
  const ordered = [...bracket].sort((a, b) => (a.round_order - b.round_order) || a.slot.localeCompare(b.slot));

  for (const game of ordered) {
    let teamA: string;
    let teamB: string;

    try {
      teamA = resolveTeam(game.team_a, winners);
      teamB = resolveTeam(game.team_b, winners);
    } catch {
      continue;
    }

    const key = gamePairKey(teamA, teamB);
    const knownWinner = knownWinners[key];
    if (knownWinner) {
      winners[game.slot] = knownWinner;
    }
  }

  return winners;
}
