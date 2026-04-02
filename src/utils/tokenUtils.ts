/**
 * Utility to extract a 64-character hexadecimal token from various input formats.
 * Supports:
 * 1. Raw 64-char hex token
 * 2. Full URL containing a 64-char hex token anywhere in the path
 * 3. URL with query parameters
 *
 * @param input The raw input string from the scanner or client
 * @returns The 64-character hex token, or null if invalid
 */
export function extractQRCodeToken(input: string): string | null {
  if (!input) return null;

  // Case 1: already a raw token (64 hex chars)
  if (/^[a-fA-F0-9]{64}$/.test(input)) {
    return input;
  }

  // Case 2: full URL → extract token
  try {
    const url = new URL(input);

    // Split the pathname and search each part for a segment that looks like a token
    const parts = url.pathname.split('/');

    const tokenCandidate = parts.find(part => /^[a-fA-F0-9]{64}$/.test(part));

    return tokenCandidate || null;
  } catch (error) {
    // If not a valid URL either, it's just invalid input
    return null;
  }
}
