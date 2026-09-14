import axios, { AxiosInstance } from 'axios';
import logger from '../utils/logger';
import { predictFromStandings, Prediction, StandingsResponse } from './predictionModel';
import { predictV2, prepareModelV2 } from './historyModel';

// Competitions to load. Override with COMPETITIONS=PL,PD,... in .env
const DEFAULT_COMPETITIONS = ['PL', 'PD', 'SA', 'BL1', 'FL1', 'CL', 'DED', 'PPL', 'ELC'];

// Statuses that count as "upcoming or live"
const ACTIVE_STATUSES = new Set(['SCHEDULED', 'TIMED', 'IN_PLAY', 'PAUSED']);
const LIVE_STATUSES = new Set(['IN_PLAY', 'PAUSED']);

const MAX_DAYS = 30; // size of the in-memory fixture window
const CACHE_TTL_MS = 5 * 60 * 1000; // background refresh interval for the window
const LIVE_CACHE_TTL_MS = 30 * 1000; // 30 seconds for live

interface CacheEntry<T> {
  data: T;
  expires: number;
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

class FootballDataAPI {
  private client: AxiosInstance;
  private apiKey: string;
  private baseURL: string;
  private competitions: string[];
  private cache = new Map<string, CacheEntry<any>>();
  private window: any[] | null = null;
  private windowLoadedAt: number | null = null;
  private refreshing: Promise<void> | null = null;
  // Latest known standings per competition (kept even if a refresh fails)
  private standingsByCode = new Map<string, StandingsResponse>();
  /** Called after every successful window refresh with predictions attached. */
  onWindowRefreshed: ((matches: any[]) => void) | null = null;

  constructor() {
    this.baseURL = process.env.FOOTBALL_DATA_BASE_URL || 'https://api.football-data.org/v4';
    this.apiKey = process.env.FOOTBALL_DATA_API_KEY || '';
    this.competitions = (process.env.COMPETITIONS || DEFAULT_COMPETITIONS.join(','))
      .split(',')
      .map(c => c.trim().toUpperCase())
      .filter(Boolean);

    console.log('=== Football Data API Init ===');
    console.log(`API Key loaded: ${this.apiKey ? 'YES ✅' : 'NO ❌'}`);
    console.log(`Base URL: ${this.baseURL}`);
    console.log(`Competitions: ${this.competitions.join(', ')}`);
    console.log('================================');

    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 15000,
      headers: {
        'X-Auth-Token': this.apiKey,
        Accept: 'application/json'
      }
    });
  }

  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (entry && entry.expires > Date.now()) return entry.data as T;
    return null;
  }

  private setCached<T>(key: string, data: T, ttl: number) {
    this.cache.set(key, { data, expires: Date.now() + ttl });
  }

  /**
   * Upcoming (and currently live) matches for the next `days` days.
   * Served instantly from an in-memory window that is refreshed in the
   * background (see startBackgroundRefresh). Falls back to a live fetch
   * only if the window has never been loaded.
   */
  async getUpcomingMatches(days: number = MAX_DAYS) {
    const safeDays = Math.min(Math.max(days, 1), MAX_DAYS);
    if (!this.window) {
      await this.refreshWindow();
    }
    const cutoff = Date.now() + safeDays * 24 * 60 * 60 * 1000;
    return (this.window || []).filter(m => new Date(m.utcDate).getTime() <= cutoff);
  }

  /** Load the full MAX_DAYS window from the API. Keeps the old data if it fails. */
  async refreshWindow() {
    if (this.refreshing) return this.refreshing;
    this.refreshing = this.fetchWindow()
      .then(async matches => {
        this.window = matches;
        this.windowLoadedAt = Date.now();
        await this.refreshStandings();
        if (this.onWindowRefreshed) {
          try {
            this.onWindowRefreshed(this.withPredictions(matches));
          } catch (error: any) {
            logger.error('onWindowRefreshed failed', { message: error.message });
          }
        }
      })
      .catch(err => {
        logger.error('Window refresh failed, keeping previous data', { message: err.message });
        if (!this.window) throw err;
      })
      .finally(() => {
        this.refreshing = null;
      });
    return this.refreshing;
  }

  startBackgroundRefresh(intervalMs: number = CACHE_TTL_MS) {
    this.refreshWindow()
      .then(() => this.prepareHistoryModel())
      .then(() => this.refreshWindow()) // re-run so v2 predictions get recorded right away
      .catch(() => {});
    setInterval(() => this.refreshWindow().catch(() => {}), intervalMs);
    // Re-sync the current season's results and refit v2 every 6 hours
    setInterval(() => this.prepareHistoryModel().catch(() => {}), 6 * 60 * 60 * 1000);
  }

  get windowAge() {
    return this.windowLoadedAt ? Date.now() - this.windowLoadedAt : null;
  }

  /** Load/refresh standings for every competition in the window (cached 30 min). */
  private async refreshStandings() {
    const codes = Array.from(new Set((this.window || []).map(m => m.competition?.code).filter(Boolean)));
    const results = await Promise.allSettled(codes.map(code => this.getStandings(code)));
    let ok = 0;
    results.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value) {
        this.standingsByCode.set(codes[i], r.value);
        ok++;
      } else {
        const err: any = (r as PromiseRejectedResult).reason;
        console.log(`  ⚠️  standings ${codes[i]}: ${err?.response?.status || ''} ${err?.message || ''}`);
      }
    });
    console.log(`📊 Standings loaded for ${ok}/${codes.length} competitions`);
  }

  /** v1: standings-based Poisson model (always available once standings are loaded). */
  predictionV1(match: any): Prediction | null {
    if (!match?.homeTeam?.id || !match?.awayTeam?.id) return null;
    const standings = this.standingsByCode.get(match.competition?.code) || null;
    try {
      return predictFromStandings(standings, match.homeTeam.id, match.awayTeam.id);
    } catch (error: any) {
      logger.warn('Prediction v1 failed', { matchId: match.id, message: error.message });
      return null;
    }
  }

  /** All model predictions for a match (v1 standings, v2 history) — for tracking both. */
  allPredictionsFor(match: any): Prediction[] {
    const out: Prediction[] = [];
    const v1 = this.predictionV1(match);
    if (v1) out.push(v1);
    try {
      const v2 = predictV2(match);
      if (v2) out.push(v2);
    } catch (error: any) {
      logger.warn('Prediction v2 failed', { matchId: match.id, message: error.message });
    }
    return out;
  }

  /** The prediction shown on the site: v2 (history model) when available, else v1. */
  predictionFor(match: any): Prediction | null {
    const all = this.allPredictionsFor(match);
    return all.find(p => p.model.startsWith('dc-history')) || all[0] || null;
  }

  withPredictions<T extends { id: number }>(matches: T[]): (T & { prediction: Prediction | null; predictions: Prediction[] })[] {
    return matches.map(m => {
      const predictions = this.allPredictionsFor(m);
      return { ...m, prediction: predictions.find(p => p.model.startsWith('dc-history')) || predictions[0] || null, predictions };
    });
  }

  /** Download history (first time), map team names and fit model v2. */
  async prepareHistoryModel(forceSync = false) {
    try {
      const r = await prepareModelV2(this.standingsByCode, forceSync);
      console.log(`🧠 Model v2 ready: ${r.fitted} groups fitted`);
      return r;
    } catch (error: any) {
      logger.error('Model v2 preparation failed', { message: error.message });
      return null;
    }
  }

  get standings() {
    return this.standingsByCode;
  }

  private async fetchWindow() {
    const today = new Date();
    const end = new Date(today.getTime() + MAX_DAYS * 24 * 60 * 60 * 1000);
    const dateFrom = toDateString(today);
    const dateTo = toDateString(end);

    console.log(`🔄 Fetching matches ${dateFrom} → ${dateTo} from ${this.competitions.length} competitions...`);

    const results = await Promise.allSettled(
      this.competitions.map(code =>
        this.client
          .get(`/competitions/${code}/matches`, { params: { dateFrom, dateTo } })
          .then(res => ({ code, matches: (res.data.matches || []) as any[] }))
      )
    );

    const all: any[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled') {
        console.log(`  ✅ ${r.value.code}: ${r.value.matches.length} matches`);
        all.push(...r.value.matches);
      } else {
        const err: any = r.reason;
        const status = err?.response?.status;
        const msg = err?.response?.data?.message || err?.message;
        console.log(`  ⚠️  failed: ${status || ''} ${msg}`);
        logger.warn('Competition fetch failed', { status, msg });
      }
    }

    // Keep only upcoming/live, dedupe, sort by kickoff
    const byId = new Map<number, any>();
    for (const m of all) {
      if (ACTIVE_STATUSES.has(m.status)) byId.set(m.id, m);
    }
    const matches = Array.from(byId.values()).sort(
      (a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime()
    );

    console.log(`✅ Total: ${matches.length} upcoming/live matches (next ${MAX_DAYS} days)`);
    return matches;
  }

  /** All matches (any status) between two dates, across the plan's competitions. Max 10 days. */
  async getMatchesInRange(dateFrom: string, dateTo: string) {
    const response = await this.client.get('/matches', { params: { dateFrom, dateTo } });
    return (response.data.matches || []) as any[];
  }

  /** Matches currently in play across all competitions the plan allows. */
  async getLiveMatches() {
    const cacheKey = 'live';
    const cached = this.getCached<any[]>(cacheKey);
    if (cached) return cached;

    try {
      const response = await this.client.get('/matches', {
        params: { status: 'IN_PLAY' }
      });
      const inPlay: any[] = response.data.matches || [];
      // The API treats IN_PLAY and PAUSED separately; fetch PAUSED too
      const pausedRes = await this.client.get('/matches', {
        params: { status: 'PAUSED' }
      });
      const paused: any[] = pausedRes.data.matches || [];

      const live = [...inPlay, ...paused].filter(m => LIVE_STATUSES.has(m.status));
      this.setCached(cacheKey, live, LIVE_CACHE_TTL_MS);
      return live;
    } catch (error: any) {
      logger.error('Error fetching live matches', { error: error.message });
      throw error;
    }
  }

  async getLeagues() {
    const cached = this.getCached<any[]>('leagues');
    if (cached) return cached;
    const response = await this.client.get('/competitions');
    const leagues = response.data.competitions || [];
    this.setCached('leagues', leagues, 60 * 60 * 1000);
    return leagues;
  }

  async getStandings(leagueCode: string) {
    const key = `standings:${leagueCode}`;
    const cached = this.getCached<any>(key);
    if (cached) return cached;
    const response = await this.client.get(`/competitions/${leagueCode}/standings`);
    this.setCached(key, response.data, 30 * 60 * 1000);
    return response.data;
  }

  async getMatch(matchId: number) {
    const key = `match:${matchId}`;
    const cached = this.getCached<any>(key);
    if (cached) return cached;
    const response = await this.client.get(`/matches/${matchId}`);
    this.setCached(key, response.data, 60 * 1000);
    return response.data;
  }

  async getHeadToHead(matchId: number, limit: number = 10) {
    const key = `h2h:${matchId}`;
    const cached = this.getCached<any>(key);
    if (cached) return cached;
    const response = await this.client.get(`/matches/${matchId}/head2head`, {
      params: { limit }
    });
    this.setCached(key, response.data, 60 * 60 * 1000);
    return response.data;
  }

  async getTeam(teamId: number) {
    const key = `team:${teamId}`;
    const cached = this.getCached<any>(key);
    if (cached) return cached;
    const response = await this.client.get(`/teams/${teamId}`);
    this.setCached(key, response.data, 60 * 60 * 1000);
    return response.data;
  }

  /** Last `limit` finished matches for a team (most recent first). */
  async getTeamRecentMatches(teamId: number, limit: number = 5) {
    const key = `teamform:${teamId}:${limit}`;
    const cached = this.getCached<any[]>(key);
    if (cached) return cached;

    const today = new Date();
    const from = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
    const response = await this.client.get(`/teams/${teamId}/matches`, {
      params: { status: 'FINISHED', dateFrom: toDateString(from), dateTo: toDateString(today) }
    });
    const matches: any[] = (response.data.matches || [])
      .sort((a: any, b: any) => new Date(b.utcDate).getTime() - new Date(a.utcDate).getTime())
      .slice(0, limit);
    this.setCached(key, matches, 30 * 60 * 1000);
    return matches;
  }

  /** Find a team's row in a competition table (TOTAL table, or the group that contains it). */
  private findStandingRow(standings: any, teamId: number) {
    const tables: any[] = standings?.standings || [];
    const total = tables.find(t => t.type === 'TOTAL' && t.table?.some((r: any) => r.team?.id === teamId));
    const table = total || tables.find(t => t.table?.some((r: any) => r.team?.id === teamId));
    if (!table) return null;
    const row = table.table.find((r: any) => r.team?.id === teamId);
    return row ? { ...row, group: table.group || null, teamsInTable: table.table.length } : null;
  }

  /**
   * Everything the match page needs in one call:
   * match (events, lineups, stats), head-to-head, both teams' standing + recent form.
   */
  async getMatchDetails(matchId: number) {
    const match = await this.getMatch(matchId);
    if (!match || !match.homeTeam || !match.awayTeam) {
      throw Object.assign(new Error('Match not found'), { response: { status: 404 } });
    }
    const homeId = match.homeTeam.id;
    const awayId = match.awayTeam.id;
    const code = match.competition?.code;

    const [h2h, standings, homeForm, awayForm] = await Promise.all([
      this.getHeadToHead(matchId, 10).catch(() => null),
      code ? this.getStandings(code).catch(() => null) : Promise.resolve(null),
      this.getTeamRecentMatches(homeId, 5).catch(() => []),
      this.getTeamRecentMatches(awayId, 5).catch(() => [])
    ]);

    if (standings && code) this.standingsByCode.set(code, standings);

    return {
      match,
      prediction: this.predictionFor(match),
      head2head: h2h,
      standings: {
        home: standings ? this.findStandingRow(standings, homeId) : null,
        away: standings ? this.findStandingRow(standings, awayId) : null
      },
      form: { home: homeForm, away: awayForm }
    };
  }
}

export default new FootballDataAPI();
