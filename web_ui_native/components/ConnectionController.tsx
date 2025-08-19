'use client'

import { useState } from 'react'
import type { ConnectionStatus } from '@/types'

interface ConnectionControllerProps {
  connectionStatus: ConnectionStatus
  onConnect: (port: number) => void
  onDisconnect: () => void
  onPortChange: (port: number) => void
  vertexCount: number
  faceCount: number
  fps: number
  updateFrequency: number
  setUpdateFrequency: (freq: number) => void
  smoothReceiving: boolean
  setSmoothReceiving: (smooth: boolean) => void
}

export default function ConnectionController({ 
  connectionStatus, 
  onConnect, 
  onDisconnect, 
  onPortChange,
  vertexCount,
  faceCount,
  fps,
  updateFrequency,
  setUpdateFrequency,
  smoothReceiving,
  setSmoothReceiving
}: ConnectionControllerProps) {
  const [portInput, setPortInput] = useState(connectionStatus.port.toString())
  const [showSettings, setShowSettings] = useState(false)
  
  console.log('🔌 ConnectionController render:', { 
    status: connectionStatus.status, 
    port: connectionStatus.port 
  })

  const handleConnect = () => {
    const port = parseInt(portInput, 10)
    if (port >= 1024 && port <= 65535) {
      onPortChange(port)
      onConnect(port)
    }
  }

  const handlePortInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPortInput(e.target.value)
  }

  const getStatusDisplay = () => {
    switch (connectionStatus.status) {
      case 'connected':
        return (
          <>
            <span className="material-icons text-green-400">wifi</span>
            <span className="text-green-400">Connected</span>
          </>
        )
      case 'connecting':
        return (
          <>
            <span className="material-icons text-yellow-400 animate-spin">sync</span>
            <span className="text-yellow-400">Connecting...</span>
          </>
        )
      case 'disconnected':
      default:
        return (
          <>
            <span className="material-icons text-red-400">wifi_off</span>
            <span className="text-red-400">Disconnected</span>
          </>
        )
    }
  }

  return (
    <div className="connection-controller">
      {/* Main Connection Bar */}
      <div className="connection-main">
        <div className="connection-status">
          {getStatusDisplay()}
        </div>
        
        <div className="connection-divider"></div>
        
        <div className="connection-controls">
          {connectionStatus.status !== 'connected' ? (
            <button 
              className="connect-button" 
              onClick={handleConnect}
              disabled={connectionStatus.status === 'connecting'}
              title="Connect to Blender"
            >
              {connectionStatus.status === 'connecting' ? 'Connecting...' : 'Connect'}
            </button>
          ) : (
            <button 
              className="disconnect-button" 
              onClick={onDisconnect}
              title="Disconnect from Blender"
            >
              Disconnect
            </button>
          )}
        </div>

        <div className="connection-divider"></div>

        <div className="mesh-stats">
          <div className="stat-item">
            <span className="stat-label">V:</span>
            <span className="stat-value">{vertexCount}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">F:</span>
            <span className="stat-value">{faceCount}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">FPS:</span>
            <span className="stat-value">{fps}</span>
          </div>
        </div>

        <div className="connection-divider"></div>

        <button 
          className="settings-toggle"
          onClick={() => setShowSettings(!showSettings)}
          title="Toggle Settings"
        >
          <span className="material-icons">settings</span>
        </button>
      </div>

      {/* Secondary Settings Panel */}
      {showSettings && (
        <div className="connection-settings">
          <div className="setting-group">
            <label htmlFor="port-input">WebSocket Port:</label>
            <input
              type="number"
              id="port-input"
              value={portInput}
              onChange={handlePortInputChange}
              min="1024"
              max="65535"
              disabled={connectionStatus.status === 'connected'}
            />
          </div>

          <div className="setting-group">
            <label htmlFor="frequency-slider">
              Update Rate: {updateFrequency}Hz
            </label>
            <input
              type="range"
              id="frequency-slider"
              min="1"
              max="60"
              step="1"
              value={updateFrequency}
              onChange={(e) => {
                const newFreq = Number(e.target.value)
                console.log('🎛️ ConnectionController: Update frequency changed to', newFreq, 'Hz')
                setUpdateFrequency(newFreq)
              }}
            />
            <div className="range-labels">
              <span>1Hz</span>
              <span>60Hz</span>
            </div>
          </div>

          <div className="setting-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={smoothReceiving}
                onChange={(e) => setSmoothReceiving(e.target.checked)}
              />
              <span>Smooth Receiving</span>
            </label>
          </div>
        </div>
      )}
    </div>
  )
}