/**
 * Status transition validation utilities
 * Ensures state machines follow valid transition paths
 */

import { BadRequestError } from './ApiError';

// User status transitions
export const USER_STATUS_TRANSITIONS: Record<string, string[]> = {
  active: ['blocked', 'deleted'],
  blocked: ['active', 'deleted'],
  deleted: ['active'], // Can be recovered
};

// Call status transitions
export const CALL_STATUS_TRANSITIONS: Record<string, string[]> = {
  initiated: ['ringing', 'failed', 'ended'],
  ringing: ['connected', 'ended', 'failed'],
  connected: ['ended'],
  ended: [], // Terminal state
  failed: [], // Terminal state
};

// QR Code status transitions
export const QR_STATUS_TRANSITIONS: Record<string, string[]> = {
  unassigned: ['active', 'disabled'],
  active: ['disabled', 'revoked'],
  disabled: ['active', 'revoked'],
  revoked: [], // Terminal state
};

// Chat status transitions
export const CHAT_STATUS_TRANSITIONS: Record<string, string[]> = {
  active: ['ended', 'blocked'],
  ended: [], // Terminal state
  blocked: ['active'], // Can be unblocked
};

// Subscription status transitions
export const SUBSCRIPTION_STATUS_TRANSITIONS: Record<string, string[]> = {
  active: ['expired', 'canceled'],
  expired: ['active'], // Can be renewed
  canceled: ['active'], // Can be reactivated
};

/**
 * Validates if a status transition is allowed
 */
export function validateStatusTransition(
  currentStatus: string,
  newStatus: string,
  transitions: Record<string, string[]>,
  resourceType: string = 'Resource'
): void {
  if (currentStatus === newStatus) {
    return; // No transition needed
  }

  const allowedTransitions = transitions[currentStatus];
  
  if (!allowedTransitions) {
    throw new BadRequestError(
      `Invalid current status '${currentStatus}' for ${resourceType}`
    );
  }

  if (!allowedTransitions.includes(newStatus)) {
    throw new BadRequestError(
      `Cannot transition ${resourceType} from '${currentStatus}' to '${newStatus}'. ` +
      `Allowed transitions: ${allowedTransitions.join(', ') || 'none'}`
    );
  }
}

/**
 * Get allowed transitions for a given status
 */
export function getAllowedTransitions(
  currentStatus: string,
  transitions: Record<string, string[]>
): string[] {
  return transitions[currentStatus] || [];
}

/**
 * Check if a status is terminal (no further transitions allowed)
 */
export function isTerminalStatus(
  status: string,
  transitions: Record<string, string[]>
): boolean {
  const allowed = transitions[status];
  return allowed ? allowed.length === 0 : false;
}
