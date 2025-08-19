export interface BlenderMaterialData {
  name: string
  type: 'standard' | 'emission' | 'glass' | 'transparent'
  color: [number, number, number] // RGB values 0-1
  roughness: number // 0-1
  metalness: number // 0-1
  emission: [number, number, number] // RGB emission color
  emissionStrength: number // Emission intensity
  transparency: number // 0-1, 0=opaque, 1=fully transparent
  ior: number // Index of refraction
  normalStrength: number // Normal map strength
  clearcoat?: number // Clearcoat factor
  clearcoatRoughness?: number // Clearcoat roughness
  textures?: {
    diffuse?: {
      name: string
      data?: string // base64 data URL
      size?: number
      format?: string
      hash?: string // MD5 hash for caching
      filepath?: string // fallback for debugging
      error?: string // if loading failed
    }
    normal?: {
      name: string
      data?: string
      size?: number
      format?: string
      hash?: string
      filepath?: string
      error?: string
    }
    roughness?: {
      name: string
      data?: string
      size?: number
      format?: string
      hash?: string
      filepath?: string
      error?: string
    }
    metalness?: {
      name: string
      data?: string
      size?: number
      format?: string
      hash?: string
      filepath?: string
      error?: string
    }
    emission?: {
      name: string
      data?: string
      size?: number
      format?: string
      hash?: string
      filepath?: string
      error?: string
    }
  }
}

export interface BlenderLightData {
  name: string
  type: 'sun' | 'point' | 'spot' | 'area'
  position: [number, number, number]
  rotation: [number, number, number] // Euler angles
  color: [number, number, number] // RGB 0-1
  energy: number // Light intensity
  size?: number // For area lights
  angle?: number // For spot lights (in radians)
  blend?: number // For spot lights, blend factor
  distance?: number // For point/spot lights, falloff distance
}

export interface BlenderWorldData {
  backgroundColor: [number, number, number]
  ambientColor: [number, number, number]
  ambientStrength: number
  hdriTexture?: string // Base64 encoded HDRI
}

export interface BlenderObjectData {
  name: string
  vertices: number[][]
  faces: number[][]
  uvs?: number[][] // UV coordinates for each vertex [u, v]
  transform?: number[][]
  materials?: BlenderMaterialData[]
  materialIndices?: number[] // Per-face material indices
}

export interface BlenderSceneData {
  objects: BlenderObjectData[]
  lights?: BlenderLightData[]
  world?: BlenderWorldData
}

// Legacy single object support
export interface BlenderMeshData {
  vertices: number[][]
  faces: number[][]
  uvs?: number[][]
  transform?: number[][]
  name?: string
  materials?: BlenderMaterialData[]
  materialIndices?: number[]
}

export interface ConnectionStatus {
  status: 'disconnected' | 'connecting' | 'connected'
  port: number
}

export interface MeshInfo {
  vertexCount: number
  faceCount: number
}

export interface DebugInfo extends MeshInfo {
  fps: number
}