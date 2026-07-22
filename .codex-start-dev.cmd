@echo off
setlocal
set "PROJECT_DIR=%~dp0"
start "urban-fantasy-api" /min cmd /d /k "cd /d ""%PROJECT_DIR%"" && npm.cmd --workspace apps/api run dev"
start "urban-fantasy-admin" /min cmd /d /k "cd /d ""%PROJECT_DIR%"" && npm.cmd --workspace apps/admin run dev"
