@echo off
REM PostgreSQL Backup Script for Windows
REM Usage: scripts\backup.bat

echo.
echo 📦 Starting database backup...
echo.

REM Check if pg_dump is available
pg_dump --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ pg_dump is not installed or not in PATH
    echo.
    echo 📋 Installation Instructions:
    echo.
    echo Windows:
    echo 1. Download PostgreSQL from: https://www.postgresql.org/download/windows/
    echo 2. Install PostgreSQL ^(includes pg_dump^)
    echo 3. Add PostgreSQL bin directory to PATH:
    echo    - Default location: C:\Program Files\PostgreSQL\15\bin
    echo    - Add to System Environment Variables ^> PATH
    echo 4. Restart your terminal/IDE
    echo.
    echo 💡 Alternative: Use pgAdmin or another GUI tool for backups
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

REM Create backups directory
if not exist backups mkdir backups

REM Generate timestamp
for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set "dt=%%a"
set "YY=%dt:~2,2%" & set "YYYY=%dt:~0,4%" & set "MM=%dt:~4,2%" & set "DD=%dt:~6,2%"
set "HH=%dt:~8,2%" & set "Min=%dt:~10,2%" & set "Sec=%dt:~12,2%"
set "timestamp=%YYYY%-%MM%-%DD%_%HH%-%Min%-%Sec%"

REM Extract database name from URL (simplified)
for /f "tokens=4 delims=/" %%a in ("%DATABASE_URL%") do set "DB_NAME=%%a"
for /f "tokens=1 delims=?" %%a in ("%DB_NAME%") do set "DB_NAME=%%a"

REM Create backup filename
set "BACKUP_FILE=backups\backup_%DB_NAME%_%timestamp%.sql"

echo Database: %DB_NAME%
echo Backup file: %BACKUP_FILE%
echo.

echo ⏳ Creating backup...
pg_dump "%DATABASE_URL%" > "%BACKUP_FILE%"

if %errorlevel% equ 0 (
    if exist "%BACKUP_FILE%" (
        for %%A in ("%BACKUP_FILE%") do set "FILE_SIZE=%%~zA"
        echo.
        echo ✅ Backup completed successfully!
        echo 📁 File: %BACKUP_FILE%
        echo 📊 Size: %FILE_SIZE% bytes
        echo ⏰ Time: %date% %time%
        echo.
        echo 💡 To restore this backup, run:
        echo    scripts\restore.bat %BACKUP_FILE:backups\=%
        echo.
    ) else (
        echo ❌ Backup file was not created
        exit /b 1
    )
) else (
    echo ❌ Backup failed
    echo.
    echo 💡 Troubleshooting:
    echo 1. Verify DATABASE_URL is correct
    echo 2. Check if PostgreSQL server is running
    echo 3. Test connection manually
    echo.
    if exist "%BACKUP_FILE%" del "%BACKUP_FILE%"
    exit /b 1
)

pause