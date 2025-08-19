'use client'

import { Canvas } from '@react-three/fiber'
import { useR3FScene } from '@/hooks/useR3FScene'
import R3FSceneContent from '@/components/R3FSceneContent'
import type { BlenderMeshData, BlenderSceneData } from '@/types'

interface ThreeSceneProps {
  meshData: BlenderMeshData | BlenderSceneData | null;
  meshes: any[];
  selectedObject: any;
  isEditMode: boolean;
  isWireframe: boolean;
  showGrid: boolean;
  isAutoRotating: boolean;
  autoRotateSpeed: number;
  handlePointerClick: (event: any) => void;
  handlePointerMissed: () => void;
  handleTransformChange: () => void;
  cameraRef: React.RefObject<any>;
  resetCameraTrigger: number;
  lights: any[];
  world: any;
  gizmoMode: 'translate' | 'rotate' | 'scale';
  handleDraggingChanged: (isDragging: boolean) => void;
  isDragging: boolean;
}

export default function ThreeScene({ 
  meshData, 
  meshes,
  selectedObject,
  isEditMode,
  isWireframe,
  showGrid,
  isAutoRotating,
  autoRotateSpeed,
  handlePointerClick,
  handlePointerMissed,
  handleTransformChange,
  cameraRef,
  resetCameraTrigger,
  lights, 
  world, 
  gizmoMode, 
  handleDraggingChanged,
  isDragging 
}: ThreeSceneProps) {
  // No longer calling useR3FScene here - all values come from props

  return (
    <Canvas
      className="canvas-container"
      style={{ width: '100vw', height: '100vh', display: 'block' }}
      gl={{ antialias: true, alpha: false }}
      camera={{ position: [7, 5, 7], fov: 75 }}
      onPointerMissed={handlePointerMissed}
    >
      <R3FSceneContent
        meshes={meshes}
        selectedObject={selectedObject}
        isEditMode={isEditMode}
        isWireframe={isWireframe}
        showGrid={showGrid}
        isAutoRotating={isAutoRotating}
        autoRotateSpeed={autoRotateSpeed}
        onPointerClick={handlePointerClick}
        onTransformChange={handleTransformChange}
        onDraggingChanged={handleDraggingChanged}
        onPointerMissed={handlePointerMissed}
        cameraRef={cameraRef}
        resetCameraTrigger={resetCameraTrigger}
        lights={lights}
        world={world}
        gizmoMode={gizmoMode}
        isDragging={isDragging}
      />
    </Canvas>
  )
}