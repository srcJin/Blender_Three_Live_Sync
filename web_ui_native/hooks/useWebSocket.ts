'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { BlenderMeshData, BlenderSceneData, ConnectionStatus } from '@/types'

export function useWebSocket() {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    status: 'disconnected',
    port: 10005
  })
  const [meshData, setMeshData] = useState<BlenderMeshData | BlenderSceneData | null>(null)
  const socketRef = useRef<WebSocket | null>(null)

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

  const sendMessage = useCallback((message: any) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      console.log('🔍 useWebSocket: Sending message:', message)
      socketRef.current.send(JSON.stringify(message))
      return true
    } else {
      console.warn('🔍 useWebSocket: Cannot send message - WebSocket not connected')
      return false
    }
  }, [])

  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [disconnect])

  return {
    connectionStatus,
    meshData,
    connect,
    disconnect,
    sendMessage,
    setPort: (port: number) => setConnectionStatus(prev => ({ ...prev, port }))
  }
}