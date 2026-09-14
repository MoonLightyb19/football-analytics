import { useState, useEffect } from 'react'
import axios from 'axios'

interface Match {
  id: number
  homeTeam: string
  awayTeam: string
  date: string
  status: string
  score?: {
    home: number
    away: number
  }
  prediction?: {
    homeWinProb: number
    drawProb: number
    awayWinProb: number
  }
}

function Dashboard() {
  const [upcomingMatches, setUpcomingMatches] = useState<Match[]>([])
  const [liveMatches, setLiveMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchMatches()
  }, [])

  const fetchMatches = async () => {
    try {
      setLoading(true)
      // TODO: Replace with actual API call
      // const response = await axios.get(`${import.meta.env.VITE_API_URL}/matches`)

      // Mock data for now
      setUpcomingMatches([
        {
          id: 1,
          homeTeam: 'Real Madrid',
          awayTeam: 'Barcelona',
          date: new Date(Date.now() + 86400000).toISOString(),
          status: 'SCHEDULED',
          prediction: {
            homeWinProb: 55,
            drawProb: 25,
            awayWinProb: 20
          }
        }
      ])

      setLiveMatches([])
    } catch (error) {
      console.error('Error fetching matches:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="p-6 text-center">Loading...</div>
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Upcoming Matches */}
        <section>
          <h2 className="text-2xl font-bold mb-4">Upcoming Matches</h2>
          <div className="space-y-4">
            {upcomingMatches.map((match) => (
              <div key={match.id} className="bg-white rounded-lg shadow p-4">
                <div className="flex justify-between items-center mb-3">
                  <div className="flex-1">
                    <p className="font-semibold">{match.homeTeam} vs {match.awayTeam}</p>
                    <p className="text-sm text-gray-500">
                      {new Date(match.date).toLocaleString()}
                    </p>
                  </div>
                </div>
                {match.prediction && (
                  <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t">
                    <div className="text-center">
                      <p className="text-sm text-gray-600">Home</p>
                      <p className="font-bold text-lg text-blue-600">
                        {match.prediction.homeWinProb}%
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-gray-600">Draw</p>
                      <p className="font-bold text-lg text-yellow-600">
                        {match.prediction.drawProb}%
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm text-gray-600">Away</p>
                      <p className="font-bold text-lg text-red-600">
                        {match.prediction.awayWinProb}%
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {upcomingMatches.length === 0 && (
              <p className="text-gray-500">No upcoming matches</p>
            )}
          </div>
        </section>

        {/* Live Matches */}
        <section>
          <h2 className="text-2xl font-bold mb-4">Live Scores</h2>
          <div className="space-y-4">
            {liveMatches.map((match) => (
              <div key={match.id} className="bg-white rounded-lg shadow p-4">
                <div className="flex justify-between items-center">
                  <div className="flex-1">
                    <p className="font-semibold">{match.homeTeam}</p>
                  </div>
                  <div className="text-2xl font-bold mx-4">
                    {match.score?.home} - {match.score?.away}
                  </div>
                  <div className="flex-1 text-right">
                    <p className="font-semibold">{match.awayTeam}</p>
                  </div>
                </div>
                <p className="text-sm text-green-600 text-center mt-2">🔴 LIVE</p>
              </div>
            ))}
            {liveMatches.length === 0 && (
              <p className="text-gray-500">No live matches right now</p>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

export default Dashboard
