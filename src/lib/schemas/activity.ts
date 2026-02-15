import { z } from 'zod';

// ============================================================================
// ACTIVITY CATEGORIES (shared between frontend and referenced in backend)
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

export const CATEGORY_LABELS: Record<ActivityCategory, string> = {
  coffee: 'Coffee',
  study: 'Study',
  food: 'Food',
  event: 'Event',
  explore: 'Explore',
  sports: 'Sports',
  other: 'Other',
};

// ============================================================================
// ALLOWED DURATIONS
// ============================================================================

export const ALLOWED_DURATIONS_HOURS = [2, 4, 6, 12, 24, 48] as const;

export const DURATION_LABELS: Record<number, string> = {
  2: '2 hours',
  4: '4 hours',
  6: '6 hours',
  12: '12 hours',
  24: '1 day',
  48: '2 days',
};

// ============================================================================
// NYC GEOFENCE
// ============================================================================

const NYC_LAT_MIN = 40.4;
const NYC_LAT_MAX = 41.0;
const NYC_LNG_MIN = -74.3;
const NYC_LNG_MAX = -73.7;

// ============================================================================
// ACTIVITY POST SCHEMAS
// ============================================================================

export const activityPostCreateSchema = z.object({
  body: z
    .string()
    .min(1, 'Post body is required')
    .max(140, 'Post body must be at most 140 characters')
    .refine((s) => s.trim().length > 0, 'Post body cannot be only whitespace'),
  category: z.enum(ACTIVITY_CATEGORIES, {
    message: 'Please select a valid category',
  }),
  maxParticipants: z
    .number()
    .int('Must be a whole number')
    .min(1, 'At least 1 participant required')
    .max(4, 'Maximum 4 participants allowed'),
  expiresInHours: z
    .number()
    .refine(
      (v) => (ALLOWED_DURATIONS_HOURS as readonly number[]).includes(v),
      'Please select a valid duration'
    ),
  locationName: z
    .string()
    .max(60, 'Location name must be at most 60 characters')
    .optional()
    .nullable(),
  locationLat: z
    .number()
    .min(NYC_LAT_MIN, 'Location must be in the NYC area')
    .max(NYC_LAT_MAX, 'Location must be in the NYC area')
    .optional()
    .nullable(),
  locationLng: z
    .number()
    .min(NYC_LNG_MIN, 'Location must be in the NYC area')
    .max(NYC_LNG_MAX, 'Location must be in the NYC area')
    .optional()
    .nullable(),
}).refine(
  (data) => {
    // If one coordinate is provided, both must be provided
    const hasLat = data.locationLat != null;
    const hasLng = data.locationLng != null;
    return hasLat === hasLng;
  },
  { message: 'Both latitude and longitude must be provided together', path: ['locationLat'] }
);

export type ActivityPostCreateData = z.infer<typeof activityPostCreateSchema>;

export const activityPostUpdateSchema = z.object({
  postId: z.string().min(1, 'Post ID is required'),
  body: z
    .string()
    .min(1)
    .max(140, 'Post body must be at most 140 characters')
    .refine((s) => s.trim().length > 0, 'Post body cannot be only whitespace')
    .optional(),
  locationName: z
    .string()
    .max(60, 'Location name must be at most 60 characters')
    .optional()
    .nullable(),
  locationLat: z
    .number()
    .min(NYC_LAT_MIN)
    .max(NYC_LAT_MAX)
    .optional()
    .nullable(),
  locationLng: z
    .number()
    .min(NYC_LNG_MIN)
    .max(NYC_LNG_MAX)
    .optional()
    .nullable(),
  maxParticipants: z
    .number()
    .int()
    .min(1)
    .max(4)
    .optional(),
  expiresAt: z
    .string()
    .datetime()
    .optional(),
});

export type ActivityPostUpdateData = z.infer<typeof activityPostUpdateSchema>;

// ============================================================================
// JOIN REQUEST SCHEMAS
// ============================================================================

export const joinRequestSendSchema = z.object({
  postId: z.string().min(1, 'Post ID is required'),
  message: z
    .string()
    .max(80, 'Message must be at most 80 characters')
    .optional()
    .nullable(),
});

export type JoinRequestSendData = z.infer<typeof joinRequestSendSchema>;

export const joinRequestRespondSchema = z.object({
  postId: z.string().min(1, 'Post ID is required'),
  requesterUid: z.string().min(1, 'Requester ID is required'),
  action: z.enum(['accept', 'decline'], {
    message: 'Action must be accept or decline',
  }),
});

export type JoinRequestRespondData = z.infer<typeof joinRequestRespondSchema>;

// ============================================================================
// GROUP CHAT SCHEMA
// ============================================================================

export const groupSendMessageSchema = z.object({
  groupId: z.string().min(1, 'Group ID is required'),
  body: z
    .string()
    .min(1, 'Message is required')
    .max(500, 'Message must be at most 500 characters')
    .refine((s) => s.trim().length > 0, 'Message cannot be only whitespace'),
});

export type GroupSendMessageData = z.infer<typeof groupSendMessageSchema>;

// ============================================================================
// MAP STATUS SCHEMA
// ============================================================================

export const mapStatusSetSchema = z.object({
  statusText: z
    .string()
    .min(1, 'Status text is required')
    .max(30, 'Status text must be at most 30 characters')
    .refine((s) => s.trim().length > 0, 'Status text cannot be only whitespace'),
  lat: z
    .number()
    .min(NYC_LAT_MIN, 'Location must be in the NYC area')
    .max(NYC_LAT_MAX, 'Location must be in the NYC area'),
  lng: z
    .number()
    .min(NYC_LNG_MIN, 'Location must be in the NYC area')
    .max(NYC_LNG_MAX, 'Location must be in the NYC area'),
});

export type MapStatusSetData = z.infer<typeof mapStatusSetSchema>;

// ============================================================================
// REPORT SCHEMA
// ============================================================================

export const REPORT_TYPES = [
  'harassment',
  'spam',
  'inappropriate_content',
  'impersonation',
  'no_show',
  'other',
] as const;

export const REPORT_CONTEXTS = [
  'activity_post',
  'join_request',
  'group_chat',
  'map_status',
  'profile',
] as const;

export const reportSubmitSchema = z.object({
  reportedUid: z.string().min(1, 'Reported user ID is required'),
  reportType: z.enum(REPORT_TYPES, {
    message: 'Please select a valid report type',
  }),
  context: z.enum(REPORT_CONTEXTS, {
    message: 'Please select a valid context',
  }),
  contextId: z.string().min(1, 'Context ID is required'),
  description: z
    .string()
    .max(500, 'Description must be at most 500 characters')
    .optional()
    .nullable(),
});

export type ReportSubmitData = z.infer<typeof reportSubmitSchema>;

// ============================================================================
// ACTIVITY POST STATUS (for client-side use)
// ============================================================================

export const ACTIVITY_POST_STATUS = {
  OPEN: 'open',
  FILLED: 'filled',
  CLOSED: 'closed',
  EXPIRED: 'expired',
} as const;

export type ActivityPostStatus = typeof ACTIVITY_POST_STATUS[keyof typeof ACTIVITY_POST_STATUS];

// ============================================================================
// CLIENT-SIDE TYPES
// ============================================================================

export interface ActivityPost {
  postId: string;
  creatorUid: string;
  creatorDisplayName: string;
  creatorPhotoURL: string | null;
  body: string;
  category: ActivityCategory;
  imageUrl: string | null;
  maxParticipants: number;
  acceptedCount: number;
  locationName: string | null;
  locationLat: number | null;
  locationLng: number | null;
  status: ActivityPostStatus;
  closeReason: string | null;
  groupId: string | null;
  editCount: number;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface JoinRequest {
  requestId: string;
  postId: string;
  requesterUid: string;
  requesterDisplayName: string;
  requesterPhotoURL: string | null;
  message: string | null;
  status: string;
  respondedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ActivityGroup {
  groupId: string;
  postId: string;
  creatorUid: string;
  memberUids: string[];
  memberCount: number;
  status: string;
  dissolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface GroupChatMessage {
  id: string;
  senderUid: string;
  senderDisplayName: string;
  body: string;
  type: 'user' | 'system';
  createdAt: Date | null;
}

export interface MapStatusEntry {
  uid: string;
  statusText: string;
  lat: number;
  lng: number;
  displayName?: string;
  photoURL?: string | null;
  expiresAt: Date;
  createdAt: Date;
}
