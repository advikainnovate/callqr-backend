/**
 * Database Backup Script
 * Creates a timestamped backup of the PostgreSQL database
 *
 * Usage: node scripts/backup-database.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

// Check if pg_dump is available
function checkPgDump() {
  try {
    execSync('pg_dump --version', { stdio: 'pipe' });
    return true;
  } catch (error) {
    return false;
  }
}

// Parse DATABASE_URL
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('❌ DATABASE_URL not found in environment variables');
  process.exit(1);
}

// Check if pg_dump is installed
if (!checkPgDump()) {
  console.error('❌ pg_dump is not installed or not in PATH\n');
  console.error('📋 Installation Instructions:\n');

  if (process.platform === 'win32') {
    console.error('Windows:');
    console.error(
      '1. Download PostgreSQL from: https://www.postgresql.org/download/windows/'
    );
    console.error('2. Install PostgreSQL (includes pg_dump)');
    console.error('3. Add PostgreSQL bin directory to PATH:');
    console.error(
      '   - Default location: C:\\Program Files\\PostgreSQL\\15\\bin'
    );
    console.error('   - Add to System Environment Variables > PATH');
    console.error('4. Restart your terminal/IDE\n');
  } else if (process.platform === 'darwin') {
    console.error('macOS:');
    console.error('1. Install via Homebrew: brew install postgresql');
    console.error(
      '2. Or download from: https://www.postgresql.org/download/macosx/\n'
    );
  } else {
    console.error('Linux:');
    console.error('1. Ubuntu/Debian: sudo apt-get install postgresql-client');
    console.error('2. CentOS/RHEL: sudo yum install postgresql');
    console.error("3. Or use your distribution's package manager\n");
  }

  console.error(
    '💡 Alternative: Use a database management tool like pgAdmin or DBeaver for backups\n'
  );
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

// Create backups directory if it doesn't exist
const backupDir = path.join(__dirname, '..', 'backups');
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
  console.log('✓ Created backups directory');
}

// Generate backup filename with timestamp
const timestamp =
  new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] +
  '_' +
  new Date().toTimeString().split(' ')[0].replace(/:/g, '-');
const backupFile = path.join(backupDir, `backup_${database}_${timestamp}.sql`);

console.log('\n📦 Starting database backup...\n');
console.log(`Database: ${database}`);
console.log(`Host: ${host}:${port}`);
console.log(`Backup file: ${backupFile}\n`);

try {
  // Set password environment variable for pg_dump
  process.env.PGPASSWORD = password;

  // Execute pg_dump with better error handling
  const command = `pg_dump -h ${host} -p ${port} -U ${user} -d ${database} -F p -f "${backupFile}"`;

  console.log('⏳ Creating backup...');
  execSync(command, { stdio: 'inherit' });

  // Check if backup file was created
  if (fs.existsSync(backupFile)) {
    const stats = fs.statSync(backupFile);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    console.log('\n✅ Backup completed successfully!');
    console.log(`📁 File: ${backupFile}`);
    console.log(`📊 Size: ${fileSizeMB} MB`);
    console.log(`⏰ Time: ${new Date().toLocaleString()}\n`);

    // List recent backups
    console.log('📋 Recent backups:');
    const backups = fs
      .readdirSync(backupDir)
      .filter(file => file.startsWith('backup_') && file.endsWith('.sql'))
      .sort()
      .reverse()
      .slice(0, 5);

    backups.forEach(backup => {
      const backupPath = path.join(backupDir, backup);
      const backupStats = fs.statSync(backupPath);
      const sizeMB = (backupStats.size / (1024 * 1024)).toFixed(2);
      console.log(`  - ${backup} (${sizeMB} MB)`);
    });

    console.log('\n💡 To restore this backup, run:');
    console.log(`   npm run db:restore ${path.basename(backupFile)}\n`);
  } else {
    console.error('❌ Backup file was not created');
    process.exit(1);
  }
} catch (error) {
  console.error('\n❌ Backup failed:', error.message);

  if (error.message.includes('password authentication failed')) {
    console.error(
      '\n💡 Database connection failed. Check your DATABASE_URL credentials.'
    );
  } else if (error.message.includes('could not connect')) {
    console.error(
      '\n💡 Could not connect to database. Check if PostgreSQL server is running.'
    );
  } else {
    console.error(
      '\n💡 Make sure pg_dump is installed and accessible in your PATH'
    );
  }

  console.error('\n📋 Troubleshooting:');
  console.error('1. Verify DATABASE_URL is correct');
  console.error('2. Check if PostgreSQL server is running');
  console.error('3. Test connection: psql $DATABASE_URL');
  console.error('4. Install PostgreSQL client tools if needed\n');
  process.exit(1);
} finally {
  // Clear password from environment
  delete process.env.PGPASSWORD;
}
