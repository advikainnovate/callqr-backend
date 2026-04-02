export interface NormalizedIdentity {
  id: string;
  type: 'user' | 'guest';
}

/**
 * Normalizes a user ID string into a unified format.
 * Strips the "guest:" prefix for anonymous callers.
 *
 * @param rawId The raw user ID from the socket (e.g., "guest:123" or "user-uuid")
 * @returns A NormalizedIdentity object or null if input is invalid
 */
export function normalizeUserId(
  rawId: string | undefined
): NormalizedIdentity | null {
  if (!rawId) return null;

  if (rawId.startsWith('guest:')) {
    return {
      id: rawId.replace('guest:', ''),
      type: 'guest',
    };
  }

  // Handle common case where pure UUID is provided
  return {
    id: rawId,
    type: 'user',
  };
}
