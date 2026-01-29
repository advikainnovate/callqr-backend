/**
 * Security Components Demo
 * 
 * Demonstrates the usage of the core security and cryptographic components
 * for the privacy-preserving QR-based calling system.
 */

import { 
  TokenManager, 
  TokenManagerFactory, 
  InMemoryTokenStorage,
  UserId 
} from './index';

async function demonstrateSecurityComponents() {
  console.log('🔐 Privacy-Preserving QR-Based Calling System - Security Demo\n');

  // Initialize components
  const storage = new InMemoryTokenStorage();
  const tokenManager = TokenManagerFactory.create(storage);

  // Demo user
  const userId = 'demo-user-123' as UserId;

  console.log('1. 🎫 Generating secure token for user...');
  const token = await tokenManager.generateToken(userId);
  console.log(`   Token generated with ${token.value.length * 4} bits of entropy`);
  console.log(`   Token version: ${token.version}`);
  console.log(`   Checksum: ${token.checksum}`);

  console.log('\n2. 📱 Formatting token for QR code...');
  const qrData = tokenManager.formatTokenForQR(token);
  console.log(`   QR Data: ${qrData}`);

  console.log('\n3. 🔍 Extracting token from QR data...');
  const extractedToken = tokenManager.extractTokenFromQR(qrData);
  console.log(`   Extraction successful: ${extractedToken !== null}`);
  console.log(`   Values match: ${extractedToken?.value === token.value}`);

  console.log('\n4. ✅ Validating token...');
  const validationResult = await tokenManager.validateToken(qrData);
  console.log(`   Token is valid: ${validationResult.isValid}`);

  console.log('\n5. 🔗 Resolving token to user...');
  const resolvedUserId = await tokenManager.resolveTokenToUser(token);
  console.log(`   Resolved user ID: ${resolvedUserId}`);
  console.log(`   Matches original: ${resolvedUserId === userId}`);

  console.log('\n6. 📋 Getting user tokens...');
  const userTokens = await tokenManager.getUserTokens(userId);
  console.log(`   User has ${userTokens.length} valid token(s)`);

  console.log('\n7. ❌ Revoking token...');
  const revoked = await tokenManager.revokeToken(token);
  console.log(`   Token revoked: ${revoked}`);

  console.log('\n8. 🔍 Checking tokens after revocation...');
  const tokensAfterRevoke = await tokenManager.getUserTokens(userId);
  console.log(`   User has ${tokensAfterRevoke.length} valid token(s) remaining`);

  console.log('\n9. 🎫 Generating multiple tokens...');
  const token2 = await tokenManager.generateToken(userId);
  const token3 = await tokenManager.generateToken(userId);
  const multipleTokens = await tokenManager.getUserTokens(userId);
  console.log(`   User now has ${multipleTokens.length} valid token(s)`);

  console.log('\n10. 🧹 Cleaning up all user tokens...');
  const revokedCount = await tokenManager.revokeAllUserTokens(userId);
  console.log(`   Revoked ${revokedCount} token(s)`);

  const finalTokens = await tokenManager.getUserTokens(userId);
  console.log(`   User has ${finalTokens.length} valid token(s) remaining`);

  console.log('\n✨ Demo completed successfully!');
  console.log('\n🔒 Security Features Demonstrated:');
  console.log('   • 256-bit cryptographically secure token generation');
  console.log('   • SHA-256 hashing with salt for secure storage');
  console.log('   • Token format validation and integrity checking');
  console.log('   • QR code formatting and extraction');
  console.log('   • Token lifecycle management (generation, validation, revocation)');
  console.log('   • Privacy-preserving user resolution');
}

// Run demo if this file is executed directly
if (require.main === module) {
  demonstrateSecurityComponents().catch(console.error);
}

export { demonstrateSecurityComponents };