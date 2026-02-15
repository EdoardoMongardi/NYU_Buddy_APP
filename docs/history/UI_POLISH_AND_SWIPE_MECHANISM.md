# UI Polish & Swipe Mechanism — Implementation Summary

**Date:** 2026-02-14
**Status:** COMPLETE
**Scope:** Home page visual refinement, swipe-to-browse gesture system, iOS PWA touch handling, layout stability

---

## Table of Contents

1. [Overview](#overview)
2. [Design Philosophy](#design-philosophy)
3. [Visual System Changes](#visual-system-changes)
4. [Swipe-to-Browse Mechanism](#swipe-to-browse-mechanism)
5. [iOS PWA Touch Handling (Deep Dive)](#ios-pwa-touch-handling)
6. [Card Stack Architecture](#card-stack-architecture)
7. [Cycle Management & Interstitials](#cycle-management--interstitials)
8. [Client-Side Buffering System](#client-side-buffering-system)
9. [Layout & Scroll Locking](#layout--scroll-locking)
10. [Active Invites Redesign](#active-invites-redesign)
11. [Navigation & Notification Bubbles](#navigation--notification-bubbles)
12. [PWA vs Browser Adaptive Layout](#pwa-vs-browser-adaptive-layout)
13. [Avatar Loading & Flash Prevention](#avatar-loading--flash-prevention)
14. [Files Modified](#files-modified)
15. [Bug Fixes Summary](#bug-fixes-summary)

---

## Overview

A comprehensive mobile-first UI refinement of the NYU Buddy home page, transforming the suggestion discovery flow from a static two-button (invite/pass) interface into a fluid swipe-to-browse card system. All changes are visual and interaction-layer only — no business logic, Firestore operations, or routing behavior was modified.

The primary technical challenge was achieving smooth, native-feeling swipe gestures in iOS Safari and PWA standalone mode, where the operating system's own gesture recognition actively competes with web app touch handling.

---

## Design Philosophy

### Identity: Campus Light Social — Not Dating App

The swipe mechanism was deliberately designed as **browsing-style** (exploring a cycle of nearby people) rather than **decision-style** (Tinder-like accept/reject). Key distinctions:

| Avoided (Dating App DNA) | Implemented (Browsing DNA) |
|---|---|
| Red "Pass" / Green "Accept" indicators | No color-coded directional feedback |
| 5-8° card rotation on drag | Subtle 2-3° max tilt |
| Scale-up on right swipe | No directional visual differentiation |
| "Picked" / "Rejected" language | Neutral: both directions = "next person" |
| Heavy motion, dramatic exits | Clean translate + fade, invisible motion |

### Visual Tone

- Neutral base surfaces (`bg-[#f2f2f7]`) with subtle warm-violet top gradient
- Three distinct surface layers: page background → card surface → interactive elements
- Refined shadows (`shadow-card` custom utility) — tight, not dramatic
- One accent color (violet-600) reserved for primary CTA only
- Accessible contrast on all text

---

## Visual System Changes

### Page Background & Depth

```
layout.tsx: bg-[#f2f2f7] (iOS system gray)
Top gradient: rgba(120,90,220, 0.045) → transparent (barely perceptible warmth)
Cards: bg-white with border-gray-200/60 + shadow-card
```

### Typography Hierarchy

| Element | Size | Weight | Color |
|---|---|---|---|
| Page title ("Find a Buddy") | 22px | Bold | gray-800 |
| Card name | 17px | Bold | gray-800 |
| Card activity | 11px | Medium | gray-500 |
| Interest badges | 11px | Normal | violet-600 or gray-600 |
| Meta pills (distance, walk, time) | 10px | Normal | gray-500 |
| Section labels | 10px | Semibold uppercase | violet-400 or gray-400 |

### Card Layout (CardBody Component)

The user card is rendered by a shared `CardBody` component used for both the active (swipeable) card and the background (next) card preview:

```
┌─────────────────────────────────────┐
│ Header (bg-gray-50/80)              │
│ ┌──────┐ Name          [2/5]       │
│ │Avatar│ Activity                    │
│ │ 80px │ [🗺 350m] [🚶~4min] [⏰30m]│
│ └──────┘                             │
├─────────────────────────────────────┤
│ Body                                 │
│ "Match explanation quote"            │
│                                      │
│ YOU BOTH LIKE                        │
│ [Badge] [Badge] [Badge]             │
│                                      │
│ INTERESTS                            │
│ [Badge] [Badge] [Badge] [+2]        │
│                                      │
│ ─────────────────────────           │
│ [    ■ Send Invite    ]              │
└─────────────────────────────────────┘
```

- Interests capped at 3 per category (common / non-common) with `+N` overflow badge
- Each category occupies a single line (`overflow-hidden whitespace-nowrap`)
- This ensures fixed card height regardless of interest count
- Walk time calculated dynamically: `Math.max(1, Math.ceil(distance / 80))`

---

## Swipe-to-Browse Mechanism

### Gesture Model

Both left and right swipes do the same thing: advance to the next person in the cycle. The invite action remains an explicit button tap. This creates a low-pressure browsing experience.

### Swipe Detection — Three-Layer Measurement

The swipe decision in `handlePanEnd` uses the **maximum** of three independent measurements:

```typescript
const effectiveOffset = Math.max(trueDisplacement, maxDrag, absX);
```

| Measurement | Source | Purpose |
|---|---|---|
| `trueDisplacement` | `\|event.clientX - pointerStartXRef\|` | Captures full finger travel including iOS-consumed initial movement |
| `maxDrag` | Peak `\|info.offset.x\|` during pan | Handles natural thumb retraction at gesture end |
| `absX` | `\|info.offset.x\|` at pan end | Standard Framer Motion offset (baseline) |

### Threshold Configuration

```typescript
// Browser mode — full touch event delivery, no system gesture competition
SWIPE_OFFSET_THRESHOLD_BROWSER = 90   // px displacement
// PWA mode — lower to compensate for iOS gesture recognizer consumption
SWIPE_OFFSET_THRESHOLD_PWA     = 55   // px displacement
// Velocity-based swipe (fast flick with small displacement)
SWIPE_VELOCITY_THRESHOLD       = 350  // px/s
SWIPE_MIN_OFFSET               = 15   // px minimum for velocity-based trigger
```

The swipe triggers if **either** condition is met:
1. `effectiveOffset > threshold` (distance-based)
2. `velocity > 350 AND effectiveOffset > 15` (velocity-based)

### Animation Parameters

| Phase | Property | Value |
|---|---|---|
| **Drag follow** | x position | Direct `info.offset.x` (real-time) |
| **Drag follow** | Rotation | ±3° max via `useTransform` |
| **Exit animation** | x target | `dir * 500px` |
| **Exit animation** | Duration | 280ms |
| **Exit animation** | Easing | `[0, 0, 0.2, 1]` (fast start, gentle decel) |
| **Bounce-back** | Spring | `bounce: 0.2, duration: 350ms` |
| **Card entrance** | Translate Y | 12px → 0 |
| **Card entrance** | Duration | 350ms |
| **Card entrance** | Easing | `cubic-bezier(0.22, 1, 0.36, 1)` |
| **Post-swipe entrance** | All | Skipped (`initial={false}`) for instant appearance |

### Direction Resolution

When the swipe is confirmed, direction is determined with fallback priority:

```typescript
// 1. Framer Motion's final offset (if significant)
// 2. True displacement direction (from raw pointer coordinates)
// 3. Dominant drag direction (peak during gesture)
// 4. Default: right (+1)
const dir = absX > 5
  ? (info.offset.x > 0 ? 1 : -1)
  : (trueDisplacement > 5 ? trueDir : dominantDir || 1);
```

---

## iOS PWA Touch Handling

This section documents the core technical challenge that required the most investigation.

### The Problem

Swiping worked reliably in Safari browser mode but was intermittently difficult in PWA standalone mode. Cards would frequently "bounce back" to their original position even when the user clearly swiped past the threshold.

### Root Cause Analysis

**Two distinct iOS-specific mechanisms cause the problem:**

#### 1. System Gesture Recognizer Delay

In PWA standalone mode (no browser chrome), iOS reserves the initial portion of every touch event for its own gesture recognition:

```
Timeline (PWA standalone mode):

T=0ms     Finger touches screen
          → iOS system gesture recognizer activates
          → Pointer events DELAYED to web app

T=50-150ms iOS determines this is NOT a system gesture (back nav, etc.)
           → Releases touch events to web app
           → Framer Motion receives first pointer event HERE
           → onPan tracking starts from THIS position (not T=0)

T=end     User lifts finger
          → info.offset.x = displacement from T=50-150ms, NOT from T=0
          → Actual displacement was 10-25px LARGER than reported
```

In browser mode, Safari's browser chrome handles system navigation, so touch events are delivered immediately to the web app. This is why the same gesture works in browser but fails in PWA.

#### 2. CSS touch-action Unreliability

`touch-action: none` via CSS tells the browser not to handle default touch behaviors. However, in iOS PWA standalone mode, this isn't 100% respected. iOS can still decide mid-gesture to "steal" the touch for system purposes, causing:
- Pointer events to stop being delivered
- The pan gesture to end prematurely
- Incomplete offset data resulting in bounce-back

### Three-Layer Fix

#### Layer 1: True Start Position Capture

```typescript
// onPointerDown fires BEFORE iOS's gesture recognition delay.
// We capture the actual initial finger position here.
const pointerStartXRef = useRef(0);

const handlePointerDown = (e: React.PointerEvent) => {
  pointerStartXRef.current = e.clientX;
};

// In handlePanEnd, compute true displacement:
const trueDisplacement = Math.abs(event.clientX - pointerStartXRef.current);
```

`onPointerDown` fires at T=0 (when the finger actually touches), before the system gesture recognizer consumes any movement. The `clientX` captured here is the true starting position.

In `handlePanEnd`, the native `PointerEvent` parameter provides the final `clientX`. The difference gives the actual total displacement, recovering the 10-25px that iOS consumed.

#### Layer 2: Non-Passive touchmove Prevention

```typescript
const containerRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  const el = containerRef.current;
  if (!el) return;
  const handler = (e: TouchEvent) => { e.preventDefault(); };
  el.addEventListener('touchmove', handler, { passive: false });
  return () => el.removeEventListener('touchmove', handler);
}, [suggestion?.uid]);
```

- Must use `addEventListener` directly (React synthetic events default to `passive: true`)
- `{ passive: false }` allows calling `preventDefault()`
- `preventDefault()` on `touchmove` forcefully tells iOS: "this touch belongs to my app"
- Prevents mid-gesture touch theft that causes intermittent failures
- Does NOT affect taps (`touchmove` only fires when the finger moves)
- Scoped to the card stack container only; other page areas unaffected

#### Layer 3: Max Drag Tracking

```typescript
const maxDragRef = useRef(0);
const dragDirRef = useRef(0);

// In handlePan: track peak displacement
const absOffset = Math.abs(info.offset.x);
if (absOffset > maxDragRef.current) {
  maxDragRef.current = absOffset;
  dragDirRef.current = info.offset.x > 0 ? 1 : -1;
}
```

Users naturally retract 10-20px at the end of a thumb swipe gesture. The `info.offset.x` at `onPanEnd` is the **final** position (after retraction), not the peak. Tracking the maximum displacement prevents false bounce-backs when the user clearly swiped far enough.

### Additional PWA Measures

- `touchAction: 'none'` on the discover tab wrapper (page.tsx) — CSS-level signal to iOS
- `touchAction: 'none'` on the active card's `motion.div` — element-level signal
- `overscrollBehavior: 'none'` on page container — prevents rubber-banding

---

## Card Stack Architecture

### Visual Layers (Bottom to Top)

```
┌─ z=0: Stack edge layer 2 (if 2+ remaining) ─┐
│  absolute, top:3px bottom:3px                 │
│  left:1.5 right:0                             │
│  bg-gray-100/60 border-gray-200/30            │
│                                                │
│  ┌─ z=0: Stack edge layer 1 (if 1+ remaining)┐│
│  │  absolute, top:1.5px bottom:1.5px          ││
│  │  left:1.5 right:2px                        ││
│  │  bg-gray-50/70 border-gray-200/40          ││
│  │                                             ││
│  │  ┌─ Background card (next suggestion) ────┐││
│  │  │  absolute, top:0 bottom:0              │││
│  │  │  left:1.5 right:1                      │││
│  │  │  scale: 0.97→1.0 (driven by drag x)   │││
│  │  │  opacity: 0.5→1.0 (driven by drag x)  │││
│  │  │  Full CardBody content                 │││
│  │  └────────────────────────────────────────┘││
│  └─────────────────────────────────────────────┘│
│                                                  │
│  ┌─ z=10: Active card ─────────────────────────┐│
│  │  relative, mx:1.5                            ││
│  │  x: follows drag gesture                     ││
│  │  rotate: ±3° from drag                       ││
│  │  Full CardBody with Send Invite button        ││
│  └───────────────────────────────────────────────┘│
└────────────────────────────────────────────────────┘
```

### Background Card Reveal Effect

As the user drags the active card away, the background card progressively reveals:

```typescript
// Absolute drag distance → scale
const bgScale = useTransform(x, (v) => {
  const absV = Math.min(Math.abs(v), 250);
  return 0.97 + (absV / 250) * 0.03; // 0.97 → 1.0
});

// Absolute drag distance → opacity
const bgOpacity = useTransform(x, (v) => {
  const absV = Math.min(Math.abs(v), 250);
  return 0.5 + (absV / 250) * 0.5; // 0.5 → 1.0
});
```

- Direction-independent (works identically for left and right swipe)
- Background card shows **full content** (same `CardBody` component) so the user sees the next person's info during the swipe
- At rest: background is at 50% opacity and 97% scale (subtly visible behind the stack edge layers)
- At full drag: background is fully visible and full-scale

### Stack Layer Dynamics

The number of visible stack edge layers is determined by `buffer.length`:

| Buffer Size | Visible Layers | Visual Effect |
|---|---|---|
| 0 | None | Single card, no stack appearance |
| 1 | 1 layer | Slight peek behind card |
| 2+ | 2 layers | Clear card stack effect |

### Last Card in Cycle

When the current card is the last in the cycle (`cycleInfo.current >= cycleInfo.total && buffer.length === 0`), the background card shows a "That's everyone nearby" preview instead of a user card, signaling to the user that this is the last person.

---

## Cycle Management & Interstitials

### End-of-Cycle Detection

The cycle-end interstitial shows when all three conditions are met:

```typescript
useEffect(() => {
  const isNew = cycleInfo?.isNewCycle ?? false;
  // Transition detection: false → true (not just "is currently true")
  // AND user has actually swiped (not initial load)
  // AND suggestion exists (data is ready)
  if (isNew && !prevIsNewCycleRef.current && hasSwipedRef.current && suggestion) {
    setShowCycleEnd(true);
  }
  prevIsNewCycleRef.current = isNew;
}, [cycleInfo, suggestion]);
```

Using transition detection (`prevIsNewCycleRef`) prevents the interstitial from re-triggering after "Browse Again" when `isNewCycle` is still `true`.

### Browse Again — Stale Card Prevention

When the last card is swiped, `passSuggestion()` fires in the background (not awaited) while the interstitial shows immediately. If the user clicks "Browse Again" before `passSuggestion` completes, the old suggestion state still contains the last card.

**Previous bug:** Interstitial dismisses → stale last card flashes → passSuggestion completes → first card of new cycle appears.

**Fix:** `handleBrowseAgain` awaits the background promise:

```typescript
const bgPassPromiseRef = useRef<Promise<void> | null>(null);

// When last card is swiped:
bgPassPromiseRef.current = passSuggestion().then(() => {
  bgPassPromiseRef.current = null;
});

// When Browse Again is clicked:
const handleBrowseAgain = async () => {
  if (bgPassPromiseRef.current) {
    setBrowseAgainLoading(true);
    await bgPassPromiseRef.current;
    setBrowseAgainLoading(false);
  }
  setShowCycleEnd(false);
  hasSwipedRef.current = false;
  prevIsNewCycleRef.current = true;
};
```

The button shows a loading spinner until data is ready. The interstitial only dismisses when the new cycle's first card is in state.

### State Reset on Browse Again

```typescript
hasSwipedRef.current = false;        // Prevent cycle-end useEffect from re-triggering
prevIsNewCycleRef.current = true;    // Mark current isNewCycle state as "seen"
```

---

## Client-Side Buffering System

### Architecture (`useCycleSuggestions.ts`)

```
┌─────────────────────────┐
│  Backend (getCycle.ts)   │
│  batchSize: 3            │
│  Returns: suggestions[]  │
│           cycleInfo      │
└───────┬─────────────────┘
        │
        ▼
┌─────────────────────────────────────┐
│  Client Buffer                       │
│                                      │
│  suggestion ──► Currently displayed  │
│  buffer[0]  ──► Next card (preview)  │
│  buffer[1]  ──► Pre-fetched          │
│                                      │
│  On swipe:                           │
│    suggestion = buffer.shift()       │
│    ← INSTANT (no network wait)       │
│                                      │
│  When buffer.length <= 1:            │
│    refetchInBackground()             │
│    ← Deduplicates against buffer     │
└─────────────────────────────────────┘
```

### passSuggestion Flow

```
buffer has items?
├── YES: Pop from buffer (instant), fire pass in background
│        Update cycleInfo.current locally
│        Trigger refetch if buffer <= 1
│
└── NO:  Await pending passes, fetch from backend
         Set new suggestion + buffer from response
```

This eliminates the 1-2 second network delay that previously caused visible stuttering between cards.

---

## Layout & Scroll Locking

### The Challenge

The home page must NOT scroll vertically (to prevent scroll interference with horizontal swipe), but other pages (profile, etc.) must remain scrollable.

### Solution: Multi-Layer Scroll Prevention

#### Layer 1: Root Container (`layout.tsx`)

```typescript
// Fixed positioning removes the element from normal document flow,
// preventing body-level scrolling entirely
<div className="fixed inset-0 bg-[#f2f2f7] flex flex-col overflow-hidden"
     style={{ overscrollBehavior: 'none' }}>
```

#### Layer 2: Body-Level Prevention (`layout.tsx`)

```typescript
useEffect(() => {
  const html = document.documentElement;
  const body = document.body;
  html.style.overflow = 'hidden';
  html.style.height = '100%';
  body.style.overflow = 'hidden';
  body.style.height = '100%';
  return () => { /* cleanup */ };
}, []);
```

iOS Safari can rubber-band scroll the body element even with `fixed` positioning. This useEffect explicitly locks the body.

#### Layer 3: Main Content Area (`layout.tsx`)

```html
<main className="flex-1 min-h-0 overflow-auto relative z-10 px-5 pt-2 pb-[env(safe-area-inset-bottom)]">
```

`overflow-auto` on `<main>` allows child pages (profile, settings) to scroll independently while the body remains locked.

#### Layer 4: Home Page Specific (`page.tsx`)

```html
<div className="max-w-md mx-auto h-full overflow-hidden flex flex-col"
     style={{ overscrollBehavior: 'none', touchAction: 'manipulation' }}>
```

The home page root uses `overflow-hidden` to lock its own scrolling. `touchAction: 'manipulation'` prevents double-tap zoom while allowing panning for the discover tab.

#### Layer 5: Discover Tab (`page.tsx`)

```html
<motion.div key="discover" style={{ touchAction: 'none' }}>
```

Within the discover tab specifically, `touchAction: 'none'` prevents iOS from interpreting any touch as scroll/pan, fully deferring to Framer Motion's gesture handling.

---

## Active Invites Redesign

### Layout: Horizontal Row

Active outgoing invites display in a horizontal `flex` row above the suggestion card:

```
┌─────────┐ ┌─────────┐ ┌─────────┐
│ ○ Name  │ │ ○ Name  │ │ ○ Name  │
│ ████░░░ │ │ ████░░░ │ │ ████░░░ │  (progress bars)
└─────────┘ └─────────┘ └─────────┘
```

- Each card is `flex-1` (equal width distribution)
- Container uses `items-start` to prevent cards from stretching to match tallest sibling
- Maximum 3 active invites (enforced by backend)

### Individual Expansion

Each `CollapsibleInviteCard` manages its own expansion state. Clicking a card expands it to reveal a "Cancel" button:

```
┌─────────────┐
│ ○ Name      │
│ ┌─────────┐ │
│ │ Cancel  │ │  ← AnimatePresence height animation
│ └─────────┘ │
│ ████████░░░ │
└─────────────┘
```

- Only the clicked card expands; others remain collapsed
- Auto-expand on creation (new invite appears expanded, auto-collapses after 2s)
- `e.stopPropagation()` on Cancel button prevents parent collapse

### Progress Bar

Each card shows a time-remaining progress bar:

```typescript
style={{
  width: `${Math.max(0, (timeLeft / 600) * 100)}%`,
  transition: 'width 1s linear',
}}
```

- Driven by `timeLeft` state (countdown from `expiresInSeconds`)
- Uses percentage of 600s (10 minutes) for proportional width
- CSS transition for smooth animation (no Framer Motion overhead)
- Color: `bg-violet-400` normal, `bg-orange-400` when expiring

---

## Navigation & Notification Bubbles

### Navbar Changes

- Removed: User name display, sign out button, hamburger menu
- Added: Settings gear icon (`Settings` from lucide) navigating to `/profile`
- Sign Out moved to: Profile page → Basic Info tab (bottom)

### Inline Bubbles

Notification prompt and install banner relocated from top-of-layout banners to compact pill-shaped bubbles beside the "Find a Buddy" title:

```
┌─────────────────────────────────────────┐
│ Find a Buddy    [🔔 Notifications  ✕]  │
└─────────────────────────────────────────┘
```

- Mutually exclusive: notification prompt takes priority over install prompt
- `AnimatePresence mode="wait"` for smooth transitions between them
- Dismissible with X button; state persisted to localStorage
- Touch-friendly sizing: `pl-3 pr-2 py-1.5`, icon `w-3.5 h-3.5`

---

## PWA vs Browser Adaptive Layout

### Detection

```typescript
const [isPWA, setIsPWA] = useState(false);
useEffect(() => {
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as { standalone?: boolean }).standalone === true;
  setIsPWA(standalone);
}, []);
```

### Conditional Sizing

| Element | Browser | PWA |
|---|---|---|
| Card header padding | `py-2.5` | `py-3` |
| Card body padding | `py-2.5` | `py-3` |
| Availability button height | `h-[44px]` | `h-[46px]` |
| Availability card padding | `py-3` | `py-3.5` |
| Tab navigation margin | `mt-1.5` | `mt-2` |
| Swipe threshold | 90px | 55px |

The differences are subtle — just enough extra breathing room to use the space freed by the absent browser chrome.

---

## Avatar Loading & Flash Prevention

### Problem

When transitioning between user cards, the `ProfileAvatar` component briefly showed its placeholder background before the new image loaded. The original placeholder was a purple gradient (`bg-gradient-to-br from-violet-500 to-purple-600`), causing a visible violet flash.

### Root Cause

The `!bg-gray-200` className override only sets `background-color`. But the gradient sets `background-image` (via Tailwind's `bg-gradient-to-br`), and CSS `background-image` renders **on top of** `background-color`. The purple gradient was never actually cleared.

### Fix: Two Layers

#### Layer 1: Neutral Default Background (`ProfileAvatar.tsx`)

Changed the component's default placeholder from:
```
bg-gradient-to-br from-violet-500 to-purple-600
```
to:
```
bg-gray-200
```

This makes the flash (if it occurs) a neutral gray instead of purple. Applied globally since the avatar is used throughout the app.

#### Layer 2: Image Preloading (`SuggestionCard.tsx`)

```typescript
useEffect(() => {
  if (buffer.length > 0 && buffer[0].photoURL) {
    const img = new window.Image();
    img.src = buffer[0].photoURL;
  }
}, [buffer]);
```

The next card's photo is preloaded into the browser cache when it enters the buffer, so it's already available when the card transition happens.

---

## Files Modified

| File | Changes |
|---|---|
| `src/components/matching/SuggestionCard.tsx` | Complete rewrite: swipe gesture system, card stack, CardBody component, cycle interstitial, iOS touch handling, image preloading |
| `src/lib/hooks/useCycleSuggestions.ts` | Buffer exposed in return value; batch fetching with `batchSize: 3`; background refetch; deduplication |
| `src/app/(protected)/page.tsx` | Layout restructuring; PWA detection; notification/install bubbles; touchAction on discover tab; scroll locking |
| `src/app/(protected)/layout.tsx` | Fixed positioning; body scroll prevention; overscroll-behavior; overflow-auto on main |
| `src/components/layout/Navbar.tsx` | Simplified to logo + settings icon |
| `src/components/availability/AvailabilitySheet.tsx` | Compact styling; isPWA adaptive sizing |
| `src/components/home/TabNavigation.tsx` | Removed bottom margin |
| `src/components/match/ActiveInvitesRow.tsx` | Horizontal layout; items-start alignment |
| `src/components/match/CollapsibleInviteCard.tsx` | Individual cancel buttons; accurate progress bar; layout prop removed |
| `src/components/ui/ProfileAvatar.tsx` | Neutral gray default background |
| `src/app/(protected)/profile/page.tsx` | Sign Out button added to Basic Info tab |
| `functions/src/suggestions/getCycle.ts` | batchSize parameter support; returns suggestions array |

---

## Bug Fixes Summary

| Bug | Root Cause | Fix |
|---|---|---|
| PWA swipe bounce-back | iOS gesture recognizer delays touch delivery; Framer Motion offset under-reports displacement | Three-layer: pointerDown capture + non-passive touchmove + max drag tracking |
| Browse Again shows last card | Background passSuggestion not completed; stale suggestion state rendered | Await bgPassPromiseRef before dismissing interstitial |
| Cycle-end re-triggers after Browse Again | useEffect checks `isNewCycle === true` (still true after dismiss) | Transition detection: `false → true` via prevIsNewCycleRef |
| Purple avatar flash | CSS gradient `background-image` renders over `background-color` override | Changed ProfileAvatar default to `bg-gray-200`; preload next image |
| Swipe lag between cards | Two sequential network calls (pass + getCycle) per swipe | Client-side buffer with instant pop; background refetch |
| Page scrolls vertically (interferes with swipe) | iOS Safari body rubber-banding | Fixed positioning + body overflow lock + touchAction cascade |
| Components narrow on initial render | Framer Motion `layout` prop + AnimatePresence layout shifts | Removed `layout` prop; popLayout mode; opacity-only transitions |
| All active invite cards expand together | Flex `align-items: stretch` default | `items-start` on container |
| Progress bar inaccurate on existing invites | Animation `initial: 100%` doesn't reflect actual elapsed time | Dynamic `width` from `timeLeft / 600 * 100%` |
| Infinite loading after Browse Again | cycleEndUidRef guard deadlocked when only one user in cycle | Removed cycleEndUidRef mechanism entirely |

---

## Key Refs & State Summary

| Ref/State | Type | Purpose |
|---|---|---|
| `x` | MotionValue | Card X position during drag |
| `pointerStartXRef` | Ref\<number\> | True initial touch clientX |
| `maxDragRef` | Ref\<number\> | Peak absolute drag distance |
| `dragDirRef` | Ref\<number\> | Dominant drag direction (+1/-1) |
| `afterSwipeRef` | Ref\<boolean\> | Skip entrance animation after swipe |
| `hasSwipedRef` | Ref\<boolean\> | User has swiped at least once (for cycle-end detection) |
| `prevIsNewCycleRef` | Ref\<boolean\> | Previous isNewCycle value (transition detection) |
| `bgPassPromiseRef` | Ref\<Promise\> | Background passSuggestion promise for Browse Again |
| `containerRef` | Ref\<HTMLDivElement\> | Card stack container for touchmove listener |
| `isSwiping` | State | Prevents concurrent swipe gestures |
| `isResponding` | State | Prevents swipe during invite send |
| `showCycleEnd` | State | Cycle-end interstitial visibility |
| `browseAgainLoading` | State | Loading indicator on Browse Again button |
