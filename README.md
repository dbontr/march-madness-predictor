# dbontr bracket oracle

A static March Madness bracket app for GitHub Pages with an offline Python pipeline.

It is designed for GitHub Pages with Actions:

- `docs/` contains the site that GitHub Pages serves
- `scripts/` contains the Python pipeline
- `.github/workflows/` refreshes data and deploys Pages automatically

## What it does

- trains a matchup model from historical game results and team features
- loads the current tournament field from ESPN's public bracket page when available
- fetches completed tournament games from ESPN's public scoreboard API
- locks in known winners automatically
- predicts only the remaining games
- exports static JSON into `docs/data/`
- publishes through GitHub Pages

## What you still control

Reliable public player injury feeds for college basketball are inconsistent, so this project keeps injuries as a simple team-level override file:

- `data/raw/<season>/injuries.csv`

That file is optional. If you do not provide it, the model still runs.

## Included sample data

This zip includes a synthetic `data/raw/2026/` sample so the site can boot immediately. Replace it with your real season data for serious use.

## Quick start

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python scripts/update_bracket_site.py --season 2026
```

Then commit and push the repository, and in GitHub set **Settings -> Pages -> Source** to **GitHub Actions**.

## Repo layout

```text
.github/workflows/deploy-pages.yml
.github/workflows/update-bracket.yml
config.json
scripts/
  update_bracket_site.py
  build_site_data.py
  pages_app_template.html
  predictor.py
  bracket_logic.py
  public_sources.py
docs/
  .nojekyll
  index.html
  data/
data/raw/<season>/
  team_stats.csv
  historical_games.csv
  injuries.csv         # optional
  bracket.csv          # optional cache / override
```

## Raw data files

### `team_stats.csv`

Required columns:

- `season`
- `team`
- `seed`

Recommended numeric feature columns:

- `adj_offense`
- `adj_defense`
- `tempo`
- `sos`
- `net_rating`
- `q1_wins`
- `q2_wins`
- `q3_losses`
- `q4_losses`
- `recent_form`
- `injuries_impact`
- `fg3_pct`
- `tov_pct`
- `orb_pct`
- `drb_pct`
- `ft_rate`

### `historical_games.csv`

Required columns:

- `season`
- `team_a`
- `team_b`
- `score_a`
- `score_b`

Optional:

- `neutral_site`
- `game_date`
- `round_name`

### `injuries.csv`

Optional columns:

- `team`
- `injuries_impact`

Convention:

- `0.0` = healthy baseline
- negative = worse because of injuries / availability
- positive = better than baseline

## Automatic updates

The included GitHub Actions workflows:

- `update-bracket.yml` runs on manual dispatch and on a tournament schedule
- `update-bracket.yml` regenerates `docs/data/*.json` and commits updates
- `deploy-pages.yml` deploys `docs/` to GitHub Pages when `docs/**` changes

## Yearly use

Each season, add a new folder:

```text
data/raw/2027/
```

and drop in fresh `team_stats.csv` and `historical_games.csv`.

The script auto-detects the active season by date unless you pass `--season` explicitly.

## Notes

- The bracket field and completed game results are fetched from ESPN public pages/endpoints when possible.
- If the bracket fetch fails, the script falls back to `data/raw/<season>/bracket.csv`.
- If automatic result fetch fails, the model still produces a bracket from the current raw files.
