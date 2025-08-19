# Blender Three Live Sync

**Real-time bidirectional synchronization between Blender and Three.js web applications**

Blender Three Live Sync is an open-source library that enables real-time, bidirectional synchronization between Blender 3D scenes and web applications using Three.js. Edit in Blender and see changes instantly in your web browser, or manipulate objects in the web interface and watch them update in Blender immediately.

## ✨ Features

- **🔄 Bidirectional Sync**: Changes in Blender reflect instantly in the web browser and vice versa
- **⚡ Real-time Updates**: Sub-60ms latency for smooth real-time collaboration
- **🎯 Two Integration Options**: 
  - **React Three Fiber**: Full-featured integration with selection and modification tools
  - **Native Three.js**: Lightweight integration for basic synchronization
- **🔧 Object Manipulation**: Transform, rotate, and scale objects from either environment
- **🖱️ Interactive Selection**: Click and select objects in the web interface (React Three Fiber only)
- **📦 Easy Setup**: Simple installation with automated setup scripts
- **🔒 Local Network**: Secure WebSocket communication over your local network

## 🚀 Quick Start

### Prerequisites

- **Blender** 2.80 or later
- **Node.js** 16 or later
- Modern web browser with WebGL support

### 1. Install Blender Plugin

1. Download or clone this repository
2. In Blender: Edit → Preferences → Add-ons → Install...
3. Select `blender_plugin/blender_web_sync_plugin.py`
4. Enable the "Web Sync" add-on
5. Find the Web Sync panel in the 3D Viewport sidebar (N key)

### 2. Choose Your Integration

#### Option A: React Three Fiber (Recommended)
Full-featured integration with interactive selection and modification:

**macOS:**
```bash
# All-in-one setup (recommended)
./scripts/start-all-mac.sh

# Or start services separately:
./scripts/start-websocket-server-mac.sh
./scripts/start-web-ui-fiber-mac.sh
```

**Linux:**
```bash
# All-in-one setup (recommended)
./scripts/start-all-linux.sh

# Or start services separately:
./scripts/start-websocket-server-linux.sh
./scripts/start-web-ui-fiber-linux.sh
```

**Windows:**
```cmd
# All-in-one setup (recommended)
scripts\start-all.bat

# Or start services separately:
scripts\start-websocket-server.bat
scripts\start-web-ui-fiber.bat
```

#### Option B: Native Three.js
Lightweight integration for basic synchronization:

**macOS:**
```bash
./scripts/start-websocket-server-mac.sh
./scripts/start-web-ui-native-mac.sh
```

**Linux:**
```bash
./scripts/start-websocket-server-linux.sh
./scripts/start-web-ui-native-linux.sh
```

**Windows:**
```cmd
scripts\start-websocket-server.bat
scripts\start-web-ui-native.bat
```

### 3. Connect and Sync

1. In Blender's Web Sync panel, click **"Start Server"**
2. Open your browser to `http://localhost:9876`
3. Click **"Connect"** in the web interface
4. Start creating! Changes in either environment sync instantly

## 🛠️ Manual Setup

If you prefer manual setup or need to customize the configuration:

### WebSocket Server
```bash
cd websocket_server
npm install
npm start
```

### React Three Fiber Client
```bash
cd web_ui_fiber
npm install
npm run dev
```

### Native Three.js Client
```bash
cd web_ui_native
npm install
npm run dev
```

## 📖 Usage Examples

### Basic Synchronization
1. Create objects in Blender (cubes, spheres, etc.)
2. Move, rotate, or scale them in Blender
3. Watch them update instantly in your web browser

### Interactive Web Control (React Three Fiber)
1. Click on objects in the web interface to select them
2. Use the transformation tools to modify position, rotation, and scale
3. See changes reflected immediately in Blender

### Development Workflow
Perfect for:
- **Game Development**: Preview game assets in real-time
- **Architectural Visualization**: Interactive client presentations  
- **WebXR Development**: Test VR/AR scenes instantly
- **Educational Content**: Interactive 3D learning experiences

## 🏗️ Architecture

```
┌─────────────┐    WebSocket     ┌──────────────────┐    HTTP    ┌─────────────────┐
│   Blender   │ ←────────────── │ WebSocket Server │ ────────→ │   Web Client    │
│   Plugin    │      TCP/IP      │   (Node.js)      │   9876     │ (React/Three.js)│
└─────────────┘                  └──────────────────┘            └─────────────────┘
```

- **Blender Plugin**: Monitors scene changes and sends updates via WebSocket
- **WebSocket Server**: Routes messages between Blender and web clients  
- **Web Client**: Renders 3D scene and sends user interactions back to Blender

## 🔧 Configuration

### Network Settings
- **WebSocket Server**: Default port 8080
- **Web Client**: Default port 9876
- **Local Network**: All services run on localhost by default

### Performance Tuning
- **Frame Rate**: Configurable sync rate (default: 60 FPS)
- **Throttling**: Built-in throttling prevents excessive updates
- **Compression**: Automatic data compression for large scenes

## 🤝 Contributing

We welcome contributions! Please see our contributing guidelines and feel free to:

- Report bugs and request features via GitHub Issues
- Submit pull requests for improvements
- Share your use cases and examples
- Help improve documentation

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

This project builds upon the foundational work of [BlenderWebSync](https://github.com/Ma3h1r0/BlenderWebSync) by Ma3h1r0. We've modernized the codebase with the latest technologies, added bidirectional synchronization, and enhanced the user experience with better tooling and documentation.
