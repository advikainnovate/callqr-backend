# Phase 1 Quick Start Guide

## 🚀 5-Minute Deployment

### 1. Generate Secrets (30 seconds)

```bash
# Generate JWT Secret
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"

# Generate Encryption Key
node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output and update your `.env` file.

### 2. Set Admin Users (30 seconds)

```bash
# Get your user ID
psql -U username -d database_name -c "SELECT id FROM users WHERE username = 'your-username';"

# Add to .env
echo "ADMIN_USER_IDS=<your-user-id>" >> .env
```

### 3. Deploy (2 minutes)

```bash
# Backup database
pg_dump -U username -d database_name > backup_$(date +%Y%m%d).sql

# Update code
git pull origin main
npm install
npm run build

# Apply database changes
npm run db:push

# Start application
npm start
```

### 4. Verify (1 minute)

```bash
# Health check
curl http://localhost:4000/healthz

# Test admin protection (should fail)
curl -H "Authorization: Bearer <non-admin-token>" http://localhost:4000/api/admin/users

# Test login (should create audit log)
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test123"}'

# Check audit logs
psql -U username -d database_name -c "SELECT * FROM audit_logs LIMIT 5;"
```

### 5. Monitor (ongoing)

```bash
# Watch logs
tail -f logs/combined.log

# Check audit logs
psql -U username -d database_name -c "SELECT action, COUNT(*) FROM audit_logs GROUP BY action;"
```

## ✅ Success Indicators

- Application starts without errors
- Health check returns 200 OK
- Non-admin users get 403 on admin endpoints
- Audit logs are being created
- No errors in logs

## 🔥 Troubleshooting

### "JWT_SECRET must be at least 32 characters"
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Copy output to .env as JWT_SECRET
```

### "Admin access required"
```bash
# Get your user ID and add to ADMIN_USER_IDS in .env
psql -U username -d database_name -c "SELECT id FROM users WHERE username = 'your-username';"
```

### Application won't start
```bash
# Check logs
cat logs/error.log

# Verify environment variables
cat .env | grep -E "JWT_SECRET|ENCRYPTION_KEY|ADMIN_USER_IDS"
```

## 📚 Full Documentation

- **Detailed Guide**: `PHASE1_IMPROVEMENTS.md`
- **Migration Steps**: `MIGRATION_GUIDE.md`
- **Deployment Checklist**: `DEPLOYMENT_CHECKLIST.md`
- **Production Setup**: `DEPLOYMENT.md`

## 🆘 Need Help?

1. Check `logs/error.log`
2. Review `MIGRATION_GUIDE.md`
3. Check health endpoint: `curl http://localhost:4000/healthz`
4. Query audit logs: `SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 10;`

---

**Time to Deploy**: ~5 minutes
**Difficulty**: Easy
**Risk Level**: Low (includes rollback)
