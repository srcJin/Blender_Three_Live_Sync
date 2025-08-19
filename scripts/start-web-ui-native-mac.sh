#!/bin/bash

# Blender Three Live Sync - Native Three.js Client Startup Script
# This script starts the native Three.js web client (lightweight version)

echo "🎨 Starting Blender Three Live Sync Native Three.js Client..."
echo "📍 Location: $(pwd)"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed"
    echo "   Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ Error: npm is not installed"
    echo "   Please install npm (usually comes with Node.js)"
    exit 1
fi

# Check if the web_ui_native directory exists
if [ ! -d "web_ui_native" ]; then
    echo "❌ Error: web_ui_native directory not found"
    echo "   Make sure you're running this script from the Blender_Three_Live_Sync directory"
    exit 1
fi

# Navigate to frontend directory
cd web_ui_native

# Check if package.json exists
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found in web_ui_native directory"
    exit 1
fi

# Install dependencies if node_modules doesn't exist
echo "📦 Checking dependencies..."
if [ ! -d "node_modules" ]; then
    echo "⬇️  Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install dependencies"
        exit 1
    fi
else
    echo "✅ Dependencies already installed"
fi

# Check if the WebSocket server is running
echo "🔍 Checking for WebSocket server..."
if ! nc -z 127.0.0.1 8080 2>/dev/null; then
    echo "⚠️  Warning: WebSocket server (port 8080) is not running"
    echo "   To start the server, run: ./start-websocket-server.sh"
    echo ""
fi

echo "🌐 Starting Native Three.js development server..."
echo "   - Frontend URL: http://localhost:9876"
echo "   - WebSocket connection: ws://127.0.0.1:8080"
echo "   - Features: Basic synchronization (no selection/modification)"
echo ""
echo "📝 To use:"
echo "   1. Make sure the WebSocket server is running (./start-websocket-server.sh)"
echo "   2. Open http://localhost:9876 in your browser"
echo "   3. Click 'Connect' to connect to WebSocket server"
echo "   4. Start Blender with the Web Sync addon"
echo ""
echo "⏹️  Press Ctrl+C to stop the frontend"
echo ""

# Start the Next.js development server
npm run dev