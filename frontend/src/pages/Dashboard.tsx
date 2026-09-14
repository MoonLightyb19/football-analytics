import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { API_URL, socket } from '../lib/socket'
import { predict } from '../lib/predict'

interface Team {
  id: number
  name: string
  shortName?: string
  tla?: string
  crest?: string
}

interface Competition {
  id: number
  name: string
  code: string
  emblem?: string
}

interface APIMatch {
  id: number
  utcDate: string
  status: string
  matchday?: number
  stage?: string
  competition: Competition
  homeTeam: Team
  awayTeam: Team
  score?: {
    winner?: string | null
    fullTime?: { home: number | null; away: number | null }
    halfTime?: { home: number | null; away: number | null }
  }
}

const LIVE = new Set(['IN_PLAY', 'PAUSED'])
const DAY_OPTIONS = [3, 7, 14, 30]

function dayKey(iso: string) {
  const d = new Date(iso)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function dayLabel(ts: number) {
  const today = dayKey(new Date().toISOString())
  const diff = Math.round((ts - today) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return new Date(ts).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'short'
  })
}

function kickoff(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function Dashboard() {
  const [matches, setMatches] = useState<APIMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(7)
  const [league, setLeague] = useState<string>('ALL')

  // Fetch the full 30-day window once; the day selector filters locally.
  // Re-fetch quietly every 5 minutes without blanking the list.
  useEffect(() => {
    let cancelled = false
    const load = (initial: boolean) => {
      if (initial) setLoading(true)
      axios
        .get(`${API_URL}/matches/upcoming`, { params: { days: 30 } })
        .then(res => {
          if (cancelled) return
          setMatches(res.data.data || [])
          setError(null)
        })
        .catch(err => {
          if (!cancelled && initial) setError(err.response?.data?.message || err.message)
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }
    load(true)
    const timer = setInterval(() => load(false), 5 * 60 * 1000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  // Live score pushes from the server
  useEffect(() => {
    const onLive = (payload: { data: APIMatch[] }) => {
      const live = new Map(payload.data.map(m => [m.id, m]))
      if (live.size === 0) return
      setMatches(prev => prev.map(m => live.get(m.id) || m))
    }
    socket.on('matches:live', onLive)
    return () => {
      socket.off('matches:live', onLive)
    }
  }, [])

  const competitions = useMemo(() => {
    const map = new Map<string, Competition>()
    matches.forEach(m => map.set(m.competition.code, m.competition))
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [matches])

  const visible = useMemo(() => {
    const cutoff = Date.now() + days * 86400000
    return matches.filter(
      m =>
        new Date(m.utcDate).getTime() <= cutoff &&
        (league === 'ALL' || m.competition.code === league)
    )
  }, [matches, league, days])

  const grouped = useMemo(() => {
    const groups = new Map<number, APIMatch[]>()
    visible.forEach(m => {
      const k = dayKey(m.utcDate)
      groups.set(k, [...(groups.get(k) || []), m])
    })
    return Array.from(groups.entries()).sort((a, b) => a[0] - b[0])
  }, [visible])

  const liveCount = matches.filter(m => LIVE.has(m.status)).length

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Upcoming Matches</h2>
          <p className="text-sm text-gray-500">
            {visible.length} matches in the next {days} days
            {liveCount > 0 && <span className="ml-2 text-red-600 font-medium">• {liveCount} live</span>}
          </p>
        </div>
        <div className="flex gap-1 bg-white rounded-lg shadow-sm p-1">
          {DAY_OPTIONS.map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 text-sm rounded-md transition ${
                days === d ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* League filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setLeague('ALL')}
          className={`px-3 py-1.5 text-sm rounded-full border transition ${
            league === 'ALL'
              ? 'bg-gray-900 text-white border-gray-900'
              : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
          }`}
        >
          All leagues
        </button>
        {competitions.map(c => (
          <button
            key={c.code}
            onClick={() => setLeague(c.code)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full border transition ${
              league === c.code
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
            }`}
          >
            {c.emblem && <img src={c.emblem} alt="" className="w-4 h-4 object-contain" />}
            {c.name}
          </button>
        ))}
      </div>

      {loading && <div className="text-center text-gray-500 py-16">Loading matches…</div>}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4">
          Failed to load matches: {error}
        </div>
      )}

      {!loading && !error && visible.length === 0 && (
        <div className="bg-white rounded-lg shadow p-10 text-center text-gray-500">
          No matches found for this selection.
        </div>
      )}

      {!loading &&
        grouped.map(([ts, dayMatches]) => (
          <section key={ts} className="mb-8">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">
              {dayLabel(ts)}{' '}
              <span className="text-gray-400 font-normal normal-case">· {dayMatches.length} matches</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {dayMatches.map(m => (
                <MatchCard key={m.id} match={m} />
              ))}
            </div>
          </section>
        ))}
    </div>
  )
}

function TeamRow({ team, score, bold }: { team: Team; score?: number | null; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        {team.crest ? (
          <img src={team.crest} alt="" className="w-6 h-6 object-contain flex-shrink-0" />
        ) : (
          <span className="w-6 h-6 rounded-full bg-gray-200 flex-shrink-0" />
        )}
        <span className={`truncate text-sm ${bold ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
          {team.shortName || team.name}
        </span>
      </div>
      {score !== undefined && score !== null && (
        <span className="font-bold text-gray-900 tabular-nums">{score}</span>
      )}
    </div>
  )
}

function MatchCard({ match }: { match: APIMatch }) {
  const isLive = LIVE.has(match.status)
  const p = predict(match)
  const ft = match.score?.fullTime

  return (
    <Link
      to={`/match/${match.id}`}
      className="block bg-white rounded-lg shadow hover:shadow-md transition-shadow p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 text-xs text-gray-500 min-w-0">
          {match.competition.emblem && (
            <img src={match.competition.emblem} alt="" className="w-4 h-4 object-contain" />
          )}
          <span className="truncate">{match.competition.name}</span>
          {match.matchday && <span className="text-gray-400">· MD {match.matchday}</span>}
        </div>
        {isLive ? (
          <span className="flex items-center gap-1 text-xs font-semibold text-red-600">
            <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" />
            {match.status === 'PAUSED' ? 'HT' : 'LIVE'}
          </span>
        ) : (
          <span className="text-xs text-gray-500 tabular-nums">{kickoff(match.utcDate)}</span>
        )}
      </div>

      <div className="space-y-1.5 mb-4">
        <TeamRow team={match.homeTeam} score={isLive ? ft?.home : undefined} bold />
        <TeamRow team={match.awayTeam} score={isLive ? ft?.away : undefined} bold />
      </div>

      {/* Prediction bar */}
      <div>
        <div className="flex h-2 rounded-full overflow-hidden bg-gray-100">
          <div className="bg-blue-500" style={{ width: `${p.home}%` }} />
          <div className="bg-yellow-400" style={{ width: `${p.draw}%` }} />
          <div className="bg-red-500" style={{ width: `${p.away}%` }} />
        </div>
        <div className="flex justify-between text-xs mt-1.5 tabular-nums">
          <span className="text-blue-600 font-medium">1 · {p.home}%</span>
          <span className="text-yellow-600 font-medium">X · {p.draw}%</span>
          <span className="text-red-600 font-medium">2 · {p.away}%</span>
        </div>
      </div>
    </Link>
  )
}

export default Dashboard
