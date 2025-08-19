'use client'

import { useState } from 'react'
import type { ConnectionStatus } from '@/types'

interface ConnectionPanelProps {
  connectionStatus: ConnectionStatus
  onConnect: (port: number) => void
  onDisconnect: () => void
  onPortChange: (port: number) => void
}

export default function ConnectionPanel({ 
  connectionStatus, 
  onConnect, 
  onDisconnect, 
  onPortChange 
}: ConnectionPanelProps) {
  const [portInput, setPortInput] = useState(connectionStatus.port.toString())
  
  console.log('🔌 ConnectionPanel render:', { 
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
            <span className="material-icons">wifi</span>
            <span>Connected</span>
          </>
        )
      case 'connecting':
        return (
          <>
            <span className="material-icons">sync</span>
            <span>Connecting...</span>
          </>
        )
      case 'disconnected':
      default:
        return (
          <>
            <span className="material-icons">wifi_off</span>
            <span>Disconnected</span>
          </>
        )
    }
  }

  return (
    <>
      <div className={`status ${connectionStatus.status}`}>
        {getStatusDisplay()}
      </div>

      <div className="connection-panel">
        <div className="connection-controls">
          <label htmlFor="port-input">WebSocket Port:</label>
          <input
            type="number"
            id="port-input"
            value={portInput}
            onChange={handlePortInputChange}
            min="1024"
            max="65535"
          />
          {connectionStatus.status !== 'connected' ? (
            <button 
              className="connect-button" 
              onClick={handleConnect}
              disabled={connectionStatus.status === 'connecting'}
            >
              {connectionStatus.status === 'connecting' ? 'Connecting...' : 'Connect'}
            </button>
          ) : (
            <button className="disconnect-button" onClick={onDisconnect}>
              Disconnect
            </button>
          )}
        </div>
      </div>
    </>
  )
}