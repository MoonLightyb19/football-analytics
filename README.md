# Bet To Beat

Football match-prediction platform. Real fixtures, live scores and a statistical
outcome model for the big European leagues.

## What it does

- Upcoming fixtures for the next 30 days across 9 competitions
  (Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Champions League,
  Eredivisie, Primeira Liga, Championship) — served from memory, refreshed
  every 5 minutes.
- Live scores pushed to the browser over WebSocket (Socket.io).
- Match page: score & minute, goals / cards / substitutions, lineups and bench,
  match statistics (where the data provider has them), head-to-head history,
  league position and form for both teams.
- Prediction for every match: home / draw / away probabilities, expected goals,
  over 2.5, both-teams-to-score, most likely scorelines, and a confidence level.

## Prediction model (v1)

Poisson model with Dixon-Coles low-score correction
(`backend/src/services/predictionModel.ts`).

- Attack and defence strength for each team = goals scored / conceded per game
  relative to the league average, from the current league table.
- Home advantage from the league's HOME / AWAY tables.
- Strengths are shrunk toward average early in the season, and nudged by the
  last-5-games form.
- Expected goals for each side feed a Poisson score matrix → outcome
  probabilities.

Predictions are recomputed from fresh standings on every refresh. Nothing is
stored yet; storing predictions and scoring them against results is the next step.

## Stack

- **Backend**: Node.js, Express, TypeScript, Socket.io, Axios
- **Frontend**: React 18, Vite, TypeScript, TailwindCSS, socket.io-client
- **Data**: [Football-Data.org](https://www.football-data.org/) v4 API
- Planned: PostgreSQL for prediction history and accuracy tracking

## Running locally

```
# backend
cd backend
npm install
cp .env.example .env    # add FOOTBALL_DATA_API_KEY
npm run dev             # http://localhost:3001

# frontend
cd frontend
npm install
npm run dev             # http://localhost:3000 (proxies /api and /socket.io to :3001)
```

Backend `.env` options:

```
FOOTBALL_DATA_API_KEY=...
FOOTBALL_DATA_BASE_URL=https://api.football-data.org/v4
PORT=3001
COMPETITIONS=PL,PD,SA,BL1,FL1,CL,DED,PPL,ELC   # optional override
LIVE_POLL_MS=60000                             # live-score push interval
```

## API

```
GET /api/matches/upcoming?days=30      fixtures + predictions
GET /api/matches/live                  matches in play
GET /api/matches/:id/details           match + prediction + h2h + standings + form
GET /api/matches/:id/head2head
GET /api/leagues
GET /api/leagues/:code/standings
GET /api/teams/:id
GET /api/health
```

WebSocket events: `matches:live` (all live matches, every 60 s),
`match:live` (per match, after `subscribe_match`).
