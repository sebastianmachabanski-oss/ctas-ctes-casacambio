@echo off
title Backup base de datos - Casa de Cambio
color 0f

REM ============================================================
REM  Backup de la base de datos (Supabase / PostgreSQL)
REM  Genera un .dump con ESQUEMA + DATOS, con fecha y hora.
REM  Uso: doble clic. Pega la cadena de conexion cuando la pida.
REM  NO guarda la contrasena en este archivo.
REM ============================================================

REM --- Carpeta destino: subcarpeta "backups" junto a este .bat ---
set "DESTINO=%~dp0backups"
if not exist "%DESTINO%" mkdir "%DESTINO%"

REM --- Marca de tiempo AAAA-MM-DD_HH-mm (independiente del idioma de Windows) ---
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH-mm"`) do set "STAMP=%%i"
set "ARCHIVO=%DESTINO%\backup-casacambio-%STAMP%.dump"

REM --- Verificar que pg_dump este disponible ---
where pg_dump >nul 2>nul
if errorlevel 1 (
  echo.
  echo [ERROR] No se encontro "pg_dump".
  echo Instala PostgreSQL desde: https://www.postgresql.org/download/windows/
  echo Luego agrega su carpeta "bin" al PATH, por ejemplo:
  echo    C:\Program Files\PostgreSQL\16\bin
  echo.
  pause
  exit /b 1
)

REM --- Cadena de conexion: de la variable SUPABASE_DB_URL o preguntando ---
set "CONN="
if defined SUPABASE_DB_URL set "CONN=%SUPABASE_DB_URL%"
if not defined CONN (
  echo.
  echo Pega la cadena de conexion de Supabase y presiona Enter.
  echo   Dashboard  ^>  Settings  ^>  Database  ^>  Connection string  ^>  URI
  echo   Ejemplo:
  echo   postgresql://postgres:TU_CLAVE@db.PROYECTO.supabase.co:5432/postgres
  echo.
  set /p "CONN=Cadena: "
)
if not defined CONN (
  echo.
  echo [ERROR] No ingresaste ninguna cadena de conexion.
  pause
  exit /b 1
)

echo.
echo Generando backup en:
echo    %ARCHIVO%
echo Puede tardar un momento...
echo.

pg_dump "%CONN%" --format=custom --file="%ARCHIVO%"

if errorlevel 1 (
  echo.
  echo [ERROR] El backup fallo. Revisa la cadena de conexion / la contrasena.
  echo Si la clave tiene simbolos raros, verifica que la copiaste completa.
  pause
  exit /b 1
)

echo.
echo [OK] Backup completado:
echo    %ARCHIVO%
echo.
echo Copia ese archivo a un disco externo.
echo Recorda probar una restauracion de vez en cuando:
echo    pg_restore --dbname="postgresql://..." "%ARCHIVO%"
echo.
pause
