import * as THREE from 'three'
import type { BlenderMaterialData, BlenderLightData, BlenderWorldData } from '@/types'

// Global texture cache to avoid re-loading identical textures
const textureCache = new Map<string, THREE.Texture>() // hash -> THREE.Texture

// Performance stats
let cacheStats = {
  hits: 0,
  misses: 0,
  totalTextures: 0
}

/**
 * Convert coordinates from Blender coordinate system (Z-up) to Three.js (Y-up)
 * Blender: X=right, Y=forward, Z=up
 * Three.js: X=right, Y=up, Z=forward
 * Transformation: (x, y, z) -> (x, z, -y)
 */
export function convertBlenderToThreeJS(vertices: Float32Array): Float32Array {
  const converted = new Float32Array(vertices.length)
  
  for (let i = 0; i < vertices.length; i += 3) {
    const x = vertices[i]
    const y = vertices[i + 1]
    const z = vertices[i + 2]
    
    converted[i] = x      // X stays the same
    converted[i + 1] = z  // Y becomes Z
    converted[i + 2] = -y // Z becomes -Y
  }
  
  return converted
}

/**
 * Convert position from Three.js coordinate system (Y-up) back to Blender (Z-up)
 * Three.js: X=right, Y=up, Z=forward
 * Blender: X=right, Y=forward, Z=up
 * Transformation: (x, y, z) -> (x, -z, y)
 */
export function convertThreeJSPositionToBlender(position: [number, number, number]): [number, number, number] {
  const [x, y, z] = position
  return [x, -z, y]
}

/**
 * Convert rotation from Three.js coordinate system (Y-up) back to Blender (Z-up)
 * Three.js: X=right, Y=up, Z=forward (XYZ Euler)
 * Blender: X=right, Y=forward, Z=up (XYZ Euler)
 * Transformation: (rx, ry, rz) -> (rx, -rz, ry)
 */
export function convertThreeJSRotationToBlender(rotation: [number, number, number]): [number, number, number] {
  const [rx, ry, rz] = rotation
  return [rx, -rz, ry]
}

/**
 * Convert scale from Three.js coordinate system (Y-up) back to Blender (Z-up)
 * Scale transformation: (sx, sy, sz) -> (sx, sz, sy)
 */
export function convertThreeJSScaleToBlender(scale: [number, number, number]): [number, number, number] {
  const [sx, sy, sz] = scale
  return [sx, sz, sy]
}

/**
 * Create coordinate system transformation matrix
 * From Blender (Z-up) to Three.js (Y-up)
 */
export function createCoordinateTransformMatrix(): THREE.Matrix4 {
  return new THREE.Matrix4().set(
    1,  0,  0, 0,  // X stays the same
    0,  0,  1, 0,  // Y becomes Z
    0, -1,  0, 0,  // Z becomes -Y
    0,  0,  0, 1   // Translation handled separately
  )
}

/**
 * Apply Blender transform matrix with coordinate system conversion
 */
export function applyBlenderTransform(
  mesh: THREE.Mesh, 
  transformArray: number[][]
): void {
  // Reset transform
  mesh.position.set(0, 0, 0)
  mesh.rotation.set(0, 0, 0)
  mesh.scale.set(1, 1, 1)
  
  // Create matrices
  const blenderMatrix = new THREE.Matrix4()
  blenderMatrix.fromArray(transformArray.flat())
  
  const coordTransform = createCoordinateTransformMatrix()
  
  // Apply transformation: coordTransform * blenderMatrix * coordTransform.inverse()
  const finalMatrix = new THREE.Matrix4()
  finalMatrix.multiplyMatrices(coordTransform, blenderMatrix)
  finalMatrix.multiply(coordTransform.clone().invert())
  
  mesh.applyMatrix4(finalMatrix)
}

/**
 * Create optimized material with PBR properties
 */
export function createStandardMaterial(options: {
  color?: number
  roughness?: number
  metalness?: number
  wireframe?: boolean
}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: options.color ?? 0x808080,
    roughness: options.roughness ?? 0.7,
    metalness: options.metalness ?? 0.3,
    wireframe: options.wireframe ?? false,
    side: THREE.DoubleSide,
    flatShading: true,
  })
}

/**
 * Create Three.js material from Blender material data
 */
export function createMaterialFromBlenderData(
  materialData: BlenderMaterialData,
  wireframe: boolean = false
): THREE.Material {
  console.log(`🎨 MATERIAL: Creating Three.js material for '${materialData.name}'`)
  console.log(`🎨 MATERIAL: Type: ${materialData.type}`)
  console.log(`🎨 MATERIAL: Color: [${materialData.color.join(', ')}]`)
  console.log(`🎨 MATERIAL: Roughness: ${materialData.roughness}`)
  console.log(`🎨 MATERIAL: Metalness: ${materialData.metalness}`)
  console.log(`🎨 MATERIAL: Wireframe: ${wireframe}`)

  const [r, g, b] = materialData.color
  const color = new THREE.Color(r, g, b)

  // Common material properties
  const commonProps = {
    color,
    roughness: materialData.roughness,
    metalness: materialData.metalness,
    wireframe,
  }

  // Handle textures if present
  const textureLoader = new THREE.TextureLoader()
  const loadedTextures: { [key: string]: THREE.Texture } = {}
  
  if (materialData.textures) {
    console.log(`🎨 MATERIAL: '${materialData.name}' has textures:`, Object.keys(materialData.textures))
    
    Object.entries(materialData.textures).forEach(([type, texture]) => {
      console.log(`🎨 MATERIAL: ${type} texture:`, texture)
      
      if (texture.error) {
        console.error(`🎨 MATERIAL: ${type} texture error:`, texture.error)
        console.error(`🎨 MATERIAL: Texture object:`, texture)
        return
      }
      
      if (texture.data && texture.hash) {
        try {
          console.log(`🎨 MATERIAL: Processing ${type} texture '${texture.name}' (${texture.size || 'unknown'} bytes, hash: ${texture.hash?.substring(0, 8)}...)`)
          
          // Check cache first
          if (textureCache.has(texture.hash)) {
            const cachedTexture = textureCache.get(texture.hash)!
            loadedTextures[type] = cachedTexture
            cacheStats.hits++
            console.log(`🎨 MATERIAL: Using cached ${type} texture '${texture.name}' (cache hit: ${cacheStats.hits}/${cacheStats.totalTextures})`)
          } else {
            // Load new texture from base64 data URL
            console.log(`🎨 MATERIAL: Loading new ${type} texture '${texture.name}' (${texture.format || 'unknown'} format)`)
            
            const threeTexture = textureLoader.load(
              texture.data,
              // onLoad
              (loadedTexture) => {
                console.log(`🎨 MATERIAL: Successfully loaded ${type} texture '${texture.name}'`)
                loadedTexture.needsUpdate = true
              },
              // onProgress
              undefined,
              // onError
              (error) => {
                console.error(`🎨 MATERIAL: Failed to load ${type} texture '${texture.name}':`, error)
              }
            )
            
            // Configure texture properties for better compatibility
            threeTexture.wrapS = THREE.ClampToEdgeWrapping
            threeTexture.wrapT = THREE.ClampToEdgeWrapping
            threeTexture.flipY = false // Blender textures are usually flipped
            threeTexture.generateMipmaps = true
            threeTexture.minFilter = THREE.LinearMipmapLinearFilter
            threeTexture.magFilter = THREE.LinearFilter
            
            // Cache the texture
            textureCache.set(texture.hash, threeTexture)
            loadedTextures[type] = threeTexture
            cacheStats.misses++
            cacheStats.totalTextures = cacheStats.hits + cacheStats.misses
            
            console.log(`🎨 MATERIAL: Cached ${type} texture '${texture.name}' (cache stats: ${cacheStats.hits} hits, ${cacheStats.misses} misses)`)
          }
        } catch (error) {
          console.error(`🎨 MATERIAL: Exception processing ${type} texture '${texture.name}':`, error)
        }
      } else {
        console.warn(`🎨 MATERIAL: ${type} texture '${texture.name}' has no data or hash`)
      }
    })
  } else {
    console.log(`🎨 MATERIAL: '${materialData.name}' has no textures`)
  }

  let material: THREE.Material

  switch (materialData.type) {
    case 'emission': {
      console.log(`🎨 MATERIAL: Creating emission material for '${materialData.name}'`)
      const [er, eg, eb] = materialData.emission
      const emissionColor = new THREE.Color(er, eg, eb)
      console.log(`🎨 MATERIAL: Emission color: [${er}, ${eg}, ${eb}], strength: ${materialData.emissionStrength}`)
      
      material = new THREE.MeshStandardMaterial({
        ...commonProps,
        emissive: emissionColor,
        emissiveIntensity: materialData.emissionStrength,
        side: THREE.DoubleSide,
      })
      break
    }
    
    case 'glass':
    case 'transparent': {
      console.log(`🎨 MATERIAL: Creating ${materialData.type} material for '${materialData.name}'`)
      console.log(`🎨 MATERIAL: Transparency: ${materialData.transparency}, IOR: ${materialData.ior}`)
      
      material = new THREE.MeshPhysicalMaterial({
        ...commonProps,
        transparent: true,
        opacity: 1 - materialData.transparency,
        ior: materialData.ior,
        side: THREE.DoubleSide,
      })
      break
    }
    
    default: { // 'standard'
      console.log(`🎨 MATERIAL: Creating standard material for '${materialData.name}'`)
      
      material = new THREE.MeshStandardMaterial({
        ...commonProps,
        side: THREE.DoubleSide,
      })

      // Add clearcoat if present
      if (materialData.clearcoat !== undefined) {
        console.log(`🎨 MATERIAL: Adding clearcoat: ${materialData.clearcoat}, roughness: ${materialData.clearcoatRoughness || 0}`)
        // @ts-expect-error - clearcoat is not in the official types but exists in Three.js
        material.clearcoat = materialData.clearcoat
        // @ts-expect-error - clearcoatRoughness is not in the official types but exists in Three.js  
        material.clearcoatRoughness = materialData.clearcoatRoughness || 0
      }
      break
    }
  }

  // Apply textures to the material after creation
  if (Object.keys(loadedTextures).length > 0) {
    console.log(`🎨 MATERIAL: Applying ${Object.keys(loadedTextures).length} textures to '${materialData.name}'`)
    
    if (loadedTextures.diffuse) {
      console.log(`🎨 MATERIAL: Applying diffuse texture to '${materialData.name}'`)
      ;(material as THREE.MeshStandardMaterial).map = loadedTextures.diffuse
    }
    
    if (loadedTextures.normal) {
      console.log(`🎨 MATERIAL: Applying normal texture to '${materialData.name}'`)
      ;(material as THREE.MeshStandardMaterial).normalMap = loadedTextures.normal
      ;(material as THREE.MeshStandardMaterial).normalScale = new THREE.Vector2(materialData.normalStrength, materialData.normalStrength)
    }
    
    if (loadedTextures.roughness) {
      console.log(`🎨 MATERIAL: Applying roughness texture to '${materialData.name}'`)
      ;(material as THREE.MeshStandardMaterial).roughnessMap = loadedTextures.roughness
    }
    
    if (loadedTextures.metalness) {
      console.log(`🎨 MATERIAL: Applying metalness texture to '${materialData.name}'`)
      ;(material as THREE.MeshStandardMaterial).metalnessMap = loadedTextures.metalness
    }
    
    if (loadedTextures.emission) {
      console.log(`🎨 MATERIAL: Applying emission texture to '${materialData.name}'`)
      ;(material as THREE.MeshStandardMaterial).emissiveMap = loadedTextures.emission
    }
    
    // Force material update
    material.needsUpdate = true
  }

  console.log(`🎨 MATERIAL: Successfully created ${material.type} for '${materialData.name}'`)
  return material
}

/**
 * Create Three.js light from Blender light data
 */
export function createLightFromBlenderData(lightData: BlenderLightData): THREE.Light {
  const [r, g, b] = lightData.color
  const color = new THREE.Color(r, g, b)
  const [x, y, z] = lightData.position
  
  // Convert position from Blender to Three.js coordinates
  const position = new THREE.Vector3(x, z, -y)
  
  let light: THREE.Light

  switch (lightData.type) {
    case 'sun': {
      light = new THREE.DirectionalLight(color, lightData.energy)
      light.position.copy(position)
      light.castShadow = true
      
      // Configure shadow camera for directional light
      const shadowCamera = (light as THREE.DirectionalLight).shadow.camera as THREE.OrthographicCamera
      shadowCamera.left = -50
      shadowCamera.right = 50
      shadowCamera.top = 50
      shadowCamera.bottom = -50
      shadowCamera.near = 0.1
      shadowCamera.far = 200
      break
    }
    
    case 'point': {
      light = new THREE.PointLight(color, lightData.energy, lightData.distance || 0)
      light.position.copy(position)
      light.castShadow = true
      break
    }
    
    case 'spot': {
      light = new THREE.SpotLight(
        color, 
        lightData.energy, 
        lightData.distance || 0,
        lightData.angle || Math.PI / 4,
        lightData.blend || 0.1
      )
      light.position.copy(position)
      light.castShadow = true
      
      // Apply rotation
      if (lightData.rotation) {
        const [rx, ry, rz] = lightData.rotation
        light.rotation.set(rz, ry, -rx) // Convert Blender rotation to Three.js
      }
      break
    }
    
    case 'area': {
      // Three.js doesn't have area lights, use rect area light if available
      // or fall back to point light
      if (THREE.RectAreaLight) {
        const size = lightData.size || 1
        light = new THREE.RectAreaLight(color, lightData.energy, size, size)
        light.position.copy(position)
        
        if (lightData.rotation) {
          const [rx, ry, rz] = lightData.rotation
          light.rotation.set(rz, ry, -rx)
        }
      } else {
        // Fallback to point light
        light = new THREE.PointLight(color, lightData.energy, lightData.distance || 0)
        light.position.copy(position)
        light.castShadow = true
      }
      break
    }
    
    default:
      light = new THREE.PointLight(color, lightData.energy)
      light.position.copy(position)
  }

  light.name = lightData.name
  return light
}

/**
 * Apply world settings to Three.js scene
 */
export function applyWorldSettings(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  worldData: BlenderWorldData
): void {
  // Set background color
  const [r, g, b] = worldData.backgroundColor
  const backgroundColor = new THREE.Color(r, g, b)
  scene.background = backgroundColor
  renderer.setClearColor(backgroundColor)

  // Update or create ambient light
  let ambientLight = scene.getObjectByName('ambient_light') as THREE.AmbientLight
  if (!ambientLight) {
    ambientLight = new THREE.AmbientLight()
    ambientLight.name = 'ambient_light'
    scene.add(ambientLight)
  }
  
  const [ar, ag, ab] = worldData.ambientColor
  ambientLight.color.setRGB(ar, ag, ab)
  ambientLight.intensity = worldData.ambientStrength

  // TODO: Add HDRI support if worldData.hdriTexture is provided
  // This would require loading the texture and setting it as scene.environment
}

/**
 * Create lighting setup matching legacy implementation
 */
export function createLightingSetup(): THREE.Light[] {
  const lights: THREE.Light[] = []
  
  // Match legacy implementation lighting
  const light1 = new THREE.DirectionalLight(0xffffff, 0.8)
  light1.position.set(1, 1, 1)
  lights.push(light1)
  
  const light2 = new THREE.DirectionalLight(0xffffff, 0.5)
  light2.position.set(-1, -1, -1)
  lights.push(light2)
  
  // Ambient light (matching legacy)
  const ambientLight = new THREE.AmbientLight(0x404040)
  lights.push(ambientLight)
  
  return lights
}

/**
 * Calculate optimal camera position based on bounding sphere
 */
export function calculateOptimalCameraPosition(
  boundingSphere: THREE.Sphere,
  camera: THREE.PerspectiveCamera,
  controls: { target: THREE.Vector3; update: () => void }
): void {
  const radius = boundingSphere.radius
  const center = boundingSphere.center
  const distance = radius * 3
  
  camera.position.set(distance, distance, distance)
  controls.target.copy(center)
  camera.near = radius * 0.1
  camera.far = radius * 20
  camera.updateProjectionMatrix()
  controls.update()
}

/**
 * Dispose of Three.js resources properly
 */
export function disposeObject3D(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      if (child.geometry) {
        child.geometry.dispose()
      }
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach(material => material.dispose())
        } else {
          child.material.dispose()
        }
      }
    }
  })
}

/**
 * Create performance-optimized renderer
 */
export function createOptimizedRenderer(container: HTMLElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ 
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance'
  })
  
  // Set size based on container dimensions
  const width = container.clientWidth || window.innerWidth
  const height = container.clientHeight || window.innerHeight
  
  renderer.setSize(width, height)
  renderer.setClearColor(0x1e1e1e)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)) // Limit pixel ratio for performance
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace
  
  // Performance optimizations
  renderer.info.autoReset = false
  
  return renderer
}

/**
 * Get texture cache statistics for performance monitoring
 */
export function getTextureCacheStats() {
  const hitRate = cacheStats.totalTextures > 0 ? (cacheStats.hits / cacheStats.totalTextures * 100) : 0
  return {
    cacheSize: textureCache.size,
    hits: cacheStats.hits,
    misses: cacheStats.misses,
    totalRequests: cacheStats.totalTextures,
    hitRate: `${hitRate.toFixed(1)}%`
  }
}

/**
 * Clear texture cache (useful for memory management)
 */
export function clearTextureCache() {
  textureCache.forEach(texture => texture.dispose())
  textureCache.clear()
  cacheStats = { hits: 0, misses: 0, totalTextures: 0 }
  console.log('🎨 MATERIAL: Texture cache cleared')
}

/**
 * Get basis transform matrix between coordinate systems
 * Based on: https://github.com/gkjohnson/threejs-sandbox/tree/master/basis-transform
 */
export function getBasisTransform(from: string, to: string, target: THREE.Matrix4): void {
  // Parse axis strings like '+X+Y+Z' into axis directions
  const parseAxes = (axes: string) => {
    const result = []
    for (let i = 0; i < axes.length; i += 2) {
      const sign = axes[i] === '+' ? 1 : -1
      const axis = axes[i + 1].toLowerCase()
      result.push({ axis, sign })
    }
    return result
  }

  const fromAxes = parseAxes(from)
  const toAxes = parseAxes(to)

  // Create basis vectors for source coordinate system
  const fromBasis = [
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3()
  ]

  fromAxes.forEach((axisInfo, i) => {
    const vec = fromBasis[i]
    vec.set(0, 0, 0)
    if (axisInfo.axis === 'x') vec.x = axisInfo.sign
    else if (axisInfo.axis === 'y') vec.y = axisInfo.sign
    else if (axisInfo.axis === 'z') vec.z = axisInfo.sign
  })

  // Create basis vectors for target coordinate system
  const toBasis = [
    new THREE.Vector3(),
    new THREE.Vector3(),
    new THREE.Vector3()
  ]

  toAxes.forEach((axisInfo, i) => {
    const vec = toBasis[i]
    vec.set(0, 0, 0)
    if (axisInfo.axis === 'x') vec.x = axisInfo.sign
    else if (axisInfo.axis === 'y') vec.y = axisInfo.sign
    else if (axisInfo.axis === 'z') vec.z = axisInfo.sign
  })

  // Create transformation matrix
  const fromMatrix = new THREE.Matrix4().makeBasis(fromBasis[0], fromBasis[1], fromBasis[2])
  const toMatrix = new THREE.Matrix4().makeBasis(toBasis[0], toBasis[1], toBasis[2])
  
  target.multiplyMatrices(toMatrix, fromMatrix.invert())
}

/**
 * Create enhanced axis helper with thicker lines and labeled arrows
 */
export function createEnhancedAxesHelper(size = 5): THREE.Group {
  const axesGroup = new THREE.Group()
  
  // Create thicker axis lines with arrows
  const createAxisLine = (direction: THREE.Vector3, color: number, label: string) => {
    const group = new THREE.Group()
    
    // Main line (thicker)
    const lineGeometry = new THREE.CylinderGeometry(0.02, 0.02, size, 8)
    const lineMaterial = new THREE.MeshBasicMaterial({ color })
    const line = new THREE.Mesh(lineGeometry, lineMaterial)
    
    // Position and orient the cylinder
    line.position.copy(direction.clone().multiplyScalar(size / 2))
    line.lookAt(direction.clone().multiplyScalar(size))
    line.rotateX(Math.PI / 2)
    
    // Arrow head (cone)
    const arrowGeometry = new THREE.ConeGeometry(0.1, 0.3, 8)
    const arrowMaterial = new THREE.MeshBasicMaterial({ color })
    const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial)
    arrow.position.copy(direction.clone().multiplyScalar(size))
    arrow.lookAt(direction.clone().multiplyScalar(size * 1.5))
    arrow.rotateX(Math.PI / 2)
    
    group.add(line)
    group.add(arrow)
    
    // Add text label
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')!
    canvas.width = 64
    canvas.height = 64
    
    context.fillStyle = `#${color.toString(16).padStart(6, '0')}`
    context.font = 'bold 32px Arial'
    context.textAlign = 'center'
    context.fillText(label, 32, 40)
    
    const texture = new THREE.CanvasTexture(canvas)
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture })
    const sprite = new THREE.Sprite(spriteMaterial)
    sprite.position.copy(direction.clone().multiplyScalar(size * 1.2))
    sprite.scale.setScalar(0.5)
    
    group.add(sprite)
    return group
  }
  
  // Create X, Y, Z axes
  axesGroup.add(createAxisLine(new THREE.Vector3(1, 0, 0), 0xff0000, 'X+'))  // Red X
  axesGroup.add(createAxisLine(new THREE.Vector3(0, 1, 0), 0x00ff00, 'Y+'))  // Green Y  
  axesGroup.add(createAxisLine(new THREE.Vector3(0, 0, 1), 0x0000ff, 'Z+'))  // Blue Z
  
  return axesGroup
}