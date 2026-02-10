const jwt = require('jsonwebtoken');
require('dotenv').config();

// Get user ID from command line argument
const userId = process.argv[2];
const username = process.argv[3] || 'testuser';

if (!userId) {
  console.error('Usage: node scripts/generate-test-token.js <userId> [username]');
  console.error('Example: node scripts/generate-test-token.js 123e4567-e89b-12d3-a456-426614174000 testuser');
  process.exit(1);
}

const payload = {
  userId: userId,
  username: username
};

const secret = process.env.JWT_SECRET || 'supersecretjwtkey';
const expiresIn = process.env.JWT_ACCESS_TOKEN_EXPIRES_IN || '59m';

const token = jwt.sign(payload, secret, { expiresIn });

console.log('\n✅ JWT Token Generated Successfully!\n');
console.log('User ID:', userId);
console.log('Username:', username);
console.log('Expires In:', expiresIn);
console.log('\n📋 Token:\n');
console.log(token);
console.log('\n💡 Use this token in your API requests:');
console.log('Authorization: Bearer', token);
console.log('');
