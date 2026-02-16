# Phase 2: Database Migration Instructions

## Overview
This guide provides step-by-step instructions for applying the Phase 2 database migration.

## Migration File
`drizzle/0003_phase2_features.sql`

## What This Migration Does

### New Tables
1. **email_verifications** - Stores email verification tokens
2. **password_resets** - Stores password reset tokens
3. **deleted_users** - Stores soft-deleted user data for recovery

### Schema Changes
1. **users table** - Adds:
   - `email_verified` (VARCHAR) - Email verification status
   - `blocked_reason` (TEXT) - Reason for blocking
   - `blocked_at` (TIMESTAMP) - When user was blocked
   - `blocked_by` (UUID) - Admin who blocked the user
   - `deleted_at` (TIMESTAMP) - Soft delete timestamp

2. **qr_codes table** - Adds:
   - `expires_at` (TIMESTAMP) - QR code expiration

### Indexes Created
- email_verifications: user_id, token, expires_at
- password_resets: user_id, token, expires_at
- deleted_users: original_user_id, deleted_at, recovery_expires_at

## Prerequisites

1. **Backup your database**
   ```bash
   pg_dump -U your_user -d your_database > backup_before_phase2.sql
   ```

2. **Verify database connection**
   ```bash
   psql -U your_user -d your_database -c "SELECT version();"
   ```

3. **Check current schema**
   ```bash
   psql -U your_user -d your_database -c "\dt"
   ```

## Migration Methods

### Method 1: Using Drizzle Kit (Recommended)

1. **Generate migration** (already done)
   ```bash
   npm run db:generate
   ```

2. **Review migration**
   ```bash
   cat drizzle/0003_phase2_features.sql
   ```

3. **Apply migration**
   ```bash
   npm run db:push
   ```

4. **Verify migration**
   ```bash
   npm run db:studio
   ```

### Method 2: Manual SQL Execution

1. **Connect to database**
   ```bash
   psql -U your_user -d your_database
   ```

2. **Execute migration**
   ```sql
   \i drizzle/0003_phase2_features.sql
   ```

3. **Verify tables**
   ```sql
   \dt
   ```

4. **Verify columns**
   ```sql
   \d users
   \d qr_codes
   \d email_verifications
   \d password_resets
   \d deleted_users
   ```

### Method 3: Using psql Command

```bash
psql -U your_user -d your_database -f drizzle/0003_phase2_features.sql
```

## Verification Steps

### 1. Check Tables Exist
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('email_verifications', 'password_resets', 'deleted_users');
```

Expected output: 3 rows

### 2. Check Users Table Columns
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name IN ('email_verified', 'blocked_reason', 'blocked_at', 'blocked_by', 'deleted_at');
```

Expected output: 5 rows

### 3. Check QR Codes Table Column
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'qr_codes' 
AND column_name = 'expires_at';
```

Expected output: 1 row

### 4. Check Indexes
```sql
SELECT indexname 
FROM pg_indexes 
WHERE tablename IN ('email_verifications', 'password_resets', 'deleted_users');
```

Expected output: 9 indexes

### 5. Test Insert
```sql
-- Test email_verifications table
INSERT INTO email_verifications (user_id, email, token, expires_at) 
VALUES (
  (SELECT id FROM users LIMIT 1),
  'test@example.com',
  'test_token_' || gen_random_uuid(),
  NOW() + INTERVAL '24 hours'
);

-- Verify insert
SELECT * FROM email_verifications ORDER BY created_at DESC LIMIT 1;

-- Clean up test data
DELETE FROM email_verifications WHERE email = 'test@example.com';
```

## Rollback Instructions

If you need to rollback the migration:

### Rollback SQL
```sql
-- Drop new tables
DROP TABLE IF EXISTS email_verifications CASCADE;
DROP TABLE IF EXISTS password_resets CASCADE;
DROP TABLE IF EXISTS deleted_users CASCADE;

-- Remove new columns from users
ALTER TABLE users DROP COLUMN IF EXISTS email_verified;
ALTER TABLE users DROP COLUMN IF EXISTS blocked_reason;
ALTER TABLE users DROP COLUMN IF EXISTS blocked_at;
ALTER TABLE users DROP COLUMN IF EXISTS blocked_by;
ALTER TABLE users DROP COLUMN IF EXISTS deleted_at;

-- Remove new column from qr_codes
ALTER TABLE qr_codes DROP COLUMN IF EXISTS expires_at;
```

### Restore from Backup
```bash
psql -U your_user -d your_database < backup_before_phase2.sql
```

## Common Issues

### Issue 1: Permission Denied
**Error**: `ERROR: permission denied for table users`

**Solution**:
```sql
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_user;
```

### Issue 2: Column Already Exists
**Error**: `ERROR: column "email_verified" of relation "users" already exists`

**Solution**: The migration is idempotent. This is expected if running multiple times.

### Issue 3: Foreign Key Constraint
**Error**: `ERROR: insert or update on table violates foreign key constraint`

**Solution**: Ensure referenced tables (users) exist and have data.

### Issue 4: Connection Refused
**Error**: `psql: error: connection to server failed`

**Solution**:
1. Check PostgreSQL is running: `pg_isready`
2. Check connection string in `.env`
3. Verify network connectivity

## Post-Migration Tasks

### 1. Update Application Code
```bash
npm install
npm run build
```

### 2. Restart Application
```bash
# Development
npm run dev

# Production
npm start
# or
pm2 restart callqr-backend
```

### 3. Test New Features
```bash
# Test email verification endpoint
curl -X POST http://localhost:4000/api/auth/request-email-verification \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"email":"test@example.com"}'

# Test password reset endpoint
curl -X POST http://localhost:4000/api/auth/request-password-reset \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","email":"test@example.com"}'
```

### 4. Monitor Logs
```bash
tail -f logs/combined.log
tail -f logs/error.log
```

## Environment-Specific Instructions

### Development
```bash
# Use local database
DATABASE_URL=postgres://postgres:postgres@localhost:5432/callqr_dev
npm run db:push
```

### Staging
```bash
# Use staging database
DATABASE_URL=postgres://user:pass@staging-db:5432/callqr_staging
npm run db:push
```

### Production
```bash
# Backup first!
pg_dump -U prod_user -d callqr_prod > backup_$(date +%Y%m%d_%H%M%S).sql

# Apply migration
DATABASE_URL=postgres://prod_user:prod_pass@prod-db:5432/callqr_prod
npm run db:push

# Verify
psql $DATABASE_URL -c "\dt"
```

## Monitoring

### Check Migration Status
```sql
-- Check table counts
SELECT 
  'email_verifications' as table_name, COUNT(*) as count FROM email_verifications
UNION ALL
SELECT 
  'password_resets', COUNT(*) FROM password_resets
UNION ALL
SELECT 
  'deleted_users', COUNT(*) FROM deleted_users;
```

### Check for Errors
```sql
-- Check for users with invalid states
SELECT id, username, status, email_verified, blocked_at, deleted_at
FROM users
WHERE status = 'blocked' AND blocked_at IS NULL;

-- Check for expired tokens
SELECT COUNT(*) as expired_email_tokens
FROM email_verifications
WHERE expires_at < NOW() AND verified_at IS NULL;

SELECT COUNT(*) as expired_reset_tokens
FROM password_resets
WHERE expires_at < NOW() AND used_at IS NULL;
```

## Cleanup Tasks

### Remove Expired Tokens (Run Daily)
```sql
-- Clean expired email verifications
DELETE FROM email_verifications 
WHERE expires_at < NOW() - INTERVAL '7 days';

-- Clean expired password resets
DELETE FROM password_resets 
WHERE expires_at < NOW() - INTERVAL '7 days';

-- Clean old deleted users (after recovery period)
DELETE FROM deleted_users 
WHERE recovery_expires_at < NOW() AND can_recover = 'yes';
```

### Create Cleanup Cron Job
```bash
# Add to crontab
crontab -e

# Run cleanup daily at 2 AM
0 2 * * * psql $DATABASE_URL -c "DELETE FROM email_verifications WHERE expires_at < NOW() - INTERVAL '7 days';"
0 2 * * * psql $DATABASE_URL -c "DELETE FROM password_resets WHERE expires_at < NOW() - INTERVAL '7 days';"
```

## Support

If you encounter issues:

1. Check logs: `logs/error.log`
2. Verify database connection: `psql $DATABASE_URL -c "SELECT 1;"`
3. Review migration file: `cat drizzle/0003_phase2_features.sql`
4. Check application status: `pm2 status` or `npm run dev`
5. Consult documentation: `PHASE2_IMPLEMENTATION.md`

## Success Criteria

✅ All new tables created
✅ All new columns added
✅ All indexes created
✅ No errors in logs
✅ Application builds successfully
✅ Application starts successfully
✅ Test inserts work
✅ Foreign key constraints valid

---

**Migration Version**: 0003
**Created**: Phase 2 Implementation
**Status**: Ready for deployment
