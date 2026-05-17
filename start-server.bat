@echo off
cd /d "%~dp0"
title Ali's WerAR Studio
echo.
python server.py
if errorlevel 1 (
  echo.
  echo Python not found. Install Python from https://python.org
  echo Or run: py server.py
  pause
)
