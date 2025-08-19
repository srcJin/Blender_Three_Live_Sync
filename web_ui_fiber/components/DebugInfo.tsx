'use client'

import type { DebugInfo } from '@/types'
import * as THREE from 'three'

interface DebugInfoProps {
  debugInfo: DebugInfo
  selectedObject?: THREE.Object3D | null
  isEditMode?: boolean
  gizmoMode?: 'translate' | 'rotate' | 'scale'
  connectionStatus?: {
    status: string
    port: number
  }
}

export default function DebugInfoPanel({ 
  debugInfo, 
  selectedObject, 
  isEditMode, 
  gizmoMode,
  connectionStatus 
}: DebugInfoProps) {
  return (
    <div className="debug-info">
      <div className="mesh-info">
        Vertices: {debugInfo.vertexCount} | Faces: {debugInfo.faceCount}
      </div>
      <div className="fps-info">
        FPS: {debugInfo.fps}
      </div>
      <div className="connection-info">
        Connection: <span className={connectionStatus?.status === 'connected' ? 'text-green-400' : 'text-red-400'}>
          {connectionStatus?.status?.toUpperCase() || 'UNKNOWN'}
        </span>
        {connectionStatus?.port && ` (port ${connectionStatus.port})`}
      </div>
      {isEditMode && (
        <div className="edit-info">
          <div>Edit Mode: ON</div>
          <div>Gizmo: {gizmoMode?.toUpperCase()}</div>
          <div>Selected: {selectedObject?.userData?.blenderName || 'None'}</div>
        </div>
      )}
    </div>
  )
}