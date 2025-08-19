@echo off

REM Blender Three Live Sync - Complete Setup Script (Windows)
REM This script starts both the WebSocket server and React Three Fiber client

echo 🚀 Starting Complete Blender Three Live Sync Setup (Windows)...
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

echo ✅ Node.js found: 
node --version
echo ✅ npm found: 
npm --version
echo.

echo 🚀 Starting services...
echo    1. WebSocket Server (new window)
echo    2. React Three Fiber Client (current window)
echo.

REM Start WebSocket server in new command window
echo 🌐 Starting WebSocket server in new window...
start "Blender Live Sync - WebSocket Server" cmd /k "start-websocket-server.bat"

REM Wait a moment for server to start
timeout /t 5 >nul

echo.
echo 🌐 Services starting:
echo    - WebSocket Server: ws://127.0.0.1:8080 (separate window)
echo    - Web Client: http://localhost:9876 (this window)
echo.
echo 📝 Next steps:
echo    1. Wait for the web client to start
echo    2. Open http://localhost:9876 in your browser
echo    3. Click 'Connect' in the web interface
echo    4. Start Blender with the Web Sync addon
echo.
echo ⏹️  Close both windows to stop all services
echo.

REM Start React Three Fiber client in current window
echo 🎨 Starting React Three Fiber client...
cd web_ui_fiber

if not exist "node_modules" (
    echo ⬇️  Installing client dependencies...
    npm install
    if %errorlevel% neq 0 (
        echo ❌ Failed to install client dependencies
        pause
        exit /b 1
    )
)

echo ✅ React Three Fiber client starting...
npm run dev

pause