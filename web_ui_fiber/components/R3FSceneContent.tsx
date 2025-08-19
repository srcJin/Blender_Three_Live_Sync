'use client'

import { useRef, useCallback, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Grid, TransformControls, PerspectiveCamera } from '@react-three/drei'
import * as THREE from 'three'

interface R3FMeshData {
  name: string
  geometry: THREE.BufferGeometry
  material: THREE.Material | THREE.Material[]
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
}

interface R3FSceneContentProps {
  meshes: R3FMeshData[];
  selectedObject: THREE.Object3D | null;
  isEditMode: boolean;
  isWireframe: boolean;
  showGrid: boolean;
  isAutoRotating: boolean;
  autoRotateSpeed: number;
  onPointerClick: (event: any) => void;
  onTransformChange: () => void;
  onDraggingChanged: (isDragging: boolean) => void;
  onPointerMissed: () => void;
  cameraRef: React.RefObject<THREE.PerspectiveCamera | null>;
  resetCameraTrigger: number;
  lights: any[];
  world: any;
  gizmoMode: 'translate' | 'rotate' | 'scale';
  isDragging: boolean;
}

export default function R3FSceneContent({
  meshes,
  selectedObject,
  isEditMode,
  isWireframe,
  showGrid,
  isAutoRotating,
  autoRotateSpeed,
  onPointerClick,
  onTransformChange,
  onDraggingChanged,
  // onPointerMissed,
  cameraRef,
  resetCameraTrigger,
  lights,
  world,
  gizmoMode,
  // isDragging
}: R3FSceneContentProps) {
  const { } = useThree()
  const meshRefs = useRef<THREE.Mesh[]>([])
  const orbitControlsRef = useRef<any>(null)

  // Debug logging
  console.log('R3FSceneContent render:', { 
    isEditMode, 
    selectedObject: !!selectedObject, 
    selectedObjectName: selectedObject?.userData?.blenderName,
    gizmoMode,
    meshCount: meshes.length,
    lightCount: lights?.length || 0,
    hasWorld: !!world
  })

  // Handle dragging state changes (removed unused function)

  // Handle camera reset trigger
  useEffect(() => {
    if (resetCameraTrigger > 0 && orbitControlsRef.current) {
      console.log('🔍 R3F resetCamera trigger detected, resetting OrbitControls')
      // Reset camera to default position
      orbitControlsRef.current.reset()
      // You can also set specific position if needed
      // orbitControlsRef.current.object.position.set(7, 5, 7)
      // orbitControlsRef.current.object.lookAt(0, 0, 0)
    }
  }, [resetCameraTrigger])

  // Auto-rotation using useFrame - rotate camera around scene center
  useFrame((state, delta) => {
    if (isAutoRotating && orbitControlsRef.current) {
      // Rotate the camera around the scene by updating the azimuth angle
      orbitControlsRef.current.autoRotate = true
      orbitControlsRef.current.autoRotateSpeed = autoRotateSpeed // use dynamic speed
      orbitControlsRef.current.update()
    } else if (orbitControlsRef.current) {
      // Disable auto-rotation when not active
      orbitControlsRef.current.autoRotate = false
    }
  })

  return (
    <>
      <PerspectiveCamera ref={cameraRef} makeDefault position={[7, 5, 7]} />
      
      {world?.backgroundColor && <color attach="background" args={[world.backgroundColor.r, world.backgroundColor.g, world.backgroundColor.b]} />}

      {/* Lighting */}
      {world?.ambientColor ? (
        <ambientLight color={world.ambientColor} intensity={world.ambientStrength} />
      ) : (
        <ambientLight color="#404040" intensity={0.4} />
      )}
      
      {lights && lights.length > 0 ? (
        lights.map((light, index) => {
          if (!light || !light.color || !light.position) return null; // Ensure light, color, and position are defined
          switch (light.type) {
            case 'sun':
              return <directionalLight key={index} color={light.color} intensity={light.intensity} position={light.position} />;
            case 'point':
              return <pointLight key={index} color={light.color} intensity={light.intensity} position={light.position} distance={light.distance} />;
            case 'spot':
              return <spotLight key={index} color={light.color} intensity={light.intensity} position={light.position} angle={light.angle} penumbra={light.blend} />;
            case 'area':
              // RectAreaLight requires width and height, and is not affected by position in the same way
              // For now, we'll return null or a placeholder if width/height are not available
              return light.width && light.height ? <rectAreaLight key={index} color={light.color} intensity={light.intensity} position={light.position} width={light.width} height={light.height} /> : null;
            default:
              return null;
          }
        })
      ) : (
        // Fallback lighting when no Blender lights are available
        <>
          <directionalLight position={[10, 10, 5]} intensity={0.8} color="#ffffff" castShadow />
          <directionalLight position={[-10, -10, -5]} intensity={0.4} color="#ffffff" />
        </>
      )}
      
      {/* Grid and helpers */}
      {showGrid && (
        <>
          <Grid 
            args={[10, 10]} 
            cellSize={1} 
            cellThickness={1} 
            cellColor="#6f6f6f" 
            sectionSize={5} 
            sectionThickness={1.5} 
            sectionColor="#9d4b4b" 
            fadeDistance={25} 
            fadeStrength={1} 
            followCamera={false} 
            infiniteGrid 
          />
          <axesHelper args={[5]} />
        </>
      )}
      
      {/* Test box for gizmo testing */}
      {/* <mesh
        position={[2, 0, 0]}
        userData={{ selectable: true, blenderName: "TestBox" }}
        onClick={(e) => {
          console.log('🎯 Test box clicked:', e)
          onPointerClick(e)
        }}
        onPointerDown={(e) => {
          console.log('🎯 Test box pointer down:', e)
          onPointerClick(e)
        }}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial 
          color={selectedObject?.userData?.blenderName === 'TestBox' ? '#ffff00' : 'orange'}
          emissive={selectedObject?.userData?.blenderName === 'TestBox' ? '#333300' : '#000000'}
          wireframe={isWireframe}
        />
      </mesh> */}

      {/* Render meshes */}
      {meshes.map((meshData: R3FMeshData, index: number) => {
        // Create wireframe-aware material
        const material = Array.isArray(meshData.material) 
          ? meshData.material.map(mat => {
              if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
                const clonedMat = mat.clone()
                clonedMat.wireframe = isWireframe
                return clonedMat
              }
              return mat
            })
          : meshData.material instanceof THREE.MeshStandardMaterial || meshData.material instanceof THREE.MeshPhysicalMaterial
            ? (() => {
                const clonedMat = meshData.material.clone()
                clonedMat.wireframe = isWireframe
                return clonedMat
              })()
            : meshData.material

        return (
          <mesh
            key={`${meshData.name}-${index}`}
            ref={(mesh) => {
              if (mesh) meshRefs.current[index] = mesh
            }}
            geometry={meshData.geometry}
            material={material}
            position={meshData.position}
            rotation={meshData.rotation}
            scale={meshData.scale}
            userData={{ selectable: true, blenderName: meshData.name }}
            onClick={(e) => {
              console.log('🎯 Blender mesh clicked:', meshData.name, e)
              onPointerClick(e)
              e.stopPropagation()
            }}
            onPointerDown={(e) => {
              console.log('🎯 Blender mesh pointer down:', meshData.name, e)
              onPointerClick(e)
              e.stopPropagation()
            }}
          />
        )
      })}
      
      {/* Transform controls */}
      {selectedObject && (
        <TransformControls
          object={selectedObject}
          mode={gizmoMode}
          onChange={(e) => {
            console.log('🎛️ TransformControls onChange event:', e)
            onTransformChange()
          }}
          size={1.5}
          showX={true}
          showY={true}
          showZ={true}
        />
      )}
      
      {/* Debug info */}
      {selectedObject && (
        console.log('🎯 Selected object details:', {
          name: selectedObject.name,
          blenderName: selectedObject.userData?.blenderName,
          position: [selectedObject.position.x, selectedObject.position.y, selectedObject.position.z],
          rotation: [selectedObject.rotation.x, selectedObject.rotation.y, selectedObject.rotation.z],
          scale: [selectedObject.scale.x, selectedObject.scale.y, selectedObject.scale.z],
          hasTransformControls: selectedObject && isEditMode
        })
      )}
      
      {/* Camera controls */}
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