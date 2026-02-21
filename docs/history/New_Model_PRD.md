D — NYU Buddy v2.0: Activity Companion Model

> **Document Type:** Product Requirements Document
> **Version:** 2.0
> **Date:** 2026-02-15
> **Status:** Proposed
> **Author:** Product Architecture
> **Supersedes:** PRD_ThemedMeetup.md (themed sessions concept is retired)
> **Preserves:** PRD_AsIs.md (real-time matching system remains intact as secondary feature)

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [Design Principles](#2-design-principles)
3. [Core Concepts & Terminology](#3-core-concepts--terminology)
4. [Activity Post System](#4-activity-post-system)
5. [Join Request System](#5-join-request-system)
6. [Group Formation Logic](#6-group-formation-logic)
7. [Expiration & Lifecycle](#7-expiration--lifecycle)
8. [Campus Map Presence Layer](#8-campus-map-presence-layer)
9. [Realtime Matching (Existing System) as Secondary Feature](#9-realtime-matching-existing-system-as-secondary-feature)
10. [Data Model Changes](#10-data-model-changes)
11. [Backend API Surface](#11-backend-api-surface)
12. [Reuse Map](#12-reuse-map)
13. [What Must Be Modified](#13-what-must-be-modified)
14. [What Should Be Removed](#14-what-should-be-removed)
15. [Architecture Impact Analysis](#15-architecture-impact-analysis)
16. [Cold Start Feasibility](#16-cold-start-feasibility)
17. [Does This Drift Into Content Platform?](#17-does-this-drift-into-content-platform)
18. [Metrics](#18-metrics)
19. [MVP Scope](#19-mvp-scope)
20. [Safety & Moderation](#20-safety--moderation)
21. [Push Notification Strategy](#21-push-notification-strategy)
22. [Onboarding & First-Time Experience](#22-onboarding--first-time-experience)

---

## 1. Product Vision

**Before (v1.0):**
NYU Buddy is a real-time campus proximity matching app that connects NYU students for spontaneous 1v1 meetups based on live presence, swipe discovery, and automated place resolution.

**After (v2.0):**
NYU Buddy is a lightweight campus activity companion app where students post short-lived activities they want to do soon, others request to join, and small groups form organically for real-world meetups — with an optional real-time 1v1 matching mode for instant spontaneous encounters.

**Strategic shift:**
The unit of interaction changes from **"I'm available, match me with someone"** to **"I'm doing X soon, who wants to come?"**

The existing real-time matching system is preserved wholesale as a secondary tab ("Instant Match"). It is not redesigned, not deprecated, and not merged. It coexists.

**One-line pitch:**
"Post what you want to do. Find someone to do it with. Go."

---

## 2. Design Principles

### 2.1 Action Over Content
Every interaction must point toward a real-world meetup. Posts are not content to be consumed — they are coordination artifacts that expire. There is no feed to scroll. There is no content to "engage with." There is only intent that resolves into action or expires into nothing.

### 2.2 Ephemerality as Feature
Activity posts have a hard maximum lifetime of 48 hours. Most will live for 2–6 hours. This is not a limitation — it is the product. Ephemerality prevents content accumulation, eliminates "dead feed" syndrome, and creates natural urgency without dark patterns.

### 2.3 Creator Control
The post creator is always the decision-maker. They choose who joins. They set the group size. They can close the post early. No algorithm overrides their judgment. No engagement mechanics pressure them. The creator's autonomy is absolute within the system's constraints.

### 2.4 No Algorithmic Curation
Posts are sorted by creation time (newest first). No recommendation engine. No "hot" or "trending." No personalized ranking. No engagement optimization. This is deliberate: algorithmic feeds create passive consumption. Chronological ordering preserves the tool's nature as an action coordinator.

### 2.5 Small Groups, Not Communities
Maximum group size is 2–5 people. This is a design constraint, not a temporary limit. The product facilitates micro-coordination between near-strangers, not community building. Communities form as a side effect of repeated real-world encounters — the product does not attempt to replace that organic process.

### 2.6 Campus-Grounded
All activity must reference physical campus reality. Posts are about places you can walk to, things you can do in the next few hours, activities that happen in the real world. The digital layer is as thin as possible.

### 2.7 System Coexistence
The existing real-time matching system and the new activity post system operate on independent state machines with independent data. They share the `users` collection for identity, `blocks` for safety, and `places` for location data. They do not share session state, lifecycle management, or matching logic.

---

## 3. Core Concepts & Terminology

| Term | Definition |
|------|-----------|
| **Activity Post** | A short-lived (≤48h) user-created object describing something the creator wants to do soon. Not a social media post. Not content. A coordination artifact. |
| **Creator** | The user who created an Activity Post. Has full control over participant selection. |
| **Join Request** | A request from another user to participate in an Activity Post. One per user per post. No public visibility. |
| **Participant** | A user whose Join Request has been accepted by the Creator. |
| **Activity Group** | The set of {Creator + Participants} for a given Activity Post. Maximum size: configurable 2–5 (creator-set). |
| **Group Chat** | An ephemeral chat room auto-created when the first participant is accepted. Lifecycle bound to the Activity Post. |
| **Post Lifecycle** | `draft → open → filled → expired → closed`. See §7 for full state machine. |
| **Instant Match** | The existing v1.0 real-time swipe-based 1v1 matching system. Preserved as secondary tab. No changes. |
| **Status Dot** | A lightweight campus map marker showing a user's current location and short text status. Passive presence — not actionable. |
| **Activity Category** | A fixed-vocabulary classification for Activity Posts (e.g., Coffee, Study, Food, Event). Used for filtering only — not matching. |

---

## 4. Activity Post System

### 4.1 Post Creation

**Who can create:** Any authenticated user with `profileCompleted: true` and `isVerified: true`.

**Rate limit:** Maximum 3 active (non-expired, non-closed) posts per user at any time.

**Post fields:**

| Field | Type | Constraints | Required |
|-------|------|-------------|----------|
| `body` | string | 1–140 characters. Plain text only. No markdown, no links, no mentions. | Yes |
| `category` | enum | One of: `coffee`, `study`, `food`, `event`, `explore`, `sports`, `other` | Yes |
| `imageUrl` | string | Optional. Single image. Max 2MB. JPEG/PNG/WebP. Stored in Firebase Storage at `activity-images/{postId}`. | No |
| `maxParticipants` | number | 1–4 (excluding creator). Creator sets this. Determines max group size of 2–5. Default: 2 (group of 3). | Yes |
| `expiresAt` | Timestamp | Creator selects duration: 2h, 4h, 6h, 12h, 24h, 48h. Computed as `createdAt + duration`. | Yes |
| `locationName` | string | Optional free-text location hint (e.g., "Bobst Library", "Washington Square Park"). Max 60 characters. | No |
| `locationLat` | number | Optional latitude. If provided, enables map pin. | No |
| `locationLng` | number | Optional longitude. If provided, enables map pin. | No |
| `locationGeohash` | string | Computed from lat/lng if provided. For proximity queries. | No (auto) |

**What is NOT included:**
- No title field (the body IS the post)
- No tags / hashtags
- No @mentions
- No link previews
- No polls
- No rich text
- No multiple images
- No video
- No scheduled start time (the post itself is the signal that "now-ish" is the time)

**Validation rules:**
- `body` must contain at least one non-whitespace character
- `body` is stripped of leading/trailing whitespace
- `category` must be from the fixed enum
- `maxParticipants` must be integer in range [1, 4]
- If `locationLat` is provided, `locationLng` must also be provided (and vice versa)
- If lat/lng provided, must pass NYC geofence check: lat ∈ [40.4, 41.0], lng ∈ [-74.3, -73.7]
- `imageUrl` is set server-side after upload validation (client cannot set directly)

### 4.2 Post Visibility

**Audience:** All authenticated, verified users. No segmentation. No targeting.

**Ordering:** Strictly reverse-chronological (`createdAt` descending). No ranking. No boosting. No personalization.

**Filtering (client-side only):**
- By `category` (multi-select)
- By proximity (if user shares location: within 1km, 2km, 5km)
- By time horizon (shows posts expiring within: 2h, 6h, 12h, 24h, any). This helps users find activities happening *soon* without scrolling through posts that expire in 48 hours.
- By campus zone (future/post-MVP): location-based clusters on the map view (e.g., "Washington Square area", "Brooklyn campus", "Tandon"). Requires defining named geofence zones with bounding boxes. See §8 for map layer.

**Filtering is additive, not subtractive.** Default view shows all active posts. Filters narrow the view. There is no "For You" page.

**Activity Reminders (Post-MVP decision):**
Activity reminders (push notification to accepted participants as expiration approaches) are **deferred to post-MVP**. Rationale:
- MVP posts are short-lived (mostly 2–6h); a reminder adds complexity with marginal value
- Group chat serves as the coordination layer — participants can message each other
- If post-MVP data shows groups forming but no-showing, reminders become the first mitigation lever
- If implemented, reminders would fire at `expiresAt - 30 minutes` for posts with ≥2 group members and active group chat

**Pagination:** Cursor-based, 20 posts per page, keyed on `createdAt`.

### 4.3 Post Display

Each post displays:
- Creator's `displayName` and `photoURL`
- `body` text
- `category` badge
- `locationName` (if set)
- Time since creation (relative: "2h ago", "just now")
- Remaining participant slots: "{accepted}/{maxParticipants} joined"
- `imageUrl` thumbnail (if present, small — not hero image)
- Creator's `reliabilityScore` as a visual indicator (green ≥0.8, yellow ≥0.5, red <0.5)

**What is NOT displayed:**
- Join request count (no public demand signal)
- View count
- Like count
- Comment count
- Share count
- Any engagement metric

### 4.4 Post Editing

**Allowed edits (while post status is `open`):**
- `body` text
- `locationName`, `locationLat`, `locationLng`
- `maxParticipants` (can only increase, not decrease below current accepted count)
- `expiresAt` (can extend, not shorten below current time)

**Not editable:**
- `category` (immutable after creation)
- `imageUrl` (immutable after creation — delete and recreate if wrong)

**Edit audit:** Each edit increments `editCount` and updates `updatedAt`. Maximum 10 edits per post (prevent abuse).

### 4.5 Post Deletion

Creator can delete their post at any time. Deletion is soft: sets `status: 'closed'` with `closeReason: 'creator_deleted'`. Post disappears from feeds. Group chat remains accessible for 1 hour after deletion (grace period for coordination), then is archived.

---

## 5. Join Request System

### 5.1 Sending a Join Request

**Who can send:** Any authenticated, verified user who is not:
- The post creator
- Blocked by the creator (symmetric: `blocks/{creatorUid}/blocked/{requesterUid}` or `blocks/{requesterUid}/blocked/{creatorUid}`)
- Already has a pending or accepted request on this post
- The post is in `filled` or `closed` or `expired` status

**Request fields:**

| Field | Type | Constraints | Required |
|-------|------|-------------|----------|
| `postId` | string | Must reference an active post. | Yes |
| `requesterUid` | string | Auth-derived. Cannot be spoofed. | Yes (auto) |
| `message` | string | Optional short note. Max 80 characters. | No |
| `status` | enum | Initial: `pending`. | Yes (auto) |
| `createdAt` | Timestamp | Server timestamp. | Yes (auto) |

**Rate limit:** A user can have at most 10 pending join requests across all posts at any time. This prevents spamming.

**Idempotency:** One request per user per post. Duplicate sends return the existing request. Enforced by document ID: `joinRequests/{postId}_{requesterUid}`.

### 5.2 Join Request Visibility

**Visible to:**
- The **Creator** sees all pending requests for their posts
- The **Requester** sees the status of their own request

**Not visible to:**
- Other requesters (they cannot see how many people requested)
- Any third party

### 5.3 Join Request Actions

**Creator actions:**
- **Accept:** Changes request status to `accepted`. Adds requester to the Activity Group. If this fills the group, post transitions to `filled`.
- **Decline:** Changes request status to `declined`. No cooldown. No notification beyond the status change. Requester cannot re-request for this post.

**Requester actions:**
- **Withdraw:** Changes request status to `withdrawn`. Available while status is `pending`. Cannot withdraw after acceptance.

**System actions:**
- **Expire:** When the parent Activity Post expires or closes, all pending requests transition to `expired`.

### 5.4 Join Request State Machine

```
                ┌──────────┐
                │          │
    send ──────►│ pending  │◄──── (initial)
                │          │
                └────┬─────┘
                     │
          ┌──────────┼──────────┐
          │          │          │
          ▼          ▼          ▼
    ┌──────────┐ ┌──────────┐ ┌──────────┐
    │ accepted │ │ declined │ │ withdrawn│
    └──────────┘ └──────────┘ └──────────┘
          │          │          │
          │          ▼          ▼
          │      (terminal) (terminal)
          │
          ▼
    ┌──────────┐
    │  active  │──── (in group chat)
    └──────────┘
          │
          ▼
    ┌──────────┐
    │  closed  │──── (post expired/closed)
    └──────────┘
```

All `pending` requests also transition to `expired` (terminal) when the parent post leaves `open` status for any reason.

---

## 6. Group Formation Logic

### 6.1 Group Creation Trigger

A group is formed when the first Join Request is accepted. At that point:
1. A `groups/{groupId}` document is created
2. A `groupChats/{groupId}` subcollection is initialized
3. Both creator and accepted participant are added to the group
4. Push notification sent to the accepted participant

### 6.2 Group Growth

Each subsequent acceptance:
1. Adds the participant to the `groups/{groupId}` document's `memberUids` array
2. Sends a system message to the group chat: "{displayName} joined"
3. Push notification to the new participant
4. If `memberUids.length == maxParticipants + 1` (creator + max), post transitions to `filled`

### 6.3 Group Constraints

| Constraint | Value | Rationale |
|-----------|-------|-----------|
| Min group size | 2 (creator + 1) | Minimum viable meetup |
| Max group size | 5 (creator + 4) | Beyond 5, coordination cost exceeds benefit for spontaneous meetups |
| Max participants field | 1–4 | Set by creator at post creation |
| Creator removal | Not possible | Creator cannot be removed from their own group |
| Participant leave | Allowed | Participant can leave group at any time. `memberUids` shrinks. Post may re-open if was `filled`. |
| Creator kick | Allowed | Creator can remove a participant. Same effect as participant leave. |

### 6.4 Group Chat

**Lifecycle:** Created with group. Archived when post expires/closes.

**Features:**
- Text messages only (reuse chat infra pattern from `matchSendMessage`)
- System messages for join/leave events
- No reactions, no threads, no media sharing
- Messages stored in `groupChats/{groupId}/messages/{messageId}`
- Creator can send messages. Participants can send messages. No role-based restrictions on chat.

**Message schema:**

| Field | Type | Description |
|-------|------|-------------|
| `senderUid` | string | Author UID. `system` for system messages. |
| `body` | string | Message text. Max 500 characters. |
| `type` | enum | `user` or `system` |
| `createdAt` | Timestamp | Server timestamp |

**Read receipts:** None. Deliberately omitted — this is coordination, not a messaging platform.

**Typing indicators:** None. Same rationale.

### 6.5 Group Dissolution

A group dissolves when:
1. The Activity Post expires (`expiresAt` reached)
2. The Creator closes the post manually
3. All participants leave (creator remains alone — post reverts to `open`)

On dissolution:
- Group chat archived (messages retained for 7 days, then purged)
- Group document marked `status: 'dissolved'`
- No reliability score impact (see §15 for analysis)

---

## 7. Expiration & Lifecycle

### 7.1 Activity Post State Machine

```
                  ┌──────────┐
   create ───────►│  open     │◄──── participant leaves (if was filled)
                  └────┬──┬──┘
                       │  │
          ┌────────────┘  └──────────────┐
          │                              │
          ▼                              ▼
    ┌──────────┐                   ┌──────────┐
    │  filled  │                   │  closed   │◄─── creator closes / deletes
    └────┬─────┘                   └──────────┘
         │                              ▲
         │    expiresAt reached          │
         └──────────────┐               │
                        │               │
                        ▼               │
                  ┌──────────┐          │
                  │ expired  │──────────┘ (also reachable from open)
                  └──────────┘
```

**State definitions:**

| State | Meaning | Allowed transitions |
|-------|---------|-------------------|
| `open` | Post is visible. Join requests accepted. Group may or may not exist yet. | → `filled`, → `closed`, → `expired` |
| `filled` | All participant slots taken. Post visible but not joinable. New requests rejected. | → `open` (if participant leaves), → `closed`, → `expired` |
| `closed` | Creator manually closed. Terminal except for chat grace period. | (terminal) |
| `expired` | `expiresAt` reached. Terminal. | (terminal) |

**Transition rules:**

| Trigger | From | To | Side effects |
|---------|------|----|-------------|
| Creator creates post | — | `open` | Document created |
| Creator accepts request, group full | `open` | `filled` | Post no longer accepts join requests |
| Participant leaves filled group | `filled` | `open` | Post re-accepts join requests |
| Creator closes post | `open` or `filled` | `closed` | All pending requests → `expired`. Chat grace period starts. |
| `expiresAt` ≤ `now` | `open` or `filled` | `expired` | All pending requests → `expired`. Chat archived. Group dissolved. |
| Creator deletes | `open` or `filled` | `closed` | `closeReason: 'creator_deleted'`. Same as close. |

### 7.2 Edge Case: Filled → Open Transitions (Participant Cancellations)

When a participant **leaves** a `filled` group (voluntarily or via creator kick), the post transitions back to `open`. This creates several edge cases that must be handled explicitly.

**Scenario:** Post has `maxParticipants: 3`. Three participants are accepted. Post is `filled`. Participant B leaves.

**Required behavior:**

| Step | System Action |
|------|--------------|
| 1. Participant leaves group | `groups/{groupId}.memberUids` removes their UID. `memberCount` decremented. `acceptedCount` on post decremented. |
| 2. Post status transitions | `filled` → `open`. Post becomes visible in feed as joinable again. |
| 3. Pending requests re-evaluation | If any `pending` join requests exist for this post (submitted before it was filled), they remain `pending` and become actionable again. Creator can now accept from this queue. |
| 4. FIFO ordering | Pending requests are presented to the creator in **FIFO order** (`createdAt` ascending). The earliest pending request is shown first. Creator is not required to accept in order — they retain full selection control — but the UI defaults to FIFO presentation. |
| 5. Notification to creator | Creator receives a push notification: "{displayName} left your activity. 1 spot reopened." If pending requests exist, append: "You have {n} pending requests." |
| 6. Notification to pending requesters | **No automatic notification** to pending requesters on slot reopen. Rationale: the requester already submitted their request and will see the result when the creator acts. Sending "a slot opened!" creates false urgency and notification fatigue. |
| 7. System message in group chat | "{displayName} left the group" system message posted to group chat. |

**Edge case within edge case — all participants leave:**
If all accepted participants leave and only the creator remains:
- Post reverts to `open`
- Group remains `active` (creator is still a member) but chat becomes effectively solo
- Post re-enters the feed as fully open with 0/N joined
- If the creator doesn't want to continue, they can close the post manually

**Edge case — participant leaves after post expired:**
If the post is already `expired` or `closed`, participant departure does NOT re-open it. The post remains terminal. The group simply shrinks.

**Concurrency guard:**
The `filled → open` transition and the subsequent accept of a pending request must be atomic (Firestore transaction) to prevent race conditions where two participants leave simultaneously and the post over-accepts.

---

### 7.3 Expiration Enforcement

**Scheduled function:** `activityPostCleanupExpired`
- **Frequency:** Every 5 minutes (matches existing `presenceCleanupExpired` cadence)
- **Logic:** Query all posts where `status` ∈ [`open`, `filled`] AND `expiresAt` ≤ `now`
- **Actions per expired post:**
  1. Set `status: 'expired'`
  2. Batch-update all pending `joinRequests` for this post to `status: 'expired'`
  3. Set `groups/{groupId}.status = 'dissolved'` if group exists
  4. Send push notification to all group members: "Your activity has ended"

### 7.4 Retention & Cleanup

| Object | Retention | Cleanup method |
|--------|-----------|---------------|
| Activity Post document | 30 days after expiration/close | Scheduled purge function |
| Join Request documents | 30 days after terminal state | Scheduled purge function |
| Group document | 30 days after dissolution | Scheduled purge function |
| Group Chat messages | 7 days after group dissolution | Scheduled purge function |
| Activity images | 30 days after post expiration | Storage lifecycle rule or scheduled purge |

---

## 8. Campus Map Presence Layer

### 8.1 Status Dots

**Purpose:** Provide ambient awareness of campus activity without enabling direct action. The map answers "Is anyone around?" — not "Who should I meet?"

**Implementation:**

Each user can optionally set a **map status**:

| Field | Type | Constraints |
|-------|------|-------------|
| `statusText` | string | Max 30 characters. Free text. (e.g., "studying at Bobst", "grabbing coffee") |
| `lat` | number | Current location latitude |
| `lng` | number | Current location longitude |
| `geohash` | string | Computed from lat/lng |
| `expiresAt` | Timestamp | Auto-expires after 2 hours. Non-renewable (must re-set). |
| `updatedAt` | Timestamp | Last update time |

**Display:** Anonymous colored dots on a campus map. Dot density shows activity zones. Tapping a dot reveals `statusText` and `displayName` only — no profile card, no action buttons.

### 8.2 Should Map Dots Be Invite-Triggerable?

**Decision: No.** Map dots should NOT be directly invite-triggerable.

**Justification:**

1. **Anti-surveillance.** If tapping a dot lets you send a request, users will treat the map as a hunting ground. This creates social pressure to NOT share location — the opposite of what we want.

2. **Consent asymmetry.** Setting a status dot is a low-commitment action ("I'm at Bobst"). Receiving a direct invite from a stranger because of that dot is a high-commitment interruption. The consent levels don't match.

3. **System already provides the right path.** If you see dots clustered at a coffee shop and want company, the correct action is: create an Activity Post mentioning that location. This preserves creator control (Principle 2.3) and keeps the map as ambient information.

4. **Prevents real-time matching duplication.** The Instant Match tab already handles "I'm here, find me someone now." Map-triggered invites would create a third, redundant matching pathway.

**What the map DOES enable:**
- Ambient awareness: "There are 12 people near the library right now"
- Activity post inspiration: "I see people near Stumptown — let me post a coffee activity"
- Campus vitality signal: "The campus is alive" (reduces cold-start perception)

### 8.3 Map Dot Lifecycle

- Created when user explicitly sets a status (not automatic)
- Updated if user changes `statusText` or location
- Expires after 2 hours (hard limit)
- Deleted when user explicitly clears status
- Not affected by Activity Post creation or Instant Match sessions
- Independent of all other systems

### 8.4 Map Dot Density Privacy

When fewer than 3 dots exist in a geohash cell, individual dots are not shown. Instead, the area shows a faint "some activity" indicator. This prevents identification of individuals in low-density areas.

---

## 9. Realtime Matching (Existing System) as Secondary Feature

### 9.1 Coexistence Model

The existing real-time matching system (presence → swipe → offer → match → place decision → meetup → feedback) is preserved **exactly as-is**. No code changes. No data model changes. No state machine changes.

**Tab structure:**

| Tab | Name | Position | Content |
|-----|------|----------|---------|
| Primary | "Activities" | Left/Default | Activity Post feed + creation |
| Secondary | "Instant Match" | Right | Existing discovery + invites system |

The "Activities" tab is the landing screen. "Instant Match" is accessible via tab navigation.

### 9.2 What Does NOT Change

The following are explicitly preserved without modification:

- `presence/{uid}` collection and lifecycle
- `offers/{offerId}` collection and lifecycle
- `matches/{matchId}` collection and lifecycle
- `suggestions/{fromUid}_{toUid}` collection
- `sessionHistory/{uid}/sessions/{sessionId}` subcollection
- `feedback/{matchId}_{uid}` collection
- All 28 existing Cloud Functions
- All existing scheduled cleanup functions
- Cycle-based discovery algorithm (`suggestionGetCycle`)
- Offer creation/response/cancellation logic
- Match creation (atomic), place resolution, status progression
- Reliability score calculation
- All existing Firestore security rules for these collections
- All existing Firestore indexes for these collections

### 9.3 Shared Resources

| Resource | Shared? | Notes |
|----------|---------|-------|
| `users/{uid}` | Yes | Identity, profile, reliability score — read by both systems |
| `blocks/{uid}/blocked` | Yes | Safety — enforced in both systems |
| `places/{placeId}` | Yes | Location data — used by Instant Match place resolution and Activity Post location suggestions |
| `presence/{uid}` | No | Exclusive to Instant Match. Activity Posts do not interact with presence. |
| `matches/{matchId}` | No | Exclusive to Instant Match. Activity groups are a separate concept. |
| Push notification infra | Yes | Shared FCM token management. Different notification types. |

### 9.4 Cross-System Constraints

A user CAN simultaneously:
- Have an active Activity Post AND be in an Instant Match session
- Have pending join requests AND pending offers
- Be in a group chat AND a match chat

A user CANNOT:
- Use the same post/match state for both systems (they are fully independent)

This is by design. The systems serve different intents: "I want to do X, who's in?" vs "I'm free right now, surprise me."

---

## 10. Data Model Changes

### 10.1 New Collections

#### `activityPosts/{postId}`

| Field | Type | Description |
|-------|------|-------------|
| `postId` | string | Auto-generated document ID |
| `creatorUid` | string | UID of the creator. FK → `users/{uid}` |
| `creatorDisplayName` | string | Denormalized from `users` at creation time |
| `creatorPhotoURL` | string \| null | Denormalized from `users` at creation time |
| `body` | string | Post text. 1–140 chars. |
| `category` | string | Enum: `coffee`, `study`, `food`, `event`, `explore`, `sports`, `other` |
| `imageUrl` | string \| null | Firebase Storage URL if image uploaded |
| `maxParticipants` | number | 1–4. Does not include creator. |
| `acceptedCount` | number | Current number of accepted participants. Denormalized counter. |
| `locationName` | string \| null | Free-text location hint. Max 60 chars. |
| `locationLat` | number \| null | Latitude (optional) |
| `locationLng` | number \| null | Longitude (optional) |
| `locationGeohash` | string \| null | Geohash for proximity queries |
| `status` | string | Enum: `open`, `filled`, `closed`, `expired` |
| `closeReason` | string \| null | `creator_closed`, `creator_deleted`, `expired`, `system` |
| `groupId` | string \| null | FK → `groups/{groupId}`. Set when first participant accepted. |
| `editCount` | number | Number of edits. Max 10. Default 0. |
| `expiresAt` | Timestamp | Hard expiration time |
| `createdAt` | Timestamp | Server timestamp |
| `updatedAt` | Timestamp | Server timestamp |

**Document ID:** Auto-generated (`doc().id`).

**Indexes required:**
- `status` ASC, `createdAt` DESC (feed query)
- `status` ASC, `expiresAt` ASC (expiration cleanup)
- `creatorUid` ASC, `status` ASC (my posts query)
- `status` ASC, `category` ASC, `createdAt` DESC (category filter)
- `status` ASC, `locationGeohash` ASC, `createdAt` DESC (proximity filter)

#### `joinRequests/{postId}_{requesterUid}`

| Field | Type | Description |
|-------|------|-------------|
| `postId` | string | FK → `activityPosts/{postId}` |
| `requesterUid` | string | FK → `users/{uid}` |
| `requesterDisplayName` | string | Denormalized |
| `requesterPhotoURL` | string \| null | Denormalized |
| `message` | string \| null | Optional note. Max 80 chars. |
| `status` | string | Enum: `pending`, `accepted`, `declined`, `withdrawn`, `expired` |
| `respondedAt` | Timestamp \| null | When creator accepted/declined |
| `createdAt` | Timestamp | Server timestamp |
| `updatedAt` | Timestamp | Server timestamp |

**Document ID:** Composite `{postId}_{requesterUid}` — enforces one request per user per post.

**Indexes required:**
- `postId` ASC, `status` ASC, `createdAt` ASC (creator's inbox for a specific post)
- `requesterUid` ASC, `status` ASC (my pending requests)
- `postId` ASC, `status` ASC (batch expiration)

#### `groups/{groupId}`

| Field | Type | Description |
|-------|------|-------------|
| `groupId` | string | Auto-generated document ID |
| `postId` | string | FK → `activityPosts/{postId}` |
| `creatorUid` | string | FK → `users/{uid}` |
| `memberUids` | string[] | Array of all member UIDs (creator + accepted participants) |
| `memberCount` | number | Denormalized count of `memberUids`. |
| `status` | string | Enum: `active`, `dissolved` |
| `dissolvedAt` | Timestamp \| null | When group was dissolved |
| `createdAt` | Timestamp | Server timestamp |
| `updatedAt` | Timestamp | Server timestamp |

**Document ID:** Auto-generated.

#### `groupChats/{groupId}/messages/{messageId}`

| Field | Type | Description |
|-------|------|-------------|
| `messageId` | string | Auto-generated |
| `senderUid` | string | Author UID, or `system` for system messages |
| `senderDisplayName` | string | Denormalized |
| `body` | string | Message text. Max 500 chars. |
| `type` | string | Enum: `user`, `system` |
| `createdAt` | Timestamp | Server timestamp |

#### `mapStatus/{uid}`

| Field | Type | Description |
|-------|------|-------------|
| `uid` | string | FK → `users/{uid}` |
| `statusText` | string | Max 30 chars |
| `lat` | number | Latitude |
| `lng` | number | Longitude |
| `geohash` | string | For proximity queries |
| `expiresAt` | Timestamp | `createdAt` + 2 hours |
| `createdAt` | Timestamp | Server timestamp |
| `updatedAt` | Timestamp | Server timestamp |

**Document ID:** `{uid}` — one status per user.

#### `activityReports/{reportId}`

| Field | Type | Description |
|-------|------|-------------|
| `reportId` | string | Auto-generated document ID |
| `reporterUid` | string | FK → `users/{uid}`. Who filed the report. |
| `reportedUid` | string | FK → `users/{uid}`. Who is being reported. |
| `reportType` | string | Enum: `harassment`, `spam`, `inappropriate_content`, `impersonation`, `no_show`, `other` |
| `context` | string | Enum: `activity_post`, `join_request`, `group_chat`, `map_status`, `profile` |
| `contextId` | string | Document ID of the reported object |
| `description` | string \| null | Free-text detail. Max 500 chars. |
| `status` | string | Enum: `pending`, `reviewed`, `action_taken`, `dismissed` |
| `reviewedBy` | string \| null | Admin UID who reviewed (post-MVP) |
| `reviewedAt` | Timestamp \| null | When reviewed |
| `actionTaken` | string \| null | Description of action taken |
| `createdAt` | Timestamp | Server timestamp |

**Document ID:** Auto-generated.

**Indexes required:**
- `reportedUid` ASC, `createdAt` DESC (reports against a specific user)
- `status` ASC, `createdAt` ASC (pending reports queue)
- `reporterUid` ASC, `createdAt` DESC (rate limit enforcement)

See §20 for full Safety & Moderation rules.

### 10.2 Modified Collections

#### `users/{uid}` — New Fields

| Field | Type | Description |
|-------|------|-------------|
| `activityStats` | object | `{ postsCreated: number, postsJoined: number, requestsSent: number, requestsAccepted: number }` |
| `preferredCategories` | string[] | Activity categories selected during onboarding. Max 3. Empty if skipped. See §22. |
| `onboardingCompleted` | boolean | `true` after completing or skipping onboarding flow. See §22. |
| `firstPostCreatedAt` | Timestamp \| null | Set when user creates their first Activity Post. Growth metric. |
| `firstJoinRequestAt` | Timestamp \| null | Set when user sends their first join request. Growth metric. |

No existing fields are modified or removed.

### 10.3 Unchanged Collections

All existing collections remain exactly as documented in `DataModel_AsIs.md`:
- `presence/{uid}` — no changes
- `offers/{offerId}` — no changes
- `matches/{matchId}` — no changes
- `places/{placeId}` — no changes
- `feedback/{matchId}_{uid}` — no changes
- `reports/{matchId}_{uid}` — no changes
- `blocks/{uid}/blocked/{blockedUid}` — no changes
- `suggestions/{fromUid}_{toUid}` — no changes
- `sessionHistory/{uid}/sessions/{sessionId}` — no changes

---

## 11. Backend API Surface

### 11.1 New Cloud Functions (Activity System)

#### Post Management

| Function | Type | Input | Output | Description |
|----------|------|-------|--------|-------------|
| `activityPostCreate` | callable | `{ body, category, maxParticipants, expiresInHours, locationName?, locationLat?, locationLng?, imageUrl? }` | `{ postId, status }` | Create a new Activity Post. Validates constraints. Computes `expiresAt`. |
| `activityPostUpdate` | callable | `{ postId, body?, locationName?, locationLat?, locationLng?, maxParticipants?, expiresAt? }` | `{ success }` | Edit an active post. Validates edit constraints. Increments `editCount`. |
| `activityPostClose` | callable | `{ postId, reason? }` | `{ success }` | Creator closes post. Transitions to `closed`. Expires pending requests. |
| `activityPostGetFeed` | callable | `{ cursor?, category?, lat?, lng?, radiusKm? }` | `{ posts[], nextCursor }` | Paginated feed of active posts. Reverse-chronological. |
| `activityPostGetMine` | callable | `{ status? }` | `{ posts[] }` | Get creator's own posts. Optionally filtered by status. |
| `activityPostGetById` | callable | `{ postId }` | `{ post, joinRequests?, group? }` | Get full post detail. If caller is creator, includes join requests. If caller is member, includes group. |

#### Join Request Management

| Function | Type | Input | Output | Description |
|----------|------|-------|--------|-------------|
| `joinRequestSend` | callable | `{ postId, message? }` | `{ requestId, status }` | Send join request. Validates constraints (not blocked, post open, rate limit). |
| `joinRequestWithdraw` | callable | `{ postId }` | `{ success }` | Withdraw pending request. Only if status is `pending`. |
| `joinRequestRespond` | callable | `{ postId, requesterUid, action }` | `{ success, groupId? }` | Creator accepts or declines. `action` ∈ [`accept`, `decline`]. On first accept, creates group. |
| `joinRequestGetMine` | callable | `{ status? }` | `{ requests[] }` | Get user's outgoing requests across all posts. |

#### Group Management

| Function | Type | Input | Output | Description |
|----------|------|-------|--------|-------------|
| `groupLeave` | callable | `{ groupId }` | `{ success }` | Participant leaves group. Updates `memberUids`. May re-open post. |
| `groupKick` | callable | `{ groupId, targetUid }` | `{ success }` | Creator removes participant. Same effect as leave. |
| `groupSendMessage` | callable | `{ groupId, body }` | `{ messageId }` | Send message to group chat. Validates membership. |
| `groupGetMessages` | callable | `{ groupId, cursor?, limit? }` | `{ messages[], nextCursor }` | Paginated chat history. |

#### Map Status

| Function | Type | Input | Output | Description |
|----------|------|-------|--------|-------------|
| `mapStatusSet` | callable | `{ statusText, lat, lng }` | `{ success }` | Set or update map status. Computes geohash. Sets 2h expiry. |
| `mapStatusClear` | callable | `{}` | `{ success }` | Remove map status (delete document). |
| `mapStatusGetNearby` | callable | `{ lat, lng, radiusKm? }` | `{ statuses[] }` | Get nearby map statuses. Default radius: 2km. Applies density privacy (§8.4). |

#### Safety & Reporting (see §20)

| Function | Type | Input | Output | Description |
|----------|------|-------|--------|-------------|
| `reportSubmit` | callable | `{ reportedUid, reportType, context, contextId, description? }` | `{ reportId }` | Submit a report. Validates rate limit (5/day). Triggers auto-triage. |
| `reportGetMine` | callable | `{ status? }` | `{ reports[] }` | Get user's submitted reports. |

#### Scheduled Functions

| Function | Schedule | Description |
|----------|----------|-------------|
| `activityPostCleanupExpired` | Every 5 min | Expire overdue posts. Cascade-expire pending requests. Dissolve groups. |
| `groupChatPurge` | Daily | Delete chat messages older than 7 days from dissolved groups. |
| `activityDataPurge` | Daily | Delete posts, requests, and groups older than 30 days in terminal state. |
| `mapStatusCleanupExpired` | Every 5 min | Delete expired map status documents. |
| `reportAutoTriage` | Every 10 min | Process pending reports. Apply automated suspension rules (§20.3). |
| `suspensionAutoLift` | Every 30 min | Lift temporary suspensions that have expired their duration. |

### 11.2 Existing Functions (Unchanged)

All 28 existing Cloud Functions (see `API_Contract_AsIs.md`) remain exactly as-is:
- Presence: `presenceStart`, `presenceEnd`, `presenceCleanupExpired`
- Suggestions: `suggestionGetTop1`, `suggestionGetCycle`, `suggestionPass`, `suggestionRespond`
- Offers: `offerCreate`, `offerRespond`, `offerCancel`, `offersGetInbox`, `offerGetOutgoing`, `offerExpireStale`
- Matches: `matchFetchAllPlaces`, `matchSetPlaceChoice`, `matchResolvePlaceIfNeeded`, `matchResolveExpired`, `matchCancel`, `matchCleanupStalePending`, `matchConfirmMeeting`, `matchCleanupExpiredConfirmations`, `updateMatchStatus`, `matchSendMessage`
- Availability: `checkAvailabilityForUser`
- Admin: `adminForceExpireMatch`
- Migrations & Cleanup: `normalizeOfferUpdatedAt`, `auditPresenceMatchId`, `idempotencyCleanup`

### 11.3 Total Function Count

- Existing: 28 (unchanged)
- New Activity System: 14 callable + 4 scheduled = 18
- New Safety System: 2 callable + 2 scheduled = 4
- **Total: 50 functions**

---

## 12. Reuse Map

### 12.1 Direct Reuse (No Modification)

| Component | Location | Reused For |
|-----------|----------|-----------|
| Firebase Auth | `src/lib/firebase/` | Same auth for all features |
| User collection + schema | `users/{uid}` + `src/lib/schemas/user.ts` | Identity layer for Activity Posts |
| Blocks collection | `blocks/{uid}/blocked` | Block enforcement in join requests |
| Places collection | `places/{placeId}` | Location suggestions in Activity Post creation |
| Push notification utility | `functions/src/utils/notifications.ts` | Notifications for join requests, acceptances, group messages |
| Idempotency utility | `functions/src/utils/idempotency.ts` + `functions/src/idempotency/` | Prevent duplicate join request processing |
| NYC geofence validation | `functions/src/utils/places.ts` (lat/lng bounds check) | Validate Activity Post location |
| Geohash computation | `geofire-common` usage in `functions/src/utils/places.ts` | Geohash for `activityPosts` and `mapStatus` proximity queries |
| Email verification utility | `functions/src/utils/verifyEmail.ts` | Enforce verification for Activity Post creation |
| Profile completion check | Frontend `AuthProvider` redirect logic | Require profile before posting |
| Reliability score read | `users/{uid}.reliabilityScore` | Display on Activity Post cards |
| Zod validation patterns | `src/lib/schemas/` | Schema validation for new API inputs |
| Toast / notification UI | `src/hooks/use-toast.ts` | User feedback for Activity actions |
| Navbar component shell | `src/components/layout/Navbar.tsx` | Navigation chrome (needs tab modification) |
| Admin infrastructure | `src/app/admin/` | Extend for Activity Post moderation |

### 12.2 Pattern Reuse (Same Architecture, New Implementation)

| Pattern | Source | Target |
|---------|--------|--------|
| Chat message schema | `matchSendMessage` function | `groupSendMessage` function |
| Real-time Firestore subscription | `useMatch` hook (live match state) | `useActivityPost` hook (live post state), `useGroupChat` hook (live messages) |
| Scheduled cleanup pattern | `presenceCleanupExpired`, `offerExpireStale` | `activityPostCleanupExpired`, `mapStatusCleanupExpired` |
| Cursor-based pagination | (new, but follows Firestore best practice) | `activityPostGetFeed`, `groupGetMessages` |
| Denormalized display fields | `offers/{offerId}.toDisplayName` pattern | `activityPosts.creatorDisplayName`, `joinRequests.requesterDisplayName` |
| Document ID as idempotency key | `suggestions/{fromUid}_{toUid}` pattern | `joinRequests/{postId}_{requesterUid}` |

---

## 13. What Must Be Modified

### 13.1 Frontend Navigation

**Current:** Home page has 2 tabs: "Discover" + "Invites" (both serve Instant Match).

**Required change:** Home page becomes a 2-tab layout:
- **"Activities"** tab (new, default) → Activity Post feed + creation FAB
- **"Instant Match"** tab → Existing Discover + Invites sub-tabs (nested within this tab, or as a dedicated full-screen view)

**Files affected:**
- `src/app/(protected)/page.tsx` — restructure tab layout
- `src/components/home/TabNavigation.tsx` — add top-level Activities/Instant Match tabs
- `src/components/layout/Navbar.tsx` — potentially add tab indicator

### 13.2 Frontend Routes

**New routes required:**

| Route | Purpose |
|-------|---------|
| `/` | Activities feed (new landing) |
| `/post/[postId]` | Activity Post detail (join requests, group chat) |
| `/post/create` | Post creation form |
| `/instant-match` | Existing discovery + invites (moved from `/`) |
| `/map` | Campus map with status dots |

**Modified routes:**
- `/` currently serves Instant Match → now serves Activities

### 13.3 Firestore Security Rules

**New rules needed for:**
- `activityPosts/{postId}` — creator can write; all verified users can read active posts
- `joinRequests/{postId}_{requesterUid}` — requester can create/withdraw; creator can respond; both can read
- `groups/{groupId}` — members can read; only system (Cloud Functions) can write
- `groupChats/{groupId}/messages/{messageId}` — members can read; members can create; no update/delete
- `mapStatus/{uid}` — owner can write/delete; all verified users can read
- `activityReports/{reportId}` — reporter can create and read own reports; only system (Cloud Functions) can update status; admin can read all

**Existing rules** for `presence`, `offers`, `matches`, etc. remain unchanged.

### 13.4 Firestore Indexes

New composite indexes required (see §10.1 for details per collection).

### 13.5 Onboarding

**Optional enhancement:** Add activity preference selection during onboarding (categories the user is interested in). This is used ONLY for optional client-side filter defaults — NOT for algorithmic matching.

**Current onboarding fields remain:** `displayName`, `photoURL`, `interests`, `preferredActivities`.

---

## 14. What Should Be Removed

### 14.1 Retired Concepts

| Concept | Status | Rationale |
|---------|--------|-----------|
| Themed Sessions (PRD_ThemedMeetup.md) | **Retired** | Replaced by Activity Companion model. Themed sessions required cohorts, time windows, and algorithmic pairing — all of which the Activity model eliminates. |
| Cohort-based matching | **Retired** | Activity Posts are open to all. No segmentation. |
| Session time windows | **Retired** | Activity Posts use creator-set expiration, not system-imposed windows. |

### 14.2 Code to Remove

**None.** No existing code is removed. The Instant Match system remains intact. The themed session concept was documented (PRD_ThemedMeetup.md) but never implemented — there is no code to remove.

### 14.3 Documents to Archive

| Document | Action |
|----------|--------|
| `docs/PRD_ThemedMeetup.md` | Move to `docs/history/`. Add header: "Superseded by PRD_ActivityCompanion.md" |

---

## 15. Architecture Impact Analysis

### 15.1 Collection Reuse from Existing Matching System

| Collection | Reusable? | How |
|-----------|-----------|-----|
| `users/{uid}` | **Yes — direct** | Identity, profile, reliability score. Read by Activity system. New `activityStats` field added. |
| `blocks/{uid}/blocked` | **Yes — direct** | Block checks in join request creation. Same query pattern. |
| `places/{placeId}` | **Yes — read only** | Can suggest locations when creating Activity Posts. Not required for group formation. |
| `presence/{uid}` | **No** | Exclusive to Instant Match. Activity Posts do not create presence documents. |
| `offers/{offerId}` | **No** | 1v1 offer model doesn't map to 1-to-many join requests. Different lifecycle, different state machine. |
| `matches/{matchId}` | **No** | 1v1 match coordination doesn't map to group coordination. Different status progression, different place resolution needs. |
| `feedback/{matchId}_{uid}` | **No — but pattern reusable** | Could introduce `activityFeedback` in future. Current feedback is match-specific. |
| `suggestions/{fromUid}_{toUid}` | **No** | Discovery algorithm doesn't apply to Activity Posts (no algorithmic matching). |

### 15.2 Can Match + Reliability Infrastructure Be Reused for Group Meetups?

**Reliability score: Partially yes, with important caveats.**

The existing reliability score tracks:
- `totalMatches` — count of matches entered
- `metConfirmed` — confirmed meetings
- `cancelledByUser` — user-initiated cancellations
- `noShow` — no-shows
- `expired` — expired without resolution

**For Activity groups, the dynamics differ:**
- A creator who posts and gets participants but then deletes → somewhat analogous to cancellation
- A participant who joins and then leaves → analogous to cancellation, but less severe (group continues)
- Meeting confirmation is harder: in 1v1, both parties confirm. In groups, partial attendance is normal.

**Recommendation for MVP: Do NOT apply reliability scoring to Activity groups.**

Reasons:
1. Groups are inherently lower-commitment (if one person no-shows, the group still functions)
2. There is no symmetric 1:1 accountability structure
3. Mixing group and 1v1 reliability signals would pollute the score
4. Complexity is high (who reports whom? What if 3/5 show up?)

**Post-MVP consideration:** Introduce a separate `activityReliabilityStats` field that tracks post-level reliability:
- `postsCreated` / `postsWithMeetup` → creator reliability
- `requestsAccepted` / `requestsAttended` → participant reliability

This keeps the existing `reliabilityScore` pure for Instant Match while building a parallel reputation for the Activity system.

### 15.3 Does the Activity Model Reduce Need for Presence Tracking?

**Yes, significantly — but presence remains necessary for Instant Match.**

| Purpose | Presence needed? | Activity model alternative |
|---------|-----------------|---------------------------|
| Discovery (who's available?) | Yes (Instant Match) | Not needed — posts are the discovery surface |
| Location tracking | Yes (Instant Match geohash) | Optional — post `locationName` or lat/lng |
| Duration/expiry | Yes (presence TTL) | `expiresAt` on post serves same purpose |
| Activity signaling | Yes (presence `activity` field) | `category` field on post |
| Match blocking | Yes (presence `status: matched`) | Not needed — no mutual exclusion in Activity system |

**Key insight:** The Activity model replaces the **need** for presence as a discovery mechanism. Users don't need to "go available" to be discoverable — their posts are their availability signal. However, the `presence` system must remain for the Instant Match tab.

### 15.4 What Parts of Offer/Match System Can Be Abstracted?

**Abstractable patterns (not code, but architecture):**

1. **Idempotency pattern** — `functions/src/utils/idempotency.ts` can be directly reused for `joinRequestSend` to prevent duplicate requests under race conditions.

2. **Denormalization pattern** — `offers` denormalize `toDisplayName`, `toPhotoURL` from `users`. Same pattern applies to `activityPosts.creatorDisplayName` and `joinRequests.requesterDisplayName`.

3. **Scheduled cleanup pattern** — `presenceCleanupExpired` and `offerExpireStale` establish the pattern: query by `expiresAt`, batch-transition to terminal state. Directly applicable to `activityPostCleanupExpired` and `mapStatusCleanupExpired`.

4. **Chat infrastructure** — `matchSendMessage` implements message creation, validation, and push notification. `groupSendMessage` follows the same pattern with group membership check instead of match membership check.

5. **Firestore transaction pattern** — `createMatchAtomic` uses Firestore transactions for race-condition-safe state transitions. Same pattern needed for `joinRequestRespond` (accept) to prevent over-filling a group.

**NOT abstractable:**
- Discovery algorithm (cycle-based suggestions) — Activity Posts use chronological feed, no scoring
- Offer TTL + cooldown system — Join requests have different lifecycle (no time pressure on creator)
- Place resolution voting — Groups coordinate in chat, not via algorithmic place voting
- Match status progression (pending → location_deciding → ... → completed) — Groups have simpler lifecycle

---

## 16. Cold Start Feasibility

### 16.1 The Cold Start Problem

Every campus social app faces the same bottleneck: the product requires concurrent users in the same place at the same time, but early adoption is sparse and asynchronous.

### 16.2 Model Comparison

#### Pure Realtime Matching (v1.0 Current)

**Requirement:** At least 2 users must be simultaneously available, within 5km, with matching activity type and compatible duration, and neither has blocked the other.

**Cold start viability: Poor.**

| Factor | Assessment |
|--------|-----------|
| Simultaneity requirement | **Critical blocker.** Both users must be "available" at the same moment. If User A goes available at 2:00 PM and User B at 2:15 PM, they may never see each other (A might have already left). |
| Empty state experience | **Devastating.** User opens app, goes available, sees "No one around" → closes app → never returns. The value proposition requires the network to already exist. |
| Density threshold | **High.** Need ~20-30 concurrent available users in the campus area for reliable matches. At 10% DAU conversion to "available," need 200-300 DAU. |
| Viral potential | **Low.** Hard to show the product to a friend ("go available and wait..."). |

#### Themed Session Model (PRD_ThemedMeetup.md — Retired)

**Requirement:** Users must join scheduled themed sessions with minimum participant counts.

**Cold start viability: Moderate but fragile.**

| Factor | Assessment |
|--------|-----------|
| Simultaneity requirement | **Reduced but not eliminated.** Sessions have time windows, but still need concurrent sign-ups. |
| Empty state experience | **Better.** User sees upcoming sessions → can sign up for future ones. But if sessions keep failing to reach minimum → same abandonment cycle. |
| Density threshold | **Medium.** Need ~8-12 users per session × 3-5 sessions/week ≈ 30-50 engaged users. |
| Viral potential | **Medium.** "Join me for this study session" is shareable but requires commitment. |

#### Activity Companion Model (This PRD)

**Requirement:** One user creates a post. Other users see it and decide to request. Creator selects. Asynchronous by design.

**Cold start viability: Strong.**

| Factor | Assessment |
|--------|-----------|
| Simultaneity requirement | **Eliminated.** Posts persist for 2–48 hours. User A posts at 2:00 PM. User B sees it at 2:30 PM. Still valid. No missed connection. |
| Empty state experience | **Gracefully degraded.** Even with 0 posts, user can create one. The act of posting IS the value — you are signaling intent. And unlike "going available" into a void, a post is visible to anyone who opens the app in the next 24 hours. |
| Density threshold | **Low.** Even 5 active posts create a sense of "things happening." A single successful meetup validates the entire model. Need ~10-15 weekly active posters to sustain momentum. |
| Viral potential | **High.** "I'm going to [X], posted it on NYU Buddy, 2 people joined" is a concrete, shareable story. Can be shared via direct message ("here's my post"). |

### 16.3 Why Activity Companion Wins for Cold Start

**1. Temporal decoupling.** The fundamental unlock. By breaking the simultaneity requirement, the window of opportunity expands from "both users online right now" to "any user opens the app within 48 hours." At 100 total registered users with 30% weekly retention, that's ~30 users/week seeing each post instead of ~2 concurrent users at any given moment.

**2. One-sided creation.** A single user can generate value by creating a post. In realtime matching, a single user generates nothing — the system requires a pair. This means early adopters can contribute to the ecosystem independently.

**3. Content as retention hook (without being a content platform).** Even if a user doesn't join any activity, seeing "3 people want to study at Bobst tonight" provides campus ambient information. This creates a reason to return that doesn't depend on personal matching success.

**4. Failure mode is graceful.** If no one requests to join your post, it simply expires. There's no "rejection" event, no "you weren't matched" notification. The psychological cost of failure is near-zero compared to "no one swiped right on you."

**5. Seeding is natural.** The founding team can create authentic posts ("We're getting coffee at Think Coffee at 3pm") without any fake-it-till-you-make-it mechanics. These are real activities with real intent — the app is just the coordination layer.

### 16.4 Cold Start Density Estimates

| Metric | Realtime Match | Themed Sessions | Activity Companion |
|--------|---------------|----------------|--------------------|
| Minimum DAU for value | ~50 | ~30 | ~10 |
| Minimum concurrent users | ~5-10 | ~8 per session | ~1 (creator) |
| Time to first success | Days-weeks | Days (if session fills) | Hours (first post + request) |
| Organic seeding possible? | No | Partially | Yes |
| Single-user value | None | None | Marginal (post as intent signal) |

---

## 17. Does This Drift Into Content Platform?

### 17.1 Risk Assessment

The Activity Post model introduces user-generated content (post body, optional image) into a product that previously had none. This creates genuine risk of drifting toward Instagram/Xiaohongshu/Reddit territory.

**Risk vectors:**

| Vector | Risk Level | Mechanism |
|--------|-----------|-----------|
| Image posts becoming "lifestyle showcase" | **Medium** | Users post aesthetic photos of coffee/study setups to signal status rather than coordinate action |
| Post body becoming "micro-blog" | **Low-Medium** | 140-char limit restricts but doesn't eliminate performative posting |
| Feed scrolling becoming passive consumption | **Medium** | Users scroll posts without joining → engagement without action |
| Post popularity metrics creating competition | **High (if introduced)** | Like/view counts would immediately create content incentives |
| Comment/reply threads creating discussion | **High (if introduced)** | Discussion replaces action as the primary interaction |

### 17.2 Structural Safeguards (Built Into This PRD)

| Safeguard | Mechanism | Prevents |
|-----------|-----------|----------|
| No public engagement metrics | Join request counts are invisible. No likes, no views, no shares. | Popularity competition |
| No algorithmic ranking | Chronological only. No "hot" posts. No personalization. | Engagement optimization, filter bubbles |
| Mandatory expiration | 48h max. No "evergreen" content. | Content accumulation, portfolio behavior |
| No comments | Only join requests (private to creator) and group chat (private to members). | Public discussion, debate, trolling |
| No content discovery beyond chronological feed | No search, no hashtags, no trending, no explore page. | Content platform mechanics |
| Image is auxiliary | Small thumbnail, not hero image. No image-only posts. Body text is required. | Visual content competition |
| No post resharing | Posts cannot be shared, quoted, or amplified within the app. | Viral content dynamics |
| No follower/following system | Users cannot follow other users. | Audience building |
| No profile post history | Past posts are not visible on user profiles. | Portfolio building |
| Max 3 active posts | Rate-limits content creation. | Prolific posting behavior |
| Edit limit (10 per post) | Prevents iterative "optimization" of post for engagement. | Content tuning behavior |

### 17.3 Cultural Design Signals

Beyond structural constraints, the product must signal through design that posts are invitations, not content:

1. **Post creation UI** should feel like filling out a form, not composing a creative work. No font selection, no filters, no stickers.
2. **Post cards in feed** should emphasize `category`, `locationName`, `maxParticipants`, and `expiresAt` — the logistics. The `body` text is important but not dominant.
3. **The primary CTA on every post card** is "Request to Join" — not "Like" or "Comment."
4. **Empty state** should say "No activities right now. Create one?" — not "Follow people to see their posts."

### 17.4 Monitoring for Drift

**Metrics that signal content platform drift:**

| Signal | Threshold | Response |
|--------|-----------|----------|
| Avg posts viewed per session > 20 | Investigate | Users are scrolling, not acting. Consider limiting feed depth. |
| Join request rate < 5% of post views | Investigate | Posts being consumed, not acted on. |
| Posts with images but 0 join requests | > 30% of image posts | Image posts may be performative. Consider removing image feature. |
| Average post body length consistently < 20 chars | Trend | Posts becoming low-effort / meme-like. Consider minimum length enforcement. |
| Same users creating > 80% of posts | Week over week | Platform is creator-driven, not action-driven. Community concentration risk. |

### 17.5 What This Product Is NOT

| Not This | Why | Structural Enforcement |
|----------|-----|----------------------|
| Instagram | No likes, no followers, no persistent content, no visual-first design | All posts expire. No profile gallery. No engagement metrics. |
| Xiaohongshu | No content discovery, no recommendation, no influencer dynamics | Chronological feed. No algorithmic ranking. No follow system. |
| Reddit | No comments, no voting, no threads, no communities | No public discussion. Private join requests only. No subreddit-like groups. |
| Discord | No persistent servers, no channels, no roles, no voice/video | Ephemeral groups only. No ongoing group identity. Chat dies with post. |
| Eventbrite | No ticketing, no formal events, no large gatherings, no organizer profiles | Max 5 people. No event pages. No recurring events. |
| Meetup.com | No recurring groups, no organizer reputation, no RSVPs visible to others | Posts are one-shot. Groups dissolve. No public attendance. |

---

## 18. Metrics

### 18.1 North Star Metric

**Real-world meetups completed per week**

This is the primary indicator of product success.

**Definition:**  
A meetup is considered completed when at least two members of an Activity Group indicate they met in person.

For MVP proxy tracking (without explicit in-app confirmation), we define:
> A meetup proxy is a group that formed (>=2 members accepted) where the creator did not close the post within 1 hour after the last accepted join, and where the group chat has >=1 message exchanged.

---

### 18.2 Core Usage Metrics

These metrics evaluate early traction and user engagement:

| Metric | Definition | Target (Early) |
|--------|------------|----------------|
| **Active Posts / Day** | # of newly created Activity Posts | ≥ 10 |
| **Accepted Join Ratio** | (# accepted join requests / # join requests sent) | ≥ 25% |
| **Successful Group Formation / Week** | # of groups created | ≥ 10 |
| **Chat Engagement** | % groups with >=2 chat messages | ≥ 75% |
| **Post Join Conversion** | (# accepted join requests / # posts created) | ≥ 15% |
| **Day-7 Retention** | % of users who return 7 days after first action | ≥ 30% |
| **Instant Match Usage %** | % users who have used Instant Match at least once | Observational |

---

### 18.3 Quality & Safety Metrics

| Metric | Purpose |
|--------|---------|
| **Join Request Decline Ratio** | Detect unclear posts or spammy requests |
| **Group No-Show Proxy** | Groups that formed but had 0 chat messages | Quality signal |
| **Report Rate** | # reports / # interactions | Safety monitoring |
| **Block Rate** | % of blocks after an interaction | Safety signal |

---

### 18.4 Growth & Virality Metrics

| Metric | Purpose |
|--------|---------|
| **User-to-User Invite Rate** | How often users invite others outside app | Community adoption |
| **Share-to-External Rate** | Rate of external shares (SMS/links) | Growth signal |
| **Cross-Circle Engagement** | % of groups formed across different schools/majors | Network effect |

---

## 19. MVP Scope

Focus on delivering the minimum experience that validates:

**Users can post an activity → others can request to join → groups form and coordinate → real world meetup happens.**

### 19.1 Must-Have Features (MVP)

**Core Activity Post**
- Create an Activity Post (body, category, expiration, maxParticipants)
- Feed of reverse-chronological posts
- Post editing within constraints

**Join Request Workflow**
- Send and withdraw join request
- Creator accept/decline
- UI for request inbox

**Group Formation**
- Create group at first accepted join
- Group chat with text only

**Post Lifecycle**
- Expire posts at expiration time
- Close post manually
- Cleanup expired objects

**Campus Map Status**
- Set status with text and location
- Map visualization

**Safety & Moderation (MVP subset, see §20)**
- Report submission flow (§20.2)
- Automated triage and temporary suspension (§20.3)
- Join request cooldowns and block enforcement (§20.5)
- Code of Conduct agreement on registration (§20.1)

**Push Notifications (MVP subset, see §21)**
- Core notification triggers: join request received, accepted, group chat messages (§21.2)
- Basic throttling: join request batching, per-hour cap (§21.3)
- In-app notification center (§21.4)

**Onboarding (MVP subset, see §22)**
- Welcome screen + "How it works" carousel (§22.2, screens 1–3)
- First-move prompt: create or browse (§22.2, screen 4)
- Category preference selection (optional/skippable) (§22.2, screen 2)

**Edge Case Handling (see §7.2)**
- Filled → Open transition on participant leave
- FIFO pending request re-evaluation
- Concurrency guards on group membership changes

**Secondary Tab**
- Instant Match preserved exactly as is

---

### 19.2 Optional (Post-MVP)

These can improve the experience but are not required to validate core hypothesis:

- RSVP post-meeting confirmations
- Activity post reminders for accepted joiners (see §21.5)
- Activity category suggestions
- Full onboarding with activity preferences (see §22 — basic version is MVP)
- Time-horizon filtering on feed (see §4.2)
- Campus zone location aggregation (see §4.2)
- Human review moderation dashboard (see §20.3)
- User-configurable notification preferences and quiet hours (see §21.5)
- Contextual feature discovery tooltips (see §22.3)

---

### 19.3 Do Not Include in MVP

The following should be avoided in MVP to retain focus:

❌ Likes or view counts  
❌ Comments or threaded discussion  
❌ Multiple images or rich media  
❌ Recommendation ranking or “For You” feed  
❌ Follow/follower system or influencer dynamics

---

### 19.4 MVP Success Criteria

Validate the core product hypothesis if:

- ≥ 20% of users create at least one Activity Post  
- ≥ 10% of Activity Posts receive at least one accepted join  
- ≥ 15 completed groups per week within the first month  
- Users return at least twice in the first month  
- Declines + block rate stays < 5%

---

## 20. Safety & Moderation

> **MVP scope:** Sections marked **(MVP)** must ship at launch. Sections marked **(Post-MVP)** are designed now for implementation after initial validation.

### 20.1 Code of Conduct (MVP)

All users agree to a Code of Conduct upon registration. Violation leads to escalating enforcement (see §20.3).

**Prohibited behaviors:**

| Category | Examples | Severity |
|----------|----------|----------|
| **Harassment** | Repeated unwanted join requests after decline; targeted messaging via post body directed at a specific user; using group chat to harass | High |
| **Spam** | Creating posts with no intent to meet; bulk join requests to farm interactions; promotional or commercial content in posts | Medium |
| **Impersonation** | Using another student's identity; fake profile information | High |
| **Inappropriate content** | Sexually explicit post body or images; hate speech; threats of violence | Critical |
| **No-show abuse** | Systematic pattern of accepting joins or joining groups with no intention to attend | Low (tracked, not immediately enforced) |
| **Location misuse** | Setting map status to mislead; using fake location data | Medium |

### 20.2 Reporting System (MVP)

**Who can report:**
- Any authenticated user can report an Activity Post, a Join Request message, or a Group Chat message.
- A group member can report another group member.
- A creator can report a requester (and vice versa).

**Report fields:**

| Field | Type | Constraints |
|-------|------|-------------|
| `reporterUid` | string | Auth-derived |
| `reportedUid` | string | The user being reported |
| `reportType` | enum | `harassment`, `spam`, `inappropriate_content`, `impersonation`, `no_show`, `other` |
| `context` | enum | `activity_post`, `join_request`, `group_chat`, `map_status`, `profile` |
| `contextId` | string | The document ID of the reported object (postId, requestId, messageId, etc.) |
| `description` | string | Optional free-text. Max 500 characters. |
| `createdAt` | Timestamp | Server timestamp |
| `status` | enum | `pending`, `reviewed`, `action_taken`, `dismissed` |

**Report storage:** `activityReports/{reportId}` — separate from the existing `reports/{matchId}_{uid}` collection used by Instant Match. This maintains system independence (Principle 2.7).

**Rate limit on reporting:** Maximum 5 reports per user per 24 hours. Prevents weaponized reporting.

### 20.3 Report Handling Flow (MVP: automated; Post-MVP: human review)

```
Report submitted
      │
      ▼
┌─────────────────┐
│  Auto-triage     │──── Severity classification based on reportType
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
 Critical   Standard
    │         │
    ▼         ▼
┌────────┐  ┌─────────────────────┐
│Instant │  │ Threshold check:     │
│suspend │  │ ≥3 reports from      │
│(24h)   │  │ distinct users in    │
│        │  │ 7 days?              │
└───┬────┘  └──────┬──────────────┘
    │              │
    │         ┌────┴────┐
    │         │         │
    │         ▼         ▼
    │       Yes        No
    │         │         │
    │         ▼         ▼
    │    ┌────────┐  ┌──────────┐
    │    │Temp    │  │ Queued   │
    │    │suspend │  │ for      │
    │    │(48h)   │  │ review   │
    │    └────────┘  └──────────┘
    │
    ▼
┌─────────────────────┐
│ Human review queue   │◄── Post-MVP: admin dashboard
│ (admin notified via  │
│  email/Slack)        │
└──────────────────────┘
```

**Automated actions (MVP):**

| Trigger | Action | Duration | Reversible |
|---------|--------|----------|------------|
| 1 report of type `inappropriate_content` or `impersonation` | Reported content hidden; user flagged for review | Until reviewed | Yes (admin can dismiss) |
| ≥3 distinct-user reports within 7 days (any type) | Temporary suspension: cannot create posts, send join requests, or send chat messages | 48 hours | Auto-lifts after 48h; admin can extend |
| ≥5 distinct-user reports within 30 days | Account suspension pending human review | Until admin action | Admin must manually reinstate |
| Creator blocks + reports simultaneously | Join request from reported user is immediately declined; user cannot re-request on any of this creator's posts for 7 days | 7 days | Automatic expiry |

**Post-MVP: Human review dashboard**
- Admin UI (extend existing `src/app/admin/`) to show flagged reports
- Ability to: dismiss report, issue warning, extend suspension, permanent ban
- Audit log for all moderation actions

### 20.4 Harassment Protection for Passive Users (MVP)

Users who receive unwanted attention have the following protections:

**For Creators (receiving unwanted join requests):**
- Block a requester → immediately declines their request and prevents future requests on all of this creator's posts
- Report a requester → triggers report flow (§20.3)
- Close post → all pending requests expire; no further inbound

**For Users on the Map (receiving attention due to map status):**
- Map status is **never actionable** (§8.2) — no one can send a request or message based on a map dot
- Map status can be cleared instantly
- Map dot density privacy (§8.4) protects users in low-density areas

**For Group Members (receiving harassment in group chat):**
- Leave group at any time
- Report specific chat messages
- Block the harassing user → applies across all systems (Activity + Instant Match)

### 20.5 Join Request Cooldown Mechanisms (MVP)

To prevent targeted harassment via repeated join requests:

| Rule | Constraint | Rationale |
|------|-----------|-----------|
| **One request per user per post** | Enforced by document ID `{postId}_{requesterUid}`. If declined, cannot re-request for this post. | Prevents pestering a creator |
| **Global pending request cap** | Max 10 pending requests per user at any time (already in §5.1) | Prevents spam-requesting |
| **Post-decline cooldown to same creator** | After being declined on a post, user cannot send join requests to any post by the same creator for **4 hours** | Prevents rotating through a creator's posts after being declined |
| **Post-block cooldown** | If blocked by a creator, user cannot request on any of that creator's posts **indefinitely** (until unblocked) | Hard protection |
| **Rapid-fire detection** | If a user sends ≥5 join requests within 10 minutes, subsequent requests are silently rate-limited (delayed 5 minutes) | Prevents spray-and-pray behavior |

### 20.6 Safety Metrics (Extends §18.3)

| Metric | Definition | Alert Threshold |
|--------|------------|-----------------|
| **Reports per 100 interactions** | (reports filed / join requests + chat messages) × 100 | > 2% |
| **Repeat offender rate** | % of suspended users who re-offend within 30 days | > 25% |
| **Block-after-group rate** | % of group members who block another member after dissolution | > 10% |
| **Cooldown trigger rate** | % of users who hit the post-decline cooldown | > 5% → investigate UX clarity |
| **Average time-to-review** | Time from report submission to admin action (post-MVP) | < 24 hours |

---

## 21. Push Notification Strategy

### 21.1 Design Philosophy

Push notifications in NYU Buddy serve one purpose: **facilitate real-world meetup coordination**. Every notification must pass this test: "Does this help the user take a real-world action right now?" If no, don't send it.

Notifications are never used for:
- Re-engagement ("You haven't posted in 3 days!")
- Social proof ("5 people are posting near you!")
- Gamification ("You've completed 10 meetups!")
- Marketing or announcements

### 21.2 Notification Triggers

| Trigger | Recipient | Message Template | Priority |
|---------|-----------|-----------------|----------|
| New join request received | Creator | "{displayName} wants to join your activity" | Normal |
| Join request accepted | Requester | "You're in! {creatorDisplayName} accepted your request for '{truncatedBody}'" | High |
| Join request declined | Requester | "Your request for '{truncatedBody}' was not accepted" | Low |
| New group chat message | All group members (except sender) | "{senderDisplayName}: {truncatedMessage}" | Normal |
| Participant joined group | Existing group members | "{displayName} joined your activity" | Low |
| Participant left group | Creator + remaining members | "{displayName} left your activity" | Normal |
| Participant kicked | Kicked participant | "You were removed from '{truncatedBody}'" | Normal |
| Post slot reopened (participant left filled post) | Creator only | "A spot opened in your activity. You have {n} pending requests." | Normal |
| Activity post expired | All group members | "Your activity '{truncatedBody}' has ended" | Low |
| Creator closed post | All group members (except creator) | "The activity '{truncatedBody}' was closed by the creator" | Normal |

### 21.3 Throttling & Batching Rules

To prevent notification fatigue, the following throttling rules apply:

| Rule | Constraint | Rationale |
|------|-----------|-----------|
| **Join request batching** | If a creator receives ≥2 join requests within 10 minutes, batch into a single notification: "{n} new join requests for your activity" | Prevents notification storm on popular posts |
| **Max push per user per hour** | 6 notifications per user per rolling hour. Excess notifications are silently queued and delivered in next window. | Global fatigue prevention |
| **Max push per user per day** | 30 notifications per user per rolling 24 hours. Excess notifications are silently dropped (available in-app). | Hard daily cap |
| **Chat message batching** | If ≥3 messages arrive in a group chat within 2 minutes, batch into: "{n} new messages in your activity group" | Prevents rapid-fire chat notifications |
| **Duplicate suppression** | Same notification type for the same object within 5 minutes → suppressed | Prevents re-delivery on retries |
| **Quiet hours (Post-MVP)** | User-configurable quiet hours (default: off). During quiet hours, only `High` priority notifications are delivered. | Respect user attention |

### 21.4 In-App Notification Center

All notifications (including throttled/batched ones) appear in an in-app notification list. This ensures no information is lost due to throttling.

**Notification center design:**
- Accessible via bell icon in navbar
- Unread badge count (max display: "9+")
- Grouped by Activity Post (all notifications for a post are collapsed under one header)
- Tapping a notification navigates to the relevant post detail / group chat
- Notifications auto-expire when the parent Activity Post expires or closes
- No notification history beyond active/recent posts

### 21.5 Optional Notifications (User-Configurable, Post-MVP)

| Notification Type | Default | User Can Disable |
|-------------------|---------|-----------------|
| Join requests received | On | Yes |
| Join request accepted | On | No (critical coordination) |
| Group chat messages | On | Yes |
| Activity post expiring soon | Off | Yes (opt-in) |
| Slot reopened on filled post | On | Yes |
| Post expired | On | Yes |

**Expiration reminder (opt-in, post-MVP):**
If enabled, sends a notification to all group members at `expiresAt - 30 minutes`: "Your activity '{truncatedBody}' is ending in 30 minutes."

---

## 22. Onboarding & First-Time Experience

### 22.1 Design Goal

The onboarding flow must accomplish three things in under 60 seconds:
1. Establish what the app does ("post activities, find people to join you")
2. Capture minimal preference data to improve the first session
3. Prompt the user toward their first meaningful action (creating a post or browsing)

Onboarding must NOT feel like a survey. It must feel like a quick, opinionated setup — similar to choosing a language in Duolingo, not filling out a LinkedIn profile.

### 22.2 First Launch Flow

**Screen 1 — Welcome (5 seconds)**
- Hero illustration: two people walking together on campus
- Copy: "Find someone to do things with. Right now."
- Single CTA: "Get Started"

**Screen 2 — What are you into? (15 seconds)**
- Grid of activity category chips: Coffee, Study, Food, Event, Explore, Sports
- User taps 1–3 categories they're most interested in
- Stored in `users/{uid}.preferredCategories` (array)
- Skip option available ("Skip — show me everything")
- **These preferences only set default client-side filter state. They do NOT affect ranking or visibility.**

**Screen 3 — How it works (10 seconds)**
- Three-panel carousel (auto-advances, swipeable):
  - Panel 1: "Post" — "Tell people what you want to do"
  - Panel 2: "Join" — "Request to join someone's activity"
  - Panel 3: "Meet" — "Coordinate in group chat and go"
- Emphasizes the difference from traditional social apps: "No likes. No followers. Just real meetups."

**Screen 4 — Your first move (10 seconds)**
- Two CTAs:
  - **Primary:** "Create Your First Activity" → navigates to post creation with a gentle pre-filled hint (e.g., body placeholder: "Grabbing coffee at...")
  - **Secondary:** "Browse Activities First" → navigates to feed
- No forced action — user can choose to explore before posting

### 22.3 Feature Discovery (Contextual, Not Upfront)

The Instant Match secondary tab and the Campus Map are NOT explained during onboarding. They are introduced via contextual tooltips on first encounter:

| Feature | Tooltip Trigger | Tooltip Content |
|---------|----------------|-----------------|
| Instant Match tab | First time user taps the tab | "Instant Match pairs you 1-on-1 with someone nearby in real time. Different from Activities — this is spontaneous." |
| Campus Map | First time user navigates to map | "See where people are hanging out on campus. Set your own status dot to let others know you're around." |
| Join Request (first time) | First time user taps "Request to Join" | "The creator will see your request and decide. You can add a short note to introduce yourself." |
| Group Chat (first time) | First time user enters a group chat | "This is your activity group chat. Use it to coordinate — where to meet, when, who's bringing what." |

### 22.4 Re-Engagement After Cold Start

If a user completes onboarding but does NOT create a post or send a join request within their first session:

- **No push notification.** We do not nag users back.
- On next app open (within 7 days), show a soft banner at the top of the feed: "Ready to try something? Create your first activity or join one below."
- Banner is dismissible and does not reappear after dismissal.

If a user creates a post but gets 0 join requests (cold start scenario):
- **No consolation notification.** When the post expires, the standard expiry notification is sent.
- On next app open, show: "Tip: Posts with a specific place and time tend to get more requests. Try again?"
- This banner appears at most twice, then stops.

### 22.5 Onboarding Data Model

New field added to `users/{uid}`:

| Field | Type | Description |
|-------|------|-------------|
| `preferredCategories` | string[] | Array of category enums selected during onboarding. Max 3. Empty if skipped. |
| `onboardingCompleted` | boolean | `true` after completing or skipping onboarding flow |
| `firstPostCreatedAt` | Timestamp \| null | Set when user creates their first Activity Post. Used for growth metrics. |
| `firstJoinRequestAt` | Timestamp \| null | Set when user sends their first join request. Used for growth metrics. |

These fields are for **analytics and UX gating only** — never used for matching, ranking, or algorithmic decisions.