'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import * as THREE from 'three'
import { 
  createStandardMaterial, 
  createMaterialFromBlenderData,
  getBasisTransform,
  convertThreeJSPositionToBlender,
  convertThreeJSRotationToBlender,
  convertThreeJSScaleToBlender
} from '@/lib/three-utils'
import type { BlenderMeshData, BlenderSceneData, BlenderObjectData, MeshInfo } from '@/types'

interface R3FMeshData {
  name: string
  geometry: THREE.BufferGeometry
  material: THREE.Material | THREE.Material[]
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
}

export function useR3FScene(
  meshData: BlenderMeshData | BlenderSceneData | null,
  sendMessage?: (message: any) => boolean
) {
  const hookId = useRef(Math.random().toString(36).substring(7))
  console.log('🔍 useR3FScene called with sendMessage:', {
    hookId: hookId.current,
    sendMessageExists: !!sendMessage,
    sendMessageType: typeof sendMessage
  })
  const cameraRef = useRef<THREE.PerspectiveCamera>(null)
  const sendMessageRef = useRef(sendMessage)
  
  const [meshes, setMeshes] = useState<R3FMeshData[]>([])
  const [selectedObject, setSelectedObject] = useState<THREE.Object3D | null>(null)
  const [isEditMode, setIsEditMode] = useState(false)
  const [isWireframe, setIsWireframe] = useState(false)
  const [showGrid, setShowGrid] = useState(true)
  const [isAutoRotating, setIsAutoRotating] = useState(false)
  const [gizmoMode, setGizmoMode] = useState<'translate' | 'rotate' | 'scale'>('translate')
  const [meshInfo, setMeshInfo] = useState<MeshInfo>({ vertexCount: 0, faceCount: 0 })
  const [fps, setFps] = useState(60)
  const [lights, setLights] = useState<any[]>([])
  const [world, setWorld] = useState<any>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isSendingTransform, setIsSendingTransform] = useState(false)
  const [updateFrequency, setUpdateFrequency] = useState(10) // Hz, configurable
  const [smoothReceiving, setSmoothReceiving] = useState(true) // Smooth incoming updates
  const [resetCameraTrigger, setResetCameraTrigger] = useState(0)
  const [autoRotateSpeed, setAutoRotateSpeed] = useState(0); // degrees per second, 0 = off
  const autoRotateSpeedRef = useRef(autoRotateSpeed);

  // Debug logging for frequency changes and update ref
  useEffect(() => {
    console.log(`🔧 [${hookId.current}] updateFrequency changed to:`, updateFrequency, 'Hz, interval:', (1000 / updateFrequency), 'ms')
    console.log(`🔧 [${hookId.current}] Updating updateFrequencyRef from`, updateFrequencyRef.current, 'to', updateFrequency)
    updateFrequencyRef.current = updateFrequency
    console.log(`🔧 [${hookId.current}] updateFrequencyRef.current is now:`, updateFrequencyRef.current)
  }, [updateFrequency])

  useEffect(() => {
    autoRotateSpeedRef.current = autoRotateSpeed;
  }, [autoRotateSpeed]);

  const originalColors = useRef<Map<string, THREE.Color | THREE.Color[]>>(new Map());
  const lastSentTransformRef = useRef<any>(null);
  const lastSendTime = useRef<number>(0);
  const pendingTransformUpdate = useRef<any>(null);
  const targetMeshStates = useRef<Map<string, any>>(new Map());
  const currentMeshStates = useRef<Map<string, any>>(new Map());
  const updateFrequencyRef = useRef<number>(updateFrequency);

  // Create a stable sendMessage function that always works
  const stableSendMessage = useCallback((message: any) => {
    console.log('🔍 stableSendMessage called:', {
      sendMessageExists: !!sendMessage,
      sendMessageRefExists: !!sendMessageRef.current,
      message: message
    })
    
    if (sendMessage && typeof sendMessage === 'function') {
      return sendMessage(message)
    } else if (sendMessageRef.current && typeof sendMessageRef.current === 'function') {
      return sendMessageRef.current(message)
    } else {
      // Fallback: try to access WebSocket directly from global state or create one
      console.log('🔧 Attempting WebSocket fallback...')
      
      try {
        // Try to find existing WebSocket connection
        const wsUrl = 'ws://127.0.0.1:10005'
        const ws = new WebSocket(wsUrl)
        
        ws.onopen = () => {
          console.log('🔧 Fallback WebSocket connected')
          const messageStr = JSON.stringify(message)
          ws.send(messageStr)
          console.log('📤 Sent via fallback WebSocket:', message)
          ws.close()
        }
        
        ws.onerror = (error) => {
          console.error('🔧 Fallback WebSocket error:', error)
        }
        
        return true
      } catch (error) {
        console.error('🔧 Fallback WebSocket failed:', error)
        console.warn('❌ No valid sendMessage function available')
        return false
      }
    }
  }, [sendMessage])
  
  // Throttled send function that respects update frequency
  const throttledSendTransform = useCallback((transformData: any, immediate: boolean = false) => {
    const now = Date.now()
    const timeSinceLastSend = now - lastSendTime.current
    console.log(`🔍 [${hookId.current}] Before reading ref: updateFrequencyRef.current =`, updateFrequencyRef.current)
    const currentFrequency = updateFrequencyRef.current // Use ref to avoid closure issues
    const minInterval = 1000 / currentFrequency // Convert Hz to milliseconds
    console.log(`🔍 [${hookId.current}] After reading ref: currentFrequency =`, currentFrequency)
    
    console.log(`🔍 throttledSendTransform debug:`, {
      updateFrequency: currentFrequency,
      minInterval,
      timeSinceLastSend,
      immediate,
      canSendNow: immediate || timeSinceLastSend >= minInterval,
      lastSendTime: lastSendTime.current,
      now
    })
    
    if (immediate || timeSinceLastSend >= minInterval) {
      // Send immediately
      const result = stableSendMessage(transformData)
      lastSendTime.current = now
      pendingTransformUpdate.current = null
      console.log(`📡 Sent transform update (${currentFrequency}Hz throttle, immediate=${immediate}), result:`, result)
      return result
    } else {
      // Store for later sending
      pendingTransformUpdate.current = transformData
      const remainingDelay = minInterval - timeSinceLastSend
      console.log(`⏳ Transform update queued, will send in ${remainingDelay}ms (${currentFrequency}Hz throttle)`)
      
      // Schedule the pending update
      setTimeout(() => {
        if (pendingTransformUpdate.current) {
          const result = stableSendMessage(pendingTransformUpdate.current)
          lastSendTime.current = Date.now()
          const queuedTransform = pendingTransformUpdate.current
          pendingTransformUpdate.current = null
          console.log(`📡 Sent queued transform update (was queued for ${remainingDelay}ms), result:`, result)
          console.log(`📡 Queued transform details:`, queuedTransform)
        }
      }, remainingDelay)
      
      return true
    }
  }, [stableSendMessage])
  
  // Update the ref whenever sendMessage changes
  useEffect(() => {
    console.log('🔍 Updating sendMessageRef:', {
      oldRef: !!sendMessageRef.current,
      newSendMessage: !!sendMessage
    })
    sendMessageRef.current = sendMessage
  }, [sendMessage])

  const handlePointerClick = useCallback((event: any) => {
    event.stopPropagation();
    const clickedObject = event.object;

    if (selectedObject) {
      // Restore original color of previously selected object
      const originalColor = originalColors.current.get(selectedObject.uuid);
      if (originalColor) {
        const selectedMesh = selectedObject as THREE.Mesh;
        if (selectedMesh.material) {
          if (Array.isArray(selectedMesh.material)) {
            selectedMesh.material.forEach((mat, i) => {
              if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
                const colorArray = originalColor as THREE.Color[];
                mat.color.copy(colorArray[i]);
              }
            });
          } else if (selectedMesh.material instanceof THREE.MeshStandardMaterial || selectedMesh.material instanceof THREE.MeshPhysicalMaterial) {
            selectedMesh.material.color.copy(originalColor as THREE.Color);
          }
        }
      }
    }

    if (clickedObject && clickedObject.isMesh) {
      // Store original color and apply highlight
      if (Array.isArray(clickedObject.material)) {
        const colors: THREE.Color[] = [];
        clickedObject.material.forEach((mat: any) => {
          if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
            colors.push(mat.color.clone());
            mat.color.set(0x00ff00); // Highlight color (green)
          }
        });
        originalColors.current.set(clickedObject.uuid, colors);
      } else if (clickedObject.material instanceof THREE.MeshStandardMaterial || clickedObject.material instanceof THREE.MeshPhysicalMaterial) {
        originalColors.current.set(clickedObject.uuid, clickedObject.material.color.clone());
        clickedObject.material.color.set(0x00ff00); // Highlight color (green)
      }
      setSelectedObject(clickedObject);
    } else {
      setSelectedObject(null);
    }
  }, [selectedObject]);

  const handlePointerMissed = useCallback(() => {
    if (selectedObject) {
      // Restore original color of previously selected object
      const originalColor = originalColors.current.get(selectedObject.uuid);
      if (originalColor) {
        const selectedMesh = selectedObject as THREE.Mesh;
        if (selectedMesh.material) {
          if (Array.isArray(selectedMesh.material)) {
            selectedMesh.material.forEach((mat, i) => {
              if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
                const colorArray = originalColor as THREE.Color[];
                mat.color.copy(colorArray[i]);
              }
            });
          } else if (selectedMesh.material instanceof THREE.MeshStandardMaterial || selectedMesh.material instanceof THREE.MeshPhysicalMaterial) {
            selectedMesh.material.color.copy(originalColor as THREE.Color);
          }
        }
      }
      setSelectedObject(null);
    }
  }, [selectedObject]);

  // Convert Blender object data to R3F mesh data
  const createR3FMeshFromObjectData = useCallback((objectData: BlenderObjectData): R3FMeshData => {
    console.log(`🔷 R3F: Creating mesh for object '${objectData.name}'`)
    
    if (!objectData.vertices || objectData.vertices.length === 0) {
      throw new Error(`Object ${objectData.name} has no vertices`)
    }
    if (!objectData.faces || objectData.faces.length === 0) {
      throw new Error(`Object ${objectData.name} has no faces`)
    }
    
    const geometry = new THREE.BufferGeometry()
    
    // Create materials from Blender data or use default
    let materials: THREE.Material[] = []
    if (objectData.materials && objectData.materials.length > 0) {
      materials = objectData.materials.map((materialData) => {
        return createMaterialFromBlenderData(materialData, isWireframe)
      })
    } else {
      materials = [createStandardMaterial({ 
        wireframe: isWireframe,
        color: 0x808080,
        roughness: 0.7,
        metalness: 0.3
      })]
    }
    
    const material = materials.length === 1 ? materials[0] : materials
    
    // Transform coordinates from Blender to Three.js
    const blenderToThreeMatrix = new THREE.Matrix4()
    getBasisTransform('+X+Y+Z', '+X+Z+Y', blenderToThreeMatrix)
    
    const originalVertices = objectData.vertices.flat()
    const vertices = new Float32Array(originalVertices.length)
    
    for (let i = 0; i < originalVertices.length; i += 3) {
      const blenderPoint = new THREE.Vector3(
        originalVertices[i],
        originalVertices[i + 1],
        originalVertices[i + 2]
      )
      
      const threePoint = blenderPoint.applyMatrix4(blenderToThreeMatrix)
      
      vertices[i] = threePoint.x
      vertices[i + 1] = threePoint.y
      vertices[i + 2] = threePoint.z
    }
    
    const indices = new Uint32Array(objectData.faces.flat())
    
    // Set geometry data
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
    geometry.setIndex(new THREE.BufferAttribute(indices, 1))
    
    // Add UV coordinates if available
    if (objectData.uvs && objectData.uvs.length > 0) {
      const uvArray = new Float32Array(objectData.uvs.length * 2)
      for (let i = 0; i < objectData.uvs.length; i++) {
        uvArray[i * 2] = objectData.uvs[i][0]
        uvArray[i * 2 + 1] = 1.0 - objectData.uvs[i][1]
      }
      geometry.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2))
    }
    
    geometry.computeVertexNormals()
    geometry.computeBoundingSphere()

    // Extract transform data
    let position: [number, number, number] = [0, 0, 0]
    let rotation: [number, number, number] = [0, 0, 0]
    let scale: [number, number, number] = [1, 1, 1]

    if (objectData.transform) {
      const blenderMatrix = new THREE.Matrix4()
      blenderMatrix.fromArray(objectData.transform.flat())
      
      const blenderTranslation = new THREE.Vector3(
        objectData.transform[0][3],
        objectData.transform[1][3],
        objectData.transform[2][3]
      )
      
      const blenderToThreeMatrix = new THREE.Matrix4()
      getBasisTransform('+X+Y+Z', '+X+Z+Y', blenderToThreeMatrix)
      
      const threePosition = blenderTranslation.clone().applyMatrix4(blenderToThreeMatrix)
      
      // Extract rotation and scale from matrix
      const tempMatrix = blenderMatrix.clone()
      const pos = new THREE.Vector3()
      const quat = new THREE.Quaternion()
      const scaleVec = new THREE.Vector3()
      tempMatrix.decompose(pos, quat, scaleVec)
      
      const euler = new THREE.Euler()
      euler.setFromQuaternion(quat)
      
      position = [threePosition.x, threePosition.y, threePosition.z]
      rotation = [euler.x, euler.y, euler.z]
      scale = [scaleVec.x, scaleVec.y, scaleVec.z]
    }

    return {
      name: objectData.name,
      geometry,
      material,
      position,
      rotation,
      scale
    }
  }, [isWireframe])

  // Update scene when mesh data changes
  useEffect(() => {
    if (!meshData) return
    
    // Skip mesh updates when we're sending our own transform to prevent feedback
    if (isSendingTransform) {
      console.log('⏸️ Skipping mesh update - currently sending transform to prevent feedback')
      return
    }

    let newMeshes: R3FMeshData[] = []
    let totalVertexCount = 0
    let totalFaceCount = 0

    if ('objects' in meshData) {
      // New scene format with multiple objects
      newMeshes = meshData.objects.map(objectData => {
        const mesh = createR3FMeshFromObjectData(objectData)
        totalVertexCount += mesh.geometry.attributes.position.count
        totalFaceCount += mesh.geometry.index ? mesh.geometry.index.count / 3 : 0
        return mesh
      })

      if (meshData.lights) {
        const processedLights = meshData.lights.map(lightData => {
          if (!lightData || typeof lightData !== 'object') return null;

          const color = new THREE.Color(0xffffff);
          if (lightData.color && Array.isArray(lightData.color) && lightData.color.length >= 3) {
            color.setRGB(lightData.color[0], lightData.color[1], lightData.color[2]);
          }

          const position: [number, number, number] = [0, 0, 0];
          if (lightData.position && Array.isArray(lightData.position) && lightData.position.length >= 3) {
            const blenderPoint = new THREE.Vector3(
              lightData.position[0],
              lightData.position[1],
              lightData.position[2]
            );
            const blenderToThreeMatrix = new THREE.Matrix4();
            getBasisTransform('+X+Y+Z', '+X+Z+Y', blenderToThreeMatrix);
            const threePoint = blenderPoint.applyMatrix4(blenderToThreeMatrix);
            position[0] = threePoint.x;
            position[1] = threePoint.y;
            position[2] = threePoint.z;
          }

          let rotation: [number, number, number] | undefined = undefined;
          if (lightData.rotation && Array.isArray(lightData.rotation) && lightData.rotation.length >= 3) {
            const [rx, ry, rz] = lightData.rotation;
            const blenderEuler = new THREE.Euler(rx, ry, rz, 'XYZ');
            const blenderQuaternion = new THREE.Quaternion().setFromEuler(blenderEuler);

            const basisTransformMatrix = new THREE.Matrix4();
            getBasisTransform('+X+Y+Z', '+X+Z+Y', basisTransformMatrix);
            const basisTransformQuaternion = new THREE.Quaternion().setFromRotationMatrix(basisTransformMatrix);

            const transformedQuaternion = new THREE.Quaternion().multiplyQuaternions(basisTransformQuaternion, blenderQuaternion);
            const transformedEuler = new THREE.Euler().setFromQuaternion(transformedQuaternion, 'XYZ');

            rotation = [transformedEuler.x, transformedEuler.y, transformedEuler.z];
          }

          return {
            type: lightData.type || 'point',
            color,
            position,
            rotation,
            intensity: lightData.energy ?? 1,
            angle: lightData.angle,
            blend: lightData.blend,
            distance: lightData.distance
          };
        }).filter(Boolean);
        setLights(processedLights);
      }

      if (meshData.world) {
        const worldData = meshData.world;
        
        const backgroundColor = new THREE.Color(0x1e1e1e);
        if (worldData.backgroundColor && Array.isArray(worldData.backgroundColor) && worldData.backgroundColor.length >= 3) {
          backgroundColor.setRGB(worldData.backgroundColor[0], worldData.backgroundColor[1], worldData.backgroundColor[2]);
        }

        const ambientColor = new THREE.Color(0x404040);
        if (worldData.ambientColor && Array.isArray(worldData.ambientColor) && worldData.ambientColor.length >= 3) {
          ambientColor.setRGB(worldData.ambientColor[0], worldData.ambientColor[1], worldData.ambientColor[2]);
        }
        
        const processedWorld = {
          backgroundColor,
          ambientColor,
          ambientStrength: worldData.ambientStrength ?? 0.5
        };
        setWorld(processedWorld);
      } else if (!world) { // Set a default world only if one doesn't exist
        setWorld({
            backgroundColor: new THREE.Color(0x1e1e1e),
            ambientColor: new THREE.Color(0x404040),
            ambientStrength: 0.5
        });
      }
    } else {
      // Legacy single mesh format
      const geometry = new THREE.BufferGeometry()
      
      // Transform coordinates
      const originalVertices = meshData.vertices.flat()
      const vertices = new Float32Array(originalVertices.length)
      
      for (let i = 0; i < originalVertices.length; i += 3) {
        vertices[i] = originalVertices[i + 1]      // Blender Y → Three.js X
        vertices[i + 1] = originalVertices[i + 2]  // Blender Z → Three.js Y
        vertices[i + 2] = originalVertices[i]      // Blender X → Three.js Z
      }
      
      const indices = new Uint32Array(meshData.faces.flat())
      
      geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
      geometry.setIndex(new THREE.BufferAttribute(indices, 1))
      
      // Add UV coordinates if available
      if (meshData.uvs && meshData.uvs.length > 0) {
        const uvArray = new Float32Array(meshData.uvs.length * 2)
        for (let i = 0; i < meshData.uvs.length; i++) {
          uvArray[i * 2] = meshData.uvs[i][0]
          uvArray[i * 2 + 1] = 1.0 - meshData.uvs[i][1]
        }
        geometry.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2))
      }
      
      geometry.computeVertexNormals()
      geometry.computeBoundingSphere()

      const material = createStandardMaterial({ 
        wireframe: isWireframe,
        color: 0x808080,
        roughness: 0.7,
        metalness: 0.3
      })

      // Extract transform from legacy format
      let position: [number, number, number] = [0, 0, 0]
      let rotation: [number, number, number] = [0, 0, 0]
      let scale: [number, number, number] = [1, 1, 1]

      if (meshData.transform) {
        const blenderMatrix = new THREE.Matrix4()
        blenderMatrix.fromArray(meshData.transform.flat())
        
        const blenderTranslation = new THREE.Vector3(
          meshData.transform[0][3],
          meshData.transform[1][3],
          meshData.transform[2][3]
        )
        
        const blenderToThreeMatrix = new THREE.Matrix4()
        getBasisTransform('+X+Y+Z', '+X+Z+Y', blenderToThreeMatrix)
        
        const threePosition = blenderTranslation.clone().applyMatrix4(blenderToThreeMatrix)
        
        position = [threePosition.x, threePosition.y, threePosition.z]
      }

      totalVertexCount = geometry.attributes.position.count
      totalFaceCount = geometry.index ? geometry.index.count / 3 : 0

      newMeshes = [{
        name: 'LegacyMesh',
        geometry,
        material,
        position,
        rotation,
        scale
      }]
    }

    setMeshes(newMeshes)
    setMeshInfo({ vertexCount: totalVertexCount, faceCount: totalFaceCount })
  }, [meshData, createR3FMeshFromObjectData, isSendingTransform])

  useEffect(() => {
    if (selectedObject && isEditMode) {
      // Attach transform controls to the selected object
      // This part will be handled in R3FSceneContent directly
    } else {
      // Detach transform controls if no object is selected or not in edit mode
      // This part will be handled in R3FSceneContent directly
    }
  }, [selectedObject, isEditMode, gizmoMode]);

  // Transform change handler - only sends updates when dragging is complete
  const handleTransformChange = useCallback(() => {
    console.log('🚨 handleTransformChange called!', {
      selectedObjectExists: !!selectedObject,
      selectedObjectName: selectedObject?.userData?.blenderName || selectedObject?.name,
      isEditMode: isEditMode,
      isDragging: isDragging
    })
    
    // Skip sending updates while dragging to prevent wobbliness
    if (isDragging) {
      console.log('⏸️ Skipping transform update while dragging')
      return
    }
    
    if (selectedObject) {
      // This function is called when the TransformControls gizmo is moved
      const threeJSPosition: [number, number, number] = [
        selectedObject.position.x, 
        selectedObject.position.y, 
        selectedObject.position.z
      ]
      const threeJSRotation: [number, number, number] = [
        selectedObject.rotation.x, 
        selectedObject.rotation.y, 
        selectedObject.rotation.z
      ]
      const threeJSScale: [number, number, number] = [
        selectedObject.scale.x, 
        selectedObject.scale.y, 
        selectedObject.scale.z
      ]
      
      // Convert Three.js coordinates back to Blender coordinates
      const blenderPosition = convertThreeJSPositionToBlender(threeJSPosition)
      const blenderRotation = convertThreeJSRotationToBlender(threeJSRotation)
      const blenderScale = convertThreeJSScaleToBlender(threeJSScale)
      
      const transformData = {
        type: 'transform_update',
        objectName: selectedObject.userData?.blenderName || selectedObject.name,
        position: blenderPosition,
        rotation: blenderRotation,
        scale: blenderScale,
        timestamp: Date.now()
      }
      
      console.log('🔄 Transform changed, converting and sending to Blender:', {
        threeJS: { position: threeJSPosition, rotation: threeJSRotation, scale: threeJSScale },
        blender: { position: blenderPosition, rotation: blenderRotation, scale: blenderScale },
        objectName: transformData.objectName
      })
      
      console.log('🔍 Debug sendMessage function:', {
        sendMessageExists: !!sendMessage,
        sendMessageType: typeof sendMessage,
        sendMessageRefExists: !!sendMessageRef.current,
        sendMessageRefType: typeof sendMessageRef.current,
        hasWindowWebSocket: typeof window !== 'undefined' && !!window.WebSocket
      })
      
      // Send transform data back to server/Blender using throttled function
      console.log('📡 About to call throttledSendTransform with:', transformData)
      const result = throttledSendTransform(transformData)
      console.log('📤 Transform message sent (throttled), result:', result)
    } else {
      console.warn('🚨 handleTransformChange called but no selectedObject!')
    }
  }, [selectedObject, throttledSendTransform, isEditMode, isDragging])

  // Handle dragging state changes
  const handleDraggingChanged = useCallback((isDraggingNow: boolean) => {
    console.log('🎛️ Dragging state changed:', {
      wasDragging: isDragging,
      nowDragging: isDraggingNow,
      selectedObject: selectedObject?.userData?.blenderName || selectedObject?.name
    })
    
    setIsDragging(isDraggingNow)
    
    // When dragging ends, send the final transform to Blender
    if (!isDraggingNow && selectedObject) {
      console.log('🏁 Dragging ended, sending final transform to Blender')
      sendFinalTransform()
    }
  }, [isDragging, selectedObject])

  // Send final transform when dragging completes
  const sendFinalTransform = useCallback(() => {
    if (!selectedObject) return
    
    console.log('📡 Sending final transform to Blender after drag completion')
    
    // Set sending state to prevent feedback from incoming updates
    setIsSendingTransform(true)
    
    const threeJSPosition: [number, number, number] = [
      selectedObject.position.x, 
      selectedObject.position.y, 
      selectedObject.position.z
    ]
    const threeJSRotation: [number, number, number] = [
      selectedObject.rotation.x, 
      selectedObject.rotation.y, 
      selectedObject.rotation.z
    ]
    const threeJSScale: [number, number, number] = [
      selectedObject.scale.x, 
      selectedObject.scale.y, 
      selectedObject.scale.z
    ]
    
    // Convert Three.js coordinates back to Blender coordinates
    const blenderPosition = convertThreeJSPositionToBlender(threeJSPosition)
    const blenderRotation = convertThreeJSRotationToBlender(threeJSRotation)
    const blenderScale = convertThreeJSScaleToBlender(threeJSScale)
    
    const transformData = {
      type: 'transform_update',
      objectName: selectedObject.userData?.blenderName || selectedObject.name,
      position: blenderPosition,
      rotation: blenderRotation,
      scale: blenderScale,
      timestamp: Date.now()
    }
    
    // Store the last sent transform to avoid processing it back
    lastSentTransformRef.current = {
      objectName: transformData.objectName,
      position: [...blenderPosition],
      rotation: [...blenderRotation], 
      scale: [...blenderScale],
      timestamp: transformData.timestamp
    }
    
    console.log('🔄 Final transform data:', {
      threeJS: { position: threeJSPosition, rotation: threeJSRotation, scale: threeJSScale },
      blender: { position: blenderPosition, rotation: blenderRotation, scale: blenderScale },
      objectName: transformData.objectName
    })
    
    // Send final transform respecting throttling (no more immediate bypass)
    const result = throttledSendTransform(transformData, false) // respect throttling
    console.log('✅ Final transform sent to Blender (drag complete, respecting throttling), result:', result)
    
    // Clear sending state after a short delay to allow the network round trip
    setTimeout(() => {
      setIsSendingTransform(false)
      console.log('🔓 Transform sending cooldown complete, ready for incoming updates')
    }, 500) // 500ms cooldown
    
  }, [selectedObject, throttledSendTransform])

  // Control functions
  const toggleEditMode = useCallback(() => {
    setIsEditMode(prev => {
      const newMode = !prev
      if (!newMode) {
        setSelectedObject(null) // Deselect when exiting edit mode
      }
      console.log(`Edit mode: ${newMode ? 'ON' : 'OFF'}`)
      return newMode
    })
  }, [])

  const toggleWireframe = useCallback(() => {
    setIsWireframe(prev => !prev)
  }, [])

  const toggleAutoRotate = useCallback(() => {
    setIsAutoRotating(prev => !prev)
  }, []);

  const toggleGrid = useCallback(() => {
    setShowGrid(prev => !prev)
  }, [])

  const resetCamera = useCallback(() => {
    setResetCameraTrigger(Date.now())
  }, [])

  // Auto-rotation will be handled in a separate component inside Canvas

  return {
    meshes,
    selectedObject,
    isEditMode,
    isWireframe,
    showGrid,
    isAutoRotating,
    autoRotateSpeed,
    setAutoRotateSpeed,
    meshInfo,
    fps,
    cameraRef,
    handlePointerClick,
    handlePointerMissed,
    handleTransformChange,
    handleDraggingChanged,
    toggleEditMode,
    toggleWireframe,
    toggleAutoRotate,
    toggleGrid,
    resetCamera,
    resetCameraTrigger,
    lights,
    world,
    gizmoMode,
    setGizmoMode,
    isDragging,
    updateFrequency,
    setUpdateFrequency,
    smoothReceiving,
    setSmoothReceiving
  }
}