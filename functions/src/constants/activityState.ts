/**
 * Activity System State Definitions - Single Source of Truth
 *
 * This module centralizes all status values and state sets used throughout
 * the Activity Companion system (v2.0). All activity-related functions
 * should import from this module rather than defining inline values.
 *
 * See: docs/history/New_Model_PRD.md for detailed documentation.
 */

// ============================================================================
// ACTIVITY POST STATUS
// ============================================================================

export const ACTIVITY_POST_STATUS = {
  OPEN: 'open',
  FILLED: 'filled',
  CLOSED: 'closed',
  EXPIRED: 'expired',
} as const;

export type ActivityPostStatus = typeof ACTIVITY_POST_STATUS[keyof typeof ACTIVITY_POST_STATUS];

export const ACTIVE_POST_STATUSES = [
  ACTIVITY_POST_STATUS.OPEN,
  ACTIVITY_POST_STATUS.FILLED,
] as const;

export const TERMINAL_POST_STATUSES = [
  ACTIVITY_POST_STATUS.CLOSED,
  ACTIVITY_POST_STATUS.EXPIRED,
] as const;

// ============================================================================
// CLOSE REASON
// ============================================================================

export const CLOSE_REASON = {
  CREATOR_CLOSED: 'creator_closed',
  CREATOR_DELETED: 'creator_deleted',
  EXPIRED: 'expired',
  SYSTEM: 'system',
} as const;

export type CloseReason = typeof CLOSE_REASON[keyof typeof CLOSE_REASON];

// ============================================================================
// JOIN REQUEST STATUS
// ============================================================================

export const JOIN_REQUEST_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  WITHDRAWN: 'withdrawn',
  EXPIRED: 'expired',
} as const;

export type JoinRequestStatus = typeof JOIN_REQUEST_STATUS[keyof typeof JOIN_REQUEST_STATUS];

export const TERMINAL_REQUEST_STATUSES = [
  JOIN_REQUEST_STATUS.DECLINED,
  JOIN_REQUEST_STATUS.WITHDRAWN,
  JOIN_REQUEST_STATUS.EXPIRED,
] as const;

// ============================================================================
// GROUP STATUS
// ============================================================================

export const GROUP_STATUS = {
  ACTIVE: 'active',
  DISSOLVED: 'dissolved',
} as const;

export type GroupStatus = typeof GROUP_STATUS[keyof typeof GROUP_STATUS];

// ============================================================================
// ACTIVITY CATEGORIES
// ============================================================================

export const ACTIVITY_CATEGORIES = [
  'coffee',
  'study',
  'food',
  'event',
  'explore',
  'sports',
  'other',
] as const;

export type ActivityCategory = typeof ACTIVITY_CATEGORIES[number];

// ============================================================================
// REPORT TYPES (Safety)
// ============================================================================

export const REPORT_TYPE = {
  HARASSMENT: 'harassment',
  SPAM: 'spam',
  INAPPROPRIATE_CONTENT: 'inappropriate_content',
  IMPERSONATION: 'impersonation',
  NO_SHOW: 'no_show',
  OTHER: 'other',
} as const;

export type ReportType = typeof REPORT_TYPE[keyof typeof REPORT_TYPE];

export const REPORT_CONTEXT = {
  ACTIVITY_POST: 'activity_post',
  JOIN_REQUEST: 'join_request',
  GROUP_CHAT: 'group_chat',
  MAP_STATUS: 'map_status',
  PROFILE: 'profile',
} as const;

export type ReportContext = typeof REPORT_CONTEXT[keyof typeof REPORT_CONTEXT];

export const REPORT_STATUS = {
  PENDING: 'pending',
  REVIEWED: 'reviewed',
  ACTION_TAKEN: 'action_taken',
  DISMISSED: 'dismissed',
} as const;

export type ReportStatus = typeof REPORT_STATUS[keyof typeof REPORT_STATUS];

// ============================================================================
// ACTIVITY SYSTEM LIMITS
// ============================================================================

export const ACTIVITY_LIMITS = {
  /** Max active (non-expired, non-closed) posts per user */
  MAX_ACTIVE_POSTS: 3,
  /** Max pending join requests per user across all posts */
  MAX_PENDING_REQUESTS: 10,
  /** Max edits per post */
  MAX_EDITS_PER_POST: 10,
  /** Max participants (excluding creator) */
  MAX_PARTICIPANTS: 4,
  /** Min participants (excluding creator) */
  MIN_PARTICIPANTS: 1,
  /** Post body max length */
  POST_BODY_MAX_LENGTH: 140,
  /** Location name max length */
  LOCATION_NAME_MAX_LENGTH: 60,
  /** Join request message max length */
  JOIN_MESSAGE_MAX_LENGTH: 80,
  /** Group chat message max length */
  CHAT_MESSAGE_MAX_LENGTH: 500,
  /** Map status text max length */
  MAP_STATUS_MAX_LENGTH: 30,
  /** Report description max length */
  REPORT_DESCRIPTION_MAX_LENGTH: 500,
  /** Max reports per user per day */
  MAX_REPORTS_PER_DAY: 5,
  /** Map status expiry in hours */
  MAP_STATUS_EXPIRY_HOURS: 2,
  /** Allowed post durations in hours */
  ALLOWED_DURATIONS_HOURS: [2, 4, 6, 12, 24, 48] as readonly number[],
  /** Feed page size */
  FEED_PAGE_SIZE: 20,
  /** NYC geofence bounds */
  NYC_LAT_MIN: 40.4,
  NYC_LAT_MAX: 41.0,
  NYC_LNG_MIN: -74.3,
  NYC_LNG_MAX: -73.7,
} as const;
