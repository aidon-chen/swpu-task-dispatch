@echo off
chcp 65001 >nul
set "NODE_OPTIONS="
title 微信开发者工具 MCP 桥接服务

:: ===== 配置区 =====
set PROJECT_PATH=G:\project\workbuddy\任务派发软件\miniprogram
set CLI_PATH=F:\toolapp2\微信web开发者工具\cli.bat
set BRIDGE_PORT=3728
set AUTO_PORT=9420

echo ============================================
echo   微信开发者工具 MCP 桥接服务
echo   项目: %PROJECT_PATH%
echo   监听: http://127.0.0.1:%BRIDGE_PORT%/mcp
echo   自动化端口: %AUTO_PORT%
echo.
echo   步骤1: 启动自动化模式...
echo ============================================
echo.

:: Step 1: Start automation
"%CLI_PATH%" auto --project "%PROJECT_PATH%" --auto-port %AUTO_PORT%

echo.
echo ============================================
echo   步骤2: 启动 MCP 桥接服务...
echo   按 Ctrl+C 停止服务
echo ============================================
echo.

:: Step 2: Start the custom MCP bridge
set NODE_PATH=C:\Users\22276\.workbuddy\binaries\node\versions\22.22.2\node.exe
"%NODE_PATH%" "C:\Users\22276\.workbuddy\temp\mcp-bridge-server.js"

pause
