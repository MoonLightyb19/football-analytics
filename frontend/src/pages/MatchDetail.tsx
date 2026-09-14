import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import axios from 'axios'
import { API_URL, socket } from '../lib/socket'
import { fairOdds, CONFIDENCE_LABEL, type Prediction } from '../lib/predict'

/* ---------- types (Football-Data.org v4 shapes, loosely) ---------- */

interface Team {
  id: number
  name: string
  shortName?: string
  tla?: string
  crest?: string
  coach?: { id: number; name: string; nationality?: string } | null
  formation?: string | null
  lineup?: Player[]
  bench?: Player[]
  statistics?: Record<string, number> | null
}

interface Player {
  id: number
  name: string
  position?: string | null
  shirtNumber?: number | null
}

interface Match {
  id: number
  utcDate: string
  status: string
  minute?: number | null
  injuryTime?: number | null
  matchday?: number | null
  stage?: string
  group?: string | null
  venue?: string | null
  attendance?: number | null
  competition: { id: number; name: string; code: string; emblem?: string }
  season?: { startDate: string; endDate: string }
  homeTeam: Team
  awayTeam: Team
  score: {
    winner?: string | null
    fullTime: { home: number | null; away: number | null }
    halfTime?: { home: number | null; away: number | null }
  }
  goals?: Goal[]
  bookings?: Booking[]
  substitutions?: Substitution[]
  referees?: { id: number; name: string; type?: string; nationality?: string }[]
}

interface Goal {
  minute: number
  injuryTime?: number | null
  type: string
  team: { id: number; name: string }
  scorer: { id: number; name: string }
  assist?: { id: number; name: string } | null
  score?: { home: number; away: number }
}

interface Booking {
  minute: number
  team: { id: number; name: string }
  player: { id: number; name: string }
  card: 'YELLOW' | 'YELLOW_RED' | 'RED'
}

interface Substitution {
  minute: number
  team: { id: number; name: string }
  playerOut: { id: number; name: string }
  playerIn: { id: number; name: string }
}

interface StandingRow {
  position: number
  playedGames: number
  form?: string | null
  won: number
  draw: number
  lost: number
  points: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  group?: string | null
  teamsInTable?: number
}

interface Details {
  match: Match
  prediction: Prediction | null
  head2head: {
    aggregates: {
      numberOfMatches: number
      totalGoals: number
      homeTeam: { id: number; wins: number; draws: number; losses: number }
      awayTeam: { id: number; wins: number; draws: number; losses: number }
    }
    matches: Match[]
  } | null
  standings: { home: StandingRow | null; away: StandingRow | null }
  form: { home: Match[]; away: Match[] }
}

const LIVE = new Set(['IN_PLAY', 'PAUSED'])
const DONE = new Set(['FINISHED', 'AWARDED'])

/* ---------- helpers ---------- */

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
}

function resultFor(teamId: number, m: Match): 'W' | 'D' | 'L' | null {
  const w = m.score?.winner
  if (!w) return null
  if (w === 'DRAW') return 'D'
  const isHome = m.homeTeam.id === teamId
  return (w === 'HOME_TEAM') === isHome ? 'W' : 'L'
}

function statusLabel(m: Match) {
  if (m.status === 'IN_PLAY') return m.minute ? `${m.minute}'${m.injuryTime ? `+${m.injuryTime}` : ''}` : 'LIVE'
  if (m.status === 'PAUSED') return 'Half-time'
  if (m.status === 'FINISHED') return 'Full-time'
  if (m.status === 'POSTPONED') return 'Postponed'
  if (m.status === 'CANCELLED') return 'Cancelled'
  if (m.status === 'SUSPENDED') return 'Suspended'
  return fmtTime(m.utcDate)
}

const STAT_LABELS: Record<string, string> = {
  ball_possession: 'Possession %',
  shots: 'Shots',
  shots_on_goal: 'Shots on target',
  shots_off_goal: 'Shots off target',
  corner_kicks: 'Corners',
  fouls: 'Fouls',
  offsides: 'Offsides',
  saves: 'Saves',
  free_kicks: 'Free kicks',
  goal_kicks: 'Goal kicks',
  throw_ins: 'Throw-ins',
  yellow_cards: 'Yellow cards',
  red_cards: 'Red cards'
}

/* ---------- page ---------- */

function MatchDetail() {
  const { id } = useParams()
  const matchId = Number(id)
  const [details, setDetails] = useState<Details | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = (initial = false) => {
    if (initial) setLoading(true)
    return axios
      .get(`${API_URL}/matches/${matchId}/details`)
      .then(res => {
        setDetails(res.data.data)
        setError(null)
      })
      .catch(err => setError(err.response?.data?.message || err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!matchId) return
    load(true)
  }, [matchId])

  // Live: subscribe to this match's room and refresh events every 60s
  const isLive = details ? LIVE.has(details.match.status) : false
  useEffect(() => {
    if (!matchId) return
    socket.emit('subscribe_match', matchId)
    const onLive = (m: Match) => {
      if (m.id !== matchId) return
      setDetails(prev => (prev ? { ...prev, match: { ...prev.match, ...m } } : prev))
    }
    socket.on('match:live', onLive)
    const timer = isLive ? setInterval(() => load(false), 60 * 1000) : null
    return () => {
      socket.emit('unsubscribe_match', matchId)
      socket.off('match:live', onLive)
      if (timer) clearInterval(timer)
    }
  }, [matchId, isLive])

  const events = useMemo(() => {
    if (!details) return []
    const m = details.match
    const list: { minute: number; extra: number; kind: string; teamId: number; text: string; sub?: string }[] = []
    ;(m.goals || []).forEach(g =>
      list.push({
        minute: g.minute,
        extra: g.injuryTime || 0,
        kind: g.type === 'OWN' ? 'own' : g.type === 'PENALTY' ? 'pen' : 'goal',
        teamId: g.team.id,
        text: g.scorer.name + (g.type === 'PENALTY' ? ' (pen)' : g.type === 'OWN' ? ' (og)' : ''),
        sub: g.assist ? `assist: ${g.assist.name}` : undefined
      })
    )
    ;(m.bookings || []).forEach(b =>
      list.push({ minute: b.minute, extra: 0, kind: b.card.toLowerCase(), teamId: b.team.id, text: b.player.name })
    )
    ;(m.substitutions || []).forEach(s =>
      list.push({
        minute: s.minute,
        extra: 0,
        kind: 'sub',
        teamId: s.team.id,
        text: s.playerIn.name,
        sub: `for ${s.playerOut.name}`
      })
    )
    return list.sort((a, b) => a.minute - b.minute || a.extra - b.extra)
  }, [details])

  if (loading) return <div className="max-w-5xl mx-auto px-4 py-16 text-center text-gray-500">Loading match…</div>
  if (error || !details)
    return (
      <div className="max-w-5xl mx-auto px-4 py-10">
        <Link to="/" className="text-sm text-gray-500 hover:text-gray-900">← Back</Link>
        <div className="mt-4 bg-red-50 border border-red-200 text-red-700 rounded-lg p-4">
          Could not load match: {error || 'unknown error'}
        </div>
      </div>
    )

  const m = details.match
  const home = m.homeTeam
  const away = m.awayTeam
  const live = LIVE.has(m.status)
  const done = DONE.has(m.status)
  const showScore = live || done
  const p = details.prediction
  const ft = m.score.fullTime
  const ht = m.score.halfTime
  const referee = (m.referees || []).find(r => !r.type || r.type === 'REFEREE') || (m.referees || [])[0]
  const homeStats = home.statistics || null
  const awayStats = away.statistics || null
  const statKeys = homeStats && awayStats ? Object.keys(STAT_LABELS).filter(k => k in homeStats && k in awayStats) : []
  const hasLineups = (home.lineup?.length || 0) > 0 || (away.lineup?.length || 0) > 0

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <Link to="/" className="text-sm text-gray-500 hover:text-gray-900">← All matches</Link>

      {/* Header */}
      <div className="mt-3 bg-white rounded-xl shadow p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-500 mb-5">
          <div className="flex items-center gap-2">
            {m.competition.emblem && <img src={m.competition.emblem} alt="" className="w-5 h-5 object-contain" />}
            <span className="font-medium text-gray-700">{m.competition.name}</span>
            {m.matchday && <span>· Matchday {m.matchday}</span>}
            {m.stage && m.stage !== 'REGULAR_SEASON' && <span>· {m.stage.replace(/_/g, ' ').toLowerCase()}</span>}
            {m.group && <span>· {m.group.replace(/_/g, ' ')}</span>}
          </div>
          <div>{fmtDate(m.utcDate)}</div>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <TeamHeader team={home} align="right" />
          <div className="text-center min-w-[120px]">
            {showScore ? (
              <>
                <div className="text-5xl font-bold tabular-nums text-gray-900">
                  {ft.home ?? 0}<span className="text-gray-300 mx-2">–</span>{ft.away ?? 0}
                </div>
                {ht && ht.home !== null && (
                  <div className="text-xs text-gray-400 mt-1">HT {ht.home}–{ht.away}</div>
                )}
              </>
            ) : (
              <div className="text-4xl font-bold tabular-nums text-gray-900">{fmtTime(m.utcDate)}</div>
            )}
            <div
              className={`mt-2 inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
                live ? 'bg-red-50 text-red-600' : done ? 'bg-gray-100 text-gray-600' : 'bg-blue-50 text-blue-600'
              }`}
            >
              {live && <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" />}
              {live ? statusLabel(m) : done ? 'Full-time' : 'Kick-off'}
            </div>
          </div>
          <TeamHeader team={away} align="left" />
        </div>

        {(m.venue || referee || m.attendance) && (
          <div className="mt-5 pt-4 border-t flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500 justify-center">
            {m.venue && <span>Venue: <span className="text-gray-700">{m.venue}</span></span>}
            {referee && <span>Referee: <span className="text-gray-700">{referee.name}</span></span>}
            {m.attendance && <span>Attendance: <span className="text-gray-700">{m.attendance.toLocaleString()}</span></span>}
          </div>
        )}
      </div>

      {/* Prediction */}
      <Section
        title="Prediction"
        note={
          p
            ? `${p.model === 'dc-history-v2' ? 'History model (Dixon-Coles, 3 seasons)' : 'Standings model'} · ${CONFIDENCE_LABEL[p.confidence]}`
            : undefined
        }
      >
        {p ? (
          <>
            <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
              <div className="bg-blue-500" style={{ width: `${p.home}%` }} />
              <div className="bg-yellow-400" style={{ width: `${p.draw}%` }} />
              <div className="bg-red-500" style={{ width: `${p.away}%` }} />
            </div>
            <div className="grid grid-cols-3 mt-3 text-center">
              <div>
                <div className="text-2xl font-bold text-blue-600">{p.home.toFixed(1)}%</div>
                <div className="text-xs text-gray-500">{home.shortName || home.name}</div>
                <div className="text-[11px] text-gray-400">fair odds {fairOdds(p.home)}</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-600">{p.draw.toFixed(1)}%</div>
                <div className="text-xs text-gray-500">Draw</div>
                <div className="text-[11px] text-gray-400">fair odds {fairOdds(p.draw)}</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600">{p.away.toFixed(1)}%</div>
                <div className="text-xs text-gray-500">{away.shortName || away.name}</div>
                <div className="text-[11px] text-gray-400">fair odds {fairOdds(p.away)}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-5 text-center">
              <Stat label="Expected goals" value={`${p.expectedGoals.home} – ${p.expectedGoals.away}`} />
              <Stat label="Over 2.5" value={`${Math.round(p.over25)}%`} />
              <Stat label="Both teams score" value={`${Math.round(p.btts)}%`} />
              <Stat
                label="Most likely score"
                value={p.topScores[0] ? `${p.topScores[0].home}–${p.topScores[0].away} (${Math.round(p.topScores[0].prob)}%)` : '–'}
              />
            </div>

            <details className="mt-4 text-xs text-gray-500">
              <summary className="cursor-pointer hover:text-gray-700">How this was calculated</summary>
              <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1">
                <span>{home.shortName || home.name} attack / defence</span>
                <span className="tabular-nums">{p.factors.homeAttack} / {p.factors.homeDefence}</span>
                <span>{away.shortName || away.name} attack / defence</span>
                <span className="tabular-nums">{p.factors.awayAttack} / {p.factors.awayDefence}</span>
                <span>Home advantage</span>
                <span className="tabular-nums">×{p.factors.homeAdvantage}</span>
                <span>Form adjustment (home / away)</span>
                <span className="tabular-nums">×{p.factors.homeForm} / ×{p.factors.awayForm}</span>
                <span>Games played this season</span>
                <span className="tabular-nums">{p.factors.gamesPlayed.home} / {p.factors.gamesPlayed.away}</span>
                <span>League average goals per team</span>
                <span className="tabular-nums">{p.factors.leagueAvgGoals}</span>
                <span>Other likely scores</span>
                <span className="tabular-nums">
                  {p.topScores.slice(1).map(s => `${s.home}–${s.away} (${Math.round(s.prob)}%)`).join(' · ')}
                </span>
              </div>
              <p className="mt-2 text-gray-400">
                Strength = goals per game vs the league average, shrunk toward average early in the season (1.00 = average).
                Attack above 1 is good; defence below 1 is good.
              </p>
            </details>
          </>
        ) : (
          <p className="text-sm text-gray-400">No prediction available for this match yet.</p>
        )}
      </Section>

      {/* Events */}
      {events.length > 0 && (
        <Section title="Match events">
          <ul className="space-y-1.5">
            {events.map((e, i) => {
              const isHome = e.teamId === home.id
              return (
                <li key={i} className={`flex items-center gap-3 text-sm ${isHome ? '' : 'flex-row-reverse text-right'}`}>
                  <span className="w-12 text-xs text-gray-400 tabular-nums">{e.minute}'{e.extra ? `+${e.extra}` : ''}</span>
                  <EventIcon kind={e.kind} />
                  <span className="text-gray-900">{e.text}</span>
                  {e.sub && <span className="text-xs text-gray-400">{e.sub}</span>}
                </li>
              )
            })}
          </ul>
        </Section>
      )}

      {/* Statistics */}
      {statKeys.length > 0 && homeStats && awayStats && (
        <Section title="Statistics">
          <div className="space-y-3">
            {statKeys.map(k => {
              const h = homeStats[k] ?? 0
              const a = awayStats[k] ?? 0
              const total = h + a || 1
              return (
                <div key={k}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-semibold tabular-nums">{h}</span>
                    <span className="text-gray-500 text-xs">{STAT_LABELS[k]}</span>
                    <span className="font-semibold tabular-nums">{a}</span>
                  </div>
                  <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-100 gap-0.5">
                    <div className="bg-blue-500 rounded-l-full" style={{ width: `${(h / total) * 100}%` }} />
                    <div className="bg-red-500 rounded-r-full" style={{ width: `${(a / total) * 100}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {/* Team comparison */}
      <Section title="Teams">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <TeamPanel team={home} row={details.standings.home} recent={details.form.home} />
          <TeamPanel team={away} row={details.standings.away} recent={details.form.away} />
        </div>
      </Section>

      {/* Head to head */}
      {details.head2head && details.head2head.aggregates.numberOfMatches > 0 && (
        <Section title={`Head-to-head · last ${details.head2head.aggregates.numberOfMatches} meetings`}>
          <H2H details={details} />
        </Section>
      )}

      {/* Lineups */}
      {hasLineups && (
        <Section title="Lineups">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Lineup team={home} />
            <Lineup team={away} />
          </div>
        </Section>
      )}
      {!hasLineups && !done && (
        <p className="text-xs text-gray-400 text-center mt-6">
          Lineups are published about an hour before kick-off.
        </p>
      )}
    </div>
  )
}

/* ---------- pieces ---------- */

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="mt-5 bg-white rounded-xl shadow p-6">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
        {note && <span className="text-xs text-gray-400">{note}</span>}
      </div>
      {children}
    </section>
  )
}

function TeamHeader({ team, align }: { team: Team; align: 'left' | 'right' }) {
  return (
    <div className={`flex items-center gap-3 min-w-0 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}>
      {team.crest ? (
        <img src={team.crest} alt="" className="w-14 h-14 object-contain flex-shrink-0" />
      ) : (
        <span className="w-14 h-14 rounded-full bg-gray-200 flex-shrink-0" />
      )}
      <div className="min-w-0">
        <div className="font-bold text-lg text-gray-900 truncate">{team.name}</div>
        {team.coach?.name && <div className="text-xs text-gray-500">Coach: {team.coach.name}</div>}
      </div>
    </div>
  )
}

function FormBadge({ r }: { r: string | null }) {
  const cls = r === 'W' ? 'bg-green-500' : r === 'L' ? 'bg-red-500' : r === 'D' ? 'bg-gray-400' : 'bg-gray-200'
  return <span className={`inline-flex w-6 h-6 items-center justify-center rounded text-xs font-bold text-white ${cls}`}>{r || '·'}</span>
}

function TeamPanel({ team, row, recent }: { team: Team; row: StandingRow | null; recent: Match[] }) {
  const formFromTable = row?.form ? row.form.split(',').map(s => s.trim()) : null
  const formFromMatches = recent.map(m => resultFor(team.id, m)).reverse()
  const form = formFromTable && formFromTable.length ? formFromTable : formFromMatches
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        {team.crest && <img src={team.crest} alt="" className="w-6 h-6 object-contain" />}
        <span className="font-semibold text-gray-900">{team.name}</span>
      </div>

      {row ? (
        <div className="grid grid-cols-4 gap-2 text-center mb-3">
          <Stat label="Position" value={`${row.position}${row.teamsInTable ? ` / ${row.teamsInTable}` : ''}`} />
          <Stat label="Points" value={row.points} />
          <Stat label="W-D-L" value={`${row.won}-${row.draw}-${row.lost}`} />
          <Stat label="GF-GA" value={`${row.goalsFor}-${row.goalsAgainst}`} />
        </div>
      ) : (
        <p className="text-xs text-gray-400 mb-3">No league table available for this competition.</p>
      )}

      <div className="flex items-center gap-1.5 mb-3">
        <span className="text-xs text-gray-500 mr-1">Form</span>
        {form.length ? form.map((r, i) => <FormBadge key={i} r={r as string} />) : <span className="text-xs text-gray-400">—</span>}
      </div>

      {recent.length > 0 && (
        <ul className="divide-y text-sm">
          {recent.map(m => {
            const isHome = m.homeTeam.id === team.id
            const opp = isHome ? m.awayTeam : m.homeTeam
            const gf = isHome ? m.score.fullTime.home : m.score.fullTime.away
            const ga = isHome ? m.score.fullTime.away : m.score.fullTime.home
            return (
              <li key={m.id} className="flex items-center gap-2 py-1.5">
                <span className="w-16 text-xs text-gray-400">{shortDate(m.utcDate)}</span>
                <FormBadge r={resultFor(team.id, m)} />
                <span className="text-xs text-gray-400 w-4">{isHome ? 'H' : 'A'}</span>
                <span className="flex-1 truncate text-gray-800">{opp.shortName || opp.name}</span>
                <span className="font-semibold tabular-nums">{gf}–{ga}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-gray-50 rounded-lg py-2">
      <div className="text-base font-bold text-gray-900 tabular-nums">{value}</div>
      <div className="text-[11px] text-gray-500">{label}</div>
    </div>
  )
}

function H2H({ details }: { details: Details }) {
  const agg = details.head2head!.aggregates
  const m = details.match
  const total = agg.numberOfMatches || 1
  const hw = agg.homeTeam.wins
  const d = agg.homeTeam.draws
  const aw = agg.awayTeam.wins
  return (
    <>
      <div className="flex justify-between text-sm mb-1">
        <span className="font-semibold">{m.homeTeam.shortName || m.homeTeam.name} · {hw}</span>
        <span className="text-gray-500">Draws · {d}</span>
        <span className="font-semibold">{aw} · {m.awayTeam.shortName || m.awayTeam.name}</span>
      </div>
      <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-100 mb-1">
        <div className="bg-blue-500" style={{ width: `${(hw / total) * 100}%` }} />
        <div className="bg-gray-400" style={{ width: `${(d / total) * 100}%` }} />
        <div className="bg-red-500" style={{ width: `${(aw / total) * 100}%` }} />
      </div>
      <div className="text-xs text-gray-400 mb-4">
        {agg.totalGoals} goals in {agg.numberOfMatches} matches · {(agg.totalGoals / total).toFixed(1)} per game
      </div>
      <ul className="divide-y text-sm">
        {details.head2head!.matches.filter(h => DONE.has(h.status)).map(h => (
          <li key={h.id} className="flex items-center gap-2 py-1.5">
            <span className="w-20 text-xs text-gray-400">{shortDate(h.utcDate)}</span>
            <span className="w-24 text-xs text-gray-400 truncate hidden sm:block">{h.competition?.name}</span>
            <span className="flex-1 text-right truncate">{h.homeTeam.shortName || h.homeTeam.name}</span>
            <span className="font-semibold tabular-nums px-2">{h.score.fullTime.home}–{h.score.fullTime.away}</span>
            <span className="flex-1 truncate">{h.awayTeam.shortName || h.awayTeam.name}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

function Lineup({ team }: { team: Team }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 font-semibold text-gray-900">
          {team.crest && <img src={team.crest} alt="" className="w-5 h-5 object-contain" />}
          {team.shortName || team.name}
        </div>
        {team.formation && <span className="text-xs text-gray-500">{team.formation}</span>}
      </div>
      {team.coach?.name && <div className="text-xs text-gray-500 mb-2">Coach: {team.coach.name}</div>}
      <ul className="text-sm space-y-1">
        {(team.lineup || []).map(p => (
          <li key={p.id} className="flex items-center gap-2">
            <span className="w-6 text-right text-xs text-gray-400 tabular-nums">{p.shirtNumber ?? ''}</span>
            <span className="text-gray-900">{p.name}</span>
            {p.position && <span className="text-[11px] text-gray-400">{p.position}</span>}
          </li>
        ))}
      </ul>
      {(team.bench || []).length > 0 && (
        <>
          <div className="text-xs text-gray-500 mt-3 mb-1">Bench</div>
          <ul className="text-xs text-gray-600 space-y-0.5">
            {team.bench!.map(p => (
              <li key={p.id} className="flex items-center gap-2">
                <span className="w-6 text-right text-gray-400 tabular-nums">{p.shirtNumber ?? ''}</span>
                {p.name}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function EventIcon({ kind }: { kind: string }) {
  const map: Record<string, { txt: string; cls: string }> = {
    goal: { txt: '⚽', cls: '' },
    pen: { txt: '⚽', cls: '' },
    own: { txt: '⚽', cls: 'opacity-60' },
    yellow: { txt: '', cls: 'w-3 h-4 bg-yellow-400 rounded-sm' },
    red: { txt: '', cls: 'w-3 h-4 bg-red-600 rounded-sm' },
    yellow_red: { txt: '', cls: 'w-3 h-4 bg-gradient-to-r from-yellow-400 to-red-600 rounded-sm' },
    sub: { txt: '⇄', cls: 'text-gray-400' }
  }
  const e = map[kind] || { txt: '•', cls: '' }
  return <span className={`inline-flex items-center justify-center w-5 ${e.cls}`}>{e.txt}</span>
}

export default MatchDetail
