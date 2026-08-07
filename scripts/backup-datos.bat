@echo off
title Backup de datos - Casa de Cambio
color 0f

REM ============================================================
REM  Backup de los DATOS de la base, SIN instalar PostgreSQL
REM  ni Docker. Usa Node y la libreria que el proyecto ya trae.
REM
REM  Uso: doble clic. Deja la carpeta "backups" junto al proyecto.
REM
REM  El ESQUEMA no va en este backup: vive en schema.sql y
REM  migrations/ del repositorio. Los dos juntos reconstruyen
REM  la base completa.
REM ============================================================

cd /d "%~dp0.."

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [ERROR] No se encontro "node".
  echo Instala Node.js desde https://nodejs.org  ^(version LTS^)
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\@supabase\supabase-js" (
  echo.
  echo Faltan las dependencias del proyecto. Instalando...
  call npm install
  if errorlevel 1 (
    echo [ERROR] Fallo "npm install".
    pause
    exit /b 1
  )
)

echo.
node scripts/backup-datos.mjs
set CODIGO=%errorlevel%

echo.
if "%CODIGO%"=="0" (
  echo Backup terminado correctamente.
) else (
  echo [ATENCION] El backup termino con problemas. Revisa el detalle de arriba.
)
echo.
pause
exit /b %CODIGO%
