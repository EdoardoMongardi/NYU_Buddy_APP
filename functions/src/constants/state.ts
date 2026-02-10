/**
 * Canonical State Definitions - Single Source of Truth
 *
 * This module centralizes all status values and state sets used throughout
 * the NYU Buddy backend. All functions should import from this module rather
 * than defining inline arrays.
 *
 * See: docs/Canonical_State_Definitions.md for detailed documentation.
 */

// ============================================================================
// MATCH STATUS SETS
// ============================================================================

/**
 * ACTIVE_MATCH_STATUSES
 *
 * Match statuses that indicate a user is in an "active match" and must be:
 * - Excluded from discovery (suggestionGetCycle, suggestionGetTop1)
 * - Blocked from creating new offers (offerCreate)
 * - Blocked from accepting new offers (offerRespond)
 *
 * These are all non-terminal match statuses. A user in any of these states
 * is committed to an ongoing match.
 */
export const ACTIVE_MATCH_STATUSES = [
  'pending',
  'location_deciding',
  'place_confirmed',
  'heading_there',
  'arrived',
] as const;

/**
 * TERMINAL_MATCH_STATUSES
 *
 * Match statuses that indicate a match has reached a final state.
 * No further state transitions are allowed from these statuses.
 */
export const TERMINAL_MATCH_STATUSES = [
  'completed',
  'cancelled',
] as const;

// ============================================================================
// TYPE EXPORTS (for TypeScript inference)
// ============================================================================

export type ActiveMatchStatus = typeof ACTIVE_MATCH_STATUSES[number];
export type TerminalMatchStatus = typeof TERMINAL_MATCH_STATUSES[number];
export type MatchStatus = ActiveMatchStatus | TerminalMatchStatus;

// ============================================================================
// CONFIRMATION STATUS
// ============================================================================

/**
 * EXPIRED_PENDING_CONFIRMATION
 *
 * Intermediate status: match lifecycle is over (presences expired), but we
 * need user input ("Did you meet?") before determining the final status.
 * NOT in ACTIVE_MATCH_STATUSES (users can start new matches).
 * NOT in TERMINAL_MATCH_STATUSES (still awaiting resolution).
 * Resolves to 'completed' or 'cancelled' with an outcome field.
 */
export const EXPIRED_PENDING_CONFIRMATION = 'expired_pending_confirmation' as const;

// ============================================================================
// PRESENCE STATUS VALUES
// ============================================================================

export const PRESENCE_STATUS = {
  AVAILABLE: 'available',
  MATCHED: 'matched',
} as const;

// ============================================================================
// OFFER STATUS VALUES
// ============================================================================

export const OFFER_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
} as const;