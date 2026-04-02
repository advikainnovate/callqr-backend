import { extractQRCodeToken } from '../src/utils/tokenUtils';

const testCases = [
  {
    name: 'Raw 64-char token',
    input: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    expected:
      'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  },
  {
    name: 'Full URL with token',
    input:
      'https://api.advikainnovate.cloud/api/qr-codes/resolve/abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    expected:
      'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  },
  {
    name: 'URL with query params',
    input:
      'https://call.veiloscan.com/call/abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890?ref=scanner',
    expected:
      'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  },
  {
    name: 'Invalid short string',
    input: 'short',
    expected: null,
  },
  {
    name: 'URL without token',
    input: 'https://google.com/search?q=qr',
    expected: null,
  },
  {
    name: 'Malformed URL',
    input: 'not-a-url',
    expected: null,
  },
  {
    name: 'Token in the middle of path',
    input:
      'https://domain.com/v1/abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890/details',
    expected:
      'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
  },
];

console.log('--- Token Extraction Test Results ---');
let passed = 0;

testCases.forEach((tc, i) => {
  const result = extractQRCodeToken(tc.input);
  const success = result === tc.expected;
  if (success) passed++;

  console.log(`[${success ? 'PASS' : 'FAIL'}] ${tc.name}`);
  console.log(`   Input: ${tc.input}`);
  console.log(`   Result: ${result}`);
  console.log(`   Expected: ${tc.expected}`);
});

console.log(`\nResults: ${passed}/${testCases.length} tests passed.`);

if (passed === testCases.length) {
  process.exit(0);
} else {
  process.exit(1);
}
