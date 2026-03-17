import type { VercelRequest, VercelResponse } from "@vercel/node";

import { runLivePrediction } from "../src/server/pipeline";

export const config = {
  maxDuration: 60,
};

function parseNumberParam(value: string | string[] | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseBoolParam(value: string | string[] | undefined): boolean | undefined {
  if (!value) {
    return undefined;
  }
  const raw = (Array.isArray(value) ? value[0] : value).toLowerCase();
  if (raw === "true" || raw === "1" || raw === "yes") {
    return true;
  }
  if (raw === "false" || raw === "0" || raw === "no") {
    return false;
  }
  return undefined;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const season = parseNumberParam(req.query.season);
    const simulations = parseNumberParam(req.query.simulations) ?? 2000;
    const randomSeed = parseNumberParam(req.query.random_seed);
    const skipPublicFetch = parseBoolParam(req.query.skip_public_fetch);

    const payload = await runLivePrediction({
      season,
      simulations,
      randomSeed,
      skipPublicFetch,
    });

    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.status(200).json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  }
}
