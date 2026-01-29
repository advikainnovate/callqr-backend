#!/bin/bash

# Create logs directory if it doesn't exist
mkdir -p logs

# Build the application
echo "Building application..."
npm run build

# Check if build was successful
if [ $? -ne 0 ]; then
    echo "Build failed! Exiting..."
    exit 1
fi

# Start with PM2 using ecosystem file
echo "Starting application with PM2..."
pm2 start ecosystem.config.js --env production

# Show status
pm2 status

echo "Application started successfully!"
echo "Use 'pm2 logs callqr-backend' to view logs"
echo "Use 'pm2 monit' for monitoring"