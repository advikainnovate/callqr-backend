export interface NormalizedIdentity {
  id: string;
  type: 'user' | 'guest';
  socketId: string; // The room name used by Socket.io (e.g., "guest:abc" or "user-uuid")
}

/**
 * Normalizes a user ID string into a unified format.
 * Strips the "guest:" prefix for internal DB usage while keeping it for socket rooms.
 *
 * @param rawId The raw user ID from the socket (e.g., "guest:123" or "user-uuid")
 * @returns A NormalizedIdentity object or null if input is invalid
 */
export function normalizeUserId(
  rawId: string | undefined
): NormalizedIdentity | null {
  if (!rawId) return null;

  if (rawId.startsWith('guest:')) {
    const id = rawId.replace('guest:', '');
    return {
      id,
      type: 'guest',
      socketId: rawId,
    };
  }

  // Registered user — id and socketId are identical (the UUID)
  return {
    id: rawId,
    type: 'user',
    socketId: rawId,
  };
}

/**
 * Legacy alias for normalizeUserId.
 */
export const parseIdentity = normalizeUserId;
