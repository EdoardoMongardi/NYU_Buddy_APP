# Messaging Feature — Technical Documentation

This document describes every aspect of the chat/messaging functionality in NYU Buddy, derived directly from the source code. It covers data models, backend calls, state management, UI structure, and iOS keyboard handling.

---

## Table of Contents

1. [Overview & Two-Step Flow](#1-overview--two-step-flow)
2. [Route & File Structure](#2-route--file-structure)
3. [Data Models & Firestore Schema](#3-data-models--firestore-schema)
4. [Backend Cloud Functions](#4-backend-cloud-functions)
5. [State Management & Hooks](#5-state-management--hooks)
6. [UI Architecture](#6-ui-architecture)
7. [iOS Keyboard Handling](#7-ios-keyboard-handling)
8. [Safety Features](#8-safety-features)
9. [Message Limits & Validation](#9-message-limits--validation)
10. [Desktop vs Mobile Layout](#10-desktop-vs-mobile-layout)

---

## 1. Overview & Two-Step Flow

The messaging feature is part of the match page at `/match/[matchId]`. It has two distinct phases:

### Step 1: Location Decision + Chat Drawer

Before both users have agreed on a meetup place, the page shows:
- A **LocationDecisionPanel** with place candidates, countdown timer, and selection UI.
- A collapsible **Chat Drawer** at the bottom that can be toggled open/closed. When open, it occupies 65% of the viewport height (100% when the keyboard is open). When closed, it collapses to just the toggle button height.

The chat drawer allows users to communicate while choosing a meetup location.

### Step 2: Full-Screen Chat View

Once a place is confirmed (`match.confirmedPlaceName` is set), the page transitions to a full-screen chat view that includes:
- A green **confirmed place banner** at the top showing the place name and address.
- The full **ChatPanel** with messages, input, and status quick-action buttons.
- A **"Leave Feedback"** link that appears after the user marks the meetup as complete.

The transition condition in code:
```typescript
const showLocationSelection = !match?.confirmedPlaceName;
```

---

## 2. Route & File Structure

### Page

| File | Description |
|------|-------------|
| `src/app/(protected)/match/[matchId]/page.tsx` | Production match page (MatchPage component). Full-screen fixed layout with visual viewport management. |
| `src/app/(protected)/layout.tsx` | Protected layout wrapping all auth-required routes. Provides Navbar, NotificationPrompt, InstallBanner. The match page overlays this with `position: fixed; z-index: 50`. |

### Components

| File | Description |
|------|-------------|
| `src/components/match/ChatPanel.tsx` | Core chat interface — messages list, input bar, confirmed place banner, status quick actions. Accepts a `compact` prop for keyboard-open state. |
| `src/components/match/StatusQuickActions.tsx` | Horizontal row of status pill buttons (e.g., "On my way", "I've arrived", "Complete Meetup"). Renders above the input bar in Step 2. |
| `src/components/match/LocationDecisionPanel.tsx` | Place selection UI with countdown timer, place cards, side-by-side choice grid, and swipeable candidate row. |
| `src/components/match/CancelReasonModal.tsx` | Modal dialog with radio-button reasons for cancelling a match. |
| `src/components/match/PlaceCard.tsx` | Individual place card used in the LocationDecisionPanel. |

### Hooks

| File | Description |
|------|-------------|
| `src/lib/hooks/useChat.ts` | Real-time chat messages via Firestore `onSnapshot`. Provides `messages`, `sendMessage`, `isSending`, `isAtLimit`, `totalCount`. |
| `src/lib/hooks/useMatch.ts` | Real-time match document listener. Provides `match`, `otherUserProfile`, `myStatus`, `updateStatus`, `cancellationReason`. |
| `src/lib/hooks/useLocationDecision.ts` | Location decision logic — place candidates, choices, countdown timer, resolution triggers. |
| `src/lib/hooks/usePresence.ts` | User presence tracking. Listens to `presence/{uid}` document. Called for side-effects on the match page. |
| `src/lib/hooks/useAuth.ts` | Re-exports from `AuthProvider`. Provides `user` (Firebase Auth) and `userProfile`. |
| `src/lib/hooks/useVisualViewport.ts` | iOS visual viewport tracker for keyboard animations. Sets CSS custom properties on `<html>`. Returns `isKeyboardOpen`. |
| `src/lib/hooks/useLockBodyScroll.ts` | Locks body scrolling by setting `body.position: fixed`. Prevents iOS Safari layout viewport scroll. |
| `src/lib/hooks/useWhiteThemeColor.ts` | Sets `<meta name="theme-color">` to `#ffffff` so Safari's bottom browser chrome blends with the chat UI. |

### Firebase Functions

| File | Description |
|------|-------------|
| `src/lib/firebase/functions.ts` | Client-side wrappers for all Firebase Cloud Functions, including chat, match status, location decision, and safety functions. |

---

## 3. Data Models & Firestore Schema

### Match Document

**Collection**: `matches/{matchId}`

```typescript
interface Match {
  id: string;
  user1Uid: string;
  user2Uid: string;
  status: string;                        // 'location_deciding' | 'pending' | 'cancelled' | 'completed' | 'expired_pending_confirmation'
  statusByUser: Record<string, string>;  // { [uid]: 'pending' | 'heading_there' | 'arrived' | 'completed' }
  matchedAt: Timestamp;
  confirmedPlaceId?: string;
  confirmedPlaceName?: string;
  confirmedPlaceAddress?: string;
  placeConfirmedBy?: string;
  cancelledBy?: string;
  cancelledAt?: Timestamp;
  cancelReason?: string;                 // legacy field
  cancellationReason?: string;           // current backend field
  // Location decision fields (see below)
  placeCandidates?: PlaceCandidate[];
  placeChoiceByUser?: Record<string, PlaceChoice | null>;
  locationDecision?: LocationDecision;
  confirmedPlaceLat?: number;
  confirmedPlaceLng?: number;
}
```

### Chat Message Document

**Collection**: `matches/{matchId}/messages/{messageId}`

```typescript
interface ChatMessage {
  id: string;
  type: 'text' | 'status';       // 'text' for user messages, 'status' for system announcements
  senderUid: string;
  content: string;                 // Message text or status description (e.g., "is on the way 🚶")
  statusValue?: string;            // Optional raw status value for status-type messages
  createdAt: Timestamp | null;
}
```

Messages are stored as a subcollection of the match document. They are ordered by `createdAt` ascending. Both text messages and status updates (e.g., "is on the way") are stored in the same subcollection — status updates have `type: 'status'`.

### Place Candidate

```typescript
interface PlaceCandidate {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  distance: number;    // distance in meters
  rank: number;
  tags?: string[];
  priceLevel?: number;
  priceRange?: string; // e.g., "$20-$50"
  photoUrl?: string;
}
```

### Place Choice

```typescript
interface PlaceChoice {
  placeId: string;
  placeRank: number;
  chosenAt: Timestamp;
}
```

### Location Decision

```typescript
interface LocationDecision {
  expiresAt?: Timestamp;      // countdown deadline
  resolvedAt?: Timestamp;
  resolutionReason?: string;  // e.g., 'both_chose_same', 'timeout', etc.
}
```

### Other Documents

| Collection | Document ID | Fields | Purpose |
|------------|-------------|--------|---------|
| `users/{uid}` | User UID | `displayName`, `photoURL`, `interests[]`, `profileCompleted` | User profiles. The match page listens to the other user's profile for display name, avatar, and interests. |
| `presence/{uid}` | User UID | `uid`, `activity`, `durationMin`, `lat`, `lng`, `status`, `matchId?`, `expiresAt` | User presence/availability. The match page calls `usePresence()` for side-effect registration. |
| `reports/{matchId}_{uid}` | Composite key | `reportedBy`, `reportedUser`, `matchId`, `reason`, `createdAt` | User reports. Written directly from the client via `setDoc`. |
| `blocks/{uid}/blocked/{otherUid}` | Blocked user UID | `blockedAt` | User blocks. Written directly from the client via `setDoc`. |

---

## 4. Backend Cloud Functions

All backend calls go through Firebase Cloud Functions (HTTPS Callable). The client-side wrappers are in `src/lib/firebase/functions.ts`.

### Chat Functions

| Function | Input | Output | Description |
|----------|-------|--------|-------------|
| `matchSendMessage` | `{ matchId, content }` | `{ success, messageId }` | Sends a text message. The backend validates the content and writes to `matches/{matchId}/messages`. |

### Match Status Functions

| Function | Input | Output | Description |
|----------|-------|--------|-------------|
| `updateMatchStatus` | `{ matchId, status }` | `{ success }` | Updates the user's status within the match. Valid statuses: `'heading_there'`, `'arrived'`, `'completed'`. The backend also writes a status-type message to the messages subcollection. |
| `matchCancel` | `{ matchId, reason?, idempotencyKey? }` | `{ success, wasSevereCancel }` | Cancels the match. Supports idempotency via retry-with-backoff wrapper. Reason is a user-provided string. |

### Location Decision Functions

| Function | Input | Output | Description |
|----------|-------|--------|-------------|
| `matchFetchAllPlaces` | `{ matchId }` | `{ success, placeCandidates[], expiresAt, alreadyFetched }` | Fetches place candidates for the match. Called once on mount if `placeCandidates` is empty. |
| `matchSetPlaceChoice` | `{ matchId, placeId, placeRank, action? }` | `{ success, action, chosenPlaceId?, bothChoseSame?, shouldResolve? }` | Sets or updates the user's place choice. Actions: `'choose'`, `'tick'` (go with their choice), `'findOthers'` (telemetry only). |
| `matchResolvePlaceIfNeeded` | `{ matchId }` | `{ success, alreadyConfirmed, confirmedPlaceId, confirmedPlaceName, confirmedPlaceAddress, ... }` | Resolves the place decision. Called when both choose the same place, or when the countdown expires. |

### Safety Functions

Reports and blocks are written directly to Firestore from the client (not via Cloud Functions):
- **Report**: `setDoc(doc(db, 'reports', `${matchId}_${user.uid}`), { reportedBy, reportedUser, matchId, reason, createdAt })`
- **Block**: `setDoc(doc(db, 'blocks', user.uid, 'blocked', otherUid), { blockedAt })` followed by `matchCancel({ matchId, reason: 'blocked' })`

---

## 5. State Management & Hooks

### useChat(matchId)

Subscribes to the `matches/{matchId}/messages` subcollection via Firestore `onSnapshot`, ordered by `createdAt` ascending.

**State**:
- `messages: ChatMessage[]` — all messages, updated in real-time.
- `isSending: boolean` — true while a `matchSendMessage` call is in-flight.
- `error: string | null` — validation or send error.
- `totalCount: number` — current number of messages (derived from `messages.length`).

**Derived**:
- `isAtLimit: boolean` — `totalCount >= 400`.

**Validation** (`validateContent`):
- Non-empty after trim.
- Max 500 characters.
- Max 100 words.
- Total messages < 400.

### useMatch(matchId)

Two real-time listeners:
1. `matches/{matchId}` — the match document itself.
2. `users/{otherUid}` — the other user's profile (derived from match.user1Uid/user2Uid).

Loading is only set to `false` after **both** listeners have their first data.

**State**:
- `match: Match | null`
- `otherUserProfile: { displayName, photoURL?, interests[] } | null`
- `loading: boolean`
- `error: string | null`

**Derived**:
- `myStatus: string | null` — `match.statusByUser[user.uid]`.
- `cancellationReason: string | undefined` — normalized from `cancelReason` (legacy) or `cancellationReason` (current).

**Actions**:
- `updateStatus(status)` — calls `updateMatchStatus` Cloud Function.

### useLocationDecision(matchId)

Subscribes to the match document and manages the location selection flow.

**State**:
- `match: MatchDoc | null` — match document with location-specific fields.
- `windowIndex: number` — current position in the rolling window system.
- `countdown: number | null` — seconds remaining until auto-resolve.
- `isSettingChoice: boolean` — true while `matchSetPlaceChoice` is in-flight.
- `isResolving: boolean` — true while `matchResolvePlaceIfNeeded` is in-flight.

**Rolling Window System** (`generateWindows`):
Place candidates are shown in groups of 3 using a rolling window approach:
- For N ≤ 3: one window `[0, 1, 2]`.
- For N = 4: `[[0,1,2], [0,1,3]]`.
- For N = 5: `[[0,1,2], [0,3,4]]`.
- For N ≥ 6: windows of 3, always ending with `[N-3, N-2, N-1]`.

**Actions**:
- `handleSetChoice(placeId, placeRank, isTick?)` — sets the user's choice. If both users chose the same, triggers resolution.
- `handleGoWithTheirChoice()` — sets the user's choice to match the other user's (tick action).
- `handleFindOthers()` — cycles through candidate windows.
- `triggerResolution()` — calls `matchResolvePlaceIfNeeded`.

**Auto-Resolution**: When the countdown reaches 0 and `match.status === 'location_deciding'`, `triggerResolution()` is called automatically.

### usePresence()

Subscribes to `presence/{user.uid}` for the current user's presence data. On the match page, this is called purely for the side-effect of maintaining the real-time listener (the return value `myPresence` is not used).

### Match Page Local State

The match page (`MatchPage` component) manages the following local state:

| State | Type | Purpose |
|-------|------|---------|
| `isUpdating` | boolean | True while a status update is in-flight. |
| `reportReason` | string | User-entered report reason text. |
| `isReporting` | boolean | True while a report is being submitted. |
| `isBlocking` | boolean | True while a block is being processed. |
| `isCancelling` | boolean | True while a cancellation is in-flight. |
| `cancelModalOpen` | boolean | Controls CancelReasonModal visibility. |
| `chatDrawerOpen` | boolean | Controls the Step 1 chat drawer open/closed state. |
| `reportDialogOpen` | boolean | Controls the report dialog visibility. |
| `contentMounted` | boolean | Tracks whether ChatPanel content should stay in DOM during drawer close animation. |
| `collapsedH` | number | Measured pixel height of the drawer toggle handle for precise collapsed state. |

---

## 6. UI Architecture

### Root Container

The entire match page is a single `position: fixed` container that covers the full viewport, overlaying the protected layout (including the Navbar) at `z-index: 50`:

```typescript
<div
  className="fixed inset-x-0 mx-auto w-full max-w-lg flex flex-col bg-white overflow-hidden z-50
             sm:rounded-xl sm:shadow-2xl sm:border sm:border-gray-200"
  style={{
    top: 'var(--vv-offset-top, 0px)',
    height: 'var(--vvh, 100dvh)',
    transitionProperty: 'height',
    transitionDuration: 'var(--vvh-duration, 0ms)',
    transitionTimingFunction: 'ease-out',
  }}
>
```

The height is driven by the `--vvh` CSS custom property, which is set by the `useVisualViewport` hook to track the iOS visual viewport height. This makes the container shrink when the keyboard opens and expand when it closes.

### Header Bar

A gradient bar (`bg-gradient-to-r from-violet-500 to-purple-600`) shows:
- **Left**: Other user's avatar (ProfileAvatar component, size "sm") + display name + "Matched [date]".
- **Right**: Overflow menu (DropdownMenu) with:
  - Other user's interests (up to 5 badges).
  - "Cancel Match" option (opens CancelReasonModal).
  - "Report" option (opens Report Dialog).
  - "Block" option (confirmation prompt, then block + cancel).

### Step 1: Location Decision + Chat Drawer

Layout:
```
[Header]
[Location Decision Area - flex-1, overflow-y-auto, bg-violet-50]
  └── LocationDecisionPanel
[Chat Drawer - absolute bottom-0, animated height]
  ├── Toggle Handle (measured via ref for collapsed height)
  │   └── "Chat" button with message count badge + chevron icon
  └── ChatPanel (when contentMounted)
```

**Drawer Animation**:
- Uses Framer Motion `<motion.div>` with `type: 'tween'` and cubic-bezier easing `[0.25, 0.1, 0.25, 1]`.
- Three height states:
  - **Collapsed**: `collapsedH` pixels (measured toggle-handle height, ~80px).
  - **Expanded, keyboard closed**: `'65%'` of the container.
  - **Expanded, keyboard open**: `'100%'` of the container.
- Animation duration:
  - **User toggle** (open/close drawer): `0.6s`.
  - **Keyboard change** (65% ↔ 100%): `0.28s`.
  - **Keyboard change during drawer mid-toggle**: `0s` (instant snap to avoid overlapping animations).

**Content Mounting Strategy**:
- Content is mounted as soon as the drawer opens: `useEffect(() => { if (chatDrawerOpen) setContentMounted(true); }, [chatDrawerOpen])`.
- Content is unmounted only after the close animation completes: `handleDrawerAnimComplete = () => { if (!chatDrawerOpen) setContentMounted(false); }`.
- This ensures the chat content slides away smoothly during close instead of disappearing instantly.

**Toggle Handle Behavior**:
- When the drawer is closed, the toggle handle has bottom padding for the safe area inset (`env(safe-area-inset-bottom)`).
- When the drawer is open, the bottom padding is removed.
- When the keyboard is open and the drawer is open, the button shrinks (`py-2 text-sm` instead of `py-5 text-base`).
- CSS transitions on `padding` and `color` (0.28s ease-out) for smooth changes.

### Step 2: Full Chat View

Layout:
```
[Header]
[ChatPanel - flex-1]
  ├── Confirmed Place Banner (green-50 bg)
  ├── Messages Area (flex-1, overflow-y-auto)
  ├── Error Banner (if error)
  ├── Status Quick Actions (if applicable)
  └── Input Bar
[Feedback Link - if myStatus === 'completed']
```

### ChatPanel Component

The ChatPanel is a flex column (`flex flex-col h-full overflow-hidden`) that lives inside the viewport-height-driven container. The input bar is **not** `position: fixed` — it's a `flex-shrink-0` element at the bottom of the flex layout, which naturally stays visible as the container height changes with the keyboard.

#### Confirmed Place Banner (Step 2 only)

A green bar showing the confirmed place name and address. When `compact` is true (keyboard open):
- Padding shrinks from 6px to 4px.
- The address line collapses via `max-height: 0px` and `opacity: 0` with CSS transitions.

#### Messages Area

- `flex-1 overflow-y-auto` with `overscroll-behavior: contain` and `-webkit-overflow-scrolling: touch`.
- **Empty state**: "Say hi to [name]! 👋" centered text.
- **Time separators**: Shown when messages are more than 5 minutes apart. Format: `HH:MM` in a gray pill.
- **Status announcements**: Centered colored pills. Violet for the current user ("You are on the way 🚶"), emerald for the other user.
- **Text message bubbles**: Violet background for sent messages (right-aligned), gray background for received messages (left-aligned). Both have avatars (ProfileAvatar, size "xs") — the sender's avatar on the right, the other user's avatar on the left.
- **Animation**: Each message/status enters with Framer Motion — `opacity: 0 → 1, y: 5 → 0` for messages, `opacity: 0, scale: 0.95 → 1` for status pills.

#### Scroll Management

Two mechanisms keep the messages scrolled to the bottom:

1. **New message auto-scroll**: `useEffect` watching `messages.length` calls `scrollIntoView({ behavior: 'smooth' })` on a sentinel `<div ref={messagesEndRef} />`.
2. **Resize-aware scroll pinning**: A `ResizeObserver` on the messages container checks `wasAtBottomRef` (updated on every scroll event). If the user was at the bottom when the container resized (e.g., keyboard opened), it snaps `scrollTop` to `scrollHeight`.

#### Status Quick Actions (Step 2 only)

Renders between the messages area and the input bar. Shows one button at a time based on the current status progression:

| Current Status | Next Action Button |
|---------------|-------------------|
| `pending` | "On my way" (violet) |
| `heading_there` | "I've arrived" (blue) |
| `arrived` | "Complete Meetup" (green) |
| `completed` | *(hidden)* |

The button has `onMouseDown={(e) => e.preventDefault()}` to prevent stealing focus from the textarea (which would close the keyboard).

#### Input Bar

- Bottom padding reads `var(--safe-bottom, env(safe-area-inset-bottom, 0px))` to handle iPhone home indicator spacing. When the keyboard is open, `--safe-bottom` is `0px` (no extra padding needed).
- Inner padding transitions smoothly with `transition: padding 0.28s ease-out`.
- **Textarea**: Single-row, auto-expandable (max 5 rows via `max-h-20`), `font-size: 16px` (prevents iOS zoom on focus), rounded-2xl border in violet-200.
- **Send button**: 32x32px violet circle with Send icon. `onMouseDown={(e) => e.preventDefault()}` prevents it from stealing focus/closing the keyboard. `onClick` sends the message and only re-focuses the textarea if `compact` is true (keyboard already open).
- **onTouchEnd handler**: When `compact` is false (keyboard not yet open), `e.preventDefault()` + `focus({ preventScroll: true })` prevents iOS Safari's default auto-scroll behavior that pushes the entire page up.
- **Character/message counts**: Shown below the input when keyboard is closed (`!compact`). Character count only appears after 400 characters. Total message count is always shown.
- **Enter to send**: `Enter` key sends the message (calls `handleSend`). `Shift+Enter` inserts a newline.

### Modals

Two modals, both using Radix Dialog (via shadcn/ui) which render via portals:

1. **CancelReasonModal**: Radio group with 5 predefined reasons (`time_conflict`, `not_responding`, `changed_mind`, `safety_concern`, `other`). "Other" shows a textarea for details. Has "Keep Match" and "Confirm Cancellation" buttons.
2. **Report Dialog**: Simple textarea for describing the issue, with a "Submit Report" button.

---

## 7. iOS Keyboard Handling

The match page uses three custom hooks for iOS-native keyboard integration:

### useVisualViewport

The core hook that tracks the iOS visual viewport and orchestrates keyboard animations.

**CSS Custom Properties** set on `<html>`:
| Property | Description |
|----------|-------------|
| `--vvh` | Current visual viewport height in pixels. Used as the container height. |
| `--vv-offset-top` | Visual viewport offset from the top (usually 0, nonzero if page scrolled). |
| `--safe-bottom` | `'0px'` when keyboard is open, `'env(safe-area-inset-bottom, 0px)'` when closed. |
| `--vvh-duration` | CSS transition duration. `'280ms'` during keyboard open, `'0ms'` otherwise. |

**Keyboard Detection**:
- Tracks `maxHeight`: the largest `visualViewport.height` ever observed.
- Keyboard is considered open when: `maxHeight - visualViewport.height > 100`.
- Tracks `baseHeight`: the most recent viewport height when the keyboard was NOT open. Used as the close animation target (accounts for Safari's dynamic URL bar).

**Keyboard Open Animation** (CSS transition):
- When the viewport shrinks by > 80px, a CSS transition is triggered: `--vvh-duration: 280ms`, and `--vvh` is set to the new target height.
- The transition is "suppressed" for 320ms — during this window, the rAF polling doesn't overwrite `--vvh`, allowing the CSS transition to animate smoothly.
- When the actual viewport height converges within 10px of the target, the suppression ends and normal tracking resumes.

**Keyboard Close Animation** (JS-driven):
- Triggered by `focusout` event when the focused element is a textarea/input and the related target is not.
- Uses a JS ease-out cubic animation over 280ms (matching iOS keyboard slide duration).
- Three phases:
  1. **main** (0–280ms): Ease-out interpolation from `closeFromH` (keyboard-open height) to `closeToH` (`baseHeight`).
  2. **hold** (280ms–780ms): Holds at `closeToH`, waiting for the real viewport to catch up.
  3. If the viewport moves (real keyboard closes), snaps instantly to the actual viewport height.
- A `closeGuard` flag prevents `isKeyboardOpen` from flipping back to `true` during the animation (since `visualViewport.height` still reflects the keyboard-open state early in the animation).

**rAF Polling**:
- Every frame, `window.scrollTo(0, 0)` resets page scroll to prevent iOS layout viewport drift.
- Polling runs for 500ms after any resize event (1000ms during close animation).

### useLockBodyScroll

Prevents the iOS layout viewport from scrolling by setting:
```css
html { overflow: hidden; overscroll-behavior: none; }
body { overflow: hidden; position: fixed; width: 100%; height: 100%; top: 0; left: 0; overscroll-behavior: none; }
```
All styles are saved and restored on unmount.

### useWhiteThemeColor

Sets `<meta name="theme-color" content="#ffffff">` so Safari's bottom browser chrome (URL bar area) renders white, blending with the chat UI. Restores the original theme color on unmount.

### Scope and Cleanup

All three hooks apply their effects on mount and **fully clean up on unmount**:
- `useVisualViewport`: Removes all CSS custom properties, cancels rAF polling, removes event listeners.
- `useLockBodyScroll`: Restores all original body/html styles.
- `useWhiteThemeColor`: Restores the original theme-color meta tag.

This means these hooks only affect the match page. When the user navigates to any other page, scrolling, viewport behavior, and theme color all return to normal.

---

## 8. Safety Features

### Cancel Match

1. User clicks "Cancel Match" in the overflow menu or LocationDecisionPanel.
2. `CancelReasonModal` opens with 5 predefined reasons.
3. On confirm, `matchCancel({ matchId, reason })` is called (with idempotency).
4. On success, redirects to `/`.

### Report User

1. User clicks "Report" in the overflow menu.
2. Report Dialog opens with a textarea.
3. On submit, a document is written directly to Firestore: `reports/{matchId}_{uid}`.

### Block User

1. User clicks "Block" in the overflow menu.
2. A `window.confirm` dialog asks for confirmation.
3. On confirm:
   - A block document is written to `blocks/{uid}/blocked/{otherUid}`.
   - `matchCancel({ matchId, reason: 'blocked' })` is called.
   - A toast notification confirms the block.
   - Redirects to `/`.

### Terminal Status Redirect

A `useEffect` watches `match.status`. If it becomes `'cancelled'`, `'completed'`, or `'expired_pending_confirmation'`, the page redirects:
- Cancelled → `/?cancelled=true&reason=...`
- Others → `/`

---

## 9. Message Limits & Validation

| Limit | Value | Enforced By |
|-------|-------|-------------|
| Max characters per message | 500 | Client-side (`validateContent`) + backend |
| Max words per message | 100 | Client-side (`validateContent`) + backend |
| Max total messages per match | 400 | Client-side (`isAtLimit`) + backend |

When the message limit is reached:
- The textarea is disabled with placeholder "Message limit reached".
- The send button is disabled.
- `isAtLimit` is `true`, preventing further sends.

Character count shows below the input only when > 400 characters typed. Total message count is always shown.

---

## 10. Desktop vs Mobile Layout

### Mobile (< 640px)

The root container is full-width (`inset-x-0`) with no border, shadow, or rounded corners. It fills the entire viewport height. This provides a native app-like full-screen chat experience.

### Desktop (>= 640px, `sm:` breakpoint)

The root container is constrained to `max-w-lg` (512px) and centered with `mx-auto`. It has:
- `sm:rounded-xl` — rounded corners.
- `sm:shadow-2xl` — large drop shadow.
- `sm:border sm:border-gray-200` — subtle border.

This makes the chat appear as a centered phone-sized card on desktop, similar to how messaging apps appear in their web versions.

The protected layout's gradient background (`bg-gradient-to-br from-violet-50 to-purple-100`) is visible on either side of the card on desktop, providing visual framing.
