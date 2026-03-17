@echo off
REM PostgreSQL Restore Script for Windows
REM Usage: scripts\restore.bat <backup-filename>

if "%1"=="" (
    echo ❌ Please provide a backup filename
    echo.
    echo Usage: scripts\restore.bat ^<backup-filename^>
    echo Example: scripts\restore.bat backup_mydb_2026-03-16_20-10-11.sql
    echo.
    
    REM List available backups
    if exist backups\backup_*.sql (
        echo 📋 Available backups:
        for %%f in (backups\backup_*.sql) do (
            echo   - %%~nxf
        )
        echo.
    )
    pause
    exit /b 1
)

echo.
echo ⚠️  DATABASE RESTORE WARNING ⚠️
echo.
echo This will REPLACE all data in the database with the backup.
echo All current data will be LOST!
echo.

REM Check if psql is available
psql --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ psql is not installed or not in PATH
    echo.
    echo 📋 Installation Instructions:
    echo.
    echo Windows:
    echo 1. Download PostgreSQL from: https://www.postgresql.org/download/windows/
    echo 2. Install PostgreSQL ^(includes psql^)
    echo 3. Add PostgreSQL bin directory to PATH:
    echo    - Default location: C:\Program Files\PostgreSQL\15\bin
    echo    - Add to System Environment Variables ^> PATH
    echo 4. Restart your terminal/IDE
    echo.
    pause
    exit /b 1
)

REM Load environment variables from .env file
if exist .env (
    for /f "usebackq tokens=1,2 delims==" %%a in (".env") do (
        if not "%%a"=="" if not "%%a:~0,1%"=="#" set %%a=%%b
    )
)

REM Check if DATABASE_URL is set
if "%DATABASE_URL%"=="" (
    echo ❌ DATABASE_URL not found in environment variables
    echo Make sure .env file exists with DATABASE_URL
    pause
    exit /b 1
)

REM Check if backup file exists
set "BACKUP_FILE=backups\%1"
if not exist "%BACKUP_FILE%" (
    echo ❌ Backup file not found: %BACKUP_FILE%
    pause
    exit /b 1
)

REM Get file info
for %%A in ("%BACKUP_FILE%") do set "FILE_SIZE=%%~zA"
for %%A in ("%BACKUP_FILE%") do set "FILE_DATE=%%~tA"

REM Extract database name from URL (simplified)
for /f "tokens=4 delims=/" %%a in ("%DATABASE_URL%") do set "DB_NAME=%%a"
for /f "tokens=1 delims=?" %%a in ("%DB_NAME%") do set "DB_NAME=%%a"

echo Database: %DB_NAME%
echo Backup file: %1
echo Backup size: %FILE_SIZE% bytes
echo Backup date: %FILE_DATE%
echo.

set /p "CONFIRM=Are you sure you want to restore? Type 'yes' to continue: "
echo.

if not "%CONFIRM%"=="yes" (
    echo ❌ Restore cancelled
    echo.
    pause
    exit /b 0
)

echo 📦 Starting database restore...
echo.

echo ⏳ Restoring backup...
psql "%DATABASE_URL%" < "%BACKUP_FILE%"

if %errorlevel% equ 0 (
    echo.
    echo ✅ Database restored successfully!
    echo 📁 From: %1
    echo ⏰ Time: %date% %time%
    echo.
) else (
    echo.
    echo ❌ Restore failed
    echo.
    echo 💡 Troubleshooting:
    echo 1. Verify DATABASE_URL is correct
    echo 2. Check if PostgreSQL server is running
    echo 3. Test connection manually
    echo.
    exit /b 1
)

pause