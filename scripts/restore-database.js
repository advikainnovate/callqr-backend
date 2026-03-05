/**
 * Database Restore Script
 * Restores a PostgreSQL database from a backup file
 * 
 * Usage: node scripts/restore-database.js <backup-filename>
 * Example: node scripts/restore-database.js backup_mydb_2024-03-05_15-30-00.sql
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Load environment variables
require('dotenv').config();

// Get backup filename from command line
const backupFilename = process.argv[2];

if (!backupFilename) {
  console.error('❌ Please provide a backup filename');
  console.error('\nUsage: node scripts/restore-database.js <backup-filename>');
  console.error('Example: node scripts/restore-database.js backup_mydb_2024-03-05_15-30-00.sql\n');
  
  // List available backups
  const backupDir = path.join(__dirname, '..', 'backups');
  if (fs.existsSync(backupDir)) {
    const backups = fs.readdirSync(backupDir)
      .filter(file => file.startsWith('backup_') && file.endsWith('.sql'))
      .sort()
      .reverse();
    
    if (backups.length > 0) {
      console.log('📋 Available backups:');
      backups.forEach(backup => {
        const backupPath = path.join(backupDir, backup);
        const stats = fs.statSync(backupPath);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        const date = new Date(stats.mtime).toLocaleString();
        console.log(`  - ${backup} (${sizeMB} MB, ${date})`);
      });
      console.log('');
    }
  }
  process.exit(1);
}

// Parse DATABASE_URL
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('❌ DATABASE_URL not found in environment variables');
  process.exit(1);
}

// Parse connection string - handle passwords with special characters
// Format: postgres://user:password@host:port/database
const urlPattern = /postgres(?:ql)?:\/\/([^:]+):(.+)@([^:\/]+):(\d+)\/([^?]+)/;
const match = dbUrl.match(urlPattern);

if (!match) {
  console.error('❌ Invalid DATABASE_URL format');
  console.error('Expected format: postgres://user:password@host:port/database');
  console.error(`Received: ${dbUrl.replace(/:[^:@]+@/, ':****@')}`); // Hide password in error
  process.exit(1);
}

let [, user, password, host, port, database] = match;

// Handle case where password contains @ symbol
// Find the last @ before host:port pattern
const lastAtIndex = dbUrl.lastIndexOf('@');
const afterAt = dbUrl.substring(lastAtIndex + 1);
const hostPortDb = afterAt.match(/([^:]+):(\d+)\/(.+)/);

if (hostPortDb) {
  host = hostPortDb[1];
  port = hostPortDb[2];
  database = hostPortDb[3].split('?')[0]; // Remove query params if any
  
  // Extract password correctly (everything between first : and last @)
  const userPassPart = dbUrl.substring(dbUrl.indexOf('://') + 3, lastAtIndex);
  const colonIndex = userPassPart.indexOf(':');
  user = userPassPart.substring(0, colonIndex);
  password = userPassPart.substring(colonIndex + 1);
}

// Find backup file
const backupDir = path.join(__dirname, '..', 'backups');
const backupFile = path.join(backupDir, backupFilename);

if (!fs.existsSync(backupFile)) {
  console.error(`❌ Backup file not found: ${backupFile}`);
  process.exit(1);
}

const stats = fs.statSync(backupFile);
const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

console.log('\n⚠️  DATABASE RESTORE WARNING ⚠️\n');
console.log('This will REPLACE all data in the database with the backup.');
console.log('All current data will be LOST!\n');
console.log(`Database: ${database}`);
console.log(`Host: ${host}:${port}`);
console.log(`Backup file: ${backupFilename}`);
console.log(`Backup size: ${fileSizeMB} MB`);
console.log(`Backup date: ${new Date(stats.mtime).toLocaleString()}\n`);

// Create readline interface for confirmation
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Are you sure you want to restore? Type "yes" to continue: ', (answer) => {
  rl.close();

  if (answer.toLowerCase() !== 'yes') {
    console.log('\n❌ Restore cancelled\n');
    process.exit(0);
  }

  console.log('\n📦 Starting database restore...\n');

  try {
    // Set password environment variable
    process.env.PGPASSWORD = password;

    // Drop existing database and recreate (optional, safer to drop tables)
    console.log('⏳ Preparing database...');
    
    // Execute psql to restore
    const command = `psql -h ${host} -p ${port} -U ${user} -d ${database} -f "${backupFile}"`;
    
    console.log('⏳ Restoring backup...');
    execSync(command, { stdio: 'inherit' });

    console.log('\n✅ Database restored successfully!');
    console.log(`📁 From: ${backupFilename}`);
    console.log(`⏰ Time: ${new Date().toLocaleString()}\n`);

  } catch (error) {
    console.error('\n❌ Restore failed:', error.message);
    console.error('\n💡 Make sure psql is installed and accessible in your PATH');
    console.error('   Install PostgreSQL client tools if needed\n');
    process.exit(1);
  } finally {
    // Clear password from environment
    delete process.env.PGPASSWORD;
  }
});
