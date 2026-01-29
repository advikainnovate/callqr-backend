#!/bin/bash

echo "🔧 Fixing CallQR Backend Deployment Issue..."

# Stop the current failing PM2 process
echo "Stopping current PM2 process..."
pm2 stop callqr-backend 2>/dev/null || echo "No existing process to stop"

# Clean and rebuild
echo "Cleaning and rebuilding..."
npm run clean
npm run build

# Check if schema.sql exists in dist
if [ ! -f "dist/database/schema.sql" ]; then
    echo "❌ schema.sql not found in dist/database/"
    echo "Copying SQL files manually..."
    mkdir -p dist/database
    cp src/database/*.sql dist/database/ 2>/dev/null || echo "No SQL files found in src/database/"
fi

# Verify the file exists now
if [ -f "dist/database/schema.sql" ]; then
    echo "✅ schema.sql found in dist/database/"
else
    echo "❌ Still missing schema.sql - check if it exists in src/database/"
    ls -la src/database/
    exit 1
fi

# Start with PM2 using ecosystem file
echo "Starting with PM2..."
pm2 start ecosystem.config.js --env production

# Show status
echo "PM2 Status:"
pm2 status

echo "✅ Deployment fix complete!"
echo "Use 'pm2 logs callqr-backend' to check if it's running properly"