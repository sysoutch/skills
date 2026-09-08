@echo off
rem Taskitty CLI for Windows - runs the PowerShell client next to this file.
rem No Node.js or npm required; PowerShell ships with Windows.
rem Usage: taskitty <command> [args]  - lifecycle: start-api|stop-api|status|health|token,
rem tasks: boards, board, add, done, ... (run `taskitty help` for the full list).
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0taskitty.ps1" %*
exit /b %ERRORLEVEL%
