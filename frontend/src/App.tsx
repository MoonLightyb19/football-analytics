import { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import MatchDetail from './pages/MatchDetail'
import { socket } from './lib/socket'
import './App.css'

function App() {
  const [connected, setConnected] = useState(socket.connected)

  useEffect(() => {
    const onConnect = () => setConnected(true)
    const onDisconnect = () => setConnected(false)

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    if (!socket.connected) socket.connect()

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
    }
  }, [])

  return (
    <Router>
      <div className="min-h-screen bg-gray-100">
        <header className="bg-white shadow">
          <div className="max-w-7xl mx-auto px-4 py-5 flex items-center justify-between">
            <Link to="/" className="text-2xl font-bold text-gray-900">
              Football Analytics
            </Link>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span
                className={`inline-block w-2.5 h-2.5 rounded-full ${
                  connected ? 'bg-green-500' : 'bg-red-500'
                }`}
              />
              {connected ? 'Live' : 'Disconnected'}
            </div>
          </div>
        </header>

        <main>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/match/:id" element={<MatchDetail />} />
          </Routes>
        </main>
      </div>
    </Router>
  )
}

export default App
