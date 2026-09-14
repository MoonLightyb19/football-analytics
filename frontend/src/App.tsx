import { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import io from 'socket.io-client'
import Dashboard from './pages/Dashboard'
import MatchDetail from './pages/MatchDetail'
import './App.css'

function App() {
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const socket = io(import.meta.env.VITE_WS_URL || 'http://localhost:3001')

    socket.on('connect', () => {
      setConnected(true)
      console.log('Connected to server')
    })

    socket.on('disconnect', () => {
      setConnected(false)
      console.log('Disconnected from server')
    })

    return () => {
      socket.disconnect()
    }
  }, [])

  return (
    <Router>
      <div className="min-h-screen bg-gray-100">
        <header className="bg-white shadow">
          <div className="max-w-7xl mx-auto px-4 py-6">
            <h1 className="text-3xl font-bold text-gray-900">Football Analytics</h1>
            <p className="text-sm text-gray-500">
              {connected ? '🟢 Connected' : '🔴 Disconnected'}
            </p>
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
