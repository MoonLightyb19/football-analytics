import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { Server } from 'socket.io';
import http from 'http';
import dotenv from 'dotenv';
import logger from './utils/logger';

// Load .env from backend root
const envResult = dotenv.config();
console.log('🔍 Loading .env from:', process.cwd());
if (envResult.error) {
  console.error('❌ Error loading .env:', envResult.error.message);
} else {
  console.log('✅ .env loaded successfully');
  console.log('API Key:', process.env.FOOTBALL_DATA_API_KEY ? '✅ SET' : '❌ NOT SET');
}

// Import after env is loaded
import footballDataAPI from './services/footballDataAPI';

const isDev = (process.env.NODE_ENV || 'development') !== 'production';

// In development accept any local origin (Vite may switch ports, 127.0.0.1 vs localhost, etc.)
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map(o => o.trim());
const corsOrigin = isDev ? true : allowedOrigins;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Middleware
app.use(helmet());
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.originalUrl}`);
  next();
});

function sendError(res: express.Response, error: any, fallback: string) {
  const status = error?.response?.status || 500;
  const message = error?.response?.data?.message || error?.message || fallback;
  logger.error(fallback, { status, message });
  res.status(status).json({ error: fallback, message });
}

// ---------- REST ----------

app.get('/api/health', (_req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

// Upcoming + live matches. ?days=30 (1-30). Served from memory.
app.get('/api/matches/upcoming', async (req, res) => {
  try {
    const days = parseInt(String(req.query.days || '30'), 10) || 30;
    const matches = await footballDataAPI.getUpcomingMatches(days);
    res.json({
      data: matches,
      count: matches.length,
      days,
      cacheAgeMs: footballDataAPI.windowAge,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    sendError(res, error, 'Failed to fetch upcoming matches');
  }
});

app.get('/api/matches/live', async (_req, res) => {
  try {
    const matches = await footballDataAPI.getLiveMatches();
    res.json({ data: matches, count: matches.length, timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'Failed to fetch live matches');
  }
});

app.get('/api/matches/:id(\\d+)', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const match = await footballDataAPI.getMatch(id);
    res.json({ data: match, timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'Failed to fetch match');
  }
});

// Everything for the match page: match + events + lineups + stats + h2h + standings + form
app.get('/api/matches/:id(\\d+)/details', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const details = await footballDataAPI.getMatchDetails(id);
    res.json({ data: details, timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'Failed to fetch match details');
  }
});

app.get('/api/matches/:id(\\d+)/head2head', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const h2h = await footballDataAPI.getHeadToHead(id);
    res.json({ data: h2h, timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'Failed to fetch head-to-head');
  }
});

app.get('/api/leagues', async (_req, res) => {
  try {
    const leagues = await footballDataAPI.getLeagues();
    res.json({ data: leagues, count: leagues.length, timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'Failed to fetch leagues');
  }
});

app.get('/api/leagues/:code/standings', async (req, res) => {
  try {
    const standings = await footballDataAPI.getStandings(req.params.code.toUpperCase());
    res.json({ data: standings, timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'Failed to fetch standings');
  }
});

app.get('/api/teams/:id(\\d+)', async (req, res) => {
  try {
    const team = await footballDataAPI.getTeam(parseInt(req.params.id, 10));
    res.json({ data: team, timestamp: new Date().toISOString() });
  } catch (error: any) {
    sendError(res, error, 'Failed to fetch team');
  }
});

// ---------- WebSocket ----------

io.on('connection', socket => {
  logger.info(`Client connected: ${socket.id}`);

  socket.on('subscribe_match', (matchId: number) => {
    socket.join(`match:${matchId}`);
  });

  socket.on('unsubscribe_match', (matchId: number) => {
    socket.leave(`match:${matchId}`);
  });

  socket.on('disconnect', reason => {
    logger.info(`Client disconnected: ${socket.id} (${reason})`);
  });
});

app.set('io', io);

// Push live scores to all clients every 60s (only when someone is connected)
const LIVE_POLL_MS = parseInt(process.env.LIVE_POLL_MS || '60000', 10);
setInterval(async () => {
  if (io.engine.clientsCount === 0) return;
  try {
    const live = await footballDataAPI.getLiveMatches();
    io.emit('matches:live', { data: live, timestamp: new Date().toISOString() });
    // Per-match rooms get their own update (score / status / minute)
    for (const m of live) {
      io.to(`match:${m.id}`).emit('match:live', m);
    }
  } catch (error: any) {
    logger.warn('Live poll failed', { message: error.message });
  }
}, LIVE_POLL_MS);

// ---------- Errors ----------

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error(`Error: ${err.message}`);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
  logger.info(`WebSocket server ready (CORS: ${isDev ? 'any origin [dev]' : allowedOrigins.join(', ')})`);
  // Warm the fixture window now and keep it fresh in the background
  footballDataAPI.startBackgroundRefresh();
});

export { app, io };
