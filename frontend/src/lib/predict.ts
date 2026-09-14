export interface Prediction {
  home: number
  draw: number
  away: number
}

// Placeholder model – deterministic so the numbers don't jump on refresh.
// Will be replaced with the real statistical model served by the backend.
export function predict(match: {
  id: number
  homeTeam: { name: string }
  awayTeam: { name: string }
}): Prediction {
  const seed = match.id + match.homeTeam.name.length + match.awayTeam.name.length
  const r = Math.sin(seed) * 10000
  const rand = r - Math.floor(r)
  const home = Math.round(40 + rand * 30)
  const draw = Math.round(20 + (1 - rand) * 15)
  return { home, draw, away: 100 - home - draw }
}
