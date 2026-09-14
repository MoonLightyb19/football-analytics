import { useParams } from 'react-router-dom'

function MatchDetail() {
  const { id } = useParams<{ id: string }>()

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="bg-white rounded-lg shadow p-8">
        <h2 className="text-2xl font-bold mb-4">Match Detail - ID: {id}</h2>
        <p className="text-gray-600">
          Coming soon: Full match analysis, lineups, player stats, and predictions
        </p>
      </div>
    </div>
  )
}

export default MatchDetail
