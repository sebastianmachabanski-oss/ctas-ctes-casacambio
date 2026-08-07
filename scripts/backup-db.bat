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

REM ============================================================
REM  Buscar pg_dump. NO hace falta INSTALAR PostgreSQL (que pide
REM  permisos de administrador): alcanza con descomprimir el ZIP
REM  de binarios sueltos en una carpeta del usuario.
REM
REM  Orden de busqueda:
REM    1. La variable PGBIN, si la definiste a mano
REM    2. El PATH
REM    3. Ubicaciones habituales SIN administrador (ZIP o Scoop)
REM    4. La instalacion clasica con administrador
REM ============================================================
set "PGDUMP="

if defined PGBIN if exist "%PGBIN%\pg_dump.exe" set "PGDUMP=%PGBIN%\pg_dump.exe"

if not defined PGDUMP (
  for /f "delims=" %%p in ('where pg_dump 2^>nul') do if not defined PGDUMP set "PGDUMP=%%p"
)

if not defined PGDUMP (
  for %%d in (
    "%USERPROFILE%\pgsql\bin"
    "%USERPROFILE%\Downloads\pgsql\bin"
    "%USERPROFILE%\scoop\apps\postgresql\current\bin"
    "%LOCALAPPDATA%\Programs\pgAdmin 4\runtime"
    "%LOCALAPPDATA%\Programs\PostgreSQL\17\bin"
    "%LOCALAPPDATA%\Programs\PostgreSQL\16\bin"
    "C:\pgsql\bin"
    "C:\Program Files\PostgreSQL\17\bin"
    "C:\Program Files\PostgreSQL\16\bin"
    "C:\Program Files\PostgreSQL\15\bin"
  ) do if not defined PGDUMP if exist "%%~d\pg_dump.exe" set "PGDUMP=%%~d\pg_dump.exe"
)

if not defined PGDUMP (
  echo.
  echo [ERROR] No se encontro "pg_dump.exe".
  echo.
  echo NO hace falta instalar PostgreSQL ni tener permisos de administrador.
  echo Alcanza con descomprimir el ZIP de binarios sueltos:
  echo.
  echo   1^) Entra a https://www.enterprisedb.com/download-postgresql-binaries
  echo   2^) Descarga "Windows x86-64" de la MISMA version mayor que tu servidor
  echo      ^(averiguala en el SQL Editor con:  select version^(^);  ^)
  echo   3^) Descomprimilo en tu carpeta de usuario. Te queda:
  echo        %USERPROFILE%\pgsql\bin\pg_dump.exe
  echo   4^) Volve a ejecutar este archivo: lo encuentra solo.
  echo.
  echo Si lo dejaste en otra carpeta, definí PGBIN apuntando a su "bin".
  echo.
  pause
  exit /b 1
)

echo Usando: %PGDUMP%

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

"%PGDUMP%" "%CONN%" --format=custom --file="%ARCHIVO%"

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
