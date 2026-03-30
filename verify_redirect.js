const postgres = require('postgres');
const jwt = require('jsonwebtoken');
const axios = require('axios');
require('dotenv').config();

const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';
const PORT = process.env.PORT || 9001; // README says 9001
const API_URL = `http://localhost:${PORT}/api`;

const sql = postgres(DATABASE_URL);

async function verify() {
  try {
    console.log(`Using API URL: ${API_URL}`);

    // 1. Get test data
    const [qr] = await sql`
      SELECT qr.token, qr.id as "qrCodeId", qr.assigned_user_id as "userId", u.username 
      FROM qr_codes qr 
      JOIN users u ON qr.assigned_user_id = u.id 
      WHERE qr.status = 'active' 
      LIMIT 1
    `;

    if (!qr) {
      console.log('No active QR codes found to test.');
      process.exit(0);
    }

    console.log(`Testing with QR Token: ${qr.token}`);
    console.log(`Owner: ${qr.username} (${qr.userId})`);

    // 2. Generate JWT
    const token = jwt.sign(
      { type: 'user', userId: qr.userId, username: qr.username },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // 3. Update Redirect Settings (PATCH)
    console.log('\nUpdating redirect settings...');
    const redirectUrl = 'https://google.com';
    try {
      const patchRes = await axios.patch(
        `${API_URL}/qr-codes/${qr.qrCodeId}/redirect`,
        {
          redirectUrl,
          isRedirectEnabled: true,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      console.log('PATCH Response:', patchRes.data.message);
    } catch (err) {
      console.error(
        'PATCH Error:',
        err.response ? err.response.data : err.message
      );
      throw err;
    }

    // 4. Test Redirection (GET resolve)
    console.log('\nTesting redirection (External/Generic UA)...');
    const resolveUrl = `http://localhost:${PORT}/api/qr-codes/resolve/${qr.token}`;

    // Simulate generic browser (should redirect to google.com)
    try {
      await axios.get(resolveUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
        },
        maxRedirects: 0,
      });
    } catch (err) {
      if (err.response && err.response.status === 302) {
        console.log(
          '✅ Correctly redirected to:',
          err.response.headers.location
        );
      } else {
        console.log('❌ Redirection failed (Expected 302):', err.message);
        if (err.response) console.log('Response data:', err.response.data);
      }
    }

    // 5. Test "Official App" (should redirect to frontend)
    console.log('\nTesting Official App detection (app=true query param)...');
    try {
      await axios.get(`${resolveUrl}?app=true`, {
        maxRedirects: 0,
      });
    } catch (err) {
      if (err.response && err.response.status === 302) {
        console.log(
          '✅ Correctly redirected to app/frontend:',
          err.response.headers.location
        );
      } else {
        console.log('❌ App detection failed (Expected 302):', err.message);
        if (err.response) console.log('Response data:', err.response.data);
      }
    }

    process.exit(0);
  } catch (err) {
    console.error('Final Verification Error:', err.message);
    process.exit(1);
  }
}

verify();
