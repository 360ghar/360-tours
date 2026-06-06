# DESIGN.md — 360 Viewer Design System

> Machine-readable design system manifest for AI coding agents. Reference this file when generating UI code to ensure visual consistency across the 360 Viewer application.

## Overview

**Brand personality:** Warm, professional, and modern — designed for property-tech with a confident orange-red accent that conveys energy and action. The secondary golden-amber palette brings warmth and approachability.

**Design principles:**

- **Accessible first:** High-contrast text, focus rings, disabled states, and screen-reader primitives (Radix UI) are built in, not afterthoughts.
- **Light + Dark:** Every color token has a `.dark` override; components must work in both modes.
- **Consistent motion:** Transition timing uses `cubic-bezier(0.4, 0, 0.2, 1)` via CSS custom properties; animations are purposeful and subtle.

**Tech stack:**

| Layer | Technology |
|---|---|
| CSS framework | Tailwind CSS v4 (`@tailwindcss/vite`) |
| Component primitives | Radix UI (16 packages) |
| Variant system | `class-variance-authority` v0.7.1 |
| Class merging | `clsx` + `tailwind-merge` via `cn()` utility |
| Icons | `lucide-react` v0.562.0 |
| Typography | Clash Display, Satoshi, JetBrains Mono (Fontshare CDN) |

**Configuration pattern:** Tailwind v4 uses CSS-based configuration — no `tailwind.config.ts`. All design tokens are CSS custom properties defined in `:root` and overridden in `.dark` within `src/index.css`.

---

## Colors

### Primary — Orange-Red

The primary palette drives CTAs, active states, focus rings, and brand accents.

| Token | Hex |
|---|---|
| `--color-primary-50` | `#FFF5F2` |
| `--color-primary-100` | `#FFE8E1` |
| `--color-primary-200` | `#FFCFC2` |
| `--color-primary-300` | `#FFAB94` |
| `--color-primary-400` | `#FF8A5C` |
| **`--color-primary-500`** | **`#FF5733`** |
| `--color-primary-600` | `#E64A2E` |
| `--color-primary-700` | `#CC3D25` |
| `--color-primary-800` | `#A63320` |
| `--color-primary-900` | `#872A1A` |
| `--color-primary-950` | `#4A1610` |

### Secondary — Golden/Amber

Used for secondary actions, highlights, and warm accents.

| Token | Hex |
|---|---|
| `--color-secondary-50` | `#FFFBEB` |
| `--color-secondary-100` | `#FEF3C7` |
| `--color-secondary-200` | `#FDE68A` |
| `--color-secondary-300` | `#FCD34D` |
| `--color-secondary-400` | `#FBBF24` |
| **`--color-secondary-500`** | **`#FFC857`** |
| `--color-secondary-600` | `#D97706` |
| `--color-secondary-700` | `#B45309` |
| `--color-secondary-800` | `#92400E` |
| `--color-secondary-900` | `#78350F` |
| `--color-secondary-950` | `#451A03` |

### Success — Emerald

| Token | Hex |
|---|---|
| `--color-success-50` | `#ecfdf5` |
| `--color-success-100` | `#d1fae5` |
| `--color-success-200` | `#a7f3d0` |
| `--color-success-500` | `#10b981` |
| `--color-success-600` | `#059669` |
| `--color-success-700` | `#047857` |
| `--color-success-800` | `#065f46` |

### Warning — Amber

| Token | Hex |
|---|---|
| `--color-warning-50` | `#fffbeb` |
| `--color-warning-100` | `#fef3c7` |
| `--color-warning-200` | `#fde68a` |
| `--color-warning-500` | `#f59e0b` |
| `--color-warning-600` | `#d97706` |
| `--color-warning-700` | `#b45309` |
| `--color-warning-800` | `#92400e` |

### Error — Red

| Token | Hex |
|---|---|
| `--color-error-50` | `#fef2f2` |
| `--color-error-100` | `#fee2e2` |
| `--color-error-200` | `#fecaca` |
| `--color-error-500` | `#ef4444` |
| `--color-error-600` | `#dc2626` |
| `--color-error-700` | `#b91c1c` |
| `--color-error-800` | `#991b1b` |

### Info — Neutral

| Token | Hex |
|---|---|
| `--color-info-50` | `#f5f5f5` |
| `--color-info-100` | `#e5e5e5` |
| `--color-info-200` | `#d4d4d4` |
| `--color-info-500` | `#6b6b6b` |
| `--color-info-600` | `#525252` |
| `--color-info-700` | `#404040` |
| `--color-info-800` | `#262626` |

### Background, Surface & Text

| Token | Light | Dark |
|---|---|---|
| `--color-background` | `#ffffff` | `#0A0A0B` |
| `--color-surface` | `#F5F5F5` | `#111111` |
| `--color-surface-elevated` | `#ffffff` | `#1A1A1F` |
| `--color-text-primary` | `#0A0A0B` | `#FAFAFA` |
| `--color-text-secondary` | `#3D3D3D` | `#B8B8B8` |
| `--color-text-muted` | `#6B6B6B` | `#6B6B6B` |
| `--color-text-disabled` | `#9A9A9A` | `#4A4A4A` |
| `--color-text-inverse` | `#ffffff` | `#ffffff` |

### Border

| Token | Value |
|---|---|
| `--color-border` | `#E5E5E5` (light) / `#2A2A2F` (dark) |
| `--color-border-focus` | `#FF5733` |
| `--color-border-error` | `#ef4444` |

### Landing Page

| Token | Light | Dark |
|---|---|---|
| `--landing-bg` | `#FAFAFA` | `#0A0A0B` |
| `--landing-bg-dark` | `#0A0A0B` | — |
| `--landing-accent` | `#FF5733` | `#FF5733` |
| `--landing-accent-hover` | `#E64A2E` | `#E64A2E` |
| `--landing-accent-subtle` | `#FFF0EC` | `#1F1510` |
| `--landing-text-hero` | `#0A0A0B` | `#FAFAFA` |
| `--landing-text-body` | `#3D3D3D` | `#B8B8B8` |
| `--landing-text-muted` | `#6B6B6B` | `#6B6B6B` |

**Gradients:**

| Token | Value |
|---|---|
| `--landing-gradient-ai` | `linear-gradient(135deg, #FF5733 0%, #FF8A5C 50%, #FFC857 100%)` |
| `--landing-gradient-dark` | `linear-gradient(180deg, #0A0A0B 0%, #1A1A1F 100%)` |

---

## Typography

### Font Families

| Use | Token | Stack |
|---|---|---|
| Display / Headings | `--font-display` | `'Clash Display', system-ui, sans-serif` |
| Body | `--font-body` | `'Satoshi', system-ui, sans-serif` |
| Sans (default) | `--font-sans` | `'Satoshi', system-ui, -apple-system, sans-serif` |
| Monospace | `--font-mono` | `'JetBrains Mono', ui-monospace, monospace` |

**Loaded weights (Fontshare CDN):**

- Clash Display: 400, 500, 600, 700
- Satoshi: 400, 500, 700, 900

### Editorial Utility Classes

| Class | Properties |
|---|---|
| `.app-headline` | `font-family: var(--font-display); font-weight: 700; letter-spacing: -0.02em; color: var(--color-text-primary)` |
| `.app-subhead` | `font-family: var(--font-body); font-weight: 500; line-height: 1.4; color: var(--color-text-secondary)` |
| `.app-body` | `font-family: var(--font-body); font-weight: 400; line-height: 1.6; color: var(--color-text-primary)` |
| `.app-eyebrow` | `font-family: var(--font-body); font-weight: 600; font-size: 0.75rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--color-primary-600)` |

### Landing Utility Classes

| Class | Properties |
|---|---|
| `.landing-headline` | `font-family: var(--font-display); font-weight: 700; line-height: 0.95; letter-spacing: -0.03em; color: var(--landing-text-hero)` |
| `.landing-subhead` | `font-family: var(--font-body); font-weight: 500; line-height: 1.4; color: var(--landing-text-body)` |
| `.landing-body` | `font-family: var(--font-body); font-weight: 400; line-height: 1.6; color: var(--landing-text-body)` |
| `.landing-eyebrow` | `font-family: var(--font-body); font-weight: 600; font-size: 0.75rem; letter-spacing: 0.15em; text-transform: uppercase; color: var(--landing-accent)` |

### Base Styles

```css
html {
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
body {
  margin: 0;
  background-color: var(--color-background);
  color: var(--color-text-primary);
  min-height: 100vh;
}
```

### Focus Styles

All focusable elements use:

```css
*:focus-visible {
  outline: 2px solid var(--color-border-focus); /* #FF5733 */
  outline-offset: 2px;
}
```

---

## Spacing & Layout

### Base Unit

**4px** — Tailwind default spacing scale (1 unit = 4px).

### Spacing Scale (commonly used)

| Tailwind | px | Usage |
|---|---|---|
| `0.5` | 2 | Tight gaps (py-0.5) |
| `1` | 4 | Micro spacing (p-1, gap-1) |
| `1.5` | 6 | Small padding (py-1.5, mb-1.5) |
| `2` | 8 | Compact spacing (p-2, gap-2, px-2) |
| `3` | 12 | Standard inline (px-3, gap-3) |
| `4` | 16 | Default padding (p-4, px-4, gap-4) |
| `6` | 24 | Section padding (p-6, mt-6) |
| `8` | 32 | Generous padding (px-8) |
| `10` | 40 | Large padding (px-10) |

### Custom Responsive Tokens

| Token | Value | Responsive Range |
|---|---|---|
| `--space-section` | `clamp(5rem, 10vw, 8rem)` | 80px → 128px |
| `--space-block` | `clamp(2.5rem, 5vw, 4rem)` | 40px → 64px |

### Landing Section Padding

| Breakpoint | Horizontal Padding |
|---|---|
| Mobile (default) | `1.5rem` (24px) |
| `≥768px` (md) | `3rem` (48px) |
| `≥1280px` (xl) | `4rem` (64px) |

### Border Radius

| Token | Value | px |
|---|---|---|
| `--radius-sm` | `0.25rem` | 4 |
| `--radius-md` | `0.375rem` | 6 |
| `--radius-lg` | `0.5rem` | 8 |
| `--radius-xl` | `0.75rem` | 12 |
| `--radius-2xl` | `1rem` | 16 |
| `--radius-full` | `9999px` | pill/circle |

---

## Components

### Button

**Source:** `src/components/ui/Button.tsx` + `src/components/ui/buttonVariants.ts`

**Base classes:**

```
inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg
text-sm font-medium transition-colors
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
disabled:pointer-events-none disabled:opacity-50
[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0
```

**Variants:**

| Variant | Background | Text | Border | Hover | Focus Ring |
|---|---|---|---|---|---|
| `default` | `--color-primary-600` | white | none | `--color-primary-700` | `--color-primary-500` |
| `destructive` | `--color-error-600` | white | none | `--color-error-500` | `--color-error-500` |
| `outline` | transparent | — | `--color-border` | bg: `--color-surface` | `--color-primary-500` |
| `secondary` | `--color-surface` | `--color-text-primary` | none | bg: `--color-border` | `--color-primary-500` |
| `ghost` | transparent | — | none | bg: `--color-surface` | `--color-primary-500` |
| `link` | transparent | `--color-primary-600` | none | underline | `--color-primary-500` |
| `success` | `--color-success-600` | white | none | `--color-success-500` | `--color-success-500` |

**Sizes:**

| Size | Height | Padding | Font | Radius |
|---|---|---|---|---|
| `sm` | 32px (h-8) | px-3 | xs | `--radius-md` |
| `default` | 40px (h-10) | px-4 py-2 | sm | `--radius-lg` |
| `lg` | 48px (h-12) | px-8 | base | `--radius-lg` |
| `xl` | 56px (h-14) | px-10 | lg | `--radius-lg` |
| `icon` | 40px × 40px | — | sm | `--radius-lg` |
| `icon-sm` | 32px × 32px | — | xs | `--radius-md` |
| `icon-lg` | 48px × 48px | — | base | `--radius-lg` |

**Loading state:** Replaces content with `Loader2` icon (`animate-spin`) + "Loading..." text.

### Landing CTA Buttons

**`.landing-btn-primary`:**

```css
display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem;
padding: 1rem 2rem;
background: var(--landing-accent); /* #FF5733 */
color: white;
font-family: var(--font-body); font-weight: 600; font-size: 1rem;
border-radius: 9999px; border: none;
/* Hover: background #E64A2E, translateY(-2px), box-shadow: 0 8px 30px rgba(255,87,51,0.3) */
```

**`.landing-btn-secondary`:**

```css
/* Same layout/font as primary */
background: transparent;
color: var(--landing-text-hero);
border-radius: 9999px; border: 2px solid var(--landing-text-hero);
/* Hover: background var(--landing-text-hero), color var(--landing-bg), translateY(-2px) */
```

### Badge

**Source:** `src/components/ui/badgeVariants.ts`

**Base:** `inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors`

| Variant | Background | Text | Border |
|---|---|---|---|
| `default` | `--color-primary-100` | `--color-primary-700` | transparent |
| `secondary` | `--color-surface` | `--color-text-secondary` | transparent |
| `destructive` | `--color-error-50` | `--color-error-600` | transparent |
| `success` | `--color-success-50` | `--color-success-600` | transparent |
| `warning` | `--color-warning-50` | `--color-warning-600` | transparent |
| `info` | `--color-info-50` | `--color-info-600` | transparent |
| `outline` | — | `--color-text-primary` | `--color-border` |

### Card

**Source:** `src/components/ui/Card.tsx`

| Sub-component | Classes |
|---|---|
| `Card` | `rounded-xl border-[--color-border] bg-[--color-surface-elevated] shadow-sm` |
| `CardHeader` | `flex flex-col space-y-1.5 p-6` |
| `CardTitle` | `text-xl font-semibold leading-none tracking-tight` |
| `CardDescription` | `text-sm text-[--color-text-muted]` |
| `CardContent` | `p-6 pt-0` |
| `CardFooter` | `flex items-center p-6 pt-0` |

### Input

**Source:** `src/components/ui/Input.tsx`

```
h-10 rounded-lg border-[--color-border] bg-[--color-background]
px-3 py-2 text-sm
focus-visible:ring-2 focus-visible:ring-[--color-primary-500] focus-visible:ring-offset-2
disabled:cursor-not-allowed disabled:opacity-50
placeholder:text-[--color-text-muted]
```

| State | Border | Focus Ring |
|---|---|---|
| Default | `--color-border` | `--color-primary-500` |
| Error | `--color-error-500` | `--color-error-500` |

- **Label:** `mb-1.5 block text-sm font-medium text-[--color-text-primary]`
- **Error text:** `mt-1.5 text-sm text-[--color-error-500]`
- **Helper text:** `mt-1.5 text-sm text-[--color-text-muted]`

### Textarea

Same styling as Input with `min-h-[80px]` and `resize-y`.

### Dialog

**Source:** `src/components/ui/Dialog.tsx`

| Part | Value |
|---|---|
| Overlay | `fixed inset-0 z-[--z-overlay] bg-black/50 backdrop-blur-sm` + fade animation |
| Content | `fixed z-[--z-modal] max-w-lg max-h-[85vh] rounded-xl shadow-xl bg-[--color-surface-elevated] border-[--color-border] p-6` + slide-up animation |
| Title | `text-lg font-semibold text-[--color-text-primary]` |
| Description | `text-sm text-[--color-text-secondary]` |
| Close | `absolute right-4 top-4 rounded-md p-1 text-[--color-text-muted] hover:text-[--color-text-primary] hover:bg-[--color-surface]` |
| Footer | `flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-6` |

### Sheet (Slide-over Panel)

**Source:** `src/components/ui/Sheet.tsx`

| Part | Value |
|---|---|
| Overlay | `fixed inset-0 z-[--z-overlay] bg-black/50 backdrop-blur-sm` + fade animation |
| Content | `fixed z-[--z-modal] bg-[--color-surface-elevated] shadow-xl` + slide animation |
| Side `left` | `inset-y-0 left-0 w-3/4 max-w-sm border-r-[--color-border]` |
| Side `right` | `inset-y-0 right-0 w-3/4 max-w-sm border-l-[--color-border]` |
| Side `top` | `inset-x-0 top-0 border-b-[--color-border]` |
| Side `bottom` | `inset-x-0 bottom-0 border-t-[--color-border]` |
| Header | `flex flex-col gap-2 p-6` |
| Footer | `flex flex-col-reverse sm:flex-row sm:justify-end gap-2 p-6 pt-0` |

### Dropdown Menu

**Source:** `src/components/ui/DropdownMenu.tsx`

| Part | Value |
|---|---|
| Content | `z-[--z-dropdown] min-w-[8rem] rounded-lg border-[--color-border] bg-[--color-surface-elevated] p-1 shadow-lg` + fade-in |
| Item | `rounded-md px-2 py-1.5 text-sm gap-2 text-[--color-text-primary] hover:bg-[--color-surface]` |
| Label | `px-2 py-1.5 text-xs font-medium text-[--color-text-muted]` |
| Separator | `h-px bg-[--color-border]` |
| Shortcut | `ml-auto text-xs tracking-widest text-[--color-text-muted]` |
| Checkbox/Radio Item | `py-1.5 pl-8 pr-2 rounded-md` |

### Alert Dialog

Same overlay/content pattern as Dialog. Confirm action uses `buttonVariants({ variant: 'default' })`, cancel uses `buttonVariants({ variant: 'outline' })`.

### Select

**Source:** `src/components/ui/Select.tsx`

| Part | Value |
|---|---|
| Trigger | `h-10 rounded-lg border-[--color-border] bg-[--color-background] px-3 py-2 text-sm focus:ring-[--color-primary-500]` |
| Content | `z-[--z-dropdown] rounded-lg border-[--color-border] bg-[--color-surface-elevated] shadow-lg max-h-96` |
| Item | `rounded-md py-2 pl-8 pr-2 text-sm focus:bg-[--color-surface]` |
| Checkmark | `text-[--color-primary-600]` 16×16px |
| Chevron | `text-[--color-text-muted]` 16×16px |

### Tabs

| Part | Value |
|---|---|
| List | `h-10 rounded-lg bg-[--color-surface] p-1 gap-1` |
| Trigger | `rounded-md px-3 py-1.5 text-sm font-medium text-[--color-text-secondary]` |
| Trigger active | `bg-[--color-surface-elevated] text-[--color-text-primary] shadow-sm` |

### Checkbox

- Size: 16×16px (h-4 w-4), `rounded`
- Unchecked: `border-[--color-border]`
- Checked: `bg-[--color-primary-600] border-[--color-primary-600] text-white`
- Focus: `ring-[--color-primary-500] ring-offset-2`
- Check icon: 12×12px, `strokeWidth={3}`

### Switch

- Root: 36×20px (h-5 w-9), `rounded-full`, `border-2 border-transparent`
- Unchecked: `bg-[--color-border]`
- Checked: `bg-[--color-primary-600]`
- Thumb: 16×16px `rounded-full bg-white shadow-lg`, `translate-x-4` when checked
- Focus: `ring-[--color-primary-500] ring-offset-2`

### Radio Group

- Item: 16×16px `rounded-full border-[--color-border]`
- Checked: `border-[--color-primary-600]`, dot: `fill-[--color-primary-600]` 10×10px
- Focus: `ring-[--color-primary-500] ring-offset-2`
- Layout: `flex gap-2` (horizontal `flex-row flex-wrap`, vertical `flex-col`)

### Avatar

| Size | Dimensions | Font |
|---|---|---|
| `sm` | 32×32px (h-8 w-8) | xs |
| `md` (default) | 40×40px (h-10 w-10) | sm |
| `lg` | 48×48px (h-12 w-12) | base |
| `xl` | 64×64px (h-16 w-16) | lg |

- Root: `rounded-full overflow-hidden`
- Fallback: `bg-[--color-surface] text-[--color-text-secondary] font-medium`

### Alert

| Variant | Border | Background | Text | Icon |
|---|---|---|---|---|
| `default` | — | `--color-surface` | `--color-text-primary` | `--color-text-primary` |
| `destructive` | `--color-error-200` | `--color-error-50` | `--color-error-700` | `--color-error-500` |
| `warning` | `--color-warning-200` | `--color-warning-50` | `--color-warning-700` | `--color-warning-500` |
| `success` | `--color-success-200` | `--color-success-50` | `--color-success-700` | `--color-success-500` |

- Base: `rounded-lg border p-4`, icon positioned `absolute left-4 top-4`
- Title: `font-medium tracking-tight`
- Description: `text-sm leading-relaxed`

### Toast

**Source:** `src/components/ui/Toaster.tsx`

| Type | Background | Border | Text | Icon |
|---|---|---|---|---|
| `success` | `--color-success-50` | `--color-success-500` | `--color-success-800` | `--color-success-600` |
| `error` | `--color-error-50` | `--color-error-500` | `--color-error-800` | `--color-error-600` |
| `info` | `--color-primary-50` | `--color-primary-500` | `--color-primary-800` | `--color-primary-600` |
| `warning` | `--color-warning-50` | `--color-warning-500` | `--color-warning-800` | `--color-warning-600` |

- Container: `fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-md`
- Item: `rounded-lg border p-4 shadow-lg transition-all duration-150`
- Icon: 20×20px; dismiss icon: 16×16px
- Default duration: 5000ms

### Popover

- Content: `z-[--z-dropdown] w-72 rounded-lg border-[--color-border] bg-[--color-surface-elevated] p-4 shadow-lg` + fade-in animation, `sideOffset = 4`

### Tooltip

- Content: `z-[--z-tooltip] rounded-md px-3 py-1.5 bg-[--color-text-primary] text-[--color-text-inverse] text-xs font-medium shadow-md animate-fade-in`, `sideOffset = 4`
- Arrow: `fill-[--color-text-primary]`

### Progress

- Track: `h-2 w-full rounded-full bg-[--color-surface]`
- Indicator: `bg-[--color-primary-600] transition-all duration-300 ease-out`

### Slider

- Track: `h-2 rounded-full bg-[--color-border]`
- Fill: `linear-gradient(to right, var(--color-primary-500) 0%, ...)`
- Thumb: `h-4 w-4 rounded-full bg-[--color-primary-600] shadow-md hover:scale-110`
- Label/value: `text-sm font-medium`

### Skeleton

- Base: `animate-pulse rounded-md bg-[--color-surface]`
- SkeletonCard: `rounded-xl border-[--color-border] p-4`

### Spinner

| Size | Dimensions |
|---|---|
| `sm` | 16×16px |
| `md` | 24×24px |
| `lg` | 32×32px |

- Color: `text-[--color-primary-600]`, uses `Loader2` icon with `animate-spin`
- LoadingOverlay: `bg-[--color-background]/80 backdrop-blur-sm`
- PageLoader: `min-h-[50vh]`

### ScrollArea

- Thumb: `rounded-full bg-[--color-text-muted] hover:bg-[--color-text-secondary] transition-colors`
- Vertical bar: `w-2.5`
- Horizontal bar: `h-2.5`

### PhoneInput

- Country select: `h-10 rounded-l-lg border-[--color-border] bg-[--color-surface] px-3`
- Phone input: `h-10 rounded-r-lg border-[--color-border] bg-[--color-background] px-3 py-2`
- Dropdown selected item: `bg-[--color-primary-50]`

### DateRangePicker

- Selected day: `bg-[--color-primary-500] text-white hover:bg-[--color-primary-600]`
- Range middle: `bg-[--color-primary-100] text-[--color-primary-900]`
- Range start/end: `bg-[--color-primary-500] text-white`
- Today: `bg-[--color-surface-elevated] font-semibold`
- Outside/disabled day: `text-[--color-text-muted] opacity-50`
- Head cell: `text-[--color-text-muted] w-9 text-[0.8rem]`

### Label

`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70`

### Separator

- Horizontal: `h-px w-full bg-[--color-border]`
- Vertical: `h-full w-px bg-[--color-border]`

---

## Elevation

### Shadow Tokens

| Token | Value | Usage |
|---|---|---|
| `--shadow-sm` | `0 1px 2px 0 rgb(0 0 0 / 0.05)` | Cards, secondary buttons |
| `--shadow-md` | `0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)` | Tooltips |
| `--shadow-lg` | `0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)` | Dropdowns, popovers |
| `--shadow-xl` | `0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)` | Dialogs, sheets, alerts |

### Special Shadows

| Context | Value |
|---|---|
| Landing CTA hover | `0 8px 30px rgba(255, 87, 51, 0.3)` |
| Landing pulse glow | `0 0 0 0 rgba(255, 87, 51, 0.4)` → `0 0 0 16px rgba(255, 87, 51, 0)` |

---

## Motion

### Transition Tokens

| Token | Value | Usage |
|---|---|---|
| `--transition-fast` | `150ms cubic-bezier(0.4, 0, 0.2, 1)` | Hover states, small toggles |
| `--transition-base` | `200ms cubic-bezier(0.4, 0, 0.2, 1)` | Component transitions, focus |
| `--transition-slow` | `300ms cubic-bezier(0.4, 0, 0.2, 1)` | Sheet/drawer slide, page transitions |

### Animation Keyframes

| Name | From | To |
|---|---|---|
| `fadeIn` | `opacity: 0` | `opacity: 1` |
| `slideUp` | `opacity: 0; translateY(10px)` | `opacity: 1; translateY(0)` |
| `slideIn` | `opacity: 0; translateX(-10px)` | `opacity: 1; translateX(0)` |
| `spin` | `rotate(0deg)` | `rotate(360deg)` |
| `pulse` | `opacity: 1` → `0.5` | `opacity: 1` |
| `scaleIn` | `opacity: 0; scale(0.9)` | `opacity: 1; scale(1)` |
| `shimmer` | `background-position: -200% 0` | `background-position: 200% 0` |

### Landing Page Animations

| Name | Duration / Easing | From | To |
|---|---|---|---|
| `fadeInUp` | `0.7s cubic-bezier(0.16, 1, 0.3, 1)` | `opacity: 0; translateY(40px)` | `opacity: 1; translateY(0)` |
| `fadeInRight` | `0.7s cubic-bezier(0.16, 1, 0.3, 1)` | `opacity: 0; translateX(-40px)` | `opacity: 1; translateX(0)` |
| `fadeInLeft` | `0.7s cubic-bezier(0.16, 1, 0.3, 1)` | `opacity: 0; translateX(40px)` | `opacity: 1; translateX(0)` |
| `float` | `5s ease-in-out infinite` | `translateY(0) rotate(-3deg)` | `translateY(-12px) rotate(-3deg)` |
| `drawPath` | `2s ease-out forwards` | `stroke-dashoffset: 1000` | `stroke-dashoffset: 0` |
| `marquee` | `40s linear infinite` | `translateX(0)` | `translateX(-50%)` |
| `pulseGlow` | `2.5s ease-in-out infinite` | `box-shadow: 0 0 0 0 rgba(255,87,51,0.4)` | `box-shadow: 0 0 0 16px rgba(255,87,51,0)` |

### Stagger Delays

Available classes: `0ms`, `100ms`, `200ms`, `300ms`, `400ms`, `500ms`, `600ms`, `700ms`, `800ms`, `900ms`, `1000ms`, `1200ms`.

---

## Z-Index Scale

| Token | Value | Usage |
|---|---|---|
| `--z-dropdown` | 50 | Dropdown menus, selects, popovers |
| `--z-sticky` | 100 | Sticky headers, navbars |
| `--z-overlay` | 200 | Dialog/sheet overlays, backdrop |
| `--z-modal` | 300 | Dialog/sheet content |
| `--z-toast` | 400 | Toast notifications |
| `--z-tooltip` | 500 | Tooltips |

---

## Dark Mode

All tokens that change in `.dark` mode are defined via CSS custom properties. The toggle uses the `.dark` class on `<html>`.

### Selective Dark Overrides

#### Primary Scale (changed tokens only)

| Token | Light | Dark |
|---|---|---|
| `--color-primary-50` | `#FFF5F2` | `#1F1510` |
| `--color-primary-100` | `#FFE8E1` | `#2D1A14` |
| `--color-primary-200` | `#FFCFC2` | `#4A1610` |
| `--color-primary-600` | `#E64A2E` | `#FF8A5C` |
| `--color-primary-800` | `#A63320` | `#FFCFC2` |

#### Success (changed tokens only)

| Token | Light | Dark |
|---|---|---|
| `--color-success-50` | `#ecfdf5` | `#064e3b` |
| `--color-success-100` | `#d1fae5` | `#065f46` |
| `--color-success-200` | `#a7f3d0` | `#047857` |
| `--color-success-500` | `#10b981` | `#10b981` |
| `--color-success-600` | `#059669` | `#34d399` |
| `--color-success-700` | `#047857` | `#6ee7b7` |
| `--color-success-800` | `#065f46` | `#a7f3d0` |

#### Warning (changed tokens only)

| Token | Light | Dark |
|---|---|---|
| `--color-warning-50` | `#fffbeb` | `#451a03` |
| `--color-warning-100` | `#fef3c7` | `#78350f` |
| `--color-warning-200` | `#fde68a` | `#92400e` |
| `--color-warning-500` | `#f59e0b` | `#f59e0b` |
| `--color-warning-600` | `#d97706` | `#fbbf24` |
| `--color-warning-700` | `#b45309` | `#fcd34d` |
| `--color-warning-800` | `#92400e` | `#fde68a` |

#### Error (changed tokens only)

| Token | Light | Dark |
|---|---|---|
| `--color-error-50` | `#fef2f2` | `#450a0a` |
| `--color-error-100` | `#fee2e2` | `#7f1d1d` |
| `--color-error-200` | `#fecaca` | `#991b1b` |
| `--color-error-500` | `#ef4444` | `#ef4444` |
| `--color-error-600` | `#dc2626` | `#f87171` |
| `--color-error-700` | `#b91c1c` | `#fca5a5` |
| `--color-error-800` | `#991b1b` | `#fecaca` |

#### Info (changed tokens only)

| Token | Light | Dark |
|---|---|---|
| `--color-info-50` | `#f5f5f5` | `#1a1a1f` |
| `--color-info-100` | `#e5e5e5` | `#2a2a2f` |
| `--color-info-200` | `#d4d4d4` | `#3a3a3f` |
| `--color-info-500` | `#6b6b6b` | `#9a9a9a` |
| `--color-info-600` | `#525252` | `#b8b8b8` |
| `--color-info-700` | `#404040` | `#d4d4d4` |
| `--color-info-800` | `#262626` | `#e5e5e5` |

#### Landing (changed tokens only)

| Token | Light | Dark |
|---|---|---|
| `--landing-bg` | `#FAFAFA` | `#0A0A0B` |
| `--landing-text-hero` | `#0A0A0B` | `#FAFAFA` |
| `--landing-text-body` | `#3D3D3D` | `#B8B8B8` |
| `--landing-accent-subtle` | `#FFF0EC` | `#1F1510` |

---

## CSS Custom Properties Reference

Complete reference for AI code generation. Always use `var(--token)` instead of hardcoded values.

### Colors

```css
/* Primary */
var(--color-primary-50)   /* #FFF5F2 */
var(--color-primary-100)  /* #FFE8E1 */
var(--color-primary-200)  /* #FFCFC2 */
var(--color-primary-300)  /* #FFAB94 */
var(--color-primary-400)  /* #FF8A5C */
var(--color-primary-500)  /* #FF5733 */
var(--color-primary-600)  /* #E64A2E */
var(--color-primary-700)  /* #CC3D25 */
var(--color-primary-800)  /* #A63320 */
var(--color-primary-900)  /* #872A1A */
var(--color-primary-950)  /* #4A1610 */

/* Secondary */
var(--color-secondary-50)   /* #FFFBEB */
var(--color-secondary-100)  /* #FEF3C7 */
var(--color-secondary-200)  /* #FDE68A */
var(--color-secondary-300)  /* #FCD34D */
var(--color-secondary-400)  /* #FBBF24 */
var(--color-secondary-500)  /* #FFC857 */
var(--color-secondary-600)  /* #D97706 */
var(--color-secondary-700)  /* #B45309 */
var(--color-secondary-800)  /* #92400E */
var(--color-secondary-900)  /* #78350F */
var(--color-secondary-950)  /* #451A03 */

/* Success */
var(--color-success-50)  /* #ecfdf5 */
var(--color-success-100) /* #d1fae5 */
var(--color-success-200) /* #a7f3d0 */
var(--color-success-500) /* #10b981 */
var(--color-success-600) /* #059669 */
var(--color-success-700) /* #047857 */
var(--color-success-800) /* #065f46 */

/* Warning */
var(--color-warning-50)  /* #fffbeb */
var(--color-warning-100) /* #fef3c7 */
var(--color-warning-200) /* #fde68a */
var(--color-warning-500) /* #f59e0b */
var(--color-warning-600) /* #d97706 */
var(--color-warning-700) /* #b45309 */
var(--color-warning-800) /* #92400e */

/* Error */
var(--color-error-50)  /* #fef2f2 */
var(--color-error-100) /* #fee2e2 */
var(--color-error-200) /* #fecaca */
var(--color-error-500) /* #ef4444 */
var(--color-error-600) /* #dc2626 */
var(--color-error-700) /* #b91c1c */
var(--color-error-800) /* #991b1b */

/* Info */
var(--color-info-50)  /* #f5f5f5 */
var(--color-info-100) /* #e5e5e5 */
var(--color-info-200) /* #d4d4d4 */
var(--color-info-500) /* #6b6b6b */
var(--color-info-600) /* #525252 */
var(--color-info-700) /* #404040 */
var(--color-info-800) /* #262626 */

/* Surface & Background */
var(--color-background)       /* #ffffff / #0A0A0B */
var(--color-surface)          /* #F5F5F5 / #111111 */
var(--color-surface-elevated) /* #ffffff / #1A1A1F */

/* Text */
var(--color-text-primary)   /* #0A0A0B / #FAFAFA */
var(--color-text-secondary)  /* #3D3D3D / #B8B8B8 */
var(--color-text-muted)      /* #6B6B6B */
var(--color-text-disabled)   /* #9A9A9A / #4A4A4A */
var(--color-text-inverse)    /* #ffffff */

/* Border */
var(--color-border)       /* #E5E5E5 / #2A2A2F */
var(--color-border-focus)  /* #FF5733 */
var(--color-border-error)  /* #ef4444 */
```

### Typography

```css
var(--font-display) /* 'Clash Display', system-ui, sans-serif */
var(--font-body)     /* 'Satoshi', system-ui, sans-serif */
var(--font-sans)     /* 'Satoshi', system-ui, -apple-system, sans-serif */
var(--font-mono)     /* 'JetBrains Mono', ui-monospace, monospace */
```

### Spacing

```css
var(--space-section) /* clamp(5rem, 10vw, 8rem) — 80px to 128px */
var(--space-block)   /* clamp(2.5rem, 5vw, 4rem) — 40px to 64px */
```

### Radius

```css
var(--radius-sm)   /* 0.25rem  (4px) */
var(--radius-md)    /* 0.375rem (6px) */
var(--radius-lg)    /* 0.5rem   (8px) */
var(--radius-xl)    /* 0.75rem  (12px) */
var(--radius-2xl)   /* 1rem     (16px) */
var(--radius-full)  /* 9999px   (pill/circle) */
```

### Shadows

```css
var(--shadow-sm)  /* 0 1px 2px 0 rgb(0 0 0 / 0.05) */
var(--shadow-md)  /* 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1) */
var(--shadow-lg)  /* 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1) */
var(--shadow-xl)  /* 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1) */
```

### Transitions

```css
var(--transition-fast) /* 150ms cubic-bezier(0.4, 0, 0.2, 1) */
var(--transition-base) /* 200ms cubic-bezier(0.4, 0, 0.2, 1) */
var(--transition-slow) /* 300ms cubic-bezier(0.4, 0, 0.2, 1) */
```

### Z-Index

```css
var(--z-dropdown) /* 50 */
var(--z-sticky)   /* 100 */
var(--z-overlay)  /* 200 */
var(--z-modal)    /* 300 */
var(--z-toast)    /* 400 */
var(--z-tooltip)  /* 500 */
```

### Landing

```css
var(--landing-bg)            /* #FAFAFA / #0A0A0B */
var(--landing-bg-dark)       /* #0A0A0B */
var(--landing-accent)        /* #FF5733 */
var(--landing-accent-hover)  /* #E64A2E */
var(--landing-accent-subtle) /* #FFF0EC / #1F1510 */
var(--landing-text-hero)     /* #0A0A0B / #FAFAFA */
var(--landing-text-body)     /* #3D3D3D / #B8B8B8 */
var(--landing-text-muted)    /* #6B6B6B */
var(--landing-gradient-ai)   /* linear-gradient(135deg, #FF5733 0%, #FF8A5C 50%, #FFC857 100%) */
var(--landing-gradient-dark)  /* linear-gradient(180deg, #0A0A0B 0%, #1A1A1F 100%) */
```

---

## AI Agent Usage Notes

1. **Always use `var(--token)` for colors** — never hardcode hex values in component code. This ensures dark mode automatically works.
2. **Use `cn()` for class merging** — import from `@/utils` to merge Tailwind classes correctly.
3. **Use `buttonVariants()` for buttons** — import from `@/components/ui/buttonVariants` rather than writing button classes manually.
4. **Use `badgeVariants()` for badges** — import from `@/components/ui/badgeVariants`.
5. **Component files follow shadcn/ui pattern** — co-located in `src/components/ui/` with Radix primitives.
6. **Tailwind v4 has no config file** — all customization is in `src/index.css` via CSS custom properties.
7. **Dark mode uses `.dark` class** — toggle on `<html>`, all tokens auto-adapt.
8. **Icons use `lucide-react`** — import individually, default size is `h-4 w-4` (16px).