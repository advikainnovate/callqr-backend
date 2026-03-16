#!/bin/bash

# PostgreSQL Restore Script
# Usage: ./scripts/restore.sh <backup-filename>

# Check if backup filename is provided
if [ -z "$1" ]; then
    echo "❌ Please provide a backup filename"
    echo ""
    echo "Usage: ./scripts/restore.sh <backup-filename>"
    echo "Example: ./scripts/restore.sh backup_mydb_2026-03-16_20-10-11.sql"
    echo ""
    
    # List available backups
    if [ -d "backups" ] && [ "$(ls -A backups/backup_*.sql 2>/dev/null)" ]; then
        echo "📋 Available backups:"
        ls -lht backups/backup_*.sql | while read line; do
            filename=$(basename $(echo $line | awk '{print $9}'))
            size=$(echo $line | awk '{print $5}')
            date=$(echo $line | awk '{print $6 " " $7 " " $8}')
            echo "  - $filename ($size, $date)"
        done
        echo ""
    fi
    exit 1
fi

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL not found in environment variables"
    echo "Make sure .env file exists with DATABASE_URL"
    exit 1
fi

# Check if psql is installed
if ! command -v psql &> /dev/null; then
    echo "❌ psql is not installed or not in PATH"
    echo ""
    echo "📋 Installation Instructions:"
    echo ""
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        echo "Linux:"
        echo "  Ubuntu/Debian: sudo apt-get install postgresql-client"
        echo "  CentOS/RHEL: sudo yum install postgresql"
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        echo "macOS:"
        echo "  Homebrew: brew install postgresql"
        echo "  Or download from: https://www.postgresql.org/download/macosx/"
    fi
    echo ""
    exit 1
fi

# Check if backup file exists
BACKUP_FILE="backups/$1"
if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ Backup file not found: $BACKUP_FILE"
    exit 1
fi

# Get file info
FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
FILE_DATE=$(date -r "$BACKUP_FILE")

# Extract database name from URL
DB_NAME=$(echo $DATABASE_URL | sed 's/.*\/\([^?]*\).*/\1/')

echo ""
echo "⚠️  DATABASE RESTORE WARNING ⚠️"
echo ""
echo "This will REPLACE all data in the database with the backup."
echo "All current data will be LOST!"
echo ""
echo "Database: $DB_NAME"
echo "Backup file: $1"
echo "Backup size: $FILE_SIZE"
echo "Backup date: $FILE_DATE"
echo ""

# Confirmation prompt
read -p "Are you sure you want to restore? Type 'yes' to continue: " -r
echo ""

if [[ ! $REPLY =~ ^yes$ ]]; then
    echo "❌ Restore cancelled"
    echo ""
    exit 0
fi

echo "📦 Starting database restore..."
echo ""

# Restore database
echo "⏳ Restoring backup..."
if psql "$DATABASE_URL" < "$BACKUP_FILE"; then
    echo ""
    echo "✅ Database restored successfully!"
    echo "📁 From: $1"
    echo "⏰ Time: $(date)"
    echo ""
else
    echo ""
    echo "❌ Restore failed"
    echo ""
    echo "💡 Troubleshooting:"
    echo "1. Verify DATABASE_URL is correct"
    echo "2. Check if PostgreSQL server is running"
    echo "3. Test connection: psql \$DATABASE_URL"
    echo ""
    exit 1
fi