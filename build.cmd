@echo off
REM ============================================================
REM  Project Monitor - one-click build & install script.
REM  Double-click this file. It will:
REM    1) install dependencies (only the first time)
REM    2) build and pack the extension into a .vsix file
REM    3) install that .vsix into your VS Code (--force)
REM  After it finishes, run "Reload Window" in open VS Code windows.
REM ============================================================

setlocal enabledelayedexpansion
REM Go to the folder where this script lives (so paths are correct).
cd /d "%~dp0"

echo ============================================
echo   Project Monitor - build ^& install
echo ============================================
echo.

REM --- Step 1: install dependencies if node_modules is missing ---
if not exist "node_modules\" (
  echo [1/3] Installing dependencies ^(npm install^)...
  call npm install
  if errorlevel 1 goto :error
) else (
  echo [1/3] Dependencies already installed - skipping.
)

echo.
REM --- Step 2: build + pack into .vsix (runs esbuild via vscode:prepublish) ---
echo [2/3] Building and packing the .vsix file...
call npm run package
if errorlevel 1 goto :error

echo.
REM --- Step 3: find the newest .vsix and install it into VS Code ---
set "VSIX="
for /f "delims=" %%f in ('dir /b /a-d /o-d *.vsix 2^>nul') do (
  if not defined VSIX set "VSIX=%%f"
)
if not defined VSIX (
  echo ERROR: no .vsix file found after packing.
  goto :error
)

echo [3/3] Installing "!VSIX!" into VS Code...
call code --install-extension "!VSIX!" --force
if errorlevel 1 (
  echo.
  echo WARNING: could not run the "code" command.
  echo Install the file manually: Extensions panel -^> "..." -^> Install from VSIX...
  echo File: !VSIX!
)

echo.
echo ============================================
echo   DONE: !VSIX!
echo   Now press Ctrl+Shift+P -^> "Reload Window"
echo   in any open VS Code window to apply it.
echo ============================================
echo.
pause
exit /b 0

:error
echo.
echo ERROR: build failed. Read the messages above.
echo.
pause
exit /b 1
