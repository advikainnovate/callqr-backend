# Phase 1 Deployment Checklist

Use this checklist to ensure a smooth deployment of Phase 1 improvements.

## Pre-Deployment

### Backup
- [ ] Database backup completed
- [ ] `.env` file backed up
- [ ] Current code committed to Git
- [ ] Backup location documented: _______________

### Environment Preparation
- [ ] Generate new JWT_SECRET (min 32 chars)
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- [ ] Generate new ENCRYPTION_KEY (64 hex chars)
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- [ ] Identify admin user IDs
  ```bash
  psql -U username -d database_name -c "SELECT id, username FROM users WHERE username IN ('admin1', 'admin2');"
  ```
- [ ] Update `.env` file with new values
- [ ] Verify `.env` file syntax

### Code Preparation
- [ ] Pull latest code: `git pull origin main`
- [ ] Install dependencies: `npm install`
- [ ] Build application: `npm run build`
- [ ] Build successful (no errors)

## Deployment

### Database Migration
- [ ] Stop application (if running)
- [ ] Apply schema changes: `npm run db:push`
- [ ] OR run SQL script: `psql -U username -d database_name -f scripts/add-security-improvements.sql`
- [ ] Verify audit_logs table exists
  ```bash
  psql -U username -d database_name -c "\d audit_logs"
  ```
- [ ] Verify indexes created
  ```bash
  psql -U username -d database_name -c "SELECT tablename, indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename;"
  ```

### Application Deployment
- [ ] Start application: `npm start` or `pm2 start ecosystem.config.js`
- [ ] Check startup logs for validation messages
- [ ] Verify no error messages in logs
- [ ] Application running on expected port

## Post-Deployment Verification

### Health Check
- [ ] Health endpoint responds: `curl http://localhost:4000/healthz`
- [ ] Database status: "connected"
- [ ] WebRTC status: "running"
- [ ] HTTP status code: 200

### Security Verification
- [ ] Test admin protection (should fail with non-admin token)
  ```bash
  curl -H "Authorization: Bearer <non-admin-token>" http://localhost:4000/api/admin/users
  # Expected: 403 Forbidden
  ```
- [ ] Test admin access (should succeed with admin token)
  ```bash
  curl -H "Authorization: Bearer <admin-token>" http://localhost:4000/api/admin/users
  # Expected: 200 OK with user list
  ```
- [ ] JWT validation working (app started without errors)
- [ ] Password validation working (login successful)

### Audit Logging
- [ ] Perform test login
  ```bash
  curl -X POST http://localhost:4000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"testuser","password":"password123"}'
  ```
- [ ] Verify audit log entry created
  ```bash
  psql -U username -d database_name -c "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 5;"
  ```
- [ ] Check IP address captured
- [ ] Check user agent captured
- [ ] Check action type correct

### Database Performance
- [ ] Run test queries on indexed fields
- [ ] Verify query performance improved
- [ ] Check index usage
  ```sql
  SELECT tablename, indexname, idx_scan 
  FROM pg_stat_user_indexes 
  WHERE schemaname = 'public' 
  ORDER BY idx_scan DESC;
  ```

### Socket.IO
- [ ] Test WebSocket connection
- [ ] Test graceful shutdown
  ```bash
  kill -TERM $(pgrep -f "node.*server")
  ```
- [ ] Verify shutdown logs:
  - [ ] "Received SIGTERM"
  - [ ] "HTTP server closed"
  - [ ] "Socket.IO connections closed"
  - [ ] "Database connection closed"
  - [ ] "Application gracefully shut down"

### Transaction Support
- [ ] Test multi-step operation (e.g., user registration)
- [ ] Verify transaction rollback on error
- [ ] Check data consistency

## Monitoring Setup

### Immediate Monitoring (First 24 Hours)
- [ ] Monitor application logs: `tail -f logs/combined.log`
- [ ] Monitor error logs: `tail -f logs/error.log`
- [ ] Check audit log growth
  ```sql
  SELECT COUNT(*) FROM audit_logs;
  ```
- [ ] Monitor database connection pool
- [ ] Monitor Socket.IO connections
- [ ] Check response times

### Metrics to Track
- [ ] Failed authentication attempts
- [ ] Admin action frequency
- [ ] Query execution times
- [ ] Database index usage
- [ ] Audit log size
- [ ] Socket.IO connection count

## Production Deployment (Additional)

### Load Balancer Configuration
- [ ] Sticky sessions configured (if using load balancer)
- [ ] WebSocket upgrade headers configured
- [ ] Health check endpoint configured
- [ ] SSL/TLS certificates installed
- [ ] CORS origins configured

### PM2 Cluster Mode
- [ ] PM2 ecosystem.config.js updated
- [ ] Cluster mode enabled (if desired)
- [ ] WebSocket transport configured
- [ ] PM2 started: `pm2 start ecosystem.config.js`
- [ ] PM2 save: `pm2 save`
- [ ] PM2 startup: `pm2 startup`

### Security Hardening
- [ ] Firewall rules configured
- [ ] Database access restricted
- [ ] HTTPS enforced
- [ ] CORS origins set (not `*`)
- [ ] Rate limiting verified
- [ ] Admin user IDs set

## Rollback Preparation

### Rollback Plan Ready
- [ ] Backup location documented
- [ ] Rollback SQL script prepared
- [ ] Previous Git commit hash noted: _______________
- [ ] Rollback procedure tested (in staging)
- [ ] Team notified of deployment

## Sign-Off

### Pre-Deployment
- [ ] Checklist reviewed
- [ ] Backup verified
- [ ] Team notified
- [ ] Deployment window scheduled

**Prepared By**: _______________
**Date**: _______________
**Time**: _______________

### Post-Deployment
- [ ] All checks passed
- [ ] No errors in logs
- [ ] Performance acceptable
- [ ] Monitoring active

**Deployed By**: _______________
**Date**: _______________
**Time**: _______________

### Verification (24 Hours Later)
- [ ] No critical errors
- [ ] Performance stable
- [ ] Audit logs growing normally
- [ ] No security incidents

**Verified By**: _______________
**Date**: _______________
**Time**: _______________

## Issues Encountered

| Issue | Severity | Resolution | Time |
|-------|----------|------------|------|
|       |          |            |      |
|       |          |            |      |
|       |          |            |      |

## Notes

_______________________________________________________________________________
_______________________________________________________________________________
_______________________________________________________________________________
_______________________________________________________________________________

## Rollback Decision

- [ ] Deployment successful - No rollback needed
- [ ] Minor issues - Continue monitoring
- [ ] Critical issues - Rollback initiated

**Decision By**: _______________
**Date**: _______________
**Time**: _______________

---

## Quick Reference

### Generate Secrets
```bash
# JWT Secret (32+ chars)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Encryption Key (64 hex chars)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Database Commands
```bash
# Backup
pg_dump -U username -d database_name > backup.sql

# Restore
psql -U username -d database_name < backup.sql

# Apply migration
psql -U username -d database_name -f scripts/add-security-improvements.sql
```

### Application Commands
```bash
# Build
npm run build

# Start
npm start

# PM2
pm2 start ecosystem.config.js
pm2 logs
pm2 stop all
```

### Health Check
```bash
curl http://localhost:4000/healthz
```

### Test Admin Protection
```bash
# Should fail (403)
curl -H "Authorization: Bearer <non-admin-token>" http://localhost:4000/api/admin/users

# Should succeed (200)
curl -H "Authorization: Bearer <admin-token>" http://localhost:4000/api/admin/users
```

### Check Audit Logs
```sql
SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 10;
```

---

**Document Version**: 1.0
**Last Updated**: February 16, 2026
