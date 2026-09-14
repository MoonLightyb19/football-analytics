# Football Analytics & Prediction Platform 🚀

A comprehensive full-stack platform for football statistics, real-time data analysis, and match outcome predictions using AI/ML.

**Status:** Phase 1 - Foundation Complete ✅  
**Next Phase:** API Integration & Database Connection

---

## 📋 Project Structure

```
football-analytics/
├── backend/              # Node.js + Express API
│   ├── src/
│   │   ├── index.ts     # Main server file
│   │   ├── services/    # API clients (Football-Data.org, RapidAPI)
│   │   ├── routes/      # API endpoints (TODO)
│   │   ├── utils/       # Logger, helpers
│   │   └── database/    # Database setup (TODO)
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   └── Dockerfile
├── frontend/            # React + TypeScript + TailwindCSS
│   ├── src/
│   │   ├── pages/       # Dashboard, MatchDetail
│   │   ├── components/  # Reusable components (TODO)
│   │   ├── App.tsx
│   │   └── index.css
│   ├── package.json
│   ├── vite.config.ts
│   ├── .env.example
│   └── Dockerfile
├── database/
│   └── schema.sql       # PostgreSQL schema
├── docker-compose.yml   # Full stack containerization
└── README.md
```

---

## 🔧 Quick Start (Development)

### Prerequisites
- Node.js 20+
- PostgreSQL 16+
- Redis 7+
- npm or yarn

### 1. Clone & Setup

```bash
# Clone project (when ready for GitHub)
# git clone <repo>
# cd football-analytics

# Backend setup
cd backend
cp .env.example .env
npm install

# Frontend setup (in new terminal)
cd frontend
cp .env.example .env
npm install
```

### 2. Database Setup

```bash
# Create PostgreSQL database
psql -U postgres
CREATE DATABASE football_analytics;
CREATE USER football_user WITH PASSWORD 'football_password';
ALTER ROLE football_user SET client_encoding TO 'utf8';
GRANT ALL PRIVILEGES ON DATABASE football_analytics TO football_user;

# Run schema
psql -U football_user -d football_analytics -f database/schema.sql
```

### 3. Configure Environment

**Backend (.env)**
```
PORT=3001
NODE_ENV=development
DB_HOST=localhost
DB_USER=football_user
DB_PASSWORD=football_password
DB_NAME=football_analytics
FOOTBALL_DATA_API_KEY=your_key_here
RAPID_API_KEY=your_key_here
JWT_SECRET=your_secret_here
```

**Frontend (.env)**
```
VITE_API_URL=http://localhost:3001/api
VITE_WS_URL=http://localhost:3001
```

### 4. Run Servers

**Backend (Terminal 1)**
```bash
cd backend
npm run dev
# Runs on http://localhost:3001
```

**Frontend (Terminal 2)**
```bash
cd frontend
npm run dev
# Runs on http://localhost:3000
```

### 5. Test Connection
Visit `http://localhost:3000` - you should see the Football Analytics dashboard

---

## 🐳 Docker Setup (Recommended)

```bash
# Start everything (PostgreSQL, Redis, Backend, Frontend)
docker-compose up

# Visit http://localhost:3000
```

To stop:
```bash
docker-compose down
```

---

## 📚 API Documentation

### Endpoints (To be implemented)

```
GET  /api/leagues              - List all leagues
GET  /api/leagues/:id/matches  - Matches by league
GET  /api/matches/:id          - Detailed match info
GET  /api/matches/:id/players  - Players in match + stats
GET  /api/teams/:id            - Team info + squad stats
GET  /api/players/:id          - Player profile + form
GET  /api/predictions/:match_id - Prediction for match
POST /api/user/predictions     - Save user's prediction
GET  /api/user/predictions     - User's prediction history
```

### WebSocket Events

```
match:updated          - Live match score, stats
player:injured         - New injury notification
player:suspended       - Yellow/red card
prediction:updated     - Updated prediction probabilities
form:updated          - Player form changes
```

---

## 🗄️ Database Schema

Key tables:
- `leagues` - Competitions (Big 5, CL, etc.)
- `teams` - Football clubs
- `players` - Player information
- `matches` - Match data
- `player_stats` - Per-match performance
- `injury_records` - Current injuries
- `predictions` - Match predictions
- `users` & `user_predictions` - Track user predictions

See `database/schema.sql` for full schema.

---

## 🔐 API Keys Setup

### Football-Data.org
1. Go to https://www.football-data.org/
2. Create free account
3. Get API key from dashboard
4. Add to `.env`: `FOOTBALL_DATA_API_KEY=your_key`

### RapidAPI (Football API)
1. Go to https://rapidapi.com/api-sports/api/api-football
2. Subscribe (free tier available)
3. Get API key from dashboard
4. Add to `.env`: `RAPID_API_KEY=your_key`

---

## 📊 Next Steps (Phase 2-4)

### Phase 2: Data Integration (Week 2)
- [ ] Implement Football-Data.org API client
- [ ] Implement RapidAPI client
- [ ] Create data fetching pipeline
- [ ] Set up Redis caching
- [ ] Implement database sync

### Phase 3: Prediction Engine (Week 2-3)
- [ ] Build statistical prediction model
- [ ] Calculate team strength metrics
- [ ] Implement confidence scoring
- [ ] Create API endpoints for predictions

### Phase 4: Frontend (Week 3-4)
- [ ] Build match detail page with lineups
- [ ] Implement player form visualizations
- [ ] Create injury/suspension display
- [ ] Build prediction history tracker
- [ ] Add real-time updates with WebSocket

---

## 🧪 Testing

```bash
# Backend
cd backend
npm run type-check
npm run lint

# Frontend
cd frontend
npm run type-check
npm run lint
```

---

## 🚀 Deployment

### Vercel (Frontend)
```bash
# Push to GitHub
git push origin main

# Connect to Vercel - automatic deployment
```

### Railway/Render (Backend)
```bash
# Docker already configured
# Push to hosting platform
```

---

## 📝 Git & GitHub

```bash
# Initialize git (when ready)
git init
git add .
git commit -m "Initial commit: Phase 1 complete"
git remote add origin <your-repo-url>
git push -u origin main
```

---

## 💬 Notes

- All paths are ready for immediate development
- Type checking is strict (TypeScript)
- TailwindCSS is configured and ready
- WebSocket server running on backend
- Real-time updates infrastructure in place

---

## 📞 Questions?

When you wake up:
1. API keys from Football-Data.org & RapidAPI
2. Verify database connection
3. Run `docker-compose up` for full stack test
4. Check `http://localhost:3000` - should show dashboard

Then we move to Phase 2! 🎯

---

**Built with:** TypeScript, React, Node.js, Express, PostgreSQL, Socket.io, TailwindCSS

**Team:** Yarin Boker  
**Created:** September 2026
