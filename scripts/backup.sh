#!/bin/bash

# PostgreSQL Backup Script
# Usage: ./scripts/backup.sh

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

# Check if pg_dump is installed
if ! command -v pg_dump &> /dev/null; then
    echo "❌ pg_dump is not installed or not in PATH"
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

# Create backups directory
mkdir -p backups

# Generate timestamp
DATE=$(date +"%Y-%m-%d_%H-%M-%S")

# Extract database name from URL for filename
DB_NAME=$(echo $DATABASE_URL | sed 's/.*\/\([^?]*\).*/\1/')

# Create backup filename
BACKUP_FILE="backups/backup_${DB_NAME}_${DATE}.sql"

echo ""
echo "📦 Starting database backup..."
echo ""
echo "Database: $DB_NAME"
echo "Backup file: $BACKUP_FILE"
echo ""

# Create backup
echo "⏳ Creating backup..."
if pg_dump "$DATABASE_URL" > "$BACKUP_FILE"; then
    # Check if backup was successful
    if [ -s "$BACKUP_FILE" ]; then
        FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
        echo ""
        echo "✅ Backup completed successfully!"
        echo "📁 File: $BACKUP_FILE"
        echo "📊 Size: $FILE_SIZE"
        echo "⏰ Time: $(date)"
        echo ""
        
        # List recent backups
        echo "📋 Recent backups:"
        ls -lht backups/backup_*.sql | head -5 | while read line; do
            echo "  - $(echo $line | awk '{print $9 " (" $5 ")"}')"
        done
        echo ""
        echo "💡 To restore this backup, run:"
        echo "   ./scripts/restore.sh $(basename $BACKUP_FILE)"
        echo ""
    else
        echo "❌ Backup file is empty"
        rm -f "$BACKUP_FILE"
        exit 1
    fi
else
    echo "❌ Backup failed"
    rm -f "$BACKUP_FILE"
    exit 1
fi