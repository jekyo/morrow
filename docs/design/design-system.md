# Morrow — Design System

**Status:** Approved v1 (normative)
**Product:** Morrow
**Tagline:** Browsers that remember.
**UI Framework:** Tailwind CSS + daisyUI
**Primary Theme:** Dark
**Design Character:** Technical, warm, tactile, calm, high-contrast

> **Reconciliation note (2026-08-10):** where this document and the brand board
> disagree, **this document wins** (user decision). Typography is Geist Sans +
> Geist Mono (not Satoshi/JetBrains Mono); ember is `#E56F24` (not `#FF6B3D`);
> base is warm black `#0C0B0A` (not the board's blue-leaning Ink `#13161A`).
> The brand board remains art direction for the logo mark (M + sunrise/horizon),
> recolored to this palette.

---

## 1. Design Direction

Morrow should not look like a conventional SaaS dashboard.

Avoid: blue/purple gradients, excessive rounded cards, glassmorphism, generic
"AI startup" visuals, excessive shadows, colorful dashboards, oversized hero
illustrations, overly friendly consumer-app styling.

Morrow is infrastructure. It should feel closer to: a developer tool, a browser
operating system, a terminal, a high-end technical instrument, a persistent
workspace.

The UI should communicate: **something is alive inside this interface.** A
browser profile is not just a database record — it is a persistent environment
that can be running, paused, controlled, connected, authenticated, and used by
both humans and machines.

## 2. Brand Personality

**Precise** — deliberate, information-dense. **Quiet** — does not constantly
demand attention. **Warm** — warm neutrals instead of cold blue/gray surfaces.
**Technical** — status, state, logs, sessions feel native. **Persistent** —
subtle references to time, continuity, returning. **Confident** — no excessive
decoration; feels like infrastructure.

## 3. Core Visual Concept

**Dawn / Horizon / Continuity.** "Morrow" refers to tomorrow. Subtle use of:
horizon lines, warm light, ember-like accents, dark→warm gradients,
inactive→active transitions, persistent state indicators. Keep the metaphor
subtle — do not turn the product into a sunrise-themed website.

## 4. Color System

### Primary background (warm almost-black, never blue-black)

```text
--morrow-base-950: #0C0B0A   application background
--morrow-base-900: #121110   sidebar / navigation
--morrow-base-850: #181614   cards / panels
--morrow-base-800: #201D1A   elevated surfaces
```

### Warm neutral scale

```text
--morrow-neutral-50:  #F5F1EA
--morrow-neutral-100: #E8E1D7
--morrow-neutral-200: #D2C9BC
--morrow-neutral-300: #B5AA9C
--morrow-neutral-400: #91877B
--morrow-neutral-500: #716960
--morrow-neutral-600: #57514B
--morrow-neutral-700: #3E3A36
--morrow-neutral-800: #292622
--morrow-neutral-900: #181614
```

**Use warm gray instead of slate.** Avoid `#0F172A`, `#1E293B`, `#334155` —
they push the interface toward the standard blue SaaS aesthetic.

## 5. Brand Accent — Ember

```text
--morrow-ember-50:  #FFF4E8
--morrow-ember-100: #FFE4C7
--morrow-ember-200: #FFC98F
--morrow-ember-300: #FFAA57
--morrow-ember-400: #F58A35
--morrow-ember-500: #E56F24   ← primary brand color
--morrow-ember-600: #C9551A
--morrow-ember-700: #9F4017
--morrow-ember-800: #713016
--morrow-ember-900: #45200F
```

Use sparingly. Good: primary buttons, active profile, focus state, selected
navigation, live browser indicator, important links, logo mark. Bad: entire
cards, large backgrounds, every icon, gradients everywhere.

## 6. Secondary Accent — Gold

`--morrow-gold: #D7A84A` for warnings and "waiting" states (e.g.
`WAITING FOR HUMAN`). Use gold rather than blue for attention states.

## 7. Semantic Colors (slightly warm)

```text
Success: #79A96B
Warning: #D7A84A
Error:   #D05C4D
Info:    #9B9388   ← intentionally neutral, not blue
```

## 8. Color Usage

Background `#0C0B0A`; sidebar `#121110`; cards `#181614`; elevated `#201D1A`;
text `#F5F1EA` on dark; fine borders `#292622`.

## 9. Typography

Typography is a major part of the identity. Avoid Inter-everywhere.

- **Primary UI font: Geist Sans** — clean, technical, contemporary.
- **Monospace: Geist Mono** — URLs, profile IDs, session IDs, logs, API
  responses, code, network requests, timestamps, technical metadata.

## 10. Typography Scale

```text
Display      48 / 52
Heading 1    32 / 38
Heading 2    24 / 30
Heading 3    18 / 24
Body         14 / 22
Small        13 / 19
Tiny         11 / 16
Mono         12 / 18
```

Favor smaller, denser UI typography — technical workspace, not marketing
dashboard.

## 11–12. Logo

Custom **M + horizon** mark (per brand board, recolored to this palette).
Avoid: globe, browser window, robot, lightning bolt, infinity, AI sparkle.
Works at 16/24/32/48px. Primarily monochrome; accent-colored versions reserved
for active states.

Lockups: `[M] MORROW` (primary), `[M]` (compact), `MORROW` (wordmark).
Uppercase product name in UI navigation; wordmark uses custom spacing.

## 13. daisyUI Strategy

Use daisyUI as the component foundation — don't fight it. daisyUI for:
button, input, select, textarea, badge, alert, card, modal, drawer, dropdown,
tabs, table, tooltip, menu, breadcrumbs, avatar, progress, kbd, skeleton,
toast. Tailwind for layout/spacing/sizing/responsive. Custom CSS only for:
brand tokens, browser viewport, terminal/log surfaces, specialized controls,
logo, subtle transitions.

## 14. daisyUI Theme

```css
@plugin "daisyui" {
  themes: morrow;
}

@plugin "daisyui/theme" {
  name: "morrow";
  default: true;
  prefersdark: true;

  --color-base-100: #0C0B0A;
  --color-base-200: #121110;
  --color-base-300: #201D1A;
  --color-base-content: #F5F1EA;

  --color-primary: #E56F24;
  --color-primary-content: #160C05;
  --color-secondary: #9B9388;
  --color-secondary-content: #0C0B0A;
  --color-accent: #D7A84A;
  --color-accent-content: #160F05;
  --color-neutral: #292622;
  --color-neutral-content: #E8E1D7;

  --color-info: #9B9388;
  --color-info-content: #0C0B0A;
  --color-success: #79A96B;
  --color-success-content: #081007;
  --color-warning: #D7A84A;
  --color-warning-content: #120D05;
  --color-error: #D05C4D;
  --color-error-content: #150605;

  --radius-selector: 0.375rem;
  --radius-field: 0.375rem;
  --radius-box: 0.5rem;

  --border: 1px;
  --depth: 0;
  --noise: 0;
}
```

Exact variables adjusted to the installed daisyUI version.

## 15–17. Borders, Radius, Shadows

**Borders over shadows.** Border color `#292622`; cards are physical panels
separated by fine lines. Radii: buttons/inputs 6px, cards 8px, modals 10px,
browser 8px, pills 999px. Default **no shadow**; subtle shadows only for
dropdowns, modals, floating panels, browser overlays. Depth from borders,
contrast, layering, spacing.

## 18. Buttons

Compact: height 36px, radius 6px, font 13px/500. `btn-primary` (ember) for the
single most important action; `btn-neutral` secondary; `btn-ghost` tertiary;
`btn-error` destructive. No large gradient buttons.

## 19–20. Profile Card & Status

Card shows: status dot + name, current URL, platform/locale summary, last
active, primary action, overflow menu. Tiny status indicator — never a fully
orange card.

```text
● RUNNING    ○ STOPPED    ◌ STARTING    ◐ PAUSED    ⚠ ACTION REQUIRED    × ERROR
```

Indicators small; color secondary to typography.

## 21–22. Browser Viewer & Control Indicator

The most visually important component — a **browser inside an operating
system**, not a screenshot in a card: title row (status dot, profile name,
LIVE), toolbar (back/forward/reload, URL bar), viewport (neutral, uncluttered),
bottom panel tabs (Human Control, Playwright, Network, Console). Control state
always visible: `● HUMAN CONTROL` / `● AUTOMATED` / `● WAITING FOR HUMAN`
(gold).

## 23–24. Session UI & Logs

Monospace for IDs and timestamps. Logs resemble a terminal: background
`#0C0B0A`, Geist Mono 12px, `HH:MM:SS  event  detail` columns, no decorative
syntax colors.

## 25. Tables

Dense, warm subtle borders, no alternating colored rows.

## 26. Navigation

Minimal sidebar; active item: background `#201D1A`, text `#F5F1EA`,
`border-left: 2px solid #E56F24`. Not a giant orange pill.

## 27–29. Empty States, Loading, Toasts

Empty states: typography + one action, no illustrations. Skeletons over
spinners (spinners only for short operations). Toasts quiet, no success
animations.

## 30. Modals

System-dialog feel: title, fields, right-aligned Cancel/Confirm.

## 31. Icons

**Lucide**, 16/18/20px, non-decorative, support text rather than replace it.

## 32. Data Density

A developer should see browser status, profile, current URL, session,
controller, proxy, last activity without clicking through five pages.

## 33–34. Marketing Website

Same system, more breathing room. Hero: "BROWSERS THAT REMEMBER." + subline +
two actions. Black, warm off-white, ember, thin lines, subtle grain, horizon
motifs, monospace metadata, browser chrome, terminal snippets. Feel:
"a piece of infrastructure from the future." No 3D browser illustrations,
purple gradients, floating SaaS cards, robot imagery.

## 35. Responsive

Desktop-first (information-dense). Mobile supports: profile list/status,
start/stop, session monitoring, basic viewer, activity.

## 36. Accessibility

WCAG AA where practical: keyboard navigation, visible focus states
(`outline: 2px solid #E56F24; outline-offset: 2px`), semantic HTML, accessible
dialogs, sufficient contrast, status never color-only, reduced-motion support.

## 37. Motion

Motion communicates state (starting, stopping, connecting, takeover, loading).
No bouncing, springs, animated gradients, decorative movement.

## 38. Design Tokens

Color (Base, Neutral, Ember, Gold, Semantic), Typography (Sans, Mono), Radius,
Border, Spacing, Motion. daisyUI consumes these tokens wherever possible.

## 39. Component Inventory

**Core:** Button, Icon Button, Input, Select, Textarea, Checkbox, Toggle,
Tabs, Badge, Avatar, Tooltip.
**Navigation:** Sidebar, Topbar, Breadcrumbs, Command Menu.
**Data:** Table, Profile Card, Session Card, Status Badge, Activity Timeline,
Log Viewer.
**Browser:** Browser Viewer, Browser Toolbar, Tab Strip, URL Bar, Control
Indicator, Browser Status, DevTools Panel.
**Infrastructure:** Worker Card, Proxy Card, Profile Health, Session
Inspector, Network Inspector.
**Feedback:** Toast, Alert, Modal, Drawer, Skeleton, Empty State.

(v1 builds a subset — see the v1 UI design doc.)

## 40. Command Palette

Eventually: global ⌘K palette (open profile, create profile, start/stop,
navigation). Reinforces the operating-system feel. Not required for v1.

## 41. Final Design Rule

> **Would this look natural inside a browser operating system?**

If yes, keep it. If it looks like a generic SaaS dashboard component,
redesign it. The signature: **warm black + ember + warm neutrals + dense
typography + thin borders + browser chrome + monospace technical information.**
