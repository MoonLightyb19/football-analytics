import axios, { AxiosInstance } from 'axios';
import logger from '../utils/logger';

class SportAPI {
  private client: AxiosInstance;
  private baseURL: string;
  private apiKey: string;
  private apiHost: string;

  constructor() {
    this.baseURL = 'https://sportapi7.p.rapidapi.com/api/v1';
    this.apiKey = process.env.RAPIDAPI_KEY || '';
    this.apiHost = process.env.RAPIDAPI_HOST || 'sportapi7.p.rapidapi.com';

    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'X-RapidAPI-Key': this.apiKey,
        'X-RapidAPI-Host': this.apiHost
      }
    });
  }

  async getUpcomingMatches() {
    try {
      // Get matches with SCHEDULED status (upcoming)
      // SportAPI uses events endpoint
      const response = await this.client.get('/events', {
        params: {
          status: 'SCHEDULED',
          limit: 50,
          sort: 'date_asc'
        }
      });

      const matches = response.data.events || response.data.results || [];

      // Transform SportAPI matches to our format
      return matches.map((match: any) => ({
        id: match.id || match.eventId,
        homeTeam: match.home?.name || match.homeTeam?.name || 'Unknown',
        awayTeam: match.away?.name || match.awayTeam?.name || 'Unknown',
        date: match.date || match.startDate || new Date().toISOString(),
        status: match.status || 'SCHEDULED',
        competition: {
          name: match.league?.name || match.competition?.name || 'Unknown'
        }
      }));
    } catch (error) {
      logger.error('Error fetching upcoming matches from SportAPI', { error });
      throw error;
    }
  }

  async getMatchesByDate(date: string) {
    try {
      const response = await this.client.get(`/events/date/${date}`, {
        params: {
          limit: 50
        }
      });

      return response.data.events || response.data.results || [];
    } catch (error) {
      logger.error(`Error fetching matches for date ${date}`, { error });
      throw error;
    }
  }

  async getLeagues() {
    try {
      const response = await this.client.get('/leagues', {
        params: {
          limit: 100
        }
      });

      return response.data.leagues || response.data.results || [];
    } catch (error) {
      logger.error('Error fetching leagues', { error });
      throw error;
    }
  }
}

export default new SportAPI();
