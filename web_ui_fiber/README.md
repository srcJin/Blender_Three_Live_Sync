# Blender Web Sync Client

A modern Next.js 15 web client for real-time Blender 3D model synchronization using the latest Three.js r178.

## Features

- **Next.js 15** with Turbopack for fast development and builds
- **Three.js r178** with modern ES modules and TypeScript support
- **Real-time WebSocket** connection to Blender
- **Modern React Hooks** for state management
- **TypeScript** for type safety
- **Responsive Design** with Material Icons
- **Real-time 3D Preview** with coordinate system conversion

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
npm start
```

### Usage

1. Start the development server: `npm run dev`
2. Open [http://localhost:3000](http://localhost:3000)
3. Make sure your Blender WebSocket server is running
4. Enter the WebSocket port and click "Connect"
5. Your 3D model will sync in real-time!

## Project Structure

```
next-web-client/
├── app/                    # Next.js App Router
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Main page
├── components/            # React components
│   ├── ThreeScene.tsx     # Three.js scene wrapper
│   ├── ConnectionPanel.tsx # WebSocket connection UI
│   ├── ControlsPanel.tsx  # 3D controls
│   ├── DebugInfo.tsx      # Debug information
│   └── LoadingOverlay.tsx # Loading screen
├── hooks/                 # Custom React hooks
│   ├── useWebSocket.ts    # WebSocket management
│   └── useThreeScene.ts   # Three.js scene logic
├── types/                 # TypeScript type definitions
│   └── index.ts
└── lib/                   # Utility functions
```

## Key Improvements

### Modern Architecture
- **Component-based**: Modular React components for better maintainability
- **Custom Hooks**: Separated business logic from UI components
- **TypeScript**: Full type safety throughout the application
- **ES Modules**: Modern JavaScript modules with tree-shaking

### Performance Optimizations
- **Next.js 15**: Latest React 19 features and Turbopack bundler
- **Three.js r178**: Latest 3D library with performance improvements
- **Efficient Rendering**: Optimized animation loop and memory management
- **Dynamic Imports**: Lazy loading of Three.js controls

### Enhanced Features
- **Better Error Handling**: Comprehensive error states and recovery
- **Responsive Design**: Mobile-friendly interface
- **Shadow Mapping**: Enhanced 3D rendering with shadows
- **Memory Management**: Proper cleanup of Three.js resources

## Configuration

### WebSocket Connection
The default WebSocket port is `10005`. You can change this in the connection panel.

### 3D Scene Settings
- **Camera**: Positioned at (7, 5, 7) for optimal Blender-like view
- **Lighting**: Directional and ambient lighting setup
- **Coordinate System**: Automatic conversion from Blender (Z-up) to Three.js (Y-up)

## Commands

```bash
npm run dev        # Start development server
npm run build      # Build for production
npm run start      # Start production server
npm run lint       # Run ESLint
npm run type-check # Run TypeScript checks
```

## Tech Stack

- **Framework**: Next.js 15.3.5
- **Runtime**: React 19.0.0
- **3D Library**: Three.js 0.178.0
- **Language**: TypeScript 5.6.0
- **Styling**: CSS with CSS Variables
- **Icons**: Material Icons
- **Build Tool**: Turbopack (via Next.js)