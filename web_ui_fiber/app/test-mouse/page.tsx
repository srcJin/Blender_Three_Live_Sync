'use client'

import { useRef, useState, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, TransformControls, Grid } from '@react-three/drei'
import * as THREE from 'three'

interface TestBoxProps {
  position: [number, number, number]
  color: string
  name: string
  onClick: (event: any, name: string) => void
  isSelected: boolean
}

function TestBox({ position, color, name, onClick, isSelected }: TestBoxProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const [originalColor] = useState(color)
  
  console.log('📦 TestBox render:', { name, position, isSelected })
  
  // Handle click with proper event handling
  const handleClick = useCallback((event: any) => {
    console.log('🖱️ Box clicked:', {
      name,
      position,
      event: {
        point: event.point,
        face: event.face,
        distance: event.distance,
        object: event.object?.name,
        eventType: event.type
      }
    })
    onClick(event, name)
    // Only stop propagation after our handler
    event.stopPropagation()
  }, [onClick, name, position])

  // Auto-rotate when not selected
  useFrame((state, delta) => {
    if (meshRef.current && !isSelected) {
      meshRef.current.rotation.y += delta * 0.5
    }
  })

  return (
    <mesh
      ref={meshRef}
      position={position}
      onClick={handleClick}
      onPointerDown={(e) => {
        console.log('🎯 Pointer down on mesh:', name)
        handleClick(e)
      }}
      userData={{ selectable: true, name, originalColor }}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial 
        color={isSelected ? '#ffff00' : color} 
        emissive={isSelected ? '#333300' : '#000000'}
        roughness={0.5}
        metalness={0.1}
        transparent={false}
        opacity={1}
      />
    </mesh>
  )
}

interface SceneContentProps {
  selectedObject: THREE.Object3D | null
  gizmoMode: 'translate' | 'rotate' | 'scale'
  onPointerClick: (event: any) => void
  onPointerMissed: () => void
  onTransformChange: () => void
  onBoxClick: (event: any, name: string) => void
  onDraggingChanged: (isDragging: boolean) => void
}

function SceneContent({ 
  selectedObject, 
  gizmoMode, 
  onPointerClick, 
  onPointerMissed, 
  onTransformChange,
  onBoxClick,
  onDraggingChanged
}: SceneContentProps) {
  const { camera, scene } = useThree()
  const orbitControlsRef = useRef<any>(null)
  const [isDragging, setIsDragging] = useState(false)
  
  console.log('🎬 SceneContent render:', {
    selectedObject: selectedObject?.name,
    gizmoMode,
    cameraPosition: camera.position,
    sceneChildren: scene.children.length,
    isDragging
  })
  
  // Handle dragging state - now simplified since makeDefault handles the heavy lifting
  const handleDraggingChanged = useCallback((event: any) => {
    console.log('🔧 Dragging changed (automatic integration):', event.value)
    const dragging = event.value
    setIsDragging(dragging)
    onDraggingChanged(dragging) // Notify parent component for UI updates
  }, [onDraggingChanged])

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.4} color="#404040" />
      <directionalLight 
        position={[10, 10, 5]} 
        intensity={0.8} 
        color="#ffffff"
        castShadow
      />
      
      {/* Grid */}
      <Grid 
        args={[10, 10]} 
        cellSize={1} 
        cellThickness={1} 
        cellColor="#444444" 
        sectionSize={5} 
        sectionThickness={1.5} 
        sectionColor="#666666"
        fadeDistance={25} 
        fadeStrength={1} 
        followCamera={false} 
        infiniteGrid 
      />
      
      {/* Test boxes - arranged in a tower */}
      <TestBox
        position={[-2, 0.5, 0]}
        color="red"
        name="RedCube"
        onClick={onBoxClick}
        isSelected={selectedObject?.name === 'RedCube'}
      />
      <TestBox
        position={[0, 2.5, 0]}
        color="green"
        name="GreenCube"
        onClick={onBoxClick}
        isSelected={selectedObject?.name === 'GreenCube'}
      />
      <TestBox
        position={[2, 4.5, 0]}
        color="blue"
        name="BlueCube"
        onClick={onBoxClick}
        isSelected={selectedObject?.name === 'BlueCube'}
      />
      
      {/* Additional tall boxes */}
      <TestBox
        position={[-1, 6.5, 1]}
        color="orange"
        name="OrangeCube"
        onClick={onBoxClick}
        isSelected={selectedObject?.name === 'OrangeCube'}
      />
      <TestBox
        position={[1, 8.5, -1]}
        color="purple"
        name="PurpleCube"
        onClick={onBoxClick}
        isSelected={selectedObject?.name === 'PurpleCube'}
      />
      
      {/* Transform Controls */}
      {selectedObject && (
        <TransformControls
          object={selectedObject}
          mode={gizmoMode}
          onChange={onTransformChange}
          size={1.5}
          showX={true}
          showY={true}
          showZ={true}
        />
      )}
      
      {/* Camera Controls */}
      <OrbitControls
        ref={orbitControlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.05}
        screenSpacePanning
        maxPolarAngle={Math.PI}
      />
    </>
  )
}

export default function TestMousePage() {
  const [selectedObject, setSelectedObject] = useState<THREE.Object3D | null>(null)
  const [gizmoMode, setGizmoMode] = useState<'translate' | 'rotate' | 'scale'>('translate')
  const [isDragging, setIsDragging] = useState(false)
  const [clickInfo, setClickInfo] = useState<{
    objectName: string
    position: THREE.Vector3
    timestamp: string
  } | null>(null)
  
  const handleBoxClick = useCallback((event: any, name: string) => {
    console.log('🎯 Box click handler:', { name, event })
    
    setSelectedObject(event.object)
    setClickInfo({
      objectName: name,
      position: event.point,
      timestamp: new Date().toISOString()
    })
    
    console.log('✅ Object selected:', {
      name,
      object: event.object,
      point: event.point,
      userData: event.object.userData
    })
  }, [])
  
  const handlePointerClick = useCallback((event: any) => {
    console.log('🖱️ Pointer click (general):', event)
  }, [])
  
  const handlePointerMissed = useCallback(() => {
    console.log('❌ Pointer missed - deselecting')
    setSelectedObject(null)
    setClickInfo(null)
  }, [])
  
  const handleTransformChange = useCallback(() => {
    console.log('🔧 Transform changed:', {
      selectedObject: selectedObject?.name,
      position: selectedObject?.position,
      rotation: selectedObject?.rotation,
      scale: selectedObject?.scale
    })
  }, [selectedObject])
  
  const handleDraggingChanged = useCallback((dragging: boolean) => {
    console.log('📡 Parent: Dragging changed to:', dragging)
    setIsDragging(dragging)
  }, [])
  
  return (
    <main className="main-container">
      {/* Floating Debug Panel */}
      <div className="absolute top-4 left-4 z-10 bg-gray-800/90 backdrop-blur-sm text-white p-4 rounded-lg border border-gray-700 max-w-md">
        <h1 className="text-lg font-bold mb-2">R3F Gizmo Test</h1>
        
        <div className="grid grid-cols-1 gap-2 text-sm mb-3">
          <div><strong>Selected:</strong> {selectedObject?.name || 'None'}</div>
          <div><strong>Mode:</strong> {gizmoMode}</div>
          <div><strong>Last Click:</strong> {clickInfo ? clickInfo.objectName : 'None'}</div>
          <div><strong>Dragging:</strong> <span className={isDragging ? 'text-red-400' : 'text-green-400'}>{isDragging ? 'YES' : 'NO'}</span></div>
        </div>
        
        {clickInfo && (
          <div className="text-xs text-gray-400 mb-3">
            Pos: ({clickInfo.position.x.toFixed(2)}, {clickInfo.position.y.toFixed(2)}, {clickInfo.position.z.toFixed(2)})
          </div>
        )}
        
        {/* Transform Mode Buttons */}
        <div className="flex gap-1">
          <button
            onClick={() => setGizmoMode('translate')}
            className={`px-2 py-1 text-xs rounded ${
              gizmoMode === 'translate' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
            }`}
          >
            Move
          </button>
          <button
            onClick={() => setGizmoMode('rotate')}
            className={`px-2 py-1 text-xs rounded ${
              gizmoMode === 'rotate' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
            }`}
          >
            Rotate
          </button>
          <button
            onClick={() => setGizmoMode('scale')}
            className={`px-2 py-1 text-xs rounded ${
              gizmoMode === 'scale' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-600 text-gray-300 hover:bg-gray-500'
            }`}
          >
            Scale
          </button>
        </div>
      </div>
      
      {/* Full Screen 3D Scene */}
      <Canvas
        className="canvas-container"
        style={{ width: '100vw', height: '100vh', display: 'block' }}
        camera={{ position: [8, 6, 8], fov: 75 }}
        gl={{ antialias: true, alpha: false }}
        onPointerMissed={handlePointerMissed}
      >
        <color attach="background" args={['#222222']} />
        <SceneContent
          selectedObject={selectedObject}
          gizmoMode={gizmoMode}
          onPointerClick={handlePointerClick}
          onPointerMissed={handlePointerMissed}
          onTransformChange={handleTransformChange}
          onBoxClick={handleBoxClick}
          onDraggingChanged={handleDraggingChanged}
        />
      </Canvas>
      
      {/* Floating Instructions */}
      <div className="absolute bottom-4 right-4 z-10 bg-gray-800/90 backdrop-blur-sm text-white p-4 rounded-lg border border-gray-700 max-w-sm">
        <h3 className="font-semibold mb-2 text-sm">Instructions:</h3>
        <ul className="text-xs space-y-1 text-gray-300">
          <li>• Click cubes to select (turn yellow)</li>
          <li>• Drag gizmo handles to transform</li>
          <li>• Use mode buttons to switch tools</li>
          <li>• Click empty space to deselect</li>
          <li>• Right-click + drag to orbit camera</li>
        </ul>
      </div>
    </main>
  )
}