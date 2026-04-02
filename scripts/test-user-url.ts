import { extractQRCodeToken } from '../src/utils/tokenUtils';

const url =
  'https://api.advikainnovate.cloud/callqr-backend/api/qr-codes/image/7dde5a4a88358ee002db8ae8af2bdf7f9333b0c8c38796552920e59b6c8cfbca';
const extracted = extractQRCodeToken(url);

console.log('--- Test Result ---');
console.log(`Input URL: ${url}`);
console.log(`Extracted Token: ${extracted || 'FAILED'}`);

if (
  extracted ===
  '7dde5a4a88358ee002db8ae8af2bdf7f9333b0c8c38796552920e59b6c8cfbca'
) {
  console.log(
    '\n✅ Extraction Successful! The 64-char hex token was correctly identified.'
  );
} else {
  console.log('\n❌ Extraction Failed.');
}
