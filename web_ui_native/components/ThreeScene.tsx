'use client'

import { useEffect, useRef } from 'react'
import { useThreeScene } from '@/hooks/useThreeScene'
import type { BlenderMeshData, BlenderSceneData } from '@/types'

interface ThreeSceneProps {
  meshData: BlenderMeshData | BlenderSceneData | null
}

interface ThreeScenePropsExtended extends ThreeSceneProps {
  initScene: (container: HTMLElement) => () => void
  updateMesh: (data: BlenderMeshData) => void
  updateScene: (data: BlenderSceneData) => void
}

export default function ThreeScene({ meshData, initScene, updateMesh, updateScene }: ThreeScenePropsExtended) {
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  
  console.log('🎬 ThreeScene component rendered')

  useEffect(() => {
    console.log('🎬 ThreeScene: useEffect called, canvasContainerRef.current:', !!canvasContainerRef.current)
    if (canvasContainerRef.current) {
      console.log('🎬 ThreeScene: Calling initScene...')
      const cleanup = initScene(canvasContainerRef.current)
      console.log('🎬 ThreeScene: initScene returned cleanup function:', typeof cleanup)
      return cleanup
    }
  }, [initScene])

  useEffect(() => {
    if (meshData) {
      // Check if it's the new scene format or legacy mesh format
      if ('objects' in meshData) {
        // New scene format with materials and lighting
        updateScene(meshData as BlenderSceneData)
      } else {
        // Legacy mesh format
        updateMesh(meshData as BlenderMeshData)
      }
    }
  }, [meshData, updateMesh, updateScene])

  return <div ref={canvasContainerRef} className="canvas-container" />
}