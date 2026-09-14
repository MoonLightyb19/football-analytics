-- Football Analytics Database Schema
-- PostgreSQL

-- Leagues/Competitions
CREATE TABLE leagues (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(10) UNIQUE NOT NULL,
  country VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Teams
CREATE TABLE teams (
  id SERIAL PRIMARY KEY,
  league_id INTEGER NOT NULL REFERENCES leagues(id),
  name VARCHAR(100) NOT NULL,
  code VARCHAR(10),
  crest_url VARCHAR(255),
  venue VARCHAR(100),
  founded_year INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Players
CREATE TABLE players (
  id SERIAL PRIMARY KEY,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  name VARCHAR(100) NOT NULL,
  position VARCHAR(50),
  number INTEGER,
  birth_date DATE,
  nationality VARCHAR(50),
  market_value VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Matches
CREATE TABLE matches (
  id SERIAL PRIMARY KEY,
  league_id INTEGER NOT NULL REFERENCES leagues(id),
  home_team_id INTEGER NOT NULL REFERENCES teams(id),
  away_team_id INTEGER NOT NULL REFERENCES teams(id),
  match_date TIMESTAMP NOT NULL,
  status VARCHAR(20),
  home_score INTEGER,
  away_score INTEGER,
  home_shots INTEGER,
  away_shots INTEGER,
  home_possession DECIMAL(5,2),
  away_possession DECIMAL(5,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Player Statistics (per match)
CREATE TABLE player_stats (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL REFERENCES players(id),
  match_id INTEGER NOT NULL REFERENCES matches(id),
  minutes_played INTEGER,
  goals INTEGER DEFAULT 0,
  assists INTEGER DEFAULT 0,
  shots INTEGER DEFAULT 0,
  key_passes INTEGER DEFAULT 0,
  tackles INTEGER DEFAULT 0,
  interceptions INTEGER DEFAULT 0,
  passes_completed INTEGER DEFAULT 0,
  passes_attempted INTEGER DEFAULT 0,
  pass_accuracy DECIMAL(5,2),
  rating DECIMAL(3,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(player_id, match_id)
);

-- Injury Records
CREATE TABLE injury_records (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL REFERENCES players(id),
  injury_type VARCHAR(100),
  date_from DATE NOT NULL,
  date_to DATE,
  status VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Yellow/Red Cards
CREATE TABLE disciplinary_records (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL REFERENCES players(id),
  match_id INTEGER NOT NULL REFERENCES matches(id),
  card_type VARCHAR(10),
  minute INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Player Form (Last 5 matches aggregate)
CREATE TABLE player_form (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL REFERENCES players(id),
  last_5_matches_performance DECIMAL(3,2),
  goals_last_5 INTEGER DEFAULT 0,
  assists_last_5 INTEGER DEFAULT 0,
  avg_rating DECIMAL(3,2),
  form_status VARCHAR(20), -- "hot", "cold", "average"
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(player_id)
);

-- Match Predictions
CREATE TABLE predictions (
  id SERIAL PRIMARY KEY,
  match_id INTEGER NOT NULL REFERENCES matches(id),
  home_win_probability DECIMAL(5,2) NOT NULL,
  draw_probability DECIMAL(5,2) NOT NULL,
  away_win_probability DECIMAL(5,2) NOT NULL,
  predicted_goals_home DECIMAL(3,1),
  predicted_goals_away DECIMAL(3,1),
  confidence_score DECIMAL(5,2),
  model_version VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(match_id)
);

-- Users
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  username VARCHAR(50) UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User Predictions (tracking user's predictions)
CREATE TABLE user_predictions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  match_id INTEGER NOT NULL REFERENCES matches(id),
  prediction_type VARCHAR(20), -- "win", "draw", "goals", "etc"
  predicted_value VARCHAR(50),
  confidence INTEGER,
  actual_result VARCHAR(50),
  is_correct BOOLEAN,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, match_id)
);

-- Create indexes for better query performance
CREATE INDEX idx_matches_home_team ON matches(home_team_id);
CREATE INDEX idx_matches_away_team ON matches(away_team_id);
CREATE INDEX idx_matches_league ON matches(league_id);
CREATE INDEX idx_matches_date ON matches(match_date);
CREATE INDEX idx_player_stats_match ON player_stats(match_id);
CREATE INDEX idx_player_stats_player ON player_stats(player_id);
CREATE INDEX idx_player_team ON players(team_id);
CREATE INDEX idx_team_league ON teams(league_id);
CREATE INDEX idx_user_predictions_user ON user_predictions(user_id);
CREATE INDEX idx_user_predictions_match ON user_predictions(match_id);
