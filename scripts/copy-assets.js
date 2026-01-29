#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function copyFile(src, dest) {
  try {
    // Ensure destination directory exists
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    
    // Copy file
    fs.copyFileSync(src, dest);
    console.log(`Copied: ${src} -> ${dest}`);
  } catch (error) {
    console.error(`Error copying ${src} to ${dest}:`, error.message);
  }
}

function copyDirectory(srcDir, destDir, extensions = []) {
  if (!fs.existsSync(srcDir)) {
    console.log(`Source directory ${srcDir} does not exist, skipping...`);
    return;
  }

  // Ensure destination directory exists
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const items = fs.readdirSync(srcDir);
  
  for (const item of items) {
    const srcPath = path.join(srcDir, item);
    const destPath = path.join(destDir, item);
    
    const stat = fs.statSync(srcPath);
    
    if (stat.isDirectory()) {
      copyDirectory(srcPath, destPath, extensions);
    } else if (stat.isFile()) {
      // If extensions filter is provided, check file extension
      if (extensions.length === 0 || extensions.some(ext => item.endsWith(ext))) {
        copyFile(srcPath, destPath);
      }
    }
  }
}

// Copy SQL files from src/database to dist/database
console.log('Copying database assets...');
copyDirectory('src/database', 'dist/database', ['.sql']);

// Copy any other static assets if needed
console.log('Asset copying complete!');