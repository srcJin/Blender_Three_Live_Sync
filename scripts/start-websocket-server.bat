@echo off

REM Blender Three Live Sync - WebSocket Server Startup Script (Windows)
REM This script starts the WebSocket server for communication between Blender and web clients

echo 🚀 Starting Blender Three Live Sync WebSocket Server (Windows)...
echo 📍 Location: %cd%
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Error: Node.js is not installed
    echo    Please install Node.js from https://nodejs.org/
    echo    Make sure to add Node.js to your PATH during installation
    pause
    exit /b 1
)

REM Check if npm is installed
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Error: npm is not installed
    echo    npm usually comes with Node.js installation
    echo    Please reinstall Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if the websocket_server directory exists
if not exist "websocket_server" (
    echo ❌ Error: websocket_server directory not found
    echo    Make sure you're running this script from the Blender_Three_Live_Sync directory
    pause
    exit /b 1
)

REM Navigate to server directory
cd websocket_server

REM Check if package.json exists and install dependencies if needed
if exist "package.json" (
    echo 📦 Checking dependencies...
    if not exist "node_modules" (
        echo ⬇️  Installing dependencies...
        npm install
        if %errorlevel% neq 0 (
            echo ❌ Failed to install dependencies
            pause
            exit /b 1
        )
    ) else (
        echo ✅ Dependencies already installed
    )
)

REM Check if server.js exists
if not exist "server.js" (
    echo ❌ Error: server.js not found in websocket_server directory
    pause
    exit /b 1
)

echo 🌐 Starting WebSocket server...
echo    - WebSocket server: ws://127.0.0.1:8080 (for web clients)
echo.
echo 📝 To connect:
echo    1. Start Blender with the Web Sync addon
echo    2. Open your web client and connect
echo.
echo ⏹️  Press Ctrl+C to stop the server
echo.

REM Start the server
npm start

pause