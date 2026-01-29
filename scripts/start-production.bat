@echo off

REM Create logs directory if it doesn't exist
if not exist logs mkdir logs

REM Build the application
echo Building application...
npm run build

REM Check if build was successful
if %errorlevel% neq 0 (
    echo Build failed! Exiting...
    exit /b 1
)

REM Start with PM2 using ecosystem file
echo Starting application with PM2...
pm2 start ecosystem.config.js --env production

REM Show status
pm2 status

echo Application started successfully!
echo Use 'pm2 logs callqr-backend' to view logs
echo Use 'pm2 monit' for monitoring