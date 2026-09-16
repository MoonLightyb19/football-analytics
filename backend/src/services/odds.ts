/**
 * Market odds for upcoming matches — The Odds API (https://the-odds-api.com), h2h market, EU bookmakers.
 *
 * - One request per competition = 1 credit (1 region × 1 market). Free tier: 500 credits / month.
 * - A budget-aware scheduler decides when a competition is worth a fetch: close to kick-off
 *   (closing line, the number that matters for tracking) and a coarser refresh in the 48 h before.
 * - Odds are matched to Football-Data.org fixtures by competition + kick-off time + team-name similarity,
 *   stored in SQLite, and attached to match objects as `odds.msw` (the shape tracking.ts already reads)
 *   plus a `market` summary for the UI.
 */
import axios from 'axios';
import { db } from '../db';
import logger from '../utils/logger';
import { similarity } from './history';

const API = 'https://api.the-odds-api.com/v4';
const KEY = process.env.ODDS_API_KEY || '';
const REGIONS = process.env.ODDS_REGIONS || 'eu';
const DAILY_BUDGET = parseInt(process.env.ODDS_DAILY_BUDGET || '16', 10); // credits per day
const PREFERRED_BOOK = process.env.ODDS_BOOKMAKER || 'pinnacle';

/** Football-Data.org competition code → The Odds API sport key (priority order for the budget). */
export const SPORT_KEYS: Record<string, string> = {
  CL: 'soccer_uefa_champs_league',
  PL: 'soccer_epl',
  PD: 'soccer_spain_la_liga',
  SA: 'soccer_italy_serie_a',
  BL1: 'soccer_germany_bundesliga',
  FL1: 'soccer_france_ligue_one',
  ELC: 'soccer_efl_champ',
  DED: 'soccer_netherlands_eredivisie',
  PPL: 'soccer_portugal_primeira_liga'
};

// Odds API names that our token similarity doesn't catch on its own
const ALIASES: Record<string, string> = {
  'inter milan': 'internazionale',
  'wolverhampton wanderers': 'wolves',
  'tottenham hotspur': 'tottenham',
  'manchester united': 'man united',
  'manchester city': 'man city',
  'paris saint germain': 'paris saint-germain',
  'bayern munich': 'bayern munchen',
  'borussia monchengladbach': 'gladbach',
  'atletico madrid': 'atletico',
  'athletic bilbao': 'athletic club',
  'real betis': 'betis',
  'sporting lisbon': 'sporting cp',
  'psv eindhoven': 'psv',
  'az alkmaar': 'az',
  'nec nijmegen': 'nec',
  'sc heerenveen': 'heerenveen',
  'fc twente': 'twente',
  'rb leipzig': 'leipzig',
  'eintracht frankfurt': 'frankfurt',
  'bayer leverkusen': 'leverkusen',
  'vitoria guimaraes': 'vitoria sc',
  'sc braga': 'braga',
  'fc porto': 'porto',
  'sl benfica': 'benfica',
  'brighton and hove albion': 'brighton hove albion',
  'nottingham forest': 'nottingham',
  'west ham united': 'west ham',
  'newcastle united': 'newcastle',
  'leeds united': 'leeds',
  'sheffield united': 'sheffield utd',
  'queens park rangers': 'qpr',
  'west bromwich albion': 'west brom'
};

db.exec(`
  CREATE TABLE IF NOT EXISTS market_odds (
    match_id    INTEGER PRIMARY KEY,
    source      TEXT NOT NULL,
    bookmaker   TEXT NOT NULL,          -- book the main line comes from (or 'median')
    home        REAL NOT NULL,
    draw        REAL NOT NULL,
    away        REAL NOT NULL,
    books       INTEGER NOT NULL,       -- number of bookmakers quoting
    best_home   REAL, best_draw REAL, best_away REAL,
    event_id    TEXT,
    fetched_at  TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS odds_fetch (
    competition TEXT PRIMARY KEY,
    fetched_at  TEXT NOT NULL,
    events      INTEGER NOT NULL,
    matched     INTEGER NOT NULL,
    remaining   INTEGER
  );
`);

const upsertOdds = db.prepare(`
  INSERT INTO market_odds (match_id, source, bookmaker, home, draw, away, books, best_home, best_draw, best_away, event_id, fetched_at)
  VALUES (?, 'the-odds-api', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(match_id) DO UPDATE SET
    bookmaker = excluded.bookmaker, home = excluded.home, draw = excluded.draw, away = excluded.away,
    books = excluded.books, best_home = excluded.best_home, best_draw = excluded.best_draw, best_away = excluded.best_away,
    event_id = excluded.event_id, fetched_at = excluded.fetched_at
`);
const upsertFetch = db.prepare(`
  INSERT INTO odds_fetch (competition, fetched_at, events, matched, remaining) VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(competition) DO UPDATE SET fetched_at = excluded.fetched_at, events = excluded.events,
    matched = excluded.matched, remaining = excluded.remaining
`);
const selectOdds = db.prepare(`SELECT * FROM market_odds WHERE match_id = ?`);
const selectFetches = db.prepare(`SELECT * FROM odds_fetch`);

export interface MarketOdds {
  msw: { homeWin: number; draw: number; awayWin: number };
  bookmaker: string;
  books: number;
  best: { homeWin: number | null; draw: number | null; awayWin: number | null };
  /** Implied probabilities (%) with the bookmaker margin removed */
  probs: { home: number; draw: number; away: number };
  overround: number;
  fetchedAt: string;
}

export function oddsFor(matchId: number): MarketOdds | null {
  const r = selectOdds.get(matchId) as any;
  if (!r) return null;
  const inv = { h: 1 / r.home, d: 1 / r.draw, a: 1 / r.away };
  const sum = inv.h + inv.d + inv.a;
  return {
    msw: { homeWin: r.home, draw: r.draw, awayWin: r.away },
    bookmaker: r.bookmaker,
    books: r.books,
    best: { homeWin: r.best_home, draw: r.best_draw, awayWin: r.best_away },
    probs: {
      home: Math.round((inv.h / sum) * 1000) / 10,
      draw: Math.round((inv.d / sum) * 1000) / 10,
      away: Math.round((inv.a / sum) * 1000) / 10
    },
    overround: Math.round((sum - 1) * 1000) / 10,
    fetchedAt: r.fetched_at
  };
}

/** Attach `odds` (tracking shape) and `market` (UI shape) to match objects that have stored odds. */
export function withMarket<T extends { id: number }>(matches: T[]): (T & { odds?: any; market?: MarketOdds | null })[] {
  return matches.map(m => {
    const mk = oddsFor(m.id);
    return mk ? { ...m, odds: { msw: mk.msw }, market: mk } : { ...m, market: null };
  });
}

// ---------------------------------------------------------------------------------------------
// Fetching

let remaining: number | null = null; // credits left this month (from response headers)
let usedToday = 0;
let usedDay = '';
let disabledLogged = false;

function today() {
  return new Date().toISOString().slice(0, 10);
}
function spend(credits: number) {
  if (usedDay !== today()) {
    usedDay = today();
    usedToday = 0;
  }
  usedToday += credits;
}

function teamScore(apiName: string, fdTeam: { name?: string; shortName?: string; tla?: string }): number {
  const n = apiName.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const cands = [apiName, ALIASES[n] || ''].filter(Boolean);
  const targets = [fdTeam.name, fdTeam.shortName].filter(Boolean) as string[];
  let best = 0;
  for (const c of cands) for (const t of targets) best = Math.max(best, similarity(c, t));
  if (fdTeam.tla && n.replace(/[^a-z]/g, '').startsWith(fdTeam.tla.toLowerCase())) best = Math.max(best, 0.5);
  return best;
}

interface OddsEvent {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: { key: string; title: string; markets: { key: string; outcomes: { name: string; price: number }[] }[] }[];
}

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Reduce an event's bookmakers to one line (+ best prices). */
function consensus(ev: OddsEvent) {
  const lines: { key: string; h: number; d: number; a: number }[] = [];
  for (const b of ev.bookmakers || []) {
    const h2h = b.markets?.find(mk => mk.key === 'h2h');
    if (!h2h) continue;
    const h = h2h.outcomes.find(o => o.name === ev.home_team)?.price;
    const a = h2h.outcomes.find(o => o.name === ev.away_team)?.price;
    const d = h2h.outcomes.find(o => o.name === 'Draw')?.price;
    if (h && d && a && h > 1 && d > 1 && a > 1) lines.push({ key: b.key, h, d, a });
  }
  if (!lines.length) return null;
  const pref = lines.find(l => l.key === PREFERRED_BOOK);
  const main = pref || { key: 'median', h: median(lines.map(l => l.h)), d: median(lines.map(l => l.d)), a: median(lines.map(l => l.a)) };
  return {
    bookmaker: main.key,
    home: main.h,
    draw: main.d,
    away: main.a,
    books: lines.length,
    best: { h: Math.max(...lines.map(l => l.h)), d: Math.max(...lines.map(l => l.d)), a: Math.max(...lines.map(l => l.a)) }
  };
}

/**
 * Fetch one competition and store odds for every fixture we can match.
 * `fixtures` = our upcoming matches for that competition (Football-Data.org shape).
 */
export async function fetchCompetitionOdds(code: string, fixtures: any[]) {
  const sport = SPORT_KEYS[code];
  if (!KEY || !sport) return { events: 0, matched: 0 };

  const res = await axios.get(`${API}/sports/${sport}/odds`, {
    params: { apiKey: KEY, regions: REGIONS, markets: 'h2h', oddsFormat: 'decimal', dateFormat: 'iso' },
    timeout: 15000
  });
  const rem = parseInt(res.headers['x-requests-remaining'], 10);
  const last = parseInt(res.headers['x-requests-last'], 10);
  if (Number.isFinite(rem)) remaining = rem;
  spend(Number.isFinite(last) ? last : 1);

  const events: OddsEvent[] = res.data || [];
  const now = new Date().toISOString();
  let matched = 0;

  for (const ev of events) {
    const t = new Date(ev.commence_time).getTime();
    // candidates: same competition, kick-off within 3 h (provider clocks occasionally differ)
    const cands = fixtures.filter(f => Math.abs(new Date(f.utcDate).getTime() - t) <= 3 * 60 * 60 * 1000);
    let best: any = null;
    let bestScore = 0;
    for (const f of cands) {
      const s = Math.min(teamScore(ev.home_team, f.homeTeam), teamScore(ev.away_team, f.awayTeam));
      if (s > bestScore) {
        bestScore = s;
        best = f;
      }
    }
    if (!best || bestScore < 0.45) {
      if (cands.length) logger.debug?.(`odds: no match for ${ev.home_team} v ${ev.away_team} (${code})`);
      continue;
    }
    const line = consensus(ev);
    if (!line) continue;
    upsertOdds.run(best.id, line.bookmaker, line.home, line.draw, line.away, line.books, line.best.h, line.best.d, line.best.a, ev.id, now);
    matched++;
  }
  upsertFetch.run(code, now, events.length, matched, remaining);
  logger.info(`odds: ${code} ${events.length} events, ${matched} matched, ${remaining ?? '?'} credits left`);
  return { events: events.length, matched };
}

// ---------------------------------------------------------------------------------------------
// Scheduler

const H = 60 * 60 * 1000;
const CLOSING_WINDOW = 2 * H; // within 2 h of kick-off: refresh every ~75 min (closing line)
const CLOSING_EVERY = 75 * 60 * 1000;
const AHEAD_WINDOW = 48 * H; // within 48 h: refresh every 8 h
const AHEAD_EVERY = 8 * H;

let running = false;

/**
 * Called every few minutes with the current fixture window. Decides which competitions deserve a
 * fetch right now, in priority order, and stops when the daily budget is spent.
 */
export async function oddsTick(windowMatches: any[]) {
  if (!KEY) {
    if (!disabledLogged) {
      disabledLogged = true;
      logger.info('odds: ODDS_API_KEY not set — market odds disabled');
    }
    return;
  }
  if (running) return;
  running = true;
  try {
    const now = Date.now();
    const fetches = new Map<string, number>();
    for (const r of selectFetches.all() as any[]) fetches.set(r.competition, new Date(r.fetched_at).getTime());
    if (usedDay !== today()) {
      usedDay = today();
      usedToday = 0;
    }

    for (const code of Object.keys(SPORT_KEYS)) {
      if (usedToday >= DAILY_BUDGET) break;
      if (remaining !== null && remaining <= 5) break; // keep a few credits for manual checks
      const fixtures = windowMatches.filter(m => m.competition?.code === code && new Date(m.utcDate).getTime() > now - H);
      if (!fixtures.length) continue;
      const nextKick = Math.min(...fixtures.map(m => new Date(m.utcDate).getTime()));
      const untilKick = nextKick - now;
      const since = now - (fetches.get(code) || 0);
      const closing = untilKick <= CLOSING_WINDOW && since >= CLOSING_EVERY;
      const ahead = untilKick <= AHEAD_WINDOW && since >= AHEAD_EVERY;
      if (!closing && !ahead) continue;
      try {
        await fetchCompetitionOdds(code, fixtures);
      } catch (error: any) {
        const status = error?.response?.status;
        logger.warn(`odds: fetch failed for ${code}`, { status, message: error?.response?.data?.message || error.message });
        if (status === 401 || status === 429) break; // bad key / out of credits: stop for this tick
        upsertFetch.run(code, new Date().toISOString(), 0, 0, remaining); // don't retry immediately
      }
    }
  } finally {
    running = false;
  }
}

export function oddsStatus() {
  const fetches = (selectFetches.all() as any[]).map(r => ({
    competition: r.competition,
    fetchedAt: r.fetched_at,
    events: r.events,
    matched: r.matched
  }));
  const stored = (db.prepare(`SELECT COUNT(*) AS c FROM market_odds`).get() as any).c;
  return {
    enabled: !!KEY,
    regions: REGIONS,
    preferredBookmaker: PREFERRED_BOOK,
    creditsRemaining: remaining,
    usedToday,
    dailyBudget: DAILY_BUDGET,
    storedMatches: stored,
    competitions: fetches
  };
}
