# Chat Surface Extraction And Reduction Brief

Date: 2026-03-22
Source page: `https://gallagherpropco.com/chat`
Artifacts:
- `output/playwright/chat-live-page.png`
- `output/playwright/chat-live-page-mobile.png`

## Site Extraction

### Brand identity

- Brand / product name: Gallagher Property Company
- Product surface name: Acquisition desk
- Logo treatment: minimalist monogram icon plus wordmark in the left system rail; wordmark-only treatment also appears in the top header
- Tagline / value proposition in the shell: Development and investment OS
- Primary run-desk headline: Set scope, ask for the deliverable, keep the run moving.

### Color system

- Primary background: `#09090b`
- Solid input / composer background: `#09090b`
- Blurred chrome surface: `rgba(9, 9, 11, 0.72)`
- Grid-backed workspace plane: approximately `#171717`
- Primary text: `#fafafa`
- Muted text: `#a2a3a9`
- Border and dividers: `#1a1a1d`
- Subtle grid lines / low-contrast separators: approximately `#121214`
- Accent / CTA fill: `#fafafa`
- Accent / CTA text: `#09090b`
- Overlay treatments: heavy backdrop blur on the top header and left rail, plus a faint grid texture behind the run desk
- Gradients: restrained horizontal glow line in the composer, from transparent to white at low opacity and back to transparent

### Typography

- Headline / display typeface: Instrument Sans, 600, approximately 43px on desktop for the run-desk headline
- Body typeface: Instrument Sans, 400, approximately 15px to 16px for shell copy and 14px for controls
- Caption / telemetry typeface: DM Mono, 400, approximately 11px to 12px, uppercase with wide tracking
- Pairing style: clean neo-grotesk sans plus technical mono telemetry
- Closest public match note: both Instrument Sans and DM Mono are available on Google Fonts, so no substitution is required

### Content and structure

- Shell / navigation:
  - Left system rail with brand block, route groupings, user identity, and collapse control
  - Top header with route context, command search, theme toggle, Copilot toggle, notifications, and primary action
- Main application body:
  - Conversation rail for saved runs, search, filters, and recents
  - Central run desk with a short operating brief, deal selector, starter prompts, transcript, and composer
  - Right inspector rail for verification, guide, and specialist coverage
- Navigation structure:
  - Route groups: Execution, Development, Capital, Intelligence, Reference, Admin
  - Chat is highlighted as the current route
  - Navigation is persistent and the top header remains fixed
- CTA language and placement:
  - Global CTA: New Run in the top header
  - Primary local CTA: Run in the composer
  - Secondary CTAs: History and Inspector on mobile; suggested-run buttons in the empty state
- Image / media treatment:
  - No photography or illustration
  - The product UI itself is the visual anchor
  - Atmosphere comes from blur, grid texture, typography scale, and dark-surface contrast
- Footer structure:
  - No marketing footer on this route
  - Persistent utility controls sit in the shell instead

### Visual character

- Mood: restrained, operator-grade, nocturnal, technical
- Layout density: dense but controlled
- Whitespace: intentionally tight in rails, more generous in the central run desk
- Borders and shadows: thin dividers, subtle transparent fills, almost no decorative shadow reliance
- Cards: present, but mostly as contained instruction blocks and tab panels rather than content marketing cards
- Motion observed:
  - conversation suggestions fade in with staggered timing
  - the composer uses a subtle animated glow line
  - the hero block fades upward on load
- Imagery style: none; the interface itself is the visual material

### Functional patterns

- Interactive elements:
  - persistent left navigation
  - searchable conversation rail
  - filter pills for All / Deals / General and local recents
  - deal selector in the run desk
  - inspector tabs for Guide / Verification / Coverage
  - modal inspector drawer on mobile
  - collapsible conversation rail
- Form patterns:
  - large multiline composer
  - search input in the conversation rail
  - search command input in the header
- Responsive behavior clues:
  - mobile collapses the history rail into a drawer
  - mobile replaces the fixed right inspector with a button-triggered drawer
  - the composer moves higher in the stack on mobile, ahead of the long supporting content
- Loading patterns:
  - session bootstrap shows “Checking session...”
  - conversation loading state exists in the rail
  - verification state is explicitly empty until the first response

## Project Brief

- Project name: Gallagher Property Company chat surface
- Type: app
- Brand / product: Gallagher Property Company
- One-line purpose: run diligence, entitlement, and capital questions against live deal context from a single operator workspace
- Target audience: internal acquisition, diligence, and capital operators who need fast access to context, saved runs, and verification
- Build scope: the authenticated `/chat` first-load workspace, with emphasis on reducing desktop visual noise while preserving mobile history and inspector access

## Visual Thesis

Warmth is not the goal here; this surface should feel like a disciplined near-black execution desk, built from blurred chrome, hard white type, mono telemetry, and restrained motion.

## Content Plan

- Header and shell: establish the Gallagher brand, route context, and system controls without competing with the run desk
- Conversation rail: keep saved runs discoverable, searchable, and reopenable
- Run desk: make the composer and current run brief the dominant working surface
- Empty-state support: offer only the minimum prompt scaffolding required to start a useful run
- Inspector rail: keep verification and specialist coverage adjacent but secondary until needed

## Interaction Thesis

- Keep the existing fade-up entrance on the run desk, but let it support the composer rather than a large instructional block
- Preserve the staggered suggestion reveal because it helps scanning, but remove extra containers around it
- Preserve the glow-line treatment in the composer because it gives the working surface presence without adding new color

## Design System Tokens

### Color palette

```css
:root {
  --color-bg: #09090b;
  --color-surface: #09090b;
  --color-surface-overlay: rgba(9, 9, 11, 0.72);
  --color-surface-elevated: #171717;
  --color-text-primary: #fafafa;
  --color-text-muted: #a2a3a9;
  --color-border: #1a1a1d;
  --color-grid: #121214;
  --color-accent: #fafafa;
  --color-accent-foreground: #09090b;
}
```

### Typography roles

- Display: Instrument Sans, 600, 34px to 43px
- Headline: Instrument Sans, 600, 24px to 32px
- Body: Instrument Sans, 400, 14px to 16px
- Caption: DM Mono, 400, 11px to 12px, uppercase tracked labels

### Spacing and layout tokens

- Max transcript width: 54rem
- Inspector width: 22rem on desktop
- Conversation rail width: 18rem on desktop
- Section padding rhythm: 16px to 24px
- Component spacing scale: 8px, 12px, 16px, 24px

### Constraints

- Typefaces: Instrument Sans plus DM Mono only
- Accent colors: one accent only, white
- Stack: React plus Tailwind CSS

## Reduction Direction

- Keep the brand, color, typography, and motion system intact
- Move the composer into the first scan on desktop, not just mobile
- Remove repeated guidance blocks that restate the same “scope / deliverable / verify” message in multiple places
- Replace boxed instruction cards with plain layout, dividers, and type hierarchy wherever the card is not the interaction
