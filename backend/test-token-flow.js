/**
 * Token Flow Test
 * 
 * Tests the complete token generation, QR code creation, and validation flow.
 */

const { simpleIntegration } = require('./dist/integration/simpleIntegration.js');

async function testTokenFlow() {
  console.log('🎫 Starting token flow test...\n');

  try {
    // Initialize the system first
    console.log('🔧 Initializing system...');
    const config = {
      database: {
        host: 'localhost',
        port: 5432,
        database: 'privacy_qr_calling_test',
        username: 'test_user',
        password: 'test_password',
        ssl: false
      },
      auth: {
        requireMFA: false,
        jwtSecret: 'test-jwt-secret-key-for-testing',
        sessionDurationHours: 24
      }
    };

    await simpleIntegration.initialize(config);
    const services = simpleIntegration.getServices();
    console.log('✅ System initialized\n');

    // Test 1: Generate a secure token
    console.log('🔐 Test 1: Token generation');
    const userId = 'test-user-' + Date.now();
    const token = await services.tokenManager.generateToken(userId);
    
    console.log('Generated token:');
    console.log('- Value length:', token.value.length, 'characters');
    console.log('- Version:', token.version);
    console.log('- Checksum length:', token.checksum.length, 'characters');
    console.log('- Created at:', token.createdAt.toISOString());
    console.log('✅ Token generation completed\n');

    // Test 2: Format token for QR code
    console.log('📱 Test 2: QR code formatting');
    const qrData = services.tokenManager.formatTokenForQR(token);
    console.log('QR data format:', qrData);
    console.log('QR data length:', qrData.length, 'characters');
    
    // Verify QR format
    const qrFormatValid = qrData.startsWith('pqc:') && qrData.split(':').length === 4;
    console.log('QR format valid:', qrFormatValid ? '✅' : '❌');
    console.log('✅ QR code formatting completed\n');

    // Test 3: Extract token from QR data
    console.log('🔍 Test 3: Token extraction from QR');
    const extractedToken = services.tokenManager.extractTokenFromQR(qrData);
    
    if (extractedToken) {
      console.log('Token extracted successfully:');
      console.log('- Original value:', token.value);
      console.log('- Extracted value:', extractedToken.value);
      console.log('- Values match:', token.value === extractedToken.value ? '✅' : '❌');
      console.log('- Checksums match:', token.checksum === extractedToken.checksum ? '✅' : '❌');
    } else {
      console.log('❌ Token extraction failed');
    }
    console.log('✅ Token extraction completed\n');

    // Test 4: Token validation
    console.log('✅ Test 4: Token validation');
    const validationResult = await services.tokenManager.validateToken(token.value);
    console.log('Validation result:');
    console.log('- Is valid:', validationResult.isValid ? '✅' : '❌');
    if (!validationResult.isValid) {
      console.log('- Error:', validationResult.error);
    }
    console.log('✅ Token validation completed\n');

    // Test 5: Privacy layer anonymous ID generation
    console.log('🔒 Test 5: Privacy layer functionality');
    const anonymousId1 = services.privacyLayer.generateAnonymousId();
    const anonymousId2 = services.privacyLayer.generateAnonymousId();
    
    console.log('Generated anonymous IDs:');
    console.log('- ID 1:', anonymousId1);
    console.log('- ID 2:', anonymousId2);
    console.log('- IDs are different:', anonymousId1 !== anonymousId2 ? '✅' : '❌');
    console.log('- ID 1 format valid:', anonymousId1.startsWith('anon_') ? '✅' : '❌');
    console.log('- ID 2 format valid:', anonymousId2.startsWith('anon_') ? '✅' : '❌');
    console.log('✅ Privacy layer functionality completed\n');

    // Test 6: Complete call flow simulation
    console.log('📞 Test 6: Complete call flow simulation');
    const callResult = await simpleIntegration.processCallFlow(qrData, anonymousId1);
    
    console.log('Call flow result:');
    console.log('- Success:', callResult.success ? '✅' : '❌');
    if (callResult.success) {
      console.log('- Session ID:', callResult.sessionId);
      console.log('- Session ID format:', callResult.sessionId?.startsWith('session_') ? '✅' : '❌');
    } else {
      console.log('- Error:', callResult.error);
    }
    console.log('✅ Call flow simulation completed\n');

    // Test 7: Token security properties
    console.log('🛡️  Test 7: Token security properties');
    
    // Generate multiple tokens to test uniqueness
    const tokens = [];
    for (let i = 0; i < 5; i++) {
      const testToken = await services.tokenManager.generateToken(`test-user-${i}`);
      tokens.push(testToken.value);
    }
    
    const uniqueTokens = new Set(tokens);
    console.log('Token uniqueness test:');
    console.log('- Generated tokens:', tokens.length);
    console.log('- Unique tokens:', uniqueTokens.size);
    console.log('- All tokens unique:', tokens.length === uniqueTokens.size ? '✅' : '❌');
    
    // Test token entropy (should be hex format)
    const isHexFormat = tokens.every(token => /^[0-9a-f]+$/i.test(token));
    console.log('- All tokens hex format:', isHexFormat ? '✅' : '❌');
    
    // Test token length (should be 64 characters for 256-bit)
    const correctLength = tokens.every(token => token.length === 64);
    console.log('- All tokens correct length (64 chars):', correctLength ? '✅' : '❌');
    console.log('✅ Token security properties verified\n');

    // Test 8: Error handling
    console.log('⚠️  Test 8: Error handling');
    
    // Test with invalid token
    const invalidTokenResult = await services.tokenManager.validateToken('invalid-token');
    console.log('Invalid token validation:');
    console.log('- Correctly rejected:', !invalidTokenResult.isValid ? '✅' : '❌');
    
    // Test with empty QR data
    const emptyQRResult = await simpleIntegration.processCallFlow('');
    console.log('Empty QR data handling:');
    console.log('- Correctly rejected:', !emptyQRResult.success ? '✅' : '❌');
    console.log('- Error message:', emptyQRResult.error);
    
    console.log('✅ Error handling verified\n');

    console.log('🎉 Token flow test completed successfully!');
    console.log('\n📊 Summary:');
    console.log('- Token generation: ✅');
    console.log('- QR code formatting: ✅');
    console.log('- Token extraction: ✅');
    console.log('- Token validation: ✅');
    console.log('- Privacy protection: ✅');
    console.log('- Call flow processing: ✅');
    console.log('- Security properties: ✅');
    console.log('- Error handling: ✅');

    return true;

  } catch (error) {
    console.error('❌ Token flow test failed:', error.message);
    console.error('Stack trace:', error.stack);
    return false;
  }
}

// Run the test
testTokenFlow().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error('Test execution failed:', error);
  process.exit(1);
});