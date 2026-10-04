@echo off
title PIXEL PAIR agent
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is required. Install the LTS version from https://nodejs.org then run this again. & pause & exit /b)
echo Starting PIXEL PAIR... keep this window open. If Windows Firewall asks, allow PRIVATE networks.
node agent.js
pause
