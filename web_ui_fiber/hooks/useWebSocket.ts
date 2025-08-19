'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { BlenderMeshData, BlenderSceneData, ConnectionStatus } from '@/types'

export function useWebSocket() {
  console.log('🔍 useWebSocket hook called')
  
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    status: 'disconnected',
    port: 10005
  })
  const [meshData, setMeshData] = useState<BlenderMeshData | BlenderSceneData | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  
  console.log('🔍 useWebSocket initial state:', {
    connectionStatus: connectionStatus.status,
    socketExists: !!socketRef.current
  })

  // Function to send messages to the server
  const sendMessage = useCallback((message: any) => {
    console.log('🔍 sendMessage called with:', {
      message: message,
      socketExists: !!socketRef.current,
      socketReadyState: socketRef.current?.readyState,
      connectionStatus: connectionStatus.status
    })
    
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      const messageStr = typeof message === 'string' ? message : JSON.stringify(message)
      socketRef.current.send(messageStr)
      console.log('📤 Sent message to server:', message)
      return true
    } else {
      console.warn('❌ Cannot send message - WebSocket not connected')
      console.warn('🔍 Socket state:', {
        socketExists: !!socketRef.current,
        readyState: socketRef.current?.readyState,
        connectionStatus: connectionStatus.status,
        readyStateNames: {
          0: 'CONNECTING',
          1: 'OPEN', 
          2: 'CLOSING',
          3: 'CLOSED'
        }
      })
      return false
    }
  }, [connectionStatus.status])

  const connect = useCallback((port: number) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      console.log('Already connected')
      return
    }

    console.log(`Attempting to connect to WebSocket server on port ${port}`)
    setConnectionStatus({ status: 'connecting', port })

    try {
      const wsUrl = `ws://127.0.0.1:${port}`
      console.log(`Creating WebSocket connection to: ${wsUrl}`)
      
      const socket = new WebSocket(wsUrl)
      socketRef.current = socket

      socket.onopen = () => {
        setConnectionStatus({ status: 'connected', port })
        console.log(`✅ Connected to WebSocket server on port ${port}`)
        console.log(`Connection state: ${socket.readyState}`)
      }

      socket.onclose = (event) => {
        setConnectionStatus(prev => ({ ...prev, status: 'disconnected' }))
        console.log('🔌 Disconnected from WebSocket server')
        console.log(`Close code: ${event.code}, reason: ${event.reason}, wasClean: ${event.wasClean}`)
      }

      socket.onerror = (error) => {
        setConnectionStatus(prev => ({ ...prev, status: 'disconnected' }))
        console.error('❌ WebSocket connection error:', {
          type: error.type || 'unknown',
          readyState: socket.readyState,
          timestamp: new Date().toISOString(),
          port: port,
          url: wsUrl,
          errorEvent: error
        })
        
        // Additional error context
        switch(socket.readyState) {
          case WebSocket.CONNECTING:
            console.error('  Socket state: CONNECTING (0)')
            break
          case WebSocket.OPEN:
            console.error('  Socket state: OPEN (1)')
            break
          case WebSocket.CLOSING:
            console.error('  Socket state: CLOSING (2)')
            break
          case WebSocket.CLOSED:
            console.error('  Socket state: CLOSED (3)')
            break
          default:
            console.error('  Socket state: UNKNOWN')
        }
      }

      socket.onmessage = (event) => {
        try {
          console.log(`📨 Received message from server (${event.data.length} bytes)`)
          const data = JSON.parse(event.data)
          
          console.log('🔍 Message type check:', {
            hasType: 'type' in data,
            type: data.type,
            hasObjects: 'objects' in data,
            hasVertices: 'vertices' in data,
            messageKeys: Object.keys(data)
          })
          
          // Filter out transform_update messages - they're for internal communication only
          if (data.type === 'transform_update') {
            console.log('🔄 Ignoring transform_update message (internal communication)')
            return
          }
          
          // Filter out messages that might be echoes of our own sent data
          if (data.timestamp && typeof data.timestamp === 'number') {
            const messageAge = Date.now() - data.timestamp
            if (messageAge < 100) { // If message is very recent (< 100ms), might be our own echo
              console.log('🔄 Ignoring very recent message (potential echo)', { messageAge, timestamp: data.timestamp })
              return
            }
          }
          
          // Handle both legacy format (BlenderMeshData) and new format (BlenderSceneData)
          if (data.objects) {
            // New scene format with materials and lighting
            console.log(`📊 WEBSOCKET: Parsed scene data - ${data.objects.length} objects, ${data.lights?.length || 0} lights, world data: ${!!data.world}`)
            
            // Log details about each object's materials
            data.objects.forEach((obj: any, index: number) => {
              console.log(`📊 WEBSOCKET: Object ${index} '${obj.name}': ${obj.vertices?.length || 0} vertices, ${obj.uvs?.length || 0} UVs, ${obj.materials?.length || 0} materials`)
              if (obj.materials) {
                obj.materials.forEach((mat: any, matIndex: number) => {
                  const textureCount = Object.keys(mat.textures || {}).length
                  const hasTextureData = mat.textures && Object.values(mat.textures).some((tex: any) => tex.data)
                  console.log(`📊 WEBSOCKET: Material ${matIndex}: '${mat.name}' type=${mat.type} color=[${mat.color?.join(', ')}] textures=${textureCount} dataPresent=${hasTextureData}`)
                  
                  // Debug texture data
                  if (mat.textures) {
                    Object.entries(mat.textures).forEach(([texType, texData]: [string, any]) => {
                      if (texData.error) {
                        console.error(`📊 WEBSOCKET: Texture ${texType} has error:`, texData.error, 'Full texture object:', texData)
                      } else if (texData.hash) {
                        console.log(`📊 WEBSOCKET: Texture ${texType} '${texData.name}' hash: ${texData.hash?.substring(0, 8)}... size: ${texData.size || 'unknown'} data: ${texData.data ? 'present' : 'missing'}`)
                      }
                    })
                  }
                })
              }
            })
            
            setMeshData(data)
          } else {
            // Legacy mesh format
            console.log(`📊 WEBSOCKET: Parsed legacy mesh data: ${data.name || 'unnamed'} (${data.vertices?.length || 0} vertices)`)
            setMeshData(data)
          }
        } catch (error) {
          console.error('❌ WEBSOCKET: Error parsing message:', error, 'Raw data length:', event.data.length)
        }
      }
      
      // Connection timeout
      setTimeout(() => {
        if (socket.readyState === WebSocket.CONNECTING) {
          console.error('⏰ WebSocket connection timeout after 10 seconds')
          socket.close()
        }
      }, 10000)
      
    } catch (error) {
      setConnectionStatus(prev => ({ ...prev, status: 'disconnected' }))
      console.error('Failed to create WebSocket connection:', error)
    }
  }, [])

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.close()
      socketRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [disconnect])

  console.log('🔍 useWebSocket returning:', {
    connectionStatus: connectionStatus.status,
    sendMessageExists: !!sendMessage,
    sendMessageType: typeof sendMessage
  })

  return {
    connectionStatus,
    meshData,
    connect,
    disconnect,
    sendMessage,
    setPort: (port: number) => setConnectionStatus(prev => ({ ...prev, port }))
  }
}