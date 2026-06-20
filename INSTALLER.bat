@echo off
title Norys Reels — Installation
color 0A
echo.
echo  ╔═══════════════════════════════════════╗
echo  ║     Norys Reels — Installation        ║
echo  ╚═══════════════════════════════════════╝
echo.

:: ── VÉRIFIER NODE.JS ─────────────────────────────────────────
echo  [1/3] Vérification de Node.js...
node --version >nul 2>&1
if %errorlevel% == 0 (
    for /f "tokens=*" %%i in ('node --version') do echo  ✓ Node.js déjà installé : %%i
) else (
    echo  → Node.js non trouvé. Téléchargement en cours...
    powershell -Command "& {Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi' -OutFile '%TEMP%\nodejs.msi'}"
    echo  → Installation de Node.js...
    msiexec /i "%TEMP%\nodejs.msi" /quiet /norestart
    del "%TEMP%\nodejs.msi"
    echo  ✓ Node.js installé
)

:: ── VÉRIFIER FFMPEG ───────────────────────────────────────────
echo.
echo  [2/3] Vérification de FFmpeg...
ffmpeg -version >nul 2>&1
if %errorlevel% == 0 (
    echo  ✓ FFmpeg déjà installé
) else (
    echo  → FFmpeg non trouvé. Téléchargement en cours (peut prendre 1-2 min)...
    
    :: Créer le dossier C:\ffmpeg
    if not exist "C:\ffmpeg" mkdir "C:\ffmpeg"
    
    :: Télécharger FFmpeg
    powershell -Command "& {[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip' -OutFile '%TEMP%\ffmpeg.zip'}"
    
    echo  → Extraction...
    powershell -Command "& {Expand-Archive -Path '%TEMP%\ffmpeg.zip' -DestinationPath '%TEMP%\ffmpeg_extract' -Force}"
    
    :: Copier les binaires
    powershell -Command "& {$src = (Get-ChildItem '%TEMP%\ffmpeg_extract' -Directory | Select-Object -First 1).FullName; Copy-Item '$src\bin\*' 'C:\ffmpeg' -Force}"
    
    del "%TEMP%\ffmpeg.zip"
    
    :: Ajouter au PATH
    powershell -Command "& {$path = [Environment]::GetEnvironmentVariable('PATH','Machine'); if ($path -notlike '*C:\ffmpeg*') { [Environment]::SetEnvironmentVariable('PATH', $path + ';C:\ffmpeg', 'Machine') }}"
    
    echo  ✓ FFmpeg installé dans C:\ffmpeg
)

:: ── VÉRIFIER EXIFTOOL ─────────────────────────────────────────
echo.
echo  [3/3] Vérification de ExifTool...
exiftool -ver >nul 2>&1
if %errorlevel% == 0 (
    echo  ✓ ExifTool déjà installé
) else (
    echo  → ExifTool non trouvé. Téléchargement...
    powershell -Command "& {[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://exiftool.org/exiftool-13.00_64.zip' -OutFile '%TEMP%\exiftool.zip'}"
    powershell -Command "& {Expand-Archive -Path '%TEMP%\exiftool.zip' -DestinationPath '%TEMP%\exiftool_extract' -Force}"
    powershell -Command "& {Copy-Item '%TEMP%\exiftool_extract\exiftool(-k).exe' 'C:\ffmpeg\exiftool.exe' -Force}"
    del "%TEMP%\exiftool.zip"
    echo  ✓ ExifTool installé
)

:: ── LANCER L'APP ──────────────────────────────────────────────
echo.
echo  ════════════════════════════════════════
echo  ✓ Tout est prêt — Lancement de l'app...
echo  ════════════════════════════════════════
echo.

:: Rafraîchir le PATH pour cette session
set "PATH=%PATH%;C:\ffmpeg"

:: Lancer le serveur
node "%~dp0server.js"
pause
