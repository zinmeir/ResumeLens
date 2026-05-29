@echo off
title ResumeLens Server
cd /d "C:\Users\Shaheer Akhtar\Desktop\AI Project 2"
call venv\Scripts\activate
cd backend
echo.
echo ============================================
echo   ResumeLens is starting...
echo   URL: http://localhost:8000
echo   Press Ctrl+C to stop the server
echo ============================================
echo.
timeout /t 8 /nobreak >nul
start "" http://localhost:8000
uvicorn main:app --host 0.0.0.0 --port 8000