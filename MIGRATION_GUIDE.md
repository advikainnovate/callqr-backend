# Phase 1 Migration Guide

## Prerequisites

- Backup your database before proceeding
- Ensure you have admin access to the database
- Stop the application during migration (recommended)

## Step-by-Step Migration

### 1. Backup Database

```bash
# PostgreSQL backup
pg_dump -U username -d database_name > backup_$(date +%Y%m%d_%H%M%S).sql

# Or using Docker
docker exec postgres_container pg_dump -U username database_name > backup_$(date +%Y%m%d_%H%M%S).sql
```

### 2. Update Environment Variables

Edit your `.env` file:

```bash
# Ensure JWT_SECRET is at least 32 characters
# Generate new secret if needed:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Update .env
JWT_SECRET=<your-new-32-char-secret>

# Ensure ENCRYPTION_KEY is 64 hex characters
# Generate if needed:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Update .env
ENCRYPTION_KEY=<your-64-char-hex-key>

# Set admin user IDs (comma-separated UUIDs)
ADMIN_USER_IDS=<admin-user-id-1>,<admin-user-id-2>
```

### 3. Pull Latest Code

```bash
git pull origin main
npm install
```

### 4. Apply Database Changes

**Option A: Using Drizzle (Recommended)**

```bash
# Generate migration
npm run db:generate

# Push schema changes
npm run db:push

# Verify schema
node scripts/verify-schema.js
```

**Option B: Using SQL Script**

```bash
# Apply the migration script
psql -U username -d database_name -f scripts/add-security-improvements.sql

# Or using Docker
docker exec -i postgres_container psql -U username -d database_name < scripts/add-security-improvements.sql
```

### 5. Verify Database Changes

```bash
# Check if audit_logs table exists
psql -U username -d database_name -c "\d audit_logs"

# Check indexes
psql -U username -d database_name -c "SELECT tablename, indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename;"

# Count audit logs (should be 0 initially)
psql -U username -d database_name -c "SELECT COUNT(*) FROM audit_logs;"
```

### 6. Build Application

```bash
npm run build
```

### 7. Test Configuration

```bash
# Test that app starts with new validations
npm start

# Check logs for validation messages
# Should see: "JWT_SECRET validation passed"
# Should NOT see: "ERROR: JWT_SECRET must be at least 32 characters"
```

### 8. Verify Admin Protection

```bash
# Get a non-admin user token
TOKEN="<non-admin-jwt-token>"

# Try to access admin endpoint (should fail with 403)
curl -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/admin/users

# Expected response: {"error": "Admin access required"}
```

### 9. Test Audit Logging

```bash
# Login to trigger audit log
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"password123"}'

# Check audit logs
psql -U username -d database_name -c "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 5;"
```

### 10. Test Graceful Shutdown

```bash
# Start the application
npm start

# In another terminal, send SIGTERM
kill -TERM $(pgrep -f "node.*server")

# Check logs for graceful shutdown messages:
# - "Received SIGTERM. Initiating graceful shutdown..."
# - "HTTP server closed."
# - "Socket.IO connections closed."
# - "Database connection closed."
# - "Application gracefully shut down."
```

## Verification Checklist

- [ ] Database backup completed
- [ ] Environment variables updated (JWT_SECRET, ENCRYPTION_KEY, ADMIN_USER_IDS)
- [ ] Code updated and dependencies installed
- [ ] Database schema updated (audit_logs table exists)
- [ ] All indexes created successfully
- [ ] Application builds without errors
- [ ] Application starts without validation errors
- [ ] Admin routes protected (non-admin users get 403)
- [ ] Audit logging works (login events logged)
- [ ] Graceful shutdown works (all connections closed properly)

## Rollback Procedure

If you encounter issues:

### 1. Stop the Application

```bash
# Stop the running process
pkill -f "node.*server"
```

### 2. Restore Database

```bash
# Restore from backup
psql -U username -d database_name < backup_YYYYMMDD_HHMMSS.sql

# Or using Docker
docker exec -i postgres_container psql -U username -d database_name < backup_YYYYMMDD_HHMMSS.sql
```

### 3. Revert Code

```bash
# Revert to previous commit
git log --oneline  # Find the commit hash before migration
git reset --hard <previous-commit-hash>

# Reinstall dependencies
npm install
npm run build
```

### 4. Restore Environment

```bash
# Restore previous .env file from backup
cp .env.backup .env
```

### 5. Restart Application

```bash
npm start
```

## Common Issues

### Issue: "JWT_SECRET must be at least 32 characters"

**Solution:**
```bash
# Generate a new secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Update .env file with the generated secret
```

### Issue: "ENCRYPTION_KEY must be a 32-byte string (64 hex characters)"

**Solution:**
```bash
# Generate a new key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Update .env file with the generated key
```

### Issue: "Admin access required" for legitimate admin

**Solution:**
```bash
# Get your user ID from database
psql -U username -d database_name -c "SELECT id, username FROM users WHERE username = 'your-admin-username';"

# Add the ID to .env
ADMIN_USER_IDS=<your-user-id>

# Restart application
```

### Issue: Duplicate key violation on chat_sessions

**Solution:**
```bash
# Check for duplicate active chats
psql -U username -d database_name -c "
SELECT participant1_id, participant2_id, status, COUNT(*) 
FROM chat_sessions 
WHERE status = 'active' 
GROUP BY participant1_id, participant2_id, status 
HAVING COUNT(*) > 1;"

# If duplicates exist, end older chats
psql -U username -d database_name -c "
UPDATE chat_sessions 
SET status = 'ended', ended_at = NOW() 
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY participant1_id, participant2_id 
      ORDER BY created_at DESC
    ) as rn
    FROM chat_sessions 
    WHERE status = 'active'
  ) t WHERE rn > 1
);"
```

### Issue: Indexes not created

**Solution:**
```bash
# Manually run the SQL script
psql -U username -d database_name -f scripts/add-security-improvements.sql

# Verify indexes
psql -U username -d database_name -c "SELECT tablename, indexname FROM pg_indexes WHERE schemaname = 'public';"
```

## Performance Monitoring

After migration, monitor these metrics:

### Database Performance

```sql
-- Check index usage
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan as index_scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;

-- Check table sizes
SELECT 
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Check slow queries
SELECT 
    query,
    calls,
    total_time,
    mean_time,
    max_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
```

### Audit Log Growth

```sql
-- Check audit log size
SELECT COUNT(*) as total_logs FROM audit_logs;

-- Check logs by action
SELECT action, COUNT(*) as count 
FROM audit_logs 
GROUP BY action 
ORDER BY count DESC;

-- Check logs by date
SELECT DATE(created_at) as date, COUNT(*) as count 
FROM audit_logs 
GROUP BY DATE(created_at) 
ORDER BY date DESC;
```

### Application Metrics

- Monitor response times for admin endpoints
- Check Socket.IO connection counts
- Monitor database connection pool usage
- Track failed authentication attempts

## Support

If you encounter issues during migration:

1. Check application logs: `logs/combined.log` and `logs/error.log`
2. Check database logs
3. Verify environment variables are set correctly
4. Ensure database user has necessary permissions
5. Review the PHASE1_IMPROVEMENTS.md document

## Next Steps

After successful migration:

1. Monitor application performance for 24-48 hours
2. Review audit logs regularly
3. Set up automated backups
4. Plan for Phase 2 improvements
5. Update monitoring dashboards

---

**Migration Date**: _____________
**Performed By**: _____________
**Status**: _____________
**Notes**: _____________
