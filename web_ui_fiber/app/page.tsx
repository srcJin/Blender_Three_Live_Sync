'use client'

import { useWebSocket } from '@/hooks/useWebSocket'
import { useR3FScene } from '@/hooks/useR3FScene'
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
    meshes,
    selectedObject,
    handlePointerClick,
    handlePointerMissed,
    handleTransformChange,
    cameraRef,
    resetCameraTrigger,
    resetCamera,
    toggleWireframe,
    toggleAutoRotate,
    toggleGrid,
    toggleEditMode,
    meshInfo,
    fps,
    isAutoRotating,
    autoRotateSpeed,
    setAutoRotateSpeed,
    isWireframe,
    showGrid,
    isEditMode,
    lights,
    world,
    gizmoMode,
    setGizmoMode,
    handleDraggingChanged,
    isDragging,
    updateFrequency,
    setUpdateFrequency,
    smoothReceiving,
    setSmoothReceiving
  } = useR3FScene(meshData, sendMessage)

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
        meshes={meshes}
        selectedObject={selectedObject}
        isEditMode={isEditMode}
        isWireframe={isWireframe}
        showGrid={showGrid}
        isAutoRotating={isAutoRotating}
        autoRotateSpeed={autoRotateSpeed}
        handlePointerClick={handlePointerClick}
        handlePointerMissed={handlePointerMissed}
        handleTransformChange={handleTransformChange}
        cameraRef={cameraRef}
        resetCameraTrigger={resetCameraTrigger}
        lights={lights} 
        world={world} 
        gizmoMode={gizmoMode}
        handleDraggingChanged={handleDraggingChanged}
        isDragging={isDragging}
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