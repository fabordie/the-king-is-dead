@echo off
title The King is Dead
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js est requis. Telechargez-le sur https://nodejs.org puis relancez.
  pause
  exit /b 1
)
node lancer.js
pause
