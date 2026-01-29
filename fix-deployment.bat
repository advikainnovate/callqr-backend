@echo off

echo 🔧 Fixing CallQR Backend Deployment Issue...

REM Stop the current failing PM2 process
echo Stopping current PM2 process...
pm2 stop callqr-backend 2>nul

REM Clean and rebuild
echo Cleaning and rebuilding...
call npm run clean
call npm run build

REM Check if schema.sql exists in dist
if not exist "dist\database\schema.sql" (
    echo ❌ schema.sql not found in dist\database\
    echo Copying SQL files manually...
    if not exist "dist\database" mkdir dist\database
    copy src\database\*.sql dist\database\ 2>nul
)

REM Verify the file exists now
if exist "dist\database\schema.sql" (
    echo ✅ schema.sql found in dist\database\
) else (
    echo ❌ Still missing schema.sql - check if it exists in src\database\
    dir src\database\
    exit /b 1
)

REM Start with PM2 using ecosystem file
echo Starting with PM2...
pm2 start ecosystem.config.js --env production

REM Show status
echo PM2 Status:
pm2 status

echo ✅ Deployment fix complete!
echo Use 'pm2 logs callqr-backend' to check if it's running properly