'use client'

import { useWebSocket } from '@/hooks/useWebSocket'
import { useThreeScene } from '@/hooks/useThreeScene'
import ThreeScene from '@/components/ThreeScene'
import ConnectionController from '@/components/ConnectionController'
import ControlButtons from '@/components/ControlButtons'
import LoadingOverlay from '@/components/LoadingOverlay'

export default function Home() {
  console.log('🔍 Home component rendering')
  
  const { 
    connectionStatus, 
    meshData, 
    connect, 
    disconnect, 
    sendMessage,
    setPort 
  } = useWebSocket()
  
  console.log('🔍 Home received from useWebSocket:', {
    connectionStatus: connectionStatus?.status,
    sendMessage: sendMessage,
    sendMessageType: typeof sendMessage,
    sendMessageIsFunction: typeof sendMessage === 'function'
  })

  const {
    initScene,
    updateMesh,
    updateScene,
    resetCamera,
    toggleWireframe,
    toggleAutoRotate,
    toggleGrid,
    toggleEditMode,
    meshInfo,
    fps,
    isAutoRotating,
    isWireframe,
    showGrid,
    isEditMode,
    gizmoMode,
    setGizmoMode
  } = useThreeScene(sendMessage)

  // Native Three.js doesn't support these advanced features - use defaults
  const autoRotateSpeed = 1
  const setAutoRotateSpeed = () => {}
  const updateFrequency = 30
  const setUpdateFrequency = () => {}
  const smoothReceiving = false
  const setSmoothReceiving = () => {}

  // Debug the WebSocket connection
  console.log('🔍 Main page debug:', {
    connectionStatus: connectionStatus.status,
    sendMessageExists: !!sendMessage,
    sendMessageType: typeof sendMessage,
    meshDataExists: !!meshData
  })
  
  // Add more detailed debugging
  console.log('🔍 Detailed WebSocket debug:', {
    connect: typeof connect,
    disconnect: typeof disconnect,
    setPort: typeof setPort,
    sendMessage: sendMessage,
    allHookReturns: { connectionStatus, meshData, connect, disconnect, sendMessage, setPort }
  })

  return (
    <main className="main-container">
      <LoadingOverlay />
      
      <ThreeScene 
        meshData={meshData}
        initScene={initScene}
        updateMesh={updateMesh}
        updateScene={updateScene}
      />
      
      {/* Bottom Left - Connection Controller */}
      <ConnectionController
        connectionStatus={connectionStatus}
        onConnect={connect}
        onDisconnect={disconnect}
        onPortChange={setPort}
        vertexCount={meshInfo.vertexCount}
        faceCount={meshInfo.faceCount}
        fps={fps}
        updateFrequency={updateFrequency}
        setUpdateFrequency={setUpdateFrequency}
        smoothReceiving={smoothReceiving}
        setSmoothReceiving={setSmoothReceiving}
      />
      
      {/* Bottom Center - Control Buttons */}
      <ControlButtons
        onResetView={resetCamera}
        onToggleWireframe={toggleWireframe}
        onToggleAutoRotate={toggleAutoRotate}
        onToggleGrid={toggleGrid}
        onToggleEditMode={toggleEditMode}
        isWireframe={isWireframe}
        isAutoRotating={isAutoRotating}
        autoRotateSpeed={autoRotateSpeed}
        setAutoRotateSpeed={setAutoRotateSpeed}
        showGrid={showGrid}
        isEditMode={isEditMode}
        gizmoMode={gizmoMode}
        setGizmoMode={setGizmoMode}
      />
    </main>
  )
}