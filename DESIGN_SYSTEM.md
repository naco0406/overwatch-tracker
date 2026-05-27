# Overwatch Tracker Design System

## Direction

The product should feel like a bright match-analysis lab: simple enough to use after a game, polished enough for repeated review, and energetic enough to belong to a competitive gaming service. The base experience is light, calm, and mobile-first. Gaming personality comes from interaction, field-line geometry, state color, and crisp data surfaces rather than heavy neon or dark sci-fi decoration.

Reference inputs:

- Toss product principles and TDS: simplicity, clear action, one thing per surface, generous mobile touch targets.
- Toss mobile screenshots: white surfaces, compact cards, obvious hierarchy, restrained labels.
- Dribbble/Behance esports dashboards: modular stat panels, active states, live-match energy, strong iconography.
- Mobalytics/Overwolf gaming analytics: post-game analysis, personal improvement framing, score/state-oriented surfaces.
- Pinterest analytics boards: clean dashboard card systems, bright background, dense-but-scannable summary layout.

## Principles

- Clarity first: one primary action per surface, compact labels, explicit data states.
- Light by default: white cards on a cool gray canvas, with enough contrast for long review sessions.
- Game energy through structure: active states, field-line containers, status chips, and command-console composition.
- Signal color only: blue for primary/action, orange for OCR or attention, green for positive, red for loss/error.
- Dense but calm: dashboards should show structure before data is connected without inventing fake analytics.
- No decorative noise: visual texture must support reading, navigation, or state recognition.
- Mobile quality is a first-class constraint: bottom navigation, larger controls, short labels, no squeezed charts.

## Tokens

- Radius: 8px max for cards and panels, 6px for compact controls.
- Background: cool light gray with white card surfaces.
- Primary: saturated blue, used for active route, focus, primary CTA, and upload/parse emphasis.
- Accent: Overwatch-like orange, used for OCR confidence and secondary attention.
- Status: green for win/success, amber for warning, red for loss/error.
- Typography: system UI stack, no negative letter spacing, no viewport-based type scaling.

## Interaction Standards

- Protected pages always resolve through auth state before rendering.
- Empty states should state the data condition and offer the nearest available action.
- Navigation state must be visible without relying on color alone.
- Inputs keep stable height and clear focus rings.
- Buttons with icons use lucide icons and concise labels.
- Mobile navigation is bottom-fixed and thumb reachable.
- Data components should not render speculative values. Use `0`, `--`, or empty states until real data exists.

## Quality Bar

- Every primary workflow needs a recognizable product surface, not only generic cards.
- Home is the command center: capture surface, review panel, and session rail must feel connected.
- Prefer flat workspace panels and table-like rows over separate card clusters.
- Shadows are avoided by default. Use borders, section dividers, background contrast, and spacing for hierarchy.
- Charts can show skeleton structure before data, but must not imply real performance values.
- Desktop uses a stable sidebar and dense work area; mobile uses a compact header plus bottom navigation.
- UI should feel closer to a polished companion app than a SaaS template.
