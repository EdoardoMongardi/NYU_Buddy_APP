# PRD — NYU Buddy: Themed Meetup Layer

> **Document Type:** Product Requirements Document (TO-BE)
> **Version:** 1.0
> **Date:** 2026-02-14
> **Author:** Product
> **Status:** Draft
> **Depends On:** PRD_AsIs.md (v1.0 spontaneous flow — coexists)

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Core Concepts & Terminology](#2-core-concepts--terminology)
3. [Design Principles](#3-design-principles)
4. [Theme System](#4-theme-system)
5. [Session Lifecycle](#5-session-lifecycle)
6. [User Experience — Screens & Flows](#6-user-experience--screens--flows)
7. [User Card Design (Themed)](#7-user-card-design-themed)
8. [Matching Flow (Within Session)](#8-matching-flow-within-session)
9. [Meeting Flow — Speed Coffee Chat](#9-meeting-flow--speed-coffee-chat)
10. [Matching Algorithm (Themed)](#10-matching-algorithm-themed)
11. [Round System & Re-Entry](#11-round-system--re-entry)
12. [Reliability & Reputation](#12-reliability--reputation)
13. [Coexistence with Spontaneous Mode](#13-coexistence-with-spontaneous-mode)
14. [Data Model — New & Modified Collections](#14-data-model--new--modified-collections)
15. [Backend API Surface](#15-backend-api-surface)
16. [Push Notifications & Reminders](#16-push-notifications--reminders)
17. [Admin — Theme Management](#17-admin--theme-management)
18. [Edge Cases & Error Handling](#18-edge-cases--error-handling)
19. [Success Metrics](#19-success-metrics)
20. [Phasing & MVP Scope](#20-phasing--mvp-scope)
21. [v1.0 Reuse Map](#21-v10-reuse-map)

---

## 1. Product Overview

### 1.1 One-Sentence Description

The Themed Meetup Layer is a **time-windowed, topic-driven 1v1 matching system** where NYU students join scheduled themed sessions, swipe through participants with shared interests, and connect for structured 15–20 minute speed coffee chats — multiple rounds per session.

### 1.2 Product Identity

```
Speed Coffee Chat — not speed dating.
Campus intellectual connection — not social small talk.
Structured spontaneity — not 24/7 random matching.
```

### 1.3 Why This Layer Exists

| Problem (v1.0) | Themed Meetup Solution |
|-----------------|------------------------|
| Low simultaneous density → empty pool | Time-windowed sessions concentrate users into 3-hour peaks |
| Weak motivation ("I'm available for coffee") | Theme gives specific reason to show up ("ML Builders Night") |
| No anticipation or habit loop | Weekly rhythm creates FOMO and ritual |
| Distance-only matching signal | Interest + theme + profile-based matching |
| Single match per session | Multiple rounds per session (speed coffee chat format) |

### 1.4 Core User Value

> "Every Monday at 6pm, I join ML Builders Night. I swipe through 20 people interested in ML, match with 2–3, have quick coffee chats, and leave with real connections. It takes 2 hours and I look forward to it every week."

---

## 2. Core Concepts & Terminology

| Term | Definition |
|------|------------|
| **Theme** | A reusable template for sessions (e.g., "ML Builders Night"). Has a name, description, tags, and recommended venues. |
| **Session** | A single instance of a theme with a fixed date + time window. "ML Builders Night — Mon Feb 17, 6–9pm." |
| **Session Window** | The time range during which matching is active. Outside the window, the session is visible but matching is locked. |
| **RSVP** | User's intent to join a session. Does not guarantee participation (user must go online during the window). |
| **Round** | One complete match cycle: swipe → match → meet → complete. Users can have multiple rounds per session. |
| **Speed Coffee Chat** | The meeting format: 15–20 min structured meetup at a suggested campus venue. |
| **Pool** | The set of users currently online and available for matching within a session. |
| **Session Card** | The user's themed profile card visible to other participants during swipe. |
| **Theme Host** | The admin or system entity that creates and manages themes. |

---

## 3. Design Principles

### 3.1 Structural Principles (结构强、轮次明确、时间锁定)

| Principle | Implementation |
|-----------|---------------|
| **Strong Structure (结构强)** | Every session has a clear theme, fixed window, defined venues, and explicit round count. Nothing is ambiguous. |
| **Clear Rounds (轮次明确)** | Each match is a numbered round. The user sees "Round 1 of 3." After completing a meeting, they return to the pool for the next round. |
| **Time-Locked (时间锁定)** | Matching only works during the session window. Before: preview only. After: session summary only. No exceptions. |

### 3.2 Experience Principles

| Principle | Implementation |
|-----------|---------------|
| **Browsing, not judging** | Swipe = next person (both directions). Same DNA as v1 — no Tinder-style accept/reject directional feedback. |
| **Intellectual, not social** | Cards show "What I'm working on" and shared interests, not selfies and bios. |
| **Fast, not lingering** | 15–20 min meetings. No open-ended chat. Meet, connect, move on. |
| **Repeatable, not one-shot** | Multiple rounds per session. Weekly recurring sessions. Habit-forming rhythm. |
| **Density over reach** | Small, focused pool > large, diluted one. 20 people in "ML Builders Night" > 200 people in "Meet Anyone." |

### 3.3 Coexistence Principle

The Themed Meetup Layer and the Spontaneous Meetup mode (v1.0 flow) are **parallel features** within the same app. They share authentication, profile, reliability, and meeting infrastructure but have independent discovery pools and activation flows. Themed is the **hero feature** in the UI; Spontaneous is the **always-available secondary option**.

---

## 4. Theme System

### 4.1 Theme Definition

A **Theme** is a reusable template. It defines the what, not the when.

| Field | Type | Required | Example |
|-------|------|----------|---------|
| `id` | string (auto) | Yes | `theme_ml_builders` |
| `name` | string | Yes | "ML Builders Night" |
| `description` | string | Yes | "For students building ML/AI projects. Share progress, get feedback, find collaborators." |
| `emoji` | string | Yes | "🤖" |
| `tags` | string[] | Yes | `["AI", "ML", "Deep Learning", "NLP"]` |
| `category` | enum | Yes | `academic` \| `cross_disciplinary` \| `career` \| `social` |
| `targetSchools` | string[] | No | `["Tandon", "CAS", "Courant"]` (empty = all) |
| `suggestedVenues` | string[] | No | Place IDs for recommended meetup spots |
| `maxRoundsPerUser` | number | Yes | 3 (default) |
| `meetingDurationMinutes` | number | Yes | 15 (default) |
| `minParticipants` | number | Yes | 6 (default, for session to "go live") |
| `color` | string | Yes | `"#7c3aed"` (theme accent color) |
| `createdBy` | string | Yes | Admin UID |
| `active` | boolean | Yes | `true` |
| `createdAt` | Timestamp | Yes | — |
| `updatedAt` | Timestamp | Yes | — |

### 4.2 Theme Categories

| Category | Examples | Vibe |
|----------|----------|------|
| `academic` | ML Builders Night, Quant Finance Lab, Systems Design Hour | Deep, technical |
| `cross_disciplinary` | Stern × CS Strategy Hour, Art × Tech Collision | Cross-pollination |
| `career` | Founder Brainstorm Lab, PM Case Practice, Recruiting Prep | Professional |
| `social` | Campus Chill Night, International Students Connect, Friday Vibes | Relaxed, open |

### 4.3 Theme Examples (Launch Set)

| Theme | Schedule | Category | Tags |
|-------|----------|----------|------|
| 🤖 ML Builders Night | Monday 6–9pm | academic | AI, ML, Deep Learning |
| 💼 Stern × CS Strategy Hour | Wednesday 5–8pm | cross_disciplinary | Business, Strategy, CS |
| 🚀 Founder Brainstorm Lab | Thursday 6–9pm | career | Startup, Entrepreneurship |
| ☕ Campus Connect | Friday 3–6pm | social | Open, Casual |

### 4.4 Theme Lifecycle

```
Created (admin) → Active (visible, sessions can be scheduled)
                → Archived (hidden, no new sessions)
                → Deleted (soft delete)
```

---

## 5. Session Lifecycle

A **Session** is a single scheduled instance of a Theme.

### 5.1 Session Definition

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string (auto) | Yes | Unique session ID |
| `themeId` | string | Yes | Reference to parent theme |
| `themeName` | string | Yes | Denormalized for display |
| `themeEmoji` | string | Yes | Denormalized |
| `themeColor` | string | Yes | Denormalized |
| `scheduledDate` | string | Yes | `"2026-02-17"` (ISO date) |
| `windowStart` | Timestamp | Yes | Session matching window opens |
| `windowEnd` | Timestamp | Yes | Session matching window closes |
| `status` | enum | Yes | `scheduled` \| `live` \| `ending` \| `completed` \| `cancelled` |
| `rsvpCount` | number | Yes | Current RSVP count (denormalized counter) |
| `activeCount` | number | No | Current online users (live only, updated periodically) |
| `completedRounds` | number | No | Total completed rounds across all users |
| `createdAt` | Timestamp | Yes | — |
| `updatedAt` | Timestamp | Yes | — |

### 5.2 Session Status Flow

```
scheduled ──[windowStart reached]──► live ──[windowEnd - 30min]──► ending ──[windowEnd reached]──► completed
    │                                  │
    └──[admin cancels]──► cancelled    └──[admin cancels]──► cancelled
```

| Status | Matching Allowed | New Rounds Allowed | Description |
|--------|------------------|--------------------|-------------|
| `scheduled` | No | No | Visible in upcoming list. RSVP open. |
| `live` | **Yes** | **Yes** | Session window is open. Full matching active. |
| `ending` | **Yes** (existing matches only) | **No** (no new matches) | Last 30 minutes. Users complete current rounds. No new swipe initiation. |
| `completed` | No | No | Session over. Summary available. |
| `cancelled` | No | No | Admin-cancelled. Users notified. |

### 5.3 Session Timing

| Constant | Value | Description |
|----------|-------|-------------|
| `SESSION_WINDOW_DURATION` | 3 hours (default) | Standard session length |
| `SESSION_ENDING_BUFFER` | 30 minutes | Time before `windowEnd` when status transitions to `ending` |
| `SESSION_RSVP_OPEN_HOURS` | 72 hours | How far in advance RSVPs open |
| `SESSION_MIN_PARTICIPANTS` | 6 | Minimum RSVPs for session to go live (advisory, not blocking) |
| `SESSION_REMINDER_BEFORE` | 60 minutes, 15 minutes | Push notification reminders |

### 5.4 RSVP System

**Purpose:** Signal intent, enable reminders, build anticipation, provide density forecast.

| Field | Type | Description |
|-------|------|-------------|
| `sessionId` | string | Session reference |
| `uid` | string | User reference |
| `rsvpAt` | Timestamp | When user RSVP'd |
| `attended` | boolean | Did user actually go online during window? (set by system) |
| `roundsCompleted` | number | Rounds completed in this session (updated on completion) |

**RSVP Flow:**
1. User sees upcoming session in the home feed
2. Taps "Join" → RSVP created
3. System sends reminder 60min and 15min before window opens
4. When window opens, user taps "Go Live" to enter the session pool
5. After session, `attended` flag set based on whether user entered pool

**RSVP is non-binding.** It's a signal, not a commitment. No penalty for not attending after RSVP. But:
- Attendance rate (RSVP → attended) is tracked per user
- Used for future session recommendations, not displayed publicly

---

## 6. User Experience — Screens & Flows

### 6.1 Home Screen (Redesigned)

The home screen becomes the **hub** for both modes:

```
┌─────────────────────────────────────────┐
│ NYU Buddy                         ⚙️    │
├─────────────────────────────────────────┤
│                                         │
│ ── UPCOMING SESSIONS ──────────────     │
│                                         │
│ ┌─────────────────────────────────┐     │
│ │ 🤖 ML Builders Night           │     │
│ │ Monday · 6–9pm · 23 joined     │     │
│ │ [Join]                          │     │
│ └─────────────────────────────────┘     │
│                                         │
│ ┌─────────────────────────────────┐     │
│ │ 💼 Stern × CS Strategy Hour    │     │
│ │ Wednesday · 5–8pm · 15 joined  │     │
│ │ [Joined ✓]                     │     │
│ └─────────────────────────────────┘     │
│                                         │
│ ┌─────────────────────────────────┐     │
│ │ 🚀 Founder Brainstorm Lab      │     │
│ │ Thursday · 6–9pm · 8 joined    │     │
│ │ [Join]                          │     │
│ └─────────────────────────────────┘     │
│                                         │
│ ── OR ──────────────────────────────    │
│                                         │
│ ┌─────────────────────────────────┐     │
│ │ ⚡ Spontaneous Meetup           │     │
│ │ Meet someone nearby right now   │     │
│ │ [Go Available]                  │     │
│ └─────────────────────────────────┘     │
│                                         │
└─────────────────────────────────────────┘
```

**Key Decisions:**
- Themed sessions are the **hero** — top of screen, prominent cards
- Spontaneous is **secondary** — below the fold, smaller card
- If a session is currently `live`, it floats to the top with an "LIVE NOW" badge
- Maximum 5 upcoming sessions displayed (sorted by `windowStart` ascending)

### 6.2 Session Detail Screen

**Route:** `/session/[sessionId]`

**Before Window (scheduled):**
```
┌─────────────────────────────────────────┐
│ ← Back                                  │
├─────────────────────────────────────────┤
│                                         │
│         🤖                              │
│    ML Builders Night                    │
│                                         │
│    Monday, Feb 17 · 6:00–9:00 PM       │
│    23 people joined                     │
│                                         │
│    For students building ML/AI          │
│    projects. Share progress, get        │
│    feedback, find collaborators.        │
│                                         │
│    ── TAGS ──                           │
│    [AI] [ML] [Deep Learning] [NLP]     │
│                                         │
│    ── SUGGESTED VENUES ──               │
│    Bobst Library · Tandon Lounge        │
│    Kimmel Center                        │
│                                         │
│    ── FORMAT ──                         │
│    Up to 3 rounds · 15 min each        │
│    Swipe to browse · Tap to connect    │
│                                         │
│    ┌─────────────────────────────┐      │
│    │      Join This Session      │      │
│    └─────────────────────────────┘      │
│                                         │
│    Starts in 2 days, 4 hours           │
│                                         │
└─────────────────────────────────────────┘
```

**During Window (live):**
```
┌─────────────────────────────────────────┐
│ ← Back                                  │
├─────────────────────────────────────────┤
│                                         │
│    🤖 ML Builders Night      LIVE 🔴   │
│    18 people online · Ends in 2h 15m   │
│                                         │
│    ┌─────────────────────────────┐      │
│    │        Go Live Now          │      │
│    └─────────────────────────────┘      │
│                                         │
│    Round 0 of 3                         │
│                                         │
└─────────────────────────────────────────┘
```

### 6.3 Session Matching Screen (The Core Experience)

**Route:** `/session/[sessionId]/live`

**Accessible only when:** Session status is `live` AND user has RSVP'd AND user tapped "Go Live."

```
┌─────────────────────────────────────────┐
│ 🤖 ML Builders Night    Round 1/3      │
│ 18 online · Ends in 2h 12m             │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────────────────────┐    │
│  │ Header                          │    │
│  │ ┌──────┐ Alex Chen       [3/18]│    │
│  │ │Avatar│ CAS · CS · Junior     │    │
│  │ │ 80px │ ⭐ 94% show-up       │    │
│  │ └──────┘                        │    │
│  ├─────────────────────────────────┤    │
│  │                                 │    │
│  │ "Building a RAG pipeline for    │    │
│  │  course recommendation. Looking │    │
│  │  for feedback on my approach."  │    │
│  │                                 │    │
│  │ YOU BOTH LIKE                   │    │
│  │ [ML] [Python] [NLP]            │    │
│  │                                 │    │
│  │ INTERESTS                       │    │
│  │ [Computer Science] [AI] [+3]   │    │
│  │                                 │    │
│  │ ─────────────────────────       │    │
│  │ [      ■ Connect       ]        │    │
│  └─────────────────────────────────┘    │
│                                         │
│  ← swipe left or right to browse →     │
│                                         │
└─────────────────────────────────────────┘
```

**Key Differences from v1 Discover Tab:**

| Aspect | v1 (Spontaneous) | Themed Session |
|--------|-------------------|----------------|
| Header info | Distance, walk time, duration | School, major, year, show-up rate |
| Quote | Match explanation (system-generated) | User-written "What I'm working on" |
| Action button | "Send Invite" | "Connect" |
| Pool indicator | `[2/5]` (position in cycle) | `[3/18]` (position in session pool) |
| Cycle behavior | Reset after exhaustion | No reset — once you've seen everyone, that's it |
| Top bar | "Find a Buddy" | Theme name + round counter + session timer |
| Available duration | Presence-based (15–240 min) | Session window (fixed) |

### 6.4 Active Invite Row (Within Session)

Same pattern as v1's `ActiveInvitesRow` — horizontal row of pending outgoing invites above the card stack. Maximum 3 concurrent.

### 6.5 Invites Tab (Within Session)

Same pattern as v1's `InvitesTab` — incoming invites from other session participants. Accept/Decline.

### 6.6 Match Overlay (Within Session)

Same pattern as v1's `MatchOverlay`:
1. "It's a Match!" animation
2. Show both users' photos
3. Theme branding (emoji + color)
4. Auto-redirect to meeting coordination

### 6.7 End-of-Pool Interstitial (Themed)

When user has seen all available participants:

```
┌─────────────────────────────────────────┐
│                                         │
│    That's everyone in this session!     │
│                                         │
│    You've browsed all 18 participants   │
│    in ML Builders Night.                │
│                                         │
│    ┌─────────────────────────────┐      │
│    │    Wait for new joiners     │      │
│    └─────────────────────────────┘      │
│                                         │
│    New people may join throughout       │
│    the session. We'll notify you.       │
│                                         │
└─────────────────────────────────────────┘
```

**Behavior:** Unlike v1's cycle reset, the themed session does NOT restart the cycle. Instead:
- User sees a waiting state
- If new users join the session, a push notification is sent: "3 new people joined ML Builders Night"
- User can tap to re-enter the swipe flow with only new (unseen) users
- This prevents repetitive cycling and preserves the "fresh encounters" quality

---

## 7. User Card Design (Themed)

### 7.1 Card Layout

```
┌─────────────────────────────────────┐
│ Header (bg-theme-50/80)             │
│ ┌──────┐ Name              [3/18]  │
│ │Avatar│ School · Major · Year     │
│ │ 80px │ ⭐ 94% show-up rate      │
│ └──────┘                            │
├─────────────────────────────────────┤
│ Body                                │
│                                     │
│ "What I'm working on / discussing"  │ ← User-written, session-specific
│                                     │
│ YOU BOTH LIKE                       │
│ [Tag] [Tag] [Tag]                  │ ← Intersection of interests + theme tags
│                                     │
│ INTERESTS                           │
│ [Badge] [Badge] [Badge] [+2]      │ ← Non-shared interests
│                                     │
│ ─────────────────────────          │
│ [      ■ Connect       ]           │ ← Primary CTA
└─────────────────────────────────────┘
```

### 7.2 Card Fields

| Field | Source | v1 Equivalent |
|-------|--------|---------------|
| Name | `users.displayName` | Same |
| Avatar | `users.photoURL` | Same |
| School | `users.school` (NEW field) | — |
| Major | `users.major` (NEW field) | — |
| Year | `users.year` (NEW field) | — |
| Show-up Rate | `users.reliabilityStats` → formatted as % | Reliability badge in v1 explanation |
| "What I'm working on" | `sessionRsvps.promptResponse` (NEW) | v1's `explanation` (system-generated) |
| Shared tags | Intersection of user interests + theme tags | v1's "You both like" |
| Other interests | Non-shared interests | Same |
| Pool position | `[current/total]` from session pool | v1's `[current/total]` from cycle |

### 7.3 Session-Specific Prompt

When RSVP'ing, the user is asked:

> **What are you working on or want to discuss?** (≤140 characters)

This becomes the quote on their card. It's session-specific — different for each session the user joins.

**Examples:**
- "Building a RAG pipeline for course recommendations. Looking for feedback."
- "Exploring the intersection of behavioral econ and ML. Want to brainstorm."
- "Working on a DeFi project. Need a frontend co-founder."

### 7.4 New User Profile Fields

The themed flow requires additional profile fields collected during onboarding:

| Field | Type | Required | Options |
|-------|------|----------|---------|
| `school` | string | Yes | CAS, Stern, Tandon, Courant, Tisch, Steinhardt, Gallatin, SPS, Wagner, GSAS, Law, Dentistry, Medicine, Nursing, SPH, Silver, Rory Meyers |
| `major` | string | Yes | Free text (with autocomplete from known majors) |
| `year` | string | Yes | Freshman, Sophomore, Junior, Senior, Masters, PhD, Alumni |

---

## 8. Matching Flow (Within Session)

### 8.1 Entering the Session Pool

```
User taps "Go Live" on session detail page
    │
    ▼
System creates sessionPresence document
    │
    ▼
User redirected to /session/[sessionId]/live
    │
    ▼
System loads session pool (all online participants)
    │
    ▼
Swipe-to-browse begins (same gesture system as v1)
```

### 8.2 Session Presence

When a user enters a live session, a **session presence** document is created:

| Field | Type | Description |
|-------|------|-------------|
| `sessionId` | string | Which session |
| `uid` | string | Which user |
| `status` | enum | `available` \| `matched` \| `in_round` |
| `currentRound` | number | Which round (1, 2, 3) |
| `completedRounds` | number | Rounds completed |
| `seenUids` | string[] | Users already swiped past |
| `activeOutgoingOfferIds` | string[] | Pending connect requests (max 3) |
| `matchId` | string \| null | Current match ID |
| `promptResponse` | string | "What I'm working on" (≤140 chars) |
| `joinedAt` | Timestamp | When user entered pool |
| `lastActiveAt` | Timestamp | Last interaction |
| `expiresAt` | Timestamp | Session window end |

### 8.3 Connect Request (Themed Offer)

The "Connect" button creates a **themed offer** — structurally identical to v1's offer but scoped to a session:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (auto) | Offer ID |
| `sessionId` | string | Session scope |
| `fromUid` | string | Sender |
| `toUid` | string | Recipient |
| `toDisplayName` | string | Denormalized |
| `toPhotoURL` | string | Denormalized |
| `status` | enum | `pending` \| `accepted` \| `declined` \| `expired` \| `cancelled` |
| `expiresAt` | Timestamp | Expiry (5 minutes — shorter than v1's 10 min for speed) |
| `createdAt` | Timestamp | — |
| `respondedAt` | Timestamp | — |

**Differences from v1 Offer:**
- `sessionId` field (scoped to session)
- 5-minute expiry (vs 10 minutes in v1) — faster pace for themed sessions
- No `activity` field (activity is implicit from theme)
- No `distanceMeters` (irrelevant in themed context)
- Mutual invite detection works the same way

### 8.4 Offer Response

Same mechanics as v1's `offerRespond`:
- **Accept:** Creates match, transitions both users to `matched` / `in_round`
- **Decline:** 6-hour cooldown applies (prevents re-seeing in same session + future sessions)

### 8.5 Match Creation (Themed)

Same atomic match creation as v1 (`createMatchAtomic`), with additional fields:

| Additional Field | Type | Description |
|------------------|------|-------------|
| `sessionId` | string | Which session this match belongs to |
| `themeId` | string | Parent theme reference |
| `roundNumber` | number | Which round for each user |
| `meetingDurationMinutes` | number | From theme config (default 15) |

---

## 9. Meeting Flow — Speed Coffee Chat

### 9.1 Core Philosophy

The meeting flow is **deliberately simpler** than v1's full coordination flow. Speed coffee chats should feel lightweight and fast:

```
v1 Flow:         Match → Pick Place (120s, dual-choice) → Heading There → Arrived → Completed → Feedback
Themed Flow:     Match → Venue Assigned → Ready Check → Meeting → Quick Rate → Back to Pool
```

### 9.2 Venue Assignment

Instead of v1's dual-choice place selection with countdown, themed sessions use **simplified venue assignment**:

**Option A — Theme Venue (Default):**
- The theme has `suggestedVenues` (e.g., "Bobst 1st Floor", "Kimmel Lounge", "Tandon Cafe")
- System auto-assigns the nearest suggested venue to the midpoint of both users
- Users see the assigned venue immediately — no 120s decision period

**Option B — User Override:**
- After auto-assignment, either user can tap "Suggest Different Spot"
- Opens a compact list of the theme's suggested venues (max 5)
- Other user sees the suggestion and can accept or keep the original
- 60-second timeout → original assignment stands

**Rationale:** The 120s dual-choice flow in v1 adds friction that's appropriate for a full meetup but too heavy for a 15-minute speed chat. Auto-assignment with override reduces coordination overhead from ~2 minutes to ~10 seconds.

### 9.3 Ready Check

After venue assignment:

```
┌─────────────────────────────────────────┐
│ 🤖 ML Builders Night · Round 1          │
├─────────────────────────────────────────┤
│                                         │
│    You matched with Alex Chen!          │
│                                         │
│    📍 Meet at: Bobst Library, 1st Floor │
│    ⏱ 15 minute coffee chat              │
│                                         │
│    Alex is ready ✓                      │
│                                         │
│    ┌─────────────────────────────┐      │
│    │       I'm Ready ✓          │      │
│    └─────────────────────────────┘      │
│                                         │
│    ┌─────────────────────────────┐      │
│    │     Skip This Round         │      │
│    └─────────────────────────────┘      │
│                                         │
└─────────────────────────────────────────┘
```

**Ready Check Flow:**
1. Both users see venue + "I'm Ready" button
2. When both tap "Ready," a 15-minute meeting timer starts
3. If one user doesn't respond within 3 minutes, the match is auto-cancelled (no reliability penalty for the ready user; mild penalty for the non-responsive user)
4. "Skip This Round" cancels the match (counts as user-cancel; standard reliability impact)

### 9.4 Meeting Timer

```
┌─────────────────────────────────────────┐
│ 🤖 Round 1 · Alex Chen                  │
├─────────────────────────────────────────┤
│                                         │
│    📍 Bobst Library, 1st Floor          │
│    [Open in Maps]                       │
│                                         │
│    ┌────────────────────────────┐       │
│    │     ⏱ 12:34 remaining     │       │
│    │     ████████████░░░░░     │       │
│    └────────────────────────────┘       │
│                                         │
│    ── ALEX'S TOPIC ──                   │
│    "Building a RAG pipeline for         │
│     course recommendations."            │
│                                         │
│    ┌─────────────────────────────┐      │
│    │     Complete Meeting ✓      │      │
│    └─────────────────────────────┘      │
│                                         │
│    ┌─────────────────────────────┐      │
│    │     End Early               │      │
│    └─────────────────────────────┘      │
│                                         │
│    Report · Block                       │
│                                         │
└─────────────────────────────────────────┘
```

**Meeting States:**

| State | Trigger | Next |
|-------|---------|------|
| `venue_assigned` | Match created | `ready_check` |
| `ready_check` | Both users see venue | `meeting_active` (both ready) or `cancelled` (timeout/skip) |
| `meeting_active` | Both users confirm ready | `completed` (timer ends or manual complete) |
| `completed` | Timer expires or both tap "Complete" | Quick Rate → Back to Pool |
| `cancelled` | Skip, timeout, block | Back to Pool (or session exit) |

### 9.5 Quick Rate (Post-Meeting)

Instead of v1's full feedback page, themed sessions use an **inline quick rate**:

```
┌─────────────────────────────────────────┐
│                                         │
│    How was your chat with Alex?         │
│                                         │
│    [👍 Great]   [😐 OK]   [👎 Skip]    │
│                                         │
│    Would you connect again?             │
│    [Yes]  [No]                          │
│                                         │
│    ┌─────────────────────────────┐      │
│    │     Back to Session ▶      │      │
│    └─────────────────────────────┘      │
│                                         │
│    Round 1 complete · 2 rounds left     │
│                                         │
└─────────────────────────────────────────┘
```

**Quick Rate Fields:**

| Field | Type | Options |
|-------|------|---------|
| `quality` | enum | `great` \| `ok` \| `skip` |
| `wouldConnectAgain` | boolean | Yes / No |

**No text comments.** Speed > depth for quick rate. Full feedback can be collected via optional post-session survey.

### 9.6 Timer Expiry Behavior

When the 15-minute timer expires:
1. Meeting auto-transitions to `completed`
2. Quick Rate screen appears
3. If neither user tapped "Complete Meeting" before timer, both still get the Quick Rate prompt
4. **This is the normal flow** — the timer is a guideline, not a hard cutoff. Users might chat for 20 minutes and complete after the timer.

---

## 10. Matching Algorithm (Themed)

### 10.1 Key Differences from v1

| Factor | v1 (Spontaneous) | Themed Session |
|--------|-------------------|----------------|
| Primary filter | Geolocation (5km radius) | Session membership (all in same session) |
| Distance weight | 40% | 0% (irrelevant) |
| Interest weight | 15% | 35% |
| Reliability weight | 10% | 25% |
| Fairness weight | 10% | 15% |
| Theme relevance | N/A | 15% (NEW) |
| Urgency weight | 5% | 0% (session window handles urgency) |
| Duration weight | 20% | 0% (fixed by theme) |

### 10.2 Themed Scoring Formula

```
totalScore =
    0.35 × interestScore +
    0.25 × reliabilityScore +
    0.15 × fairnessScore +
    0.15 × themeRelevanceScore +
    0.10 × diversityScore
```

### 10.3 Score Components

| Factor | Weight | Calculation |
|--------|--------|-------------|
| **Interest Overlap** | 35% | `sharedInterests.length / max(3, min(userA.interests, userB.interests))`, capped at 1.0 |
| **Reliability** | 25% | `(meetRate × 1.0) - (cancelRate × 0.3)`, default 0.7 for new users |
| **Fairness** | 15% | `max(0.2, 1 - exposureInSession × 0.15)` — prevents same people getting all the matches |
| **Theme Relevance** | 15% | How well user's interests match the theme's tags: `matchingTags / theme.tags.length`, capped at 1.0 |
| **Diversity** | 10% | `0.5` if same school, `1.0` if different school. Bonus `+0.2` if different year. Encourages cross-pollination. |

### 10.4 Pool Exhaustion

When a user has seen all available participants:
- **No cycle reset** (unlike v1)
- User enters "waiting" state
- System monitors for new joiners
- If new users join, notification sent: "3 new people joined — swipe to see them"
- Only unseen users appear in the refreshed pool

---

## 11. Round System & Re-Entry

### 11.1 Round Lifecycle

```
Pool (available) ──► Matched ──► Venue Assigned ──► Ready Check ──► Meeting Active ──► Quick Rate ──► Pool (available)
                                                         │                                              │
                                                         └── timeout/skip ──► Pool (available)          └── if roundsCompleted < maxRounds
                                                                                                        └── if roundsCompleted >= maxRounds ──► Session Complete
```

### 11.2 Round Rules

| Rule | Value | Rationale |
|------|-------|-----------|
| Max rounds per user per session | 3 (configurable per theme) | Prevents monopolization; keeps sessions manageable |
| Min time between rounds | 0 (immediate re-entry) | Speed > friction |
| Can match with same person twice? | No (within same session) | Freshness — different connections each round |
| Cross-session re-matching | Yes (different sessions) | Same person in "ML Night" and "Founder Lab" = different context |

### 11.3 Round Counter UI

Always visible in the session header:

```
Round 2/3 · 14 online · Ends in 1h 22m
```

After completing all rounds:

```
┌─────────────────────────────────────────┐
│                                         │
│    🎉 All rounds complete!              │
│                                         │
│    You connected with:                  │
│    • Alex Chen (ML / CAS)              │
│    • Sarah Kim (Finance / Stern)        │
│    • James Li (CS / Tandon)             │
│                                         │
│    ┌─────────────────────────────┐      │
│    │     View Session Summary    │      │
│    └─────────────────────────────┘      │
│                                         │
│    ┌─────────────────────────────┐      │
│    │     Back to Home            │      │
│    └─────────────────────────────┘      │
│                                         │
└─────────────────────────────────────────┘
```

### 11.4 Session Summary

After the session ends (or user completes all rounds), a summary is available:

| Data Point | Description |
|------------|-------------|
| People met | Names + schools of matched users |
| Rounds completed | X of Y |
| Quality breakdown | Great / OK / Skip counts from Quick Rate |
| Session stats | Total participants, total rounds completed, avg rating |

---

## 12. Reliability & Reputation

### 12.1 Unified Reliability Score

The themed layer uses the **same reliability system** as v1. A user has one reliability score across both modes.

### 12.2 Themed Session Events That Affect Reliability

| Event | Reliability Impact |
|-------|-------------------|
| Complete a meeting (both rate) | +1 `metConfirmed` |
| Skip round after matching (user-initiated) | +1 `cancelledByUser` (standard penalty) |
| Fail ready check (timeout, no response) | +1 `noShow` (no-show penalty) |
| Cancel meeting during timer | +1 `cancelledByUser` (standard penalty) |
| Session auto-cancelled (system) | No impact |
| Don't attend after RSVP | No reliability impact (RSVP is non-binding) |

### 12.3 Show-Up Rate Display

On themed cards, reliability is displayed as a **show-up rate percentage**:

```
⭐ 94% show-up rate
```

Formula: `Math.round((metConfirmed / totalMatches) * 100)` with minimum 3 matches before displaying.

New users (< 3 matches): Show "New to NYU Buddy" instead of a percentage.

---

## 13. Coexistence with Spontaneous Mode

### 13.1 Architecture

```
┌─────────────────────────────────────────────────┐
│                   NYU Buddy App                  │
│                                                  │
│  ┌──────────────────┐  ┌─────────────────────┐  │
│  │  Themed Meetup    │  │ Spontaneous Meetup  │  │
│  │  (This PRD)       │  │ (v1.0 PRD_AsIs)     │  │
│  │                   │  │                     │  │
│  │  Session-scoped   │  │  Always available   │  │
│  │  Theme pool       │  │  Proximity pool     │  │
│  │  Speed coffee     │  │  Full meetup        │  │
│  │  Multiple rounds  │  │  Single match       │  │
│  └────────┬──────────┘  └──────────┬──────────┘  │
│           │                        │              │
│  ┌────────┴────────────────────────┴──────────┐  │
│  │          Shared Infrastructure              │  │
│  │  • Auth & Profile (users collection)       │  │
│  │  • Reliability Score (unified)             │  │
│  │  • Places / Venues                         │  │
│  │  • Block / Report                          │  │
│  │  • Push Notifications (FCM)                │  │
│  │  • Match Creation (atomic)                 │  │
│  │  • PWA / Installation                      │  │
│  └─────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 13.2 Mutual Exclusion Rules

| Rule | Enforcement |
|------|-------------|
| User can be in a themed session AND spontaneous mode? | **No.** One mode at a time. |
| User can RSVP to multiple sessions? | **Yes.** But can only be live in one at a time. |
| User in active themed match can go spontaneous? | **No.** Must complete or cancel current round first. |
| User in active spontaneous match can join a session? | **No.** Must complete or cancel current match first. |
| Themed blocks carry over to spontaneous? | **Yes.** Block is global. |
| Reliability spans both modes? | **Yes.** One unified score. |

### 13.3 UI Priority

| Scenario | Home Screen Behavior |
|----------|---------------------|
| Live session the user RSVP'd to | "LIVE NOW" card at top, prominent. Spontaneous card below. |
| No live sessions | Upcoming sessions at top. Spontaneous card visible. |
| User is in active spontaneous session | Themed sessions visible but "Join" disabled (shows "End current session to join"). |
| User is in active themed session | Spontaneous card hidden. |

---

## 14. Data Model — New & Modified Collections

### 14.1 New Collection: `themes`

**Purpose:** Reusable theme templates
**Document ID:** Auto-generated

| Field | Type | Write Authority |
|-------|------|-----------------|
| `name` | string | Admin |
| `description` | string | Admin |
| `emoji` | string | Admin |
| `tags` | string[] | Admin |
| `category` | enum | Admin |
| `targetSchools` | string[] | Admin |
| `suggestedVenues` | string[] (place IDs) | Admin |
| `maxRoundsPerUser` | number | Admin |
| `meetingDurationMinutes` | number | Admin |
| `minParticipants` | number | Admin |
| `color` | string | Admin |
| `active` | boolean | Admin |
| `createdBy` | string | Admin |
| `createdAt` | Timestamp | Admin |
| `updatedAt` | Timestamp | Admin |

### 14.2 New Collection: `themeSessions`

**Purpose:** Scheduled instances of themes
**Document ID:** Auto-generated

| Field | Type | Write Authority |
|-------|------|-----------------|
| `themeId` | string | Admin / System |
| `themeName` | string | System (denormalized) |
| `themeEmoji` | string | System (denormalized) |
| `themeColor` | string | System (denormalized) |
| `scheduledDate` | string | Admin |
| `windowStart` | Timestamp | Admin |
| `windowEnd` | Timestamp | Admin |
| `status` | enum | System |
| `rsvpCount` | number | System (counter) |
| `activeCount` | number | System (live) |
| `completedRounds` | number | System (counter) |
| `createdAt` | Timestamp | System |
| `updatedAt` | Timestamp | System |

### 14.3 New Collection: `sessionRsvps`

**Purpose:** User RSVPs for sessions
**Document ID:** `{sessionId}_{uid}`

| Field | Type | Write Authority |
|-------|------|-----------------|
| `sessionId` | string | Client |
| `uid` | string | Client |
| `promptResponse` | string (≤140 chars) | Client |
| `rsvpAt` | Timestamp | Client |
| `attended` | boolean | System |
| `roundsCompleted` | number | System |

### 14.4 New Collection: `sessionPresence`

**Purpose:** Real-time user state within a live session (replaces v1's `presence` for themed context)
**Document ID:** `{sessionId}_{uid}`

| Field | Type | Write Authority |
|-------|------|-----------------|
| `sessionId` | string | Cloud Function |
| `uid` | string | Cloud Function |
| `status` | enum (`available` / `matched` / `in_round`) | Cloud Function |
| `currentRound` | number | Cloud Function |
| `completedRounds` | number | Cloud Function |
| `seenUids` | string[] | Cloud Function |
| `activeOutgoingOfferIds` | string[] | Cloud Function |
| `matchId` | string \| null | Cloud Function |
| `exposureScore` | number | Cloud Function |
| `joinedAt` | Timestamp | Cloud Function |
| `lastActiveAt` | Timestamp | Cloud Function |
| `expiresAt` | Timestamp | Cloud Function (= session windowEnd) |

### 14.5 Modified Collection: `offers`

Add optional field:

| Field | Type | Description |
|-------|------|-------------|
| `sessionId` | string \| null | `null` for spontaneous offers; session ID for themed offers |

Offers with `sessionId` use 5-minute TTL; without use 10-minute TTL.

### 14.6 Modified Collection: `matches`

Add optional fields:

| Field | Type | Description |
|-------|------|-------------|
| `sessionId` | string \| null | `null` for spontaneous matches |
| `themeId` | string \| null | `null` for spontaneous matches |
| `roundNumber` | object \| null | `{ [uid]: number }` — round number for each user |
| `meetingDurationMinutes` | number \| null | From theme config; `null` for spontaneous |
| `venueAssignment` | object \| null | `{ placeId, placeName, placeAddress, assignedAt }` |
| `readyCheck` | object \| null | `{ [uid]: { ready: boolean, readyAt: Timestamp } }` |
| `meetingStartedAt` | Timestamp \| null | When both users confirmed ready |
| `meetingTimerExpiresAt` | Timestamp \| null | `meetingStartedAt + meetingDurationMinutes` |

### 14.7 New Collection: `quickRatings`

**Purpose:** Lightweight post-meeting ratings for themed sessions
**Document ID:** `{matchId}_{uid}`

| Field | Type | Write Authority |
|-------|------|-----------------|
| `matchId` | string | Client |
| `sessionId` | string | Client |
| `uid` | string | Client |
| `quality` | enum (`great` / `ok` / `skip`) | Client |
| `wouldConnectAgain` | boolean | Client |
| `createdAt` | Timestamp | Client |

### 14.8 Modified Collection: `users`

Add fields (collected during onboarding):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `school` | string | Yes | NYU school (CAS, Stern, Tandon, etc.) |
| `major` | string | Yes | Field of study |
| `year` | string | Yes | Freshman–PhD/Alumni |

---

## 15. Backend API Surface

### 15.1 New Cloud Functions

| Function | Type | Description |
|----------|------|-------------|
| `sessionJoin` | onCall | RSVP to a session (create sessionRsvp doc, increment rsvpCount) |
| `sessionLeave` | onCall | Cancel RSVP (delete sessionRsvp doc, decrement rsvpCount) |
| `sessionGoLive` | onCall | Enter session pool (create sessionPresence doc) |
| `sessionExitPool` | onCall | Leave session pool (delete sessionPresence doc) |
| `sessionGetPool` | onCall | Get current pool for swiping (themed scoring algorithm) |
| `sessionOfferCreate` | onCall | Send connect request within session |
| `sessionOfferRespond` | onCall | Accept/decline connect request |
| `sessionMatchReady` | onCall | Ready check confirmation |
| `sessionMatchComplete` | onCall | Complete meeting + optional venue override |
| `sessionMatchCancel` | onCall | Cancel/skip a round |
| `sessionTransitionStatus` | onSchedule | Transition session status (scheduled → live → ending → completed) |
| `sessionCleanupPresence` | onSchedule | Clean up stale session presence docs |

### 15.2 Reused Cloud Functions (from v1)

| Function | Modification Needed |
|----------|-------------------|
| `matchCancel` | Add `sessionId` awareness for round counting |
| `updateMatchStatus` | Add themed match states (venue_assigned, ready_check, meeting_active) |
| `matchFetchAllPlaces` | Reused for venue override flow (subset of theme venues) |

### 15.3 Function Configuration

All new functions: `{ region: 'us-east1' }` (same as v1).

---

## 16. Push Notifications & Reminders

### 16.1 Session Lifecycle Notifications

| Trigger | Recipient | Message |
|---------|-----------|---------|
| 60 min before `windowStart` | All RSVP'd users | "🤖 ML Builders Night starts in 1 hour! 23 people are joining." |
| 15 min before `windowStart` | All RSVP'd users | "🤖 ML Builders Night starts in 15 minutes! Get ready." |
| Session goes `live` | All RSVP'd users | "🤖 ML Builders Night is LIVE! Tap to join." |
| Session enters `ending` | All active users in session | "⏰ ML Builders Night ends in 30 minutes. Complete your rounds!" |

### 16.2 In-Session Notifications

| Trigger | Recipient | Message |
|---------|-----------|---------|
| Receive connect request | Target user | "Alex wants to connect with you in ML Builders Night!" |
| Match created | Both users | "You matched with Alex! Head to the venue." |
| Ready check reminder (2 min) | Non-ready user | "Alex is waiting! Tap Ready to start your coffee chat." |
| New users join after pool exhaustion | Users in waiting state | "3 new people joined ML Builders Night — check them out!" |

### 16.3 Post-Session Notifications

| Trigger | Recipient | Message |
|---------|-----------|---------|
| Session completed | All attended users | "🎉 ML Builders Night wrapped up! You met 3 people. See your summary." |
| Next week's session announced | Users who attended previous | "🤖 ML Builders Night is back next Monday 6–9pm. Join early!" |

---

## 17. Admin — Theme Management

### 17.1 Admin Theme Page

**Route:** `/admin/themes`

**Features:**
- Create/edit/archive themes
- Schedule sessions for a theme (date + time)
- View RSVP counts per session
- View live session stats (active users, rounds completed)
- Manual session cancellation

### 17.2 Admin Session Dashboard

**Route:** `/admin/sessions`

**Live Session View:**
- Real-time active user count
- Rounds in progress
- Completed rounds
- Average quick rating
- User list with status

---

## 18. Edge Cases & Error Handling

### 18.1 Session-Specific Edge Cases

| Edge Case | Handling |
|-----------|----------|
| Session goes live with < minParticipants | Session still goes live (minParticipants is advisory). Show "Only X people are here — invite friends!" |
| User's session presence expires (app closed) | `sessionCleanupPresence` removes stale docs after 5 min inactivity. User can rejoin. |
| User in themed match when session enters `ending` | Active matches continue. No new matches. Match must complete or cancel. |
| User in themed match when session `completed` | Active match auto-cancelled with `reason: 'session_ended'`. No reliability penalty. |
| Both users in a match block each other | Same as v1: match cancelled, blocks created, both users returned to pool (or session exit). |
| User force-quits app during ready check | 3-minute ready check timeout. Match auto-cancelled. Non-responsive user gets mild no-show penalty. |
| Network failure during meeting timer | Timer is server-authoritative (`meetingTimerExpiresAt`). Client syncs on reconnect. |
| User tries to join session while in spontaneous match | Blocked. "End your current meetup to join this session." |
| Session cancelled by admin while live | All active matches cancelled (no penalty). All users notified. Redirect to home. |

### 18.2 Race Conditions

All match creation uses v1's `createMatchAtomic` with pair-level guard. No additional race conditions introduced.

Session-specific guards:
- `sessionGoLive` checks user is not in any active match (themed or spontaneous)
- `sessionOfferCreate` checks user's `sessionPresence.status === 'available'`
- `sessionOfferRespond` re-checks both users' availability within transaction

### 18.3 Data Consistency

| Concern | Mitigation |
|---------|-----------|
| `rsvpCount` drift | Recalculate on session status transitions (scheduled → live, live → completed) |
| `activeCount` accuracy | Updated every 30 seconds via scheduled function OR derived from `sessionPresence` query |
| Stale `sessionPresence` docs | `sessionCleanupPresence` runs every 2 minutes during live sessions |

---

## 19. Success Metrics

### 19.1 Primary Metrics (North Stars)

| Metric | Definition | Target (Launch) |
|--------|------------|-----------------|
| **Session Attendance Rate** | `attended / rsvpCount` per session | > 60% |
| **Match-to-Meeting Rate** | `completedMeetings / totalMatches` per session | > 70% |
| **Rounds per User per Session** | Average `roundsCompleted` | > 1.5 |
| **Weekly Active Session Participants** | Unique users who attended ≥1 session per week | Growing week-over-week |

### 19.2 Secondary Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| **RSVP Count per Session** | Average RSVPs per session | > 15 |
| **Peak Online per Session** | Max simultaneous active users | > 10 |
| **Quick Rate Quality** | % of "Great" ratings | > 50% |
| **Would Connect Again Rate** | % of "Yes" on wouldConnectAgain | > 60% |
| **Cross-Session Retention** | % of users who attend session N and N+1 of same theme | > 40% |
| **Cross-Theme Exploration** | % of users who attend ≥2 different themes in a month | > 25% |

### 19.3 Comparison Metrics (Themed vs Spontaneous)

Track these **per mode** to inform the A/B decision:

| Metric | Themed | Spontaneous |
|--------|--------|-------------|
| Match-to-meeting completion rate | Track | Track |
| User satisfaction (Quick Rate / Feedback) | Track | Track |
| Week-over-week retention | Track | Track |
| Average matches per active user per week | Track | Track |
| Time-to-first-match (from going live) | Track | Track |

**Decision rule after 4 weeks:** If themed session metrics dominate spontaneous across all dimensions, consider deprecating spontaneous. If spontaneous shows unique value (e.g., weekday afternoon usage), keep both. If spontaneous cannibalizes themed (users skip sessions to go spontaneous), restrict spontaneous access.

---

## 20. Phasing & MVP Scope

### 20.1 MVP (Phase 1) — Ship This First

| Feature | In MVP? | Notes |
|---------|---------|-------|
| Theme creation (admin) | ✅ | Manual via admin page |
| Session scheduling (admin) | ✅ | Manual date/time picker |
| RSVP system | ✅ | Join button + prompt response |
| Session lifecycle (scheduled → live → completed) | ✅ | Scheduled Cloud Function |
| Session matching screen (swipe) | ✅ | Reuse v1 swipe mechanics |
| Themed scoring algorithm | ✅ | New scoring weights |
| Themed offers (5-min TTL) | ✅ | Modified offer creation |
| Auto venue assignment | ✅ | Nearest suggested venue |
| Ready check (3-min timeout) | ✅ | New flow |
| Meeting timer (15 min) | ✅ | New UI |
| Quick Rate | ✅ | New UI |
| Round counter (up to 3) | ✅ | New state management |
| Re-entry to pool after round | ✅ | Core loop |
| Push notifications (session reminders) | ✅ | Reuse FCM infra |
| Session detail page | ✅ | New page |
| Home screen redesign (themed hero) | ✅ | Modified home page |
| New profile fields (school/major/year) | ✅ | Modified onboarding |
| Coexistence with spontaneous mode | ✅ | Mutual exclusion rules |
| End-of-pool waiting state | ✅ | New interstitial |

### 20.2 Phase 2 — Post-Launch Iteration

| Feature | Notes |
|---------|-------|
| Venue override flow | Let users suggest different spot (60s timeout) |
| Session summary page | Post-session stats and connection list |
| "New joiners" notification during session | Push when new people enter pool |
| Data-driven theme suggestions | Analyze interests to suggest new themes |
| User-submitted theme proposals | Community-driven theme creation |
| Recurring session auto-scheduling | Weekly recurrence for themes |
| Theme-specific chat (post-meeting) | Optional follow-up channel after meeting |

### 20.3 Phase 3 — Growth & Intelligence

| Feature | Notes |
|---------|-------|
| AI-powered theme curation from micro-posts | Content layer feeds theme selection |
| Smart scheduling (optimal time detection) | Data-driven session timing |
| Cross-campus expansion (other universities) | Template the theme + session model |
| Alumni network integration | Alumni join as mentors in career themes |

---

## 21. v1.0 Reuse Map

### 21.1 Direct Reuse (No Modification)

| Component | v1 Location | Usage in Themed |
|-----------|-------------|-----------------|
| Authentication flow | `AuthProvider`, `/login`, `/onboarding` | Same auth, add school/major/year to onboarding |
| Swipe gesture system | `SuggestionCard.tsx` | Same gesture mechanics, different card content |
| Card stack architecture | `SuggestionCard.tsx` (CardBody) | Adapt CardBody for themed card fields |
| iOS PWA touch handling | Three-layer fix in SuggestionCard | Direct reuse |
| Client-side buffering | `useCycleSuggestions.ts` | Adapt for session pool (different backend endpoint) |
| Atomic match creation | `createMatchAtomic.ts` | Direct reuse |
| Block/Report system | `blocks` collection, UI components | Direct reuse |
| Push notification infra | FCM setup, service worker | Direct reuse, add session-specific payloads |
| PWA installation flow | Install banner, iOS/Android guides | Direct reuse |
| Profile avatar + preloading | `ProfileAvatar.tsx`, image preload | Direct reuse |
| Scroll/layout locking | Layout.tsx fixed positioning | Direct reuse |

### 21.2 Modified Reuse

| Component | v1 Location | Modification for Themed |
|-----------|-------------|------------------------|
| Home page | `page.tsx` | Add session cards above spontaneous option |
| Offers hook | `useOffers.ts` | Add `sessionId` filtering |
| Match hook | `useMatch.ts` | Add themed match states |
| Presence hook | `usePresence.ts` | Add session-aware presence |
| Cycle suggestions hook | `useCycleSuggestions.ts` | Fork for session pool endpoint |
| Active invites row | `ActiveInvitesRow.tsx` | Same UI, scoped to session |
| Tab navigation | `TabNavigation.tsx` | Reuse within session matching screen |
| Match overlay | `MatchOverlay.tsx` | Add theme branding |
| Feedback page | `feedback/[matchId]/page.tsx` | Replace with inline Quick Rate |
| Admin spots page | `admin/spots/page.tsx` | Reference pattern for theme management |

### 21.3 New (No v1 Equivalent)

| Component | Description |
|-----------|-------------|
| Session detail page | `/session/[sessionId]` |
| Session matching screen | `/session/[sessionId]/live` |
| Ready check UI | Post-match venue + ready flow |
| Meeting timer UI | 15-min countdown during meeting |
| Quick Rate UI | Inline post-meeting rating |
| Round counter | Header component showing round progress |
| Session summary | Post-session connection recap |
| Theme management admin | `/admin/themes`, `/admin/sessions` |
| Session presence system | `sessionPresence` collection + hooks |
| Themed scoring algorithm | New scoring weights and factors |

---

**END OF DOCUMENT**
