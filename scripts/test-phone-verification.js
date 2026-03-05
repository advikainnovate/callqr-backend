/**
 * Test script for phone verification functionality
 * Run with: node scripts/test-phone-verification.js
 */

const axios = require('axios');

const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';
let authToken = '';
let testUserId = '';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testPhoneVerification() {
  try {
    log('\n🧪 Starting Phone Verification Tests\n', 'blue');

    // Step 1: Register or Login
    log('Step 1: Authenticating...', 'yellow');
    try {
      const registerResponse = await axios.post(`${BASE_URL}/api/auth/register`, {
        username: `testuser_${Date.now()}`,
        password: 'password123',
        phone: '+1234567890',
      });
      authToken = registerResponse.data.token;
      testUserId = registerResponse.data.user.id;
      log('✓ User registered successfully', 'green');
    } catch (error) {
      // If registration fails, try login
      const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
        username: 'testuser',
        password: 'password123',
      });
      authToken = loginResponse.data.token;
      testUserId = loginResponse.data.user.id;
      log('✓ User logged in successfully', 'green');
    }

    // Step 2: Check initial verification status
    log('\nStep 2: Checking initial verification status...', 'yellow');
    const statusResponse1 = await axios.get(
      `${BASE_URL}/api/auth/phone-verification-status`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );
    log(`✓ Status: ${JSON.stringify(statusResponse1.data.data, null, 2)}`, 'green');

    // Step 3: Send phone verification OTP
    log('\nStep 3: Sending phone verification OTP...', 'yellow');
    const sendOtpResponse = await axios.post(
      `${BASE_URL}/api/auth/send-phone-verification`,
      { phone: '+1234567890' },
      {
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );
    log(`✓ ${sendOtpResponse.data.message}`, 'green');
    log('📱 Check your console logs for the OTP code!', 'blue');

    // Step 4: Prompt for OTP (in real scenario, user would receive SMS)
    log('\nStep 4: Verifying OTP...', 'yellow');
    log('⚠️  In development mode, check the server console for the OTP', 'yellow');
    log('⚠️  For automated testing, you would need to extract OTP from logs', 'yellow');
    
    // Example verification (you'll need to replace with actual OTP)
    const testOtp = '123456'; // Replace with actual OTP from console
    log(`\nℹ️  To complete verification, run:`, 'blue');
    log(`curl -X POST ${BASE_URL}/api/auth/verify-phone \\`, 'blue');
    log(`  -H "Authorization: Bearer ${authToken}" \\`, 'blue');
    log(`  -H "Content-Type: application/json" \\`, 'blue');
    log(`  -d '{"otp": "YOUR_OTP_FROM_CONSOLE"}'`, 'blue');

    // Step 5: Test resend OTP
    log('\nStep 5: Testing resend OTP...', 'yellow');
    const resendResponse = await axios.post(
      `${BASE_URL}/api/auth/resend-phone-verification`,
      {},
      {
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );
    log(`✓ ${resendResponse.data.message}`, 'green');

    // Step 6: Check final status
    log('\nStep 6: Checking final verification status...', 'yellow');
    const statusResponse2 = await axios.get(
      `${BASE_URL}/api/auth/phone-verification-status`,
      {
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );
    log(`✓ Status: ${JSON.stringify(statusResponse2.data.data, null, 2)}`, 'green');

    log('\n✅ All tests completed successfully!', 'green');
    log('\n📝 Summary:', 'blue');
    log('  - User authentication: ✓', 'green');
    log('  - Send OTP: ✓', 'green');
    log('  - Resend OTP: ✓', 'green');
    log('  - Status check: ✓', 'green');
    log('  - OTP verification: Manual (check console for OTP)', 'yellow');

  } catch (error) {
    log('\n❌ Test failed:', 'red');
    if (error.response) {
      log(`Status: ${error.response.status}`, 'red');
      log(`Message: ${JSON.stringify(error.response.data, null, 2)}`, 'red');
    } else {
      log(error.message, 'red');
    }
    process.exit(1);
  }
}

// Run tests
testPhoneVerification();
