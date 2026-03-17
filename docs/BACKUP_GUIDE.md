# Database Backup Guide

## Quick Start

### Automated Backup (Recommended)

```bash
# Install PostgreSQL client tools first (see Installation section)
npm run db:backup
npm run db:restore backup_file.sql
```

### Manual Backup (Alternative)

Use pgAdmin, DBeaver, or any PostgreSQL GUI tool:

1. Connect to your database
2. Right-click database → Backup
3. Choose SQL format
4. Save with timestamp

## Installation Guide

### Windows

1. Download PostgreSQL: https://www.postgresql.org/download/windows/
2. Install PostgreSQL (includes pg_dump/psql)
3. Add to PATH: `C:\Program Files\PostgreSQL\15\bin`
4. Restart terminal

### macOS

```bash
brew install postgresql
```

### Linux

```bash
# Ubuntu/Debian
sudo apt-get install postgresql-client

# CentOS/RHEL
sudo yum install postgresql
```

## Backup Methods

### 1. Node.js Scripts (Cross-platform)

- `npm run db:backup` - Create backup
- `npm run db:restore <file>` - Restore backup
- Automatic error handling and guidance

### 2. Shell Scripts (Unix/Linux/macOS)

- `./scripts/backup.sh` - Create backup
- `./scripts/restore.sh <file>` - Restore backup
- Native shell performance

### 3. Batch Scripts (Windows)

- `scripts\backup.bat` - Create backup
- `scripts\restore.bat <file>` - Restore backup
- Windows-native batch files

## Troubleshooting

**"pg_dump not found"**

- Install PostgreSQL client tools
- Add PostgreSQL bin directory to PATH
- Restart terminal/IDE

**"Connection failed"**

- Check DATABASE_URL in .env
- Verify PostgreSQL server is running
- Test: `psql $DATABASE_URL`

**"Permission denied"**

- Check database user permissions
- Verify password in DATABASE_URL
