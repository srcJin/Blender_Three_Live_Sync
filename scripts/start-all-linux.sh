#!/bin/bash

# Blender Three Live Sync - Complete Setup Script (Linux)
# This script starts both the WebSocket server and React Three Fiber client

echo "🚀 Starting Complete Blender Three Live Sync Setup (Linux)..."
echo "📍 Location: $(pwd)"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed"
    echo "   On Ubuntu/Debian: sudo apt update && sudo apt install nodejs npm"
    echo "   On CentOS/RHEL: sudo yum install nodejs npm"
    echo "   On Arch: sudo pacman -S nodejs npm"
    echo "   Or install from: https://nodejs.org/"
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ Error: npm is not installed"
    echo "   On Ubuntu/Debian: sudo apt install npm"
    echo "   On CentOS/RHEL: sudo yum install npm"
    echo "   On Arch: sudo pacman -S npm"
    exit 1
fi

echo "✅ Node.js found: $(node --version)"
echo "✅ npm found: $(npm --version)"
echo ""

# Function to start WebSocket server in background
start_server() {
    echo "🌐 Starting WebSocket server..."
    cd websocket_server
    
    if [ ! -d "node_modules" ]; then
        echo "⬇️  Installing server dependencies..."
        npm install
        if [ $? -ne 0 ]; then
            echo "❌ Failed to install server dependencies"
            exit 1
        fi
    fi
    
    # Start server in background
    npm start &
    SERVER_PID=$!
    echo "✅ WebSocket server started (PID: $SERVER_PID)"
    cd ..
}

# Function to start React Three Fiber client
start_client() {
    echo "🎨 Starting React Three Fiber client..."
    cd web_ui_fiber
    
    if [ ! -d "node_modules" ]; then
        echo "⬇️  Installing client dependencies..."
        npm install
        if [ $? -ne 0 ]; then
            echo "❌ Failed to install client dependencies"
            exit 1
        fi
    fi
    
    echo "✅ React Three Fiber client starting..."
    npm run dev
}

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Shutting down services..."
    if [ ! -z "$SERVER_PID" ]; then
        kill $SERVER_PID 2>/dev/null
        echo "✅ WebSocket server stopped"
    fi
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

echo "🚀 Starting services..."
echo "   1. WebSocket Server (background)"
echo "   2. React Three Fiber Client (foreground)"
echo ""

# Start server in background
start_server

# Wait a moment for server to start
sleep 3

# Check if server is running
if ! kill -0 $SERVER_PID 2>/dev/null; then
    echo "❌ WebSocket server failed to start"
    exit 1
fi

echo ""
echo "🌐 Services starting:"
echo "   - WebSocket Server: ws://127.0.0.1:8080"
echo "   - Web Client: http://localhost:9876"
echo ""
echo "📝 Next steps:"
echo "   1. Wait for the web client to start"
echo "   2. Open http://localhost:9876 in your browser"
echo "   3. Click 'Connect' in the web interface"
echo "   4. Start Blender with the Web Sync addon"
echo ""
echo "⏹️  Press Ctrl+C to stop all services"
echo ""

# Start client (this will run in foreground)
start_client