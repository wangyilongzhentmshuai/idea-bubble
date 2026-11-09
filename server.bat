@echo off
chcp 65001 >nul
title 灵感泡泡罐 Server
cd /d "%~dp0server"

where node >nul 2>nul
if errorlevel 1 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 18 或更高版本：https://nodejs.org
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo 首次运行，正在安装依赖，请稍候...
    call npm install
    if errorlevel 1 (
        echo [错误] 依赖安装失败，请检查网络后重新运行本文件。
        pause
        exit /b 1
    )
)

echo 正在启动服务，3 秒后自动打开浏览器...
echo 关闭本窗口即可停止服务。
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 3; Start-Process 'http://localhost:8787'"

node src/app.js

echo.
echo 服务已停止。
pause
