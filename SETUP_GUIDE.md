# Setup Guide - Football Analytics Platform 🚀

This guide will help you get the platform running locally.

## 📅 Wake-Up Checklist

When you wake up, here's what was built:

✅ Complete project structure (backend + frontend)  
✅ TypeScript configuration for both  
✅ React + TailwindCSS setup (frontend)  
✅ Express + Socket.io setup (backend)  
✅ PostgreSQL database schema  
✅ Environment templates (.env.example)  
✅ Docker setup (optional but recommended)  
✅ README with API documentation  

---

## 🎯 What You Need to Do Now

### Step 1: Get API Keys (15 mins)

#### Football-Data.org
1. Go to https://www.football-data.org/
2. Click "Sign Up" → Create account
3. Go to Dashboard → Copy API Token
4. Save it somewhere safe

#### RapidAPI (Football API)
1. Go to https://rapidapi.com/
2. Sign up with Google/GitHub
3. Search for "api-football"
4. Click subscribe (free tier is fine)
5. Copy API key from dashboard

### Step 2: Setup Backend

```bash
cd backend

# Copy environment file
cp .env.example .env

# Edit .env with your API keys
nano .env
# Add:
# FOOTBALL_DATA_API_KEY=paste_your_key_here
# RAPID_API_KEY=paste_your_key_here
# JWT_SECRET=create_a_random_string_here

# Install dependencies
npm install

# Test if it runs
npm run dev
# Should show: Server running on http://localhost:3001
```

### Step 3: Setup Database

Option A: **Using Docker (Easier)**
```bash
# From root directory
docker-compose up

# This starts:
# - PostgreSQL (port 5432)
# - Redis (port 6379)
# - Backend (port 3001)
# - Frontend (port 3000)

# Done! Visit http://localhost:3000
```

Option B: **Manual Setup**
```bash
# Install PostgreSQL locally, then:

# Create database
createdb -U postgres football_analytics

# Create user
psql -U postgres -c "CREATE USER football_user WITH PASSWORD 'football_password';"

# Grant privileges
psql -U postgres -c "ALTER ROLE football_user SET client_encoding TO 'utf8'; GRANT ALL PRIVILEGES ON DATABASE football_analytics TO football_user;"

# Run schema
psql -U football_user -d football_analytics -f database/schema.sql
```

### Step 4: Setup Frontend

```bash
cd frontend

# Copy environment file
cp .env.example .env

# Install dependencies
npm install

# Run development server
npm run dev
# Opens on http://localhost:3000
```

### Step 5: Verify Everything Works

1. **Check Backend** (Terminal 1)
   ```bash
   cd backend && npm run dev
   ```
   Should show: `Server running on http://localhost:3001`

2. **Check Frontend** (Terminal 2)
   ```bash
   cd frontend && npm run dev
   ```
   Should show: `VITE v5.x.x  ready in xxx ms`

3. **Visit Dashboard**
   Go to http://localhost:3000  
   You should see the Football Analytics dashboard with:
   - Upcoming Matches section
   - Live Scores section
   - Connection status (green = connected)

---

## 🐳 Docker Quick Command

If you have Docker installed:

```bash
# From root directory
docker-compose up

# Wait for all services to start (2-3 mins)
# Visit http://localhost:3000

# To stop:
docker-compose down
```

---

## 📝 Environment Variables Explained

### Backend (.env)
```
PORT=3001                              # Backend port
NODE_ENV=development                   # Or production
DB_HOST=localhost                      # PostgreSQL host
DB_PORT=5432                          # PostgreSQL port
DB_USER=football_user                 # DB user
DB_PASSWORD=football_password         # DB password
DB_NAME=football_analytics            # DB name
REDIS_HOST=localhost                  # Redis host
REDIS_PORT=6379                       # Redis port
FOOTBALL_DATA_API_KEY=your_key        # GET FROM STEP 1
RAPID_API_KEY=your_key                # GET FROM STEP 1
JWT_SECRET=any_random_string          # For authentication
CORS_ORIGIN=http://localhost:3000     # Frontend URL
```

### Frontend (.env)
```
VITE_API_URL=http://localhost:3001/api    # Backend API
VITE_WS_URL=http://localhost:3001         # WebSocket
```

---

## 🔧 Troubleshooting

### Backend won't start
```bash
# Check if port 3001 is in use
lsof -i :3001  # Mac/Linux
netstat -ano | findstr :3001  # Windows

# Kill process on port 3001
kill -9 <PID>  # Mac/Linux
taskkill /PID <PID> /F  # Windows
```

### Database connection fails
```bash
# Test PostgreSQL connection
psql -U football_user -d football_analytics -h localhost

# Should show: football_analytics=>
# Type \q to exit
```

### Frontend shows blank page
```bash
# Check browser console (F12)
# Should see WebSocket connection message
# If red error, check VITE_API_URL in .env
```

### Port already in use
- Backend (3001): Change `PORT` in .env
- Frontend (3000): Change in `frontend/vite.config.ts`
- PostgreSQL (5432): Change `DB_PORT` in .env
- Redis (6379): Change `REDIS_PORT` in .env

---

## 📚 Next Steps (When Ready)

Once everything is running:

1. **Check the real data** - See if it connects to Football-Data.org
2. **Add some test matches** - Manually insert into database to test frontend
3. **Build prediction engine** - Create the ML model
4. **Connect real APIs** - Replace mock data with real API calls
5. **Deploy to production** - Use Vercel (frontend) + Railway (backend)

---

## 💡 Pro Tips

1. **Use VS Code** - Better TypeScript support
2. **Install extensions**:
   - ES7+ React/Redux/React-Native snippets
   - Tailwind CSS IntelliSense
   - Prettier - Code formatter

3. **Keep terminals open**:
   - Terminal 1: `npm run dev` (backend)
   - Terminal 2: `npm run dev` (frontend)
   - Terminal 3: Any git/admin commands

4. **Development loop**:
   ```
   Edit code → Save → Hot reload (automatic)
   Check browser → See changes instantly
   ```

---

## 🆘 Still Stuck?

1. Check README.md for architecture overview
2. Check each `.env.example` file for variable explanation
3. Visit API provider docs:
   - Football-Data.org: https://www.football-data.org/client/register
   - RapidAPI: https://rapidapi.com/

---

**You're all set! Time to build something awesome!** 🚀

Questions when you wake up? Just ask!
