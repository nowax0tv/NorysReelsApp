@echo off
title Norys Reels
echo.
echo  Norys Reels - Lancement...
echo.

:: Tuer toute instance Node.js qui utilise le port 3333
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3333 "') do (
    taskkill /PID %%a /F >nul 2>&1
)

:: Petit délai pour laisser le port se libérer
timeout /t 1 /nobreak >nul

node server.js
pause
