import axios, { AxiosInstance } from 'axios';
import logger from '../utils/logger';

class FootballDataAPI {
  private client: AxiosInstance;
  private baseURL: string;
  private apiKey: string;

  constructor() {
    this.baseURL = process.env.FOOTBALL_DATA_BASE_URL || 'https://api.football-data.org/v4';
    this.apiKey = process.env.FOOTBALL_DATA_API_KEY || '';

    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'X-Auth-Token': this.apiKey
      }
    });
  }

  async getLeagues() {
    try {
      const response = await this.client.get('/competitions');
      return response.data.competitions;
    } catch (error) {
      logger.error('Error fetching leagues', { error });
      throw error;
    }
  }

  async getMatchesByLeague(leagueCode: string) {
    try {
      const response = await this.client.get(`/competitions/${leagueCode}/matches`);
      return response.data.matches;
    } catch (error) {
      logger.error(`Error fetching matches for league ${leagueCode}`, { error });
      throw error;
    }
  }

  async getMatch(matchId: number) {
    try {
      const response = await this.client.get(`/matches/${matchId}`);
      return response.data.match;
    } catch (error) {
      logger.error(`Error fetching match ${matchId}`, { error });
      throw error;
    }
  }

  async getTeam(teamId: number) {
    try {
      const response = await this.client.get(`/teams/${teamId}`);
      return response.data.team;
    } catch (error) {
      logger.error(`Error fetching team ${teamId}`, { error });
      throw error;
    }
  }

  async getTeamSquad(teamId: number) {
    try {
      const response = await this.client.get(`/teams/${teamId}`);
      return response.data.squad;
    } catch (error) {
      logger.error(`Error fetching team squad ${teamId}`, { error });
      throw error;
    }
  }
}

export default new FootballDataAPI();
