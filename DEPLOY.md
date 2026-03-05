# Deploy Phone Verification Feature

## Quick Deploy

```bash
# 1. Upload code
git add .
git commit -m "Add phone verification with Twilio SMS"
git push origin main

# 2. On server
git pull
npm install
npm run build
npm run db:push
pm2 restart callqr-backend
```

## Environment Setup

Add to server `.env`:
```env
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890
```

## Verify

```bash
# Check logs
pm2 logs callqr-backend

# Should see:
# ✅ "Twilio SMS service initialized"
# ✅ "Server is running on port XXXX"
```

## Test

```bash
curl -X POST https://your-domain.com/api/auth/send-phone-verification \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"phone":"+918005936038"}'
```

## Documentation

- API Endpoints: `API_ENDPOINTS.md`
- Flow Details: `docs/PHONE_VERIFICATION_FLOW.md`
- Main README: `README.md`
