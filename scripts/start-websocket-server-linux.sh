#!/bin/bash

# Blender Three Live Sync - WebSocket Server Startup Script (Linux)
# This script starts the WebSocket server for communication between Blender and web clients

echo "🚀 Starting Blender Three Live Sync WebSocket Server (Linux)..."
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

# Check if the websocket_server directory exists
if [ ! -d "websocket_server" ]; then
    echo "❌ Error: websocket_server directory not found"
    echo "   Make sure you're running this script from the Blender_Three_Live_Sync directory"
    exit 1
fi

# Navigate to server directory
cd websocket_server

# Check if package.json exists and install dependencies if needed
if [ -f "package.json" ]; then
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
fi

# Check if server.js exists
if [ ! -f "server.js" ]; then
    echo "❌ Error: server.js not found in websocket_server directory"
    exit 1
fi

echo "🌐 Starting WebSocket server..."
echo "   - WebSocket server: ws://127.0.0.1:8080 (for web clients)"
echo ""
echo "📝 To connect:"
echo "   1. Start Blender with the Web Sync addon"
echo "   2. Open your web client and connect"
echo ""
echo "⏹️  Press Ctrl+C to stop the server"
echo ""

# Start the server
npm start