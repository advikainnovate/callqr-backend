# Database Backup & Restore

## Quick Start

### Create Backup
```bash
npm run db:backup
```

Creates a timestamped backup file in `backups/` directory.

### Restore Backup
```bash
npm run db:restore backup_mydb_2024-03-05_15-30-00.sql
```

Restores database from the specified backup file.

## Backup Details

### What Gets Backed Up
- All tables and data
- Database schema
- Indexes
- Constraints
- Sequences

### Backup Location
```
backups/
├── backup_mydb_2024-03-05_15-30-00.sql
├── backup_mydb_2024-03-06_10-15-30.sql
└── backup_mydb_2024-03-07_18-45-20.sql
```

### Backup Filename Format
```
backup_<database-name>_<date>_<time>.sql
```

## Usage Examples

### Manual Backup Before Changes
```bash
# Before making risky changes
npm run db:backup

# Make your changes
npm run db:push

# If something goes wrong, restore
npm run db:restore backup_mydb_2024-03-05_15-30-00.sql
```

### Scheduled Backups (Linux/Mac)
```bash
# Add to crontab for daily backups at 2 AM
0 2 * * * cd /path/to/project && npm run db:backup
```

### Scheduled Backups (Windows)
Use Task Scheduler to run:
```cmd
cd C:\path\to\project && npm run db:backup
```

## Requirements

### PostgreSQL Client Tools
The backup scripts require `pg_dump` and `psql` to be installed:

**Ubuntu/Debian:**
```bash
sudo apt-get install postgresql-client
```

**macOS:**
```bash
brew install postgresql
```

**Windows:**
- Install PostgreSQL (includes client tools)
- Or download standalone client tools

## Restore Process

### Safety Features
1. Shows backup details before restore
2. Requires "yes" confirmation
3. Displays backup size and date

### Restore Steps
```bash
# 1. List available backups
ls backups/

# 2. Choose a backup and restore
npm run db:restore backup_mydb_2024-03-05_15-30-00.sql

# 3. Confirm when prompted
Are you sure you want to restore? Type "yes" to continue: yes

# 4. Wait for completion
✅ Database restored successfully!
```

## Best Practices

### Regular Backups
- Daily automated backups
- Before major updates
- Before database migrations
- Before production deployments

### Backup Retention
- Keep last 7 daily backups
- Keep last 4 weekly backups
- Keep last 12 monthly backups

### Testing Restores
Periodically test restore process:
```bash
# 1. Create test database
createdb test_restore

# 2. Modify DATABASE_URL temporarily
DATABASE_URL=postgres://user:pass@localhost:5432/test_restore

# 3. Test restore
npm run db:restore backup_mydb_2024-03-05_15-30-00.sql

# 4. Verify data
# 5. Drop test database
dropdb test_restore
```

### Backup Storage
- Store backups on separate disk/server
- Use cloud storage (S3, Google Cloud Storage)
- Encrypt sensitive backups
- Keep offsite copies

## Troubleshooting

### "pg_dump: command not found"
Install PostgreSQL client tools (see Requirements section)

### "Permission denied"
Ensure database user has backup permissions:
```sql
GRANT SELECT ON ALL TABLES IN SCHEMA public TO your_user;
```

### Large Backup Files
For large databases, consider:
- Compressed backups: `pg_dump -Fc` (custom format)
- Exclude large tables if not needed
- Use incremental backups

### Restore Fails
- Check PostgreSQL version compatibility
- Ensure database exists
- Verify user permissions
- Check disk space

## Automation Script Example

Create `scripts/auto-backup.sh`:
```bash
#!/bin/bash
cd /path/to/project
npm run db:backup

# Keep only last 7 backups
cd backups
ls -t backup_*.sql | tail -n +8 | xargs rm -f
```

Make executable and add to cron:
```bash
chmod +x scripts/auto-backup.sh
crontab -e
# Add: 0 2 * * * /path/to/project/scripts/auto-backup.sh
```

## Security Notes

- Backup files contain sensitive data
- Store securely with proper permissions
- Encrypt backups for production
- Don't commit backups to git (already in .gitignore)
- Rotate backup encryption keys regularly

## Related Commands

```bash
# Database operations
npm run db:push      # Apply schema changes
npm run db:reset     # Reset database
npm run db:studio    # Open Drizzle Studio

# Backup operations
npm run db:backup    # Create backup
npm run db:restore   # Restore backup
```
