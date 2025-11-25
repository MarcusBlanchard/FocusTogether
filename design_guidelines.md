# Design Guidelines: Focused Work Session Web App

## Design Approach

**Reference-Based Approach:** Productivity + Video Communication
- Primary inspiration: **Focusmate** (accountability partner matching), **Linear** (clean productivity UI), **Zoom/Google Meet** (video interface patterns)
- Design principle: Calm, distraction-free interface that builds trust and enables focus
- Key insight: Users need clarity and confidence during state transitions (waiting → matched → in session)

## Typography

**Font Families:**
- Primary: Inter or Work Sans (Google Fonts) - clean, professional sans-serif
- Monospace: JetBrains Mono - for session timers and technical details

**Hierarchy:**
- Hero/Page Titles: text-4xl md:text-5xl font-semibold
- Section Headers: text-2xl font-semibold
- Body Text: text-base font-normal leading-relaxed
- UI Labels: text-sm font-medium uppercase tracking-wide
- Status Indicators: text-xs font-semibold uppercase tracking-wider
- Session Timer: text-3xl font-mono font-bold tabular-nums

## Layout System

**Spacing Primitives:** Use Tailwind units of **2, 4, 6, 8, 12, 16**
- Tight spacing: p-2, gap-2 (component internals)
- Standard spacing: p-4, gap-4, m-4 (card padding, button groups)
- Section spacing: p-8, gap-8 (between major sections)
- Large spacing: p-12, gap-16 (page margins, hero sections)

**Container Strategy:**
- Authentication pages: max-w-md mx-auto (centered narrow)
- Dashboard/waiting: max-w-4xl mx-auto
- In-session video: Full viewport (w-screen h-screen) with controlled inner layout

## Component Library

### A. Authentication & Profile
**Login/Signup Card:**
- Centered card with max-w-md, rounded-xl border shadow-lg
- Form fields with clear labels above inputs (not placeholder-only)
- Primary CTA button full-width at bottom
- "Or" divider for alternative auth methods

**Profile Display:**
- Compact header bar showing username + small avatar (h-10 w-10 rounded-full)
- Settings dropdown accessible from avatar click

### B. Session States - Landing/Dashboard

**Start Session Page:**
- Clean centered layout with large "Start Session" primary button (px-12 py-4 text-lg rounded-full)
- Brief explanation text above button (max-w-md mx-auto text-center)
- Small status bar at top showing: "Ready to match" or connection status
- Profile link in top-right corner

### C. Waiting Screen

**Layout:**
- Full-height centered content (min-h-screen flex items-center justify-center)
- Animated subtle pulse indicator (small circle or dots)
- Status text: "Waiting for partner..." (text-xl)
- Cancel button below (text-sm underline, not prominent)
- Connection status in top-right: "Connected" with small green indicator dot

**Real-time Status Updates:**
- "Searching..." → "Partner found!" → "Connecting..."
- Each state clearly labeled with text-base font-medium

### D. In-Session Video Interface

**Layout Structure:**
```
┌─────────────────────────────────────┐
│ Top Bar: Timer | Session Info | End │ (h-16 border-b)
├─────────────────────────────────────┤
│                                     │
│       Main Video Feed Area          │ (flex-1)
│       (Partner or Shared Screen)    │
│                                     │
├─────────────────────────────────────┤
│ Bottom Controls Bar                 │ (h-20)
└─────────────────────────────────────┘
```

**Top Bar (h-16):**
- Left: Session timer (font-mono text-lg)
- Center: Partner username (text-sm)
- Right: "End Session" button (px-4 py-2 rounded-lg border)

**Main Content Area:**
- Large video feed taking majority of viewport (object-cover)
- Self-view picture-in-picture: fixed bottom-4 right-4, w-48 h-36, rounded-lg shadow-xl

**Bottom Controls (h-20):**
- Centered control group (gap-4):
  - Mute audio button (icon only, w-12 h-12 rounded-full)
  - Toggle video button (icon only, w-12 h-12 rounded-full)
  - Share screen button (icon + "Share Screen" label, px-6 py-3 rounded-lg)
- Each button has clear on/off states (filled vs outline)

**Screen Share Mode:**
- When sharing: shared screen becomes main content
- Small video feeds (yours + partner) in sidebar: fixed left-4, w-40 per feed, stacked vertically gap-2

### E. Navigation & Global Elements

**Top Navigation Bar:**
- Height: h-16 with border-b
- Logo/Brand left
- User profile right with dropdown (Settings, Sign Out)
- No heavy navigation - single-page app flow

**Status Indicators:**
- Small badges with rounded-full px-3 py-1 text-xs
- Always visible in consistent position (top-right corner)
- States: "Connecting..." | "Connected" | "Reconnecting..."

**Reconnection UI:**
- Overlay modal when connection drops: fixed inset-0 backdrop-blur-sm
- Center card showing "Reconnecting..." with spinner
- Does not block video view completely (semi-transparent overlay)

### F. Error & Empty States

**Error Messages:**
- Inline below relevant component (text-sm)
- Toast notifications for global errors: fixed top-4 right-4, slide-in animation

**Empty States:**
- Centered content with icon + heading + description
- "No sessions yet" on profile/history page

## Images

**Profile Avatars:**
- Use user initials fallback with distinct background (from username hash)
- Optional: Allow custom avatar upload (display as rounded-full)

**No hero images needed** - this is a utility app, not marketing
**No decorative imagery** - keep interface clean and focused

## Accessibility

- All interactive elements keyboard navigable (tab order logical)
- Video controls have clear labels for screen readers (aria-label)
- Status changes announced (aria-live regions for "Partner found!")
- Color not sole indicator of state (use text + icons)
- Focus visible on all interactive elements (ring offset)

## Responsive Behavior

**Mobile (< 768px):**
- Stack video feeds vertically
- Hide less critical info (full timer → just minutes)
- Bottom controls become full-width stacked buttons

**Desktop (> 768px):**
- Side-by-side video layout option
- Persistent status bar

## Key UX Principles

1. **Calm confidence:** Every state transition clearly communicated
2. **Minimal distraction:** No unnecessary animations or movements during session
3. **Trust signals:** Show connection status, partner info, session timer prominently
4. **Quick recovery:** Reconnection UI doesn't panic user, maintains context
5. **One clear action:** Each screen has obvious primary action (Start, Cancel, End)

**Critical:** During active session, nothing should distract from the work - controls subtle until hovered, timer visible but not prominent, clean typography hierarchy maintains focus.