#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function runCommand(command, description) {
  console.log(`\n${description}...`);
  try {
    execSync(command, { stdio: 'inherit' });
    return true;
  } catch (error) {
    console.error(`Failed: ${description}`);
    console.error(error.message);
    return false;
  }
}

function main() {
  console.log('🚀 Starting CallQR Backend Production Deployment');
  
  // Create logs directory
  const logsDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
    console.log('✅ Created logs directory');
  }
  
  // Build application
  if (!runCommand('npm run build', '🔨 Building application')) {
    process.exit(1);
  }
  
  // Start with PM2
  if (!runCommand('pm2 start ecosystem.config.js --env production', '🚀 Starting with PM2')) {
    process.exit(1);
  }
  
  // Show status
  runCommand('pm2 status', '📊 Showing PM2 status');
  
  console.log('\n✅ Application started successfully!');
  console.log('📝 Use "pm2 logs callqr-backend" to view logs');
  console.log('📊 Use "pm2 monit" for monitoring');
  console.log('🔄 Use "pm2 restart callqr-backend" to restart');
  console.log('🛑 Use "pm2 stop callqr-backend" to stop');
}

main();