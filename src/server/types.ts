export const DEFAULT_FEATURES = [
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
] as const;

export type FeatureName = (typeof DEFAULT_FEATURES)[number];

export interface BracketGame {
  slot: string;
  round_order: number;
  round_name: string;
  region: string;
  team_a: string;
  team_b: string;
}

export interface TeamStatRow {
  season: number;
  team: string;
  [key: string]: string | number;
}

export interface HistoricalGameRow {
  season: number;
  team_a: string;
  team_b: string;
  score_a: number;
  score_b: number;
  neutral_site: number;
}

export interface MatchupSummaryRow {
  slot: string;
  round_order: number;
  round_name: string;
  region: string;
  team_a: string;
  team_b: string;
  p_team_a: number;
  p_team_b: number;
  team_a_win_rate: number;
  team_b_win_rate: number;
  winner: string;
  is_locked: boolean;
}

export interface AdvancementRow {
  team: string;
  [key: string]: string | number;
}

export interface BestBracketRow {
  slot: string;
  round_order: number;
  round_name: string;
  region: string;
  winner: string;
  is_locked: boolean;
}

export interface TrainingMetrics {
  log_loss: number;
  roc_auc: number;
  training_games: number;
}

export interface PredictionPayload {
  meta: {
    season: number;
    simulations: number;
    updated_at: string;
    training_metrics: TrainingMetrics;
    team_logos_count: number;
  };
  matchups: MatchupSummaryRow[];
  title_odds: Array<{ team: string; title_prob: number; note: string }>;
  best_bracket: BestBracketRow[];
  team_logos: Record<string, string>;
}
