import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { API_URL } from '../lib/socket'

type Outcome = 'H' | 'D' | 'A'

interface Summary {
  days: number
  competition: string | null
  settled: number
  pending: number
  model: { hitRate: number; brier: number; logLoss: number } | null
  market: { n: number; hitRate: number; brier: number; logLoss: number } | null
  betting: {
    edgeThreshold: number
    edge: { bets: number; wins: number; profit: number; roi: number }
    favourite: { bets: number; wins: number; profit: number; roi: number }
  } | null
  outcomes: Record<Outcome, number>
  picks: Record<Outcome, number>
  calibration: { range: string; n: number; predicted: number; actual: number }[]
  byCompetition: { code: string; name: string; n: number; hitRate: number; brier: number }[]
}

interface Settled {
  matchId: number
  date: string
  competition: string | null
  code: string | null
  home: string
  away: string
  score: string
  outcome: Outcome
  pick: Outcome
  hit: boolean
  p: Record<Outcome, number>
  odds: Record<Outcome, number> | null
  confidence: string | null
}

interface Status {
  total: number
  open: number
  locked: number
  settled: number
  withOdds: number
}

const DAY_OPTIONS = [7, 30, 90, 365]
const OUTCOME_LABEL: Record<Outcome, string> = { H: 'Home', D: 'Draw', A: 'Away' }

function Accuracy() {
  const [days, setDays] = useState(90)
  const [competition, setCompetition] = useState<string>('ALL')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [recent, setRecent] = useState<Settled[]>([])
  const [status, setStatus] = useState<Status | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const params: Record<string, string | number> = { days }
    if (competition !== 'ALL') params.competition = competition
    Promise.all([
      axios.get(`${API_URL}/accuracy`, { params }),
      axios.get(`${API_URL}/accuracy/recent`, { params: { ...params, limit: 200 } }),
      axios.get(`${API_URL}/accuracy/status`)
    ])
      .then(([s, r, st]) => {
        setSummary(s.data.data)
        setRecent(r.data.data)
        setStatus(st.data.data)
        setError(null)
      })
      .catch(err => setError(err.response?.data?.message || err.message))
  }, [days, competition])

  const comps = summary?.byCompetition || []

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Model accuracy</h2>
          <p className="text-sm text-gray-500">
            {status
              ? `${status.settled} settled · ${status.locked} in play or awaiting result · ${status.open} upcoming · ${status.withOdds} with market odds`
              : '…'}
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

      {comps.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          <Chip active={competition === 'ALL'} onClick={() => setCompetition('ALL')}>All leagues</Chip>
          {comps.map(c => (
            <Chip key={c.code} active={competition === c.code} onClick={() => setCompetition(c.code)}>
              {c.name} <span className="opacity-60">· {c.n}</span>
            </Chip>
          ))}
        </div>
      )}

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-5">{error}</div>}

      {summary && summary.settled === 0 && (
        <div className="bg-white rounded-xl shadow p-10 text-center text-gray-500">
          <p className="text-lg font-medium text-gray-700 mb-1">No settled predictions yet</p>
          <p className="text-sm">
            Predictions are saved for every upcoming match and frozen at kick-off. Once matches finish, they are
            scored here automatically. {summary.pending > 0 && `${summary.pending} prediction${summary.pending === 1 ? '' : 's'} waiting.`}
          </p>
        </div>
      )}

      {summary && summary.settled > 0 && summary.model && (
        <>
          {/* Headline numbers */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <Tile label="Settled matches" value={summary.settled} />
            <Tile
              label="Hit rate (model pick)"
              value={`${summary.model.hitRate}%`}
              sub={summary.market ? `market ${summary.market.hitRate}%` : undefined}
              good={summary.market ? summary.model.hitRate >= summary.market.hitRate : undefined}
            />
            <Tile
              label="Brier score"
              value={summary.model.brier}
              sub={summary.market ? `market ${summary.market.brier}` : 'lower is better'}
              good={summary.market ? summary.model.brier <= summary.market.brier : undefined}
              hint="0 = perfect, 0.667 = always 1/3 each"
            />
            <Tile
              label="Log loss"
              value={summary.model.logLoss}
              sub={summary.market ? `market ${summary.market.logLoss}` : 'lower is better'}
              good={summary.market ? summary.model.logLoss <= summary.market.logLoss : undefined}
              hint="1.099 = always 1/3 each"
            />
          </div>

          {/* Betting simulation */}
          {summary.betting && (
            <Section title={`Betting at market odds · flat 1-unit stakes · ${summary.market?.n} matches with odds`}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Strategy
                  title={`Value bets (model edge ≥ ${Math.round(summary.betting.edgeThreshold * 100)}%)`}
                  s={summary.betting.edge}
                />
                <Strategy title="Always back the model's pick" s={summary.betting.favourite} />
              </div>
              <p className="text-xs text-gray-400 mt-3">
                Odds are the pre-match bookmaker prices from the data provider. Profit is what a 1-unit bet on each
                qualifying selection would have returned. This is the number that matters.
              </p>
            </Section>
          )}

          {/* Calibration */}
          <Section title="Calibration · when the model says X%, how often does it happen?">
            {summary.calibration.length === 0 ? (
              <p className="text-sm text-gray-400">Not enough data yet.</p>
            ) : (
              <div className="space-y-2">
                {summary.calibration.map(b => (
                  <div key={b.range} className="grid grid-cols-[90px_1fr_120px] items-center gap-3 text-sm">
                    <span className="text-gray-500 tabular-nums">{b.range}</span>
                    <div className="relative h-4 bg-gray-100 rounded overflow-hidden">
                      <div className="absolute inset-y-0 left-0 bg-blue-500/80" style={{ width: `${b.actual}%` }} />
                      <div
                        className="absolute inset-y-0 w-0.5 bg-gray-900"
                        style={{ left: `${b.predicted}%` }}
                        title={`predicted ${b.predicted}%`}
                      />
                    </div>
                    <span className="tabular-nums text-gray-700">
                      {b.actual}% <span className="text-gray-400">of {b.n}</span>
                    </span>
                  </div>
                ))}
                <p className="text-xs text-gray-400 pt-1">
                  Bar = actual hit rate of the model's pick in that confidence band; black line = what the model
                  predicted. A well-calibrated model has the bar ending at the line.
                </p>
              </div>
            )}
          </Section>

          {/* Picks vs outcomes + per league */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
            <Section title="Picks vs actual outcomes" flat>
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500">
                  <tr>
                    <th className="text-left font-medium py-1">Outcome</th>
                    <th className="text-right font-medium">Model picked</th>
                    <th className="text-right font-medium">Actually happened</th>
                  </tr>
                </thead>
                <tbody>
                  {(['H', 'D', 'A'] as Outcome[]).map(o => (
                    <tr key={o} className="border-t">
                      <td className="py-1.5">{OUTCOME_LABEL[o]}</td>
                      <td className="text-right tabular-nums">{summary.picks[o]}</td>
                      <td className="text-right tabular-nums">{summary.outcomes[o]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
            <Section title="By league" flat>
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500">
                  <tr>
                    <th className="text-left font-medium py-1">League</th>
                    <th className="text-right font-medium">Matches</th>
                    <th className="text-right font-medium">Hit rate</th>
                    <th className="text-right font-medium">Brier</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byCompetition.map(c => (
                    <tr key={c.code} className="border-t">
                      <td className="py-1.5">{c.name}</td>
                      <td className="text-right tabular-nums">{c.n}</td>
                      <td className="text-right tabular-nums">{c.hitRate}%</td>
                      <td className="text-right tabular-nums">{c.brier}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          </div>

          {/* Settled list */}
          <Section title={`Settled predictions · ${recent.length}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500">
                  <tr>
                    <th className="text-left font-medium py-1">Date</th>
                    <th className="text-left font-medium">Match</th>
                    <th className="text-center font-medium">Score</th>
                    <th className="text-center font-medium">1</th>
                    <th className="text-center font-medium">X</th>
                    <th className="text-center font-medium">2</th>
                    <th className="text-center font-medium">Pick</th>
                    <th className="text-center font-medium">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map(r => (
                    <tr key={r.matchId} className="border-t hover:bg-gray-50">
                      <td className="py-1.5 text-gray-500 whitespace-nowrap">
                        {new Date(r.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                      </td>
                      <td>
                        <Link to={`/match/${r.matchId}`} className="hover:underline">
                          {r.home} – {r.away}
                        </Link>
                        <span className="text-xs text-gray-400 ml-2 hidden md:inline">{r.competition}</span>
                      </td>
                      <td className="text-center font-semibold tabular-nums">{r.score}</td>
                      {(['H', 'D', 'A'] as Outcome[]).map(o => (
                        <td
                          key={o}
                          className={`text-center tabular-nums ${
                            r.outcome === o ? 'font-bold text-gray-900' : 'text-gray-500'
                          } ${r.pick === o ? 'underline decoration-2 underline-offset-2' : ''}`}
                        >
                          {Math.round(r.p[o])}%
                          {r.odds && <div className="text-[10px] text-gray-400">{r.odds[o]}</div>}
                        </td>
                      ))}
                      <td className="text-center">{OUTCOME_LABEL[r.pick]}</td>
                      <td className="text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                            r.hit ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {r.hit ? 'HIT' : 'MISS'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-sm rounded-full border transition ${
        active ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
      }`}
    >
      {children}
    </button>
  )
}

function Tile({
  label,
  value,
  sub,
  good,
  hint
}: {
  label: string
  value: string | number
  sub?: string
  good?: boolean
  hint?: string
}) {
  return (
    <div className="bg-white rounded-xl shadow p-4" title={hint}>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-2xl font-bold text-gray-900 tabular-nums">{value}</div>
      {sub && (
        <div className={`text-xs mt-0.5 ${good === undefined ? 'text-gray-400' : good ? 'text-green-600' : 'text-red-500'}`}>
          {sub}
        </div>
      )}
    </div>
  )
}

function Strategy({ title, s }: { title: string; s: { bets: number; wins: number; profit: number; roi: number } }) {
  const pos = s.profit >= 0
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="text-sm font-medium text-gray-700 mb-2">{title}</div>
      <div className="flex items-baseline gap-4">
        <div>
          <div className={`text-2xl font-bold tabular-nums ${pos ? 'text-green-600' : 'text-red-600'}`}>
            {pos ? '+' : ''}
            {s.profit.toFixed(2)}u
          </div>
          <div className="text-xs text-gray-500">profit</div>
        </div>
        <div>
          <div className={`text-lg font-semibold tabular-nums ${pos ? 'text-green-600' : 'text-red-600'}`}>
            {pos ? '+' : ''}
            {s.roi}%
          </div>
          <div className="text-xs text-gray-500">ROI</div>
        </div>
        <div className="text-sm text-gray-500 tabular-nums">
          {s.bets} bets · {s.wins} won
        </div>
      </div>
    </div>
  )
}

function Section({ title, children, flat }: { title: string; children: ReactNode; flat?: boolean }) {
  return (
    <section className={`bg-white rounded-xl shadow p-5 ${flat ? '' : 'mt-5'}`}>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">{title}</h3>
      {children}
    </section>
  )
}

export default Accuracy
