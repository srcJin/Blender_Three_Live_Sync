@echo off

REM Blender Three Live Sync - React Three Fiber Client Startup Script (Windows)
REM This script starts the React Three Fiber web client with full interaction features

echo 🎨 Starting Blender Three Live Sync React Three Fiber Client (Windows)...
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

REM Check if the web_ui_fiber directory exists
if not exist "web_ui_fiber" (
    echo ❌ Error: web_ui_fiber directory not found
    echo    Make sure you're running this script from the Blender_Three_Live_Sync directory
    pause
    exit /b 1
)

REM Navigate to frontend directory
cd web_ui_fiber

REM Check if package.json exists
if not exist "package.json" (
    echo ❌ Error: package.json not found in web_ui_fiber directory
    pause
    exit /b 1
)

REM Install dependencies if node_modules doesn't exist
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

REM Check if the WebSocket server is running
echo 🔍 Checking for WebSocket server...
netstat -an | findstr "127.0.0.1:8080" >nul 2>&1
if %errorlevel% neq 0 (
    echo ⚠️  Warning: WebSocket server (port 8080) may not be running
    echo    To start the server, run: start-websocket-server.bat
    echo.
)

echo 🌐 Starting React Three Fiber development server...
echo    - Frontend URL: http://localhost:9876
echo    - WebSocket connection: ws://127.0.0.1:8080
echo    - Features: Full interaction, selection, and modification tools
echo.
echo 📝 To use:
echo    1. Make sure the WebSocket server is running (start-websocket-server.bat)
echo    2. Open http://localhost:9876 in your browser
echo    3. Click 'Connect' to connect to WebSocket server
echo    4. Start Blender with the Web Sync addon
echo.
echo ⏹️  Press Ctrl+C to stop the frontend
echo.

REM Start the Next.js development server
npm run dev

pause