'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { 
  createStandardMaterial, 
  createMaterialFromBlenderData,
  createLightFromBlenderData,
  applyWorldSettings,
  createLightingSetup, 
  calculateOptimalCameraPosition, 
  disposeObject3D,
  createOptimizedRenderer,
  createEnhancedAxesHelper,
  getBasisTransform
} from '@/lib/three-utils'
import type { BlenderMeshData, BlenderSceneData, BlenderObjectData, MeshInfo } from '@/types'

export function useThreeScene() {
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const meshRef = useRef<THREE.Mesh | null>(null)
  const meshesRef = useRef<Map<string, THREE.Mesh>>(new Map())
  const controlsRef = useRef<{ target: THREE.Vector3; update: () => void; enableDamping: boolean; dampingFactor: number; screenSpacePanning: boolean } | null>(null)
  const gridHelperRef = useRef<THREE.GridHelper | null>(null)
  const axesHelperRef = useRef<THREE.Group | null>(null)
  const animationIdRef = useRef<number | null>(null)
  const transformControlsRef = useRef<any | null>(null)
  const selectedObjectRef = useRef<THREE.Mesh | null>(null)
  const raycasterRef = useRef<THREE.Raycaster | null>(null)
  const hoveredObjectRef = useRef<THREE.Mesh | null>(null)
  const pointerRef = useRef<THREE.Vector2>(new THREE.Vector2())
  const isEditModeRef = useRef<boolean>(false)
  const selectObjectRef = useRef<((mesh: THREE.Mesh) => void) | null>(null)
  const deselectObjectRef = useRef<(() => void) | null>(null)
  
  const [isInitialized, setIsInitialized] = useState(false)
  const [meshInfo, setMeshInfo] = useState<MeshInfo>({ vertexCount: 0, faceCount: 0 })
  const [fps, setFps] = useState(60)
  const [isAutoRotating, setIsAutoRotating] = useState(false)
  const [isWireframe, setIsWireframe] = useState(false)
  const [showGrid, setShowGrid] = useState(true)
  const [isEditMode, setIsEditMode] = useState(false)
  
  // Remove this useEffect - we'll handle ref updates manually in toggleEditMode

  const lastFrameTimeRef = useRef(0)

  const initScene = useCallback((container: HTMLElement) => {
    console.log('🏁 INIT: Starting scene initialization, isInitialized:', isInitialized)
    if (isInitialized) {
      console.log('🏁 INIT: Scene already initialized, returning')
      return () => {}
    }

    console.log('🏁 INIT: Creating new scene...')
    // Scene setup
    const scene = new THREE.Scene()
    const width = container.clientWidth || window.innerWidth
    const height = container.clientHeight || window.innerHeight
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000)
    const renderer = createOptimizedRenderer(container)
    
    container.appendChild(renderer.domElement)

    // Camera positioning (Blender-like default view)
    camera.position.set(7, 5, 7)
    camera.lookAt(0, 0, 0)

    // Lighting setup
    const lights = createLightingSetup()
    lights.forEach(light => scene.add(light))

    // Grid and enhanced axes helpers
    const gridHelper = new THREE.GridHelper(10, 10)
    const axesHelper = createEnhancedAxesHelper(5)
    scene.add(gridHelper)
    scene.add(axesHelper)


    // Store references
    sceneRef.current = scene
    cameraRef.current = camera
    rendererRef.current = renderer
    gridHelperRef.current = gridHelper
    axesHelperRef.current = axesHelper

    // Initialize raycaster for object selection
    raycasterRef.current = new THREE.Raycaster()

    // Import OrbitControls and TransformControls dynamically for client-side only
    Promise.all([
      import('three/examples/jsm/controls/OrbitControls.js'),
      import('three/examples/jsm/controls/TransformControls.js')
    ]).then(([{ OrbitControls }, { TransformControls }]) => {
      const controls = new OrbitControls(camera, renderer.domElement)
      controls.enableDamping = true
      controls.dampingFactor = 0.05
      controls.screenSpacePanning = true
      controlsRef.current = controls

      // Initialize TransformControls
      const transformControls = new TransformControls(camera, renderer.domElement)
      transformControls.addEventListener('change', () => {
        // Force render when transform controls change
        if (renderer && scene && camera) {
          renderer.render(scene, camera)
        }
      })
      transformControls.addEventListener('dragging-changed', (event: any) => {
        // Disable orbit controls when dragging transform controls
        controls.enabled = !event.value
        
        // Send transform data to Blender when dragging ends
        if (!event.value && selectedObjectRef.current) {
          sendTransformToBlender(selectedObjectRef.current)
        }
      })
      transformControlsRef.current = transformControls
      
      // Add TransformControls to the scene so it can render
      scene.add(transformControls as any)
      console.log('TransformControls initialized and added to scene')
    })

    // Start animation loop
    const animate = () => {
      const now = performance.now()
      const delta = now - lastFrameTimeRef.current
      lastFrameTimeRef.current = now
      
      const currentFps = Math.round(1000 / delta)
      setFps(isNaN(currentFps) ? 60 : Math.min(currentFps, 144))

      if (isAutoRotating) {
        // Auto-rotate single mesh or all meshes
        if (meshRef.current) {
          meshRef.current.rotation.y += 0.01
        } else {
          meshesRef.current.forEach(mesh => {
            mesh.rotation.y += 0.01
          })
        }
      }

      // Removed hover highlighting for now - focusing on click selection

      if (controlsRef.current) {
        controlsRef.current.update()
      }

      if (renderer && scene && camera) {
        renderer.render(scene, camera)
      }

      animationIdRef.current = requestAnimationFrame(animate)
    }
    
    animate()

    // Handle window resize
    const handleResize = () => {
      if (camera && renderer && container) {
        camera.aspect = container.clientWidth / container.clientHeight
        camera.updateProjectionMatrix()
        renderer.setSize(container.clientWidth, container.clientHeight)
      }
    }

    // Handle mouse clicks for object selection in edit mode will be set up separately

    // Handle keyboard shortcuts for transform modes
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isEditMode || !transformControlsRef.current) return

      switch (event.key.toLowerCase()) {
        case 'w':
          transformControlsRef.current.setMode('translate')
          console.log('Transform mode: Translate')
          break
        case 'e':
          transformControlsRef.current.setMode('rotate')
          console.log('Transform mode: Rotate')
          break
        case 'r':
          transformControlsRef.current.setMode('scale')
          console.log('Transform mode: Scale')
          break
        case 'q':
          const currentSpace = transformControlsRef.current.space
          transformControlsRef.current.setSpace(currentSpace === 'local' ? 'world' : 'local')
          console.log(`Transform space: ${transformControlsRef.current.space}`)
          break
        case 'escape':
          deselectObject()
          break
        case ' ':
          event.preventDefault()
          transformControlsRef.current.enabled = !transformControlsRef.current.enabled
          console.log(`Transform controls: ${transformControlsRef.current.enabled ? 'Enabled' : 'Disabled'}`)
          break
      }
    }

    // Handle mouse move for hover highlighting
    const handleMouseMove = (event: MouseEvent) => {
      if (!isEditMode) return
      
      const rect = container.getBoundingClientRect()
      pointerRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointerRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    }

    window.addEventListener('resize', handleResize)
    window.addEventListener('keydown', handleKeyDown)
    container.addEventListener('mousemove', handleMouseMove)


    setIsInitialized(true)

    return () => {
      console.log('🧹 CLEANUP: Scene cleanup called - this should only happen on unmount!')
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('keydown', handleKeyDown)
      container.removeEventListener('mousemove', handleMouseMove)
      if (animationIdRef.current) {
        console.log('🧹 CLEANUP: Cancelling animation frame')
        cancelAnimationFrame(animationIdRef.current)
      }
      if (renderer && container.contains(renderer.domElement)) {
        console.log('🧹 CLEANUP: Removing renderer from DOM')
        container.removeChild(renderer.domElement)
      }
      console.log('🧹 CLEANUP: Disposing renderer')
      renderer.dispose()
    }
  }, [])

  // Helper function to create mesh from object data
  const createMeshFromObjectData = useCallback((objectData: BlenderObjectData): THREE.Mesh => {
    console.log(`🔷 MESH: Creating mesh for object '${objectData.name}'`)
    
    // Validate geometry data
    if (!objectData.vertices || objectData.vertices.length === 0) {
      console.error(`🔷 MESH: Object '${objectData.name}' has no vertices!`)
      throw new Error(`Object ${objectData.name} has no vertices`)
    }
    if (!objectData.faces || objectData.faces.length === 0) {
      console.error(`🔷 MESH: Object '${objectData.name}' has no faces!`)
      throw new Error(`Object ${objectData.name} has no faces`)
    }
    
    const vertexCount = objectData.vertices.length
    const faceCount = objectData.faces.length
    console.log(`🔷 MESH: Object '${objectData.name}' geometry: ${vertexCount} vertices, ${faceCount} faces`)
    
    const geometry = new THREE.BufferGeometry()
    
    // Create materials from Blender data or use default
    let materials: THREE.Material[] = []
    if (objectData.materials && objectData.materials.length > 0) {
      console.log(`🔷 MESH: Object '${objectData.name}' has ${objectData.materials.length} materials`)
      materials = objectData.materials.map((materialData, index) => {
        console.log(`🔷 MESH: Creating material ${index} for '${objectData.name}': '${materialData.name}'`)
        return createMaterialFromBlenderData(materialData, isWireframe)
      })
    } else {
      console.log(`🔷 MESH: Object '${objectData.name}' has no materials, using default`)
      // Fallback to default material
      materials = [createStandardMaterial({ 
        wireframe: isWireframe,
        color: 0x808080,
        roughness: 0.7,
        metalness: 0.3
      })]
    }
    
    const material = materials.length === 1 ? materials[0] : materials
    
    // Transform coordinates from Blender to Three.js using getBasisTransform
    // Blender: Right=+X, Forward=+Y, Up=+Z  
    // Three.js: Right=+X, Up=+Y, Forward=+Z
    // So: Blender Y→Three.js Z, Blender Z→Three.js Y
    const blenderToThreeMatrix = new THREE.Matrix4()
    getBasisTransform('+X+Y+Z', '+X+Z+Y', blenderToThreeMatrix)
    
    const originalVertices = objectData.vertices.flat()
    const vertices = new Float32Array(originalVertices.length)
    
    for (let i = 0; i < originalVertices.length; i += 3) {
      const blenderPoint = new THREE.Vector3(
        originalVertices[i],     // X
        originalVertices[i + 1], // Y  
        originalVertices[i + 2]  // Z
      )
      
      // Apply coordinate conversion matrix
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
      console.log(`🔷 MESH: Object '${objectData.name}' has ${objectData.uvs.length} UV coordinates for ${objectData.vertices.length} vertices`)
      const uvArray = new Float32Array(objectData.uvs.length * 2)
      for (let i = 0; i < objectData.uvs.length; i++) {
        uvArray[i * 2] = objectData.uvs[i][0]     // U coordinate
        uvArray[i * 2 + 1] = 1.0 - objectData.uvs[i][1] // V coordinate (flip for Three.js)
      }
      geometry.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2))
      console.log(`🔷 MESH: Applied UV coordinates to '${objectData.name}' (${objectData.uvs.length} UVs for ${objectData.faces.length} faces)`)
      
      // Sample some UV coordinates for debugging
      if (objectData.uvs.length > 0) {
        console.log(`🔷 MESH: Sample UVs for '${objectData.name}':`, objectData.uvs.slice(0, Math.min(12, objectData.uvs.length)))
        
        // Check UV ranges
        let minU = Math.min(...objectData.uvs.map(uv => uv[0]))
        let maxU = Math.max(...objectData.uvs.map(uv => uv[0]))
        let minV = Math.min(...objectData.uvs.map(uv => uv[1]))
        let maxV = Math.max(...objectData.uvs.map(uv => uv[1]))
        console.log(`🔷 MESH: UV ranges for '${objectData.name}': U[${minU.toFixed(3)}, ${maxU.toFixed(3)}], V[${minV.toFixed(3)}, ${maxV.toFixed(3)}]`)
        
        // Show face structure
        console.log(`🔷 MESH: Face structure for '${objectData.name}' (first 4 faces):`, objectData.faces.slice(0, 4))
      }
    } else {
      console.log(`🔷 MESH: Object '${objectData.name}' has no UV coordinates`)
    }
    
    geometry.computeVertexNormals()
    geometry.computeBoundingSphere()

    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = objectData.name
    mesh.userData = { selectable: true, blenderName: objectData.name }
    
    // Add bounding box validation
    geometry.computeBoundingBox()
    const boundingBox = geometry.boundingBox
    if (boundingBox) {
      const size = boundingBox.getSize(new THREE.Vector3())
      console.log(`🔷 MESH: Bounding box for '${objectData.name}': size=[${size.x.toFixed(2)}, ${size.y.toFixed(2)}, ${size.z.toFixed(2)}]`)
      if (size.length() < 0.001) {
        console.warn(`🔷 MESH: Object '${objectData.name}' has very small bounding box, might not be raycast-able`)
      }
    }
    
    // Store original material colors for hover highlighting
    if (Array.isArray(material)) {
      material.forEach((mat, index) => {
        if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
          if (!mesh.userData.originalColors) mesh.userData.originalColors = []
          mesh.userData.originalColors[index] = mat.emissive.getHex()
        }
      })
    } else if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
      mesh.userData.originalEmissive = material.emissive.getHex()
    }
    
    console.log(`Created mesh: ${mesh.name} (selectable: ${mesh.userData.selectable})`)

    // Apply transform matrix if provided
    if (objectData.transform) {
      const blenderMatrix = new THREE.Matrix4()
      blenderMatrix.fromArray(objectData.transform.flat())
      
      // Extract translation directly from the 4th column of the matrix
      const blenderTranslation = new THREE.Vector3(
        objectData.transform[0][3],  // X translation
        objectData.transform[1][3],  // Y translation 
        objectData.transform[2][3]   // Z translation
      )
      
      // Convert coordinates using getBasisTransform
      const blenderToThreeMatrix = new THREE.Matrix4()
      getBasisTransform('+X+Y+Z', '+X+Z+Y', blenderToThreeMatrix)
      
      const threePosition = blenderTranslation.clone().applyMatrix4(blenderToThreeMatrix)
      
      // Apply Blender matrix directly without coordinate conversion
      mesh.applyMatrix4(blenderMatrix)
      
      // Override position with our manual coordinate conversion for accurate translation
      mesh.position.copy(threePosition)
      
      // console.log(`🔄 TRANSFORM: Applied to '${objectData.name}' - pos: [${threePosition.x.toFixed(2)}, ${threePosition.y.toFixed(2)}, ${threePosition.z.toFixed(2)}], scale: [${scale.x.toFixed(2)}, ${scale.y.toFixed(2)}, ${scale.z.toFixed(2)}]`)
    }

    return mesh
  }, [isWireframe])

  // Update multiple objects in the scene
  const updateScene = useCallback((data: BlenderSceneData) => {
    if (!sceneRef.current || !rendererRef.current) return

    console.log(`🌍 SCENE: Updating scene with ${data.objects.length} objects`)
    console.log(`🌍 SCENE: Object names:`, data.objects.map(obj => obj.name))

    const scene = sceneRef.current
    const renderer = rendererRef.current
    const currentMeshes = meshesRef.current
    const newObjectNames = new Set(data.objects.map(obj => obj.name))
    
    // Remove objects that are no longer in the scene
    currentMeshes.forEach((mesh, name) => {
      if (!newObjectNames.has(name)) {
        sceneRef.current?.remove(mesh)
        mesh.geometry.dispose()
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(mat => mat.dispose())
        } else {
          mesh.material.dispose()
        }
        currentMeshes.delete(name)
      }
    })

    // Update or create objects
    let totalVertexCount = 0
    let totalFaceCount = 0

    data.objects.forEach(objectData => {
      let mesh = currentMeshes.get(objectData.name)
      
      if (mesh) {
        // Update existing mesh
        const geometry = mesh.geometry
        geometry.dispose() // Clean up old geometry
        
        // Create new geometry
        const newGeometry = new THREE.BufferGeometry()
        
        // Transform coordinates
        const originalVertices = objectData.vertices.flat()
        const vertices = new Float32Array(originalVertices.length)
        
        for (let i = 0; i < originalVertices.length; i += 3) {
          const x = originalVertices[i]
          const y = originalVertices[i + 1]
          const z = originalVertices[i + 2]
          
          vertices[i] = x
          vertices[i + 1] = z
          vertices[i + 2] = -y
        }
        
        const indices = new Uint32Array(objectData.faces.flat())
        
        newGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
        newGeometry.setIndex(new THREE.BufferAttribute(indices, 1))
        
        // Add UV coordinates if available
        if (objectData.uvs && objectData.uvs.length > 0) {
          console.log(`🔄 UPDATE: Object '${objectData.name}' has ${objectData.uvs.length} UV coordinates for ${objectData.vertices.length} vertices`)
          const uvArray = new Float32Array(objectData.uvs.length * 2)
          for (let i = 0; i < objectData.uvs.length; i++) {
            uvArray[i * 2] = objectData.uvs[i][0]     // U coordinate
            uvArray[i * 2 + 1] = 1.0 - objectData.uvs[i][1] // V coordinate (flip for Three.js)
          }
          newGeometry.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2))
          console.log(`🔄 UPDATE: Applied UV coordinates to '${objectData.name}' (${objectData.uvs.length} UVs for ${objectData.faces.length} faces)`)
          
          // Sample some UV coordinates for debugging
          if (objectData.uvs.length > 0) {
            console.log(`🔄 UPDATE: Sample UVs for '${objectData.name}':`, objectData.uvs.slice(0, Math.min(12, objectData.uvs.length)))
            
            // Check UV ranges
            let minU = Math.min(...objectData.uvs.map(uv => uv[0]))
            let maxU = Math.max(...objectData.uvs.map(uv => uv[0]))
            let minV = Math.min(...objectData.uvs.map(uv => uv[1]))
            let maxV = Math.max(...objectData.uvs.map(uv => uv[1]))
            console.log(`🔄 UPDATE: UV ranges for '${objectData.name}': U[${minU.toFixed(3)}, ${maxU.toFixed(3)}], V[${minV.toFixed(3)}, ${maxV.toFixed(3)}]`)
            
            // Show face structure
            console.log(`🔄 UPDATE: Face structure for '${objectData.name}' (first 4 faces):`, objectData.faces.slice(0, 4))
          }
        } else {
          console.log(`🔄 UPDATE: Object '${objectData.name}' has no UV coordinates`)
        }
        
        newGeometry.computeVertexNormals()
        newGeometry.computeBoundingSphere()
        
        mesh.geometry = newGeometry
        
        // UPDATE MATERIALS - This was missing!
        console.log(`🔄 UPDATE: Updating materials for existing mesh '${objectData.name}'`)
        
        // Dispose old materials
        if (Array.isArray(mesh.material)) {
          console.log(`🔄 UPDATE: Disposing ${mesh.material.length} old materials`)
          mesh.material.forEach(mat => mat.dispose())
        } else {
          console.log(`🔄 UPDATE: Disposing 1 old material`)
          mesh.material.dispose()
        }
        
        // Create new materials from Blender data
        let materials: THREE.Material[] = []
        if (objectData.materials && objectData.materials.length > 0) {
          console.log(`🔄 UPDATE: Creating ${objectData.materials.length} new materials for '${objectData.name}'`)
          materials = objectData.materials.map((materialData, index) => {
            console.log(`🔄 UPDATE: Creating material ${index} for '${objectData.name}': '${materialData.name}'`)
            return createMaterialFromBlenderData(materialData, isWireframe)
          })
        } else {
          console.log(`🔄 UPDATE: Object '${objectData.name}' has no materials, using default`)
          // Fallback to default material
          materials = [createStandardMaterial({ 
            wireframe: isWireframe,
            color: 0x808080,
            roughness: 0.7,
            metalness: 0.3
          })]
        }
        
        mesh.material = materials.length === 1 ? materials[0] : materials
        console.log(`🔄 UPDATE: Applied ${materials.length} materials to '${objectData.name}'`)
        
        // Update transform
        if (objectData.transform) {
          const blenderMatrix = new THREE.Matrix4()
          blenderMatrix.fromArray(objectData.transform.flat())
          
          // Extract translation directly from the 4th column of the matrix
          const blenderTranslation = new THREE.Vector3(
            objectData.transform[0][3],  // X translation
            objectData.transform[1][3],  // Y translation 
            objectData.transform[2][3]   // Z translation
          )
          
          // Convert coordinates: Blender (x,y,z) -> Three.js (x,z,-y)
          const threePosition = new THREE.Vector3(
            blenderTranslation.x,   // X stays same
            blenderTranslation.z,   // Y becomes Z  
            -blenderTranslation.y   // Z becomes -Y
          )
          
          // Convert coordinate system from Blender to Three.js
          const coordTransform = new THREE.Matrix4().set(
            1,  0,  0, 0,  // X stays the same
            0,  0,  1, 0,  // Y becomes Z
            0, -1,  0, 0,  // Z becomes -Y
            0,  0,  0, 1   // Translation handled separately
          )
          
          const finalMatrix = new THREE.Matrix4()
          finalMatrix.multiplyMatrices(coordTransform, blenderMatrix)
          finalMatrix.multiply(coordTransform.clone().invert())
          
          // Decompose matrix into position, rotation, and scale
          const position = new THREE.Vector3()
          const rotation = new THREE.Quaternion()
          const scale = new THREE.Vector3()
          finalMatrix.decompose(position, rotation, scale)
          
          // Apply decomposed transform to mesh (use manual position conversion)
          mesh.position.copy(threePosition)  // Use manual conversion instead of decomposed
          mesh.quaternion.copy(rotation)
          mesh.scale.copy(scale)
          
          console.log(`🔄 UPDATE: Applied transform to '${objectData.name}' - pos: [${threePosition.x.toFixed(2)}, ${threePosition.y.toFixed(2)}, ${threePosition.z.toFixed(2)}], scale: [${scale.x.toFixed(2)}, ${scale.y.toFixed(2)}, ${scale.z.toFixed(2)}]`)
        }
      } else {
        // Create new mesh
        console.log(`➕ NEW: Creating new mesh for '${objectData.name}'`)
        mesh = createMeshFromObjectData(objectData)
        // Ensure selectable userData is set
        if (!mesh.userData) mesh.userData = {}
        mesh.userData.selectable = true
        mesh.userData.blenderName = objectData.name
        currentMeshes.set(objectData.name, mesh)
        sceneRef.current?.add(mesh)
        console.log(`➕ NEW: Added mesh '${objectData.name}' to scene (selectable: ${mesh.userData.selectable})`)
      }
      
      // Accumulate stats
      totalVertexCount += mesh.geometry.attributes.position.count
      totalFaceCount += mesh.geometry.index ? mesh.geometry.index.count / 3 : 0
    })

    // Update mesh info with total counts
    setMeshInfo({ vertexCount: totalVertexCount, faceCount: totalFaceCount })

    // Handle lighting updates
    if (data.lights) {
      // Remove existing synced lights (keep default lights)
      const lightsToRemove = scene.children.filter(child => 
        child instanceof THREE.Light && child.name.startsWith('blender_')
      )
      lightsToRemove.forEach(light => scene.remove(light))

      // Add new lights from Blender
      data.lights.forEach(lightData => {
        try {
          const light = createLightFromBlenderData(lightData)
          light.name = `blender_${lightData.name}`
          scene.add(light)
        } catch (error) {
          console.warn(`Failed to create light ${lightData.name}:`, error)
        }
      })
    }

    // Handle world settings updates
    if (data.world) {
      try {
        applyWorldSettings(scene, renderer, data.world)
      } catch (error) {
        console.warn('Failed to apply world settings:', error)
      }
    }

    // Clear single mesh reference since we're using multiple objects
    meshRef.current = null
  }, [createMeshFromObjectData])

  const updateMesh = useCallback((data: BlenderMeshData) => {
    if (!sceneRef.current) return

    // Create or update mesh (matching legacy implementation)
    if (!meshRef.current) {
      const geometry = new THREE.BufferGeometry()
      const material = createStandardMaterial({ 
        wireframe: isWireframe,
        color: 0x808080,
        roughness: 0.7,
        metalness: 0.3
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.name = 'LegacyMesh'
      mesh.userData = { selectable: true, blenderName: 'LegacyMesh' }
      
      // Store original material color for hover highlighting
      const standardMaterial = material as any;
      if (standardMaterial instanceof THREE.MeshStandardMaterial || standardMaterial instanceof THREE.MeshPhysicalMaterial) {
        mesh.userData.originalEmissive = standardMaterial.emissive.getHex()
      }
      
      meshRef.current = mesh
      sceneRef.current.add(mesh)
      console.log('Created legacy mesh with selectable userData')
    }

    // Update vertices and faces - exact match to legacy coordinate transformation
    // Transform from Blender coordinate system (Z-up) to Three.js (Y-up)
    // Blender: X=right, Y=forward, Z=up
    // Three.js: X=right, Y=up, Z=forward
    // Transformation: (x, y, z) -> (x, z, -y)
    const originalVertices = data.vertices.flat()
    const vertices = new Float32Array(originalVertices.length)
    
    for (let i = 0; i < originalVertices.length; i += 3) {
      const x = originalVertices[i]     // X stays the same
      const y = originalVertices[i + 1] // Y becomes -Z
      const z = originalVertices[i + 2] // Z becomes Y
      
      vertices[i] = y      // X (was Y in Blender) - Blender Y+ → Three.js X+
      vertices[i + 1] = z  // Y (was Z in Blender) - Blender Z+ → Three.js Y+
      vertices[i + 2] = x  // Z (was X in Blender) - Blender X+ → Three.js Z+
    }
    
    const indices = new Uint32Array(data.faces.flat())

    // Clear old geometry data
    meshRef.current.geometry.dispose()
    meshRef.current.geometry = new THREE.BufferGeometry()
    
    // Set new geometry data
    meshRef.current.geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
    meshRef.current.geometry.setIndex(new THREE.BufferAttribute(indices, 1))
    
    // Add UV coordinates if available
    if (data.uvs && data.uvs.length > 0) {
      console.log(`🔄 LEGACY: Mesh has ${data.uvs.length} UV coordinates`)
      const uvArray = new Float32Array(data.uvs.length * 2)
      for (let i = 0; i < data.uvs.length; i++) {
        uvArray[i * 2] = data.uvs[i][0]     // U coordinate
        uvArray[i * 2 + 1] = 1.0 - data.uvs[i][1] // V coordinate (flip for Three.js)
      }
      meshRef.current.geometry.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2))
      console.log(`🔄 LEGACY: Applied UV coordinates to mesh`)
    } else {
      console.log(`🔄 LEGACY: Mesh has no UV coordinates`)
    }
    
    // Recalculate normals and bounds
    meshRef.current.geometry.computeVertexNormals()
    meshRef.current.geometry.computeBoundingSphere()

    // Update transform matrix (matching legacy implementation)
    if (data.transform) {
      const blenderMatrix = new THREE.Matrix4()
      blenderMatrix.fromArray(data.transform.flat())
      
      // Extract translation directly from the 4th column of the matrix
      const blenderTranslation = new THREE.Vector3(
        data.transform[0][3],  // X translation
        data.transform[1][3],  // Y translation 
        data.transform[2][3]   // Z translation
      )
      
      // Convert coordinates using getBasisTransform
      const blenderToThreeMatrix = new THREE.Matrix4()
      getBasisTransform('+X+Y+Z', '+X+Z+Y', blenderToThreeMatrix)
      
      const threePosition = blenderTranslation.clone().applyMatrix4(blenderToThreeMatrix)
      
      // Convert coordinate system from Blender to Three.js for rotation and scale
      // Blender: X=right, Y=forward, Z=up → Three.js: X=right, Y=up, Z=forward
      const coordTransform = new THREE.Matrix4().set(
        1,  0,  0, 0,  // X stays the same
        0,  0,  1, 0,  // Y becomes Z (Blender forward → Three.js forward)  
        0, -1,  0, 0,  // Z becomes -Y (Blender up → Three.js -up, then flip)
        0,  0,  0, 1   // Translation handled separately
      )
      
      const finalMatrix = new THREE.Matrix4()
      finalMatrix.multiplyMatrices(coordTransform, blenderMatrix)
      finalMatrix.multiply(coordTransform.clone().invert())
      
      // Decompose matrix for rotation and scale
      const position = new THREE.Vector3()
      const rotation = new THREE.Quaternion()
      const scale = new THREE.Vector3()
      finalMatrix.decompose(position, rotation, scale)
      
      // Apply transform to mesh (use manual position conversion for accurate translation)
      meshRef.current.position.copy(threePosition)
      meshRef.current.quaternion.copy(rotation)
      meshRef.current.scale.copy(scale)
      
      console.log(`🔄 LEGACY: Applied transform - pos: [${threePosition.x.toFixed(2)}, ${threePosition.y.toFixed(2)}, ${threePosition.z.toFixed(2)}], scale: [${scale.x.toFixed(2)}, ${scale.y.toFixed(2)}, ${scale.z.toFixed(2)}]`)
    }

    // Update mesh info
    const vertexCount = meshRef.current.geometry.attributes.position.count
    const faceCount = meshRef.current.geometry.index ? meshRef.current.geometry.index.count / 3 : 0
    setMeshInfo({ vertexCount, faceCount })
  }, [isWireframe])

  const resetCamera = useCallback(() => {
    if (!cameraRef.current || !controlsRef.current) return

    let boundingSphere: THREE.Sphere | null = null

    // Calculate bounding sphere for single mesh or all meshes
    if (meshRef.current) {
      boundingSphere = meshRef.current.geometry.boundingSphere
    } else if (meshesRef.current.size > 0) {
      // Calculate combined bounding sphere for all objects
      const box = new THREE.Box3()
      meshesRef.current.forEach(mesh => {
        if (mesh.geometry.boundingBox) {
          box.expandByObject(mesh)
        } else {
          mesh.geometry.computeBoundingBox()
          if (mesh.geometry.boundingBox) {
            box.expandByObject(mesh)
          }
        }
      })
      
      if (!box.isEmpty()) {
        boundingSphere = box.getBoundingSphere(new THREE.Sphere())
      }
    }

    if (boundingSphere) {
      calculateOptimalCameraPosition(boundingSphere, cameraRef.current, controlsRef.current)
    }
  }, [])

  const toggleWireframe = useCallback(() => {
    const newWireframe = !isWireframe
    
    // Toggle wireframe for single mesh or all meshes
    if (meshRef.current?.material) {
      if (Array.isArray(meshRef.current.material)) {
        meshRef.current.material.forEach(mat => {
          if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
            mat.wireframe = newWireframe
          }
        })
      } else if (meshRef.current.material instanceof THREE.MeshStandardMaterial || meshRef.current.material instanceof THREE.MeshPhysicalMaterial) {
        meshRef.current.material.wireframe = newWireframe
      }
    } else {
      meshesRef.current.forEach(mesh => {
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(mat => {
              if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
                mat.wireframe = newWireframe
              }
            })
          } else if (mesh.material instanceof THREE.MeshStandardMaterial || mesh.material instanceof THREE.MeshPhysicalMaterial) {
            mesh.material.wireframe = newWireframe
          }
        }
      })
    }
    
    setIsWireframe(newWireframe)
  }, [isWireframe])

  const toggleAutoRotate = useCallback(() => {
    setIsAutoRotating(prev => !prev)
  }, [])

  const toggleGrid = useCallback(() => {
    if (gridHelperRef.current && axesHelperRef.current) {
      const newShowGrid = !showGrid
      gridHelperRef.current.visible = newShowGrid
      axesHelperRef.current.visible = newShowGrid
      setShowGrid(newShowGrid)
    }
  }, [showGrid])

  const setEmissiveHighlight = useCallback((mesh: THREE.Mesh, color: number) => {
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach(mat => {
        if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
          mat.emissive.setHex(color)
        }
      })
    } else if (mesh.material instanceof THREE.MeshStandardMaterial || mesh.material instanceof THREE.MeshPhysicalMaterial) {
      mesh.material.emissive.setHex(color)
    }
  }, [])

  const restoreOriginalEmissive = useCallback((mesh: THREE.Mesh) => {
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((mat, index) => {
        if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
          const originalColor = mesh.userData.originalColors?.[index] ?? 0x000000
          mat.emissive.setHex(originalColor)
        }
      })
    } else if (mesh.material instanceof THREE.MeshStandardMaterial || mesh.material instanceof THREE.MeshPhysicalMaterial) {
      const originalColor = mesh.userData.originalEmissive ?? 0x000000
      mesh.material.emissive.setHex(originalColor)
    }
  }, [])

  const selectObject = useCallback((mesh: THREE.Mesh) => {
    if (transformControlsRef.current) {
      // Restore previous selected object
      if (selectedObjectRef.current) {
        restoreOriginalEmissive(selectedObjectRef.current)
      }

      selectedObjectRef.current = mesh
      transformControlsRef.current.attach(mesh)
      
      // Highlight selected object with bright color
      setEmissiveHighlight(mesh, 0x00ff00) // Bright green highlight - very visible on red cube
      
      console.log(`Selected object: ${mesh.name || 'Unnamed'}`)
    }
  }, [setEmissiveHighlight, restoreOriginalEmissive])

  // Update refs when callbacks change
  useEffect(() => {
    selectObjectRef.current = selectObject
  }, [selectObject])

  const deselectObject = useCallback(() => {
    if (transformControlsRef.current) {
      // Restore selected object's original color
      if (selectedObjectRef.current) {
        restoreOriginalEmissive(selectedObjectRef.current)
      }
      
      transformControlsRef.current.detach()
      selectedObjectRef.current = null
      console.log('Deselected object')
    }
  }, [restoreOriginalEmissive])

  // Update refs when callbacks change
  useEffect(() => {
    deselectObjectRef.current = deselectObject
  }, [deselectObject])

  const toggleEditMode = useCallback(() => {
    const newEditMode = !isEditMode
    
    // Update ref first, then state to ensure synchronization
    isEditModeRef.current = newEditMode
    setIsEditMode(newEditMode)
    
    if (!newEditMode) {
      // When exiting edit mode, deselect any selected object and clear hover
      deselectObject()
      if (hoveredObjectRef.current) {
        restoreOriginalEmissive(hoveredObjectRef.current)
        hoveredObjectRef.current = null
      }
    }
    
    console.log(`Edit mode: ${newEditMode ? 'ON' : 'OFF'}`)
    console.log(`🔧 DEBUG: isEditModeRef.current set to:`, isEditModeRef.current)
    console.log(`🔧 DEBUG: isEditMode state will be:`, newEditMode)
  }, [isEditMode, deselectObject, restoreOriginalEmissive])

  const sendTransformToBlender = useCallback(async (mesh: THREE.Mesh) => {
    try {
      // Convert Three.js transform back to Blender coordinate system
      const threePosition = mesh.position
      const threeQuaternion = mesh.quaternion
      const threeScale = mesh.scale

      // Convert position back to Blender coordinates using inverse getBasisTransform
      const threeToBlenderMatrix = new THREE.Matrix4()
      getBasisTransform('+X+Z+Y', '+X+Y+Z', threeToBlenderMatrix)
      
      const blenderPosition = threePosition.clone().applyMatrix4(threeToBlenderMatrix)

      // Create transform matrix in Blender format
      const transformMatrix = new THREE.Matrix4()
      transformMatrix.compose(blenderPosition, threeQuaternion, threeScale)

      const transformData = {
        type: 'transform_update',
        objectName: mesh.name || 'Unknown',
        transform: transformMatrix.toArray(),
        position: [blenderPosition.x, blenderPosition.y, blenderPosition.z],
        rotation: [threeQuaternion.x, threeQuaternion.y, threeQuaternion.z, threeQuaternion.w],
        scale: [threeScale.x, threeScale.y, threeScale.z]
      }

      console.log('Sending transform to Blender:', transformData)

      // Send to WebSocket (assuming you have access to the WebSocket connection)
      // You might need to pass the WebSocket send function as a prop or use a context
      
    } catch (error) {
      console.error('Error sending transform to Blender:', error)
    }
  }, [])

  const handleHoverHighlight = useCallback(() => {
    if (!raycasterRef.current || !cameraRef.current || !sceneRef.current) return

    // Update raycaster with current mouse position
    raycasterRef.current.setFromCamera(pointerRef.current, cameraRef.current)

    // Get all selectable meshes
    const selectableMeshes: THREE.Mesh[] = []
    if (meshRef.current && meshRef.current.userData?.selectable) {
      selectableMeshes.push(meshRef.current)
    }
    meshesRef.current.forEach(mesh => {
      if (mesh.userData?.selectable) {
        selectableMeshes.push(mesh)
      }
    })
    
    // Also include test objects and any other selectable objects in scene (same as click handler)
    sceneRef.current.children.forEach((child) => {
      if (child instanceof THREE.Mesh && child.userData?.selectable && !selectableMeshes.includes(child)) {
        selectableMeshes.push(child)
      }
    })

    const intersects = raycasterRef.current.intersectObjects(selectableMeshes)

    if (intersects.length > 0) {
      const hoveredMesh = intersects[0].object as THREE.Mesh

      // If we're hovering over a different object
      if (hoveredObjectRef.current !== hoveredMesh) {
        // Restore previous hovered object
        if (hoveredObjectRef.current) {
          restoreOriginalEmissive(hoveredObjectRef.current)
        }

        // Highlight new hovered object (unless it's currently selected)
        hoveredObjectRef.current = hoveredMesh
        if (hoveredMesh !== selectedObjectRef.current) {
          setEmissiveHighlight(hoveredMesh, 0x404040) // Dark gray highlight
        }
      }
    } else {
      // No intersection - restore previous hovered object
      if (hoveredObjectRef.current) {
        restoreOriginalEmissive(hoveredObjectRef.current)
        hoveredObjectRef.current = null
      }
    }
  }, [])

  const cleanup = useCallback(() => {
    if (animationIdRef.current) {
      cancelAnimationFrame(animationIdRef.current)
    }
    if (sceneRef.current) {
      disposeObject3D(sceneRef.current)
    }
    if (rendererRef.current) {
      rendererRef.current.dispose()
    }
  }, [])

  // Mouse click handler for object selection (similar to test-mouse page)
  useEffect(() => {
    if (!rendererRef.current) return
    
    console.log('🔧 MAIN: Setting up click listeners')
    const renderer = rendererRef.current
    const canvas = renderer.domElement

    const handleMouseClick = (event: MouseEvent) => {
      // Only process clicks in edit mode
      if (!isEditMode) {
        console.log('🔧 MAIN: Click ignored - not in edit mode')
        return
      }
      
      console.log('🔧 MAIN: Processing click in edit mode')
      
      if (!raycasterRef.current || !cameraRef.current || !sceneRef.current) {
        console.log('🔧 MAIN: Missing required refs')
        return
      }
      
      const rect = canvas.getBoundingClientRect()
      const mouse = new THREE.Vector2()
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      
      raycasterRef.current.setFromCamera(mouse, cameraRef.current)
      
      // Get all selectable meshes (including debug cube and Blender objects)
      const selectableMeshes: THREE.Mesh[] = []
      
      // Include meshes from meshesRef (Blender objects)
      meshesRef.current.forEach((mesh) => {
        if (mesh.userData?.selectable) {
          selectableMeshes.push(mesh)
        }
      })
      
      // Include scene children (like debug cube)
      sceneRef.current.children.forEach((child) => {
        if (child instanceof THREE.Mesh && child.userData?.selectable && !selectableMeshes.includes(child)) {
          selectableMeshes.push(child)
        }
      })
      
      console.log('🔧 MAIN: Found', selectableMeshes.length, 'selectable meshes')
      
      const intersects = raycasterRef.current.intersectObjects(selectableMeshes)
      console.log('🔧 MAIN: Intersections:', intersects.length)
      
      if (intersects.length > 0) {
        const selectedMesh = intersects[0].object as THREE.Mesh
        console.log('🔧 MAIN: Selected:', selectedMesh.name)
        selectObject(selectedMesh)
      } else {
        console.log('🔧 MAIN: No intersections, deselecting')
        deselectObject()
      }
    }

    // Attach click listener directly to canvas (like test-mouse page)
    canvas.addEventListener('click', handleMouseClick)
    console.log('🔧 MAIN: Click listener attached to canvas')
    
    // Cleanup function
    return () => {
      canvas.removeEventListener('click', handleMouseClick)
      console.log('🔧 MAIN: Click listener removed')
    }
  }, [isEditMode, selectObject, deselectObject]) // Include dependencies for access to current values

  useEffect(() => {
    return cleanup
  }, [cleanup])

  return {
    initScene,
    updateMesh,
    updateScene,
    resetCamera,
    toggleWireframe,
    toggleAutoRotate,
    toggleGrid,
    toggleEditMode,
    selectObject,
    deselectObject,
    meshInfo,
    fps,
    isAutoRotating,
    isWireframe,
    showGrid,
    isEditMode
  }
}