---
# gstack: design-md-format=spec
name: HealMe
description: Ballpoint on the ward chart. Sober, clinical paperwork where your blue ink sits next to the patient's response.
colors:
  ground: "#E4EBDD"
  surface: "#F7F8F2"
  rule: "#B9CBB8"
  rule-soft: "#D6E0D3"
  text: "#2F3532"
  text-muted: "#5E6862"
  text-faint: "#8A948D"
  primary: "#1D3C8F"
  on-primary: "#FFFFFF"
  primary-soft: "#E3E8F5"
  accent: "#F2D45C"
  success: "#2E6B47"
  warning: "#F2D45C"
  error: "#C0262D"
  error-soft: "#F6E1E0"
  dark-ground: "#161B19"
  dark-surface: "#20271F"
  dark-text: "#DCE3DA"
  dark-primary: "#8FA8F0"
  dark-error: "#FF6B6B"
typography:
  display:
    fontFamily: Anek Latin
    fontWeight: 800
    fontSize: 1.75rem
    letterSpacing: -0.01em
  heading:
    fontFamily: Anek Latin
    fontWeight: 700
    fontSize: 0.9375rem
  body:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 0.875rem
    lineHeight: 1.45
  label:
    fontFamily: Atkinson Hyperlegible Next
    fontWeight: 700
    fontSize: 0.72rem
    letterSpacing: 0em
  mono:
    fontFamily: Atkinson Hyperlegible Mono
    fontFeature: tnum
rounded:
  sm: 2px
  md: 2px
  lg: 2px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  2xl: 32px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.sm}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
  input:
    borderColor: "{colors.text-faint}"
    rounded: "{rounded.sm}"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.sm}"
---

# HealMe

## Overview

**Creative North Star:** the app is the ward's own paperwork (admission sheet, order book, observation chart, nurse handover slip), because interns already trust and read those documents fast.
**Product context:** phone-first ward-round simulator for interns and FCPS/BCS residents. Peers: Body Interact, AMBOSS, Figure1, Q-banks. Mobile web app (PWA).
**Mode per surface:** Operate (assessment, orders, checkpoints) · Read (debrief, citations) · Operate, desktop (authoring tool).
**Reference sites:** bodyinteract.com, amboss.com, figure1.com (researched 2026-10-27). HealMe deliberately avoids all three looks: no 3D faces, no teal SaaS, no dark social feed.
**Key characteristics:**
- Blue means "you wrote this". Red means "the patient got worse". Everything else is graphite on paper.
- Numbers are always mono with tabular figures.
- Time is always visible (the time rail).
- Outcomes arrive as documents, not celebrations.

**Memorable thing:** "My orders changed the patient."

## Colors

**Strategy:** Restrained, with color as authorship. `primary` (ballpoint blue) is reserved for the player's own orders, notes and the primary action. `error` (chart red) is reserved for abnormal values, deterioration, harm and the consultant's red pen. `accent` (highlighter amber) appears only as a highlight behind nurse-note phrases. Never use blue or red decoratively.
**Light or dark:** light by default (ward paper under hospital fluorescent light). Night-duty dark mode for duty-room use: `dark-*` tokens, matte surfaces, no glow; blue and red keep their meanings at higher luminance.

## Typography

- **Anek Latin** (Google Fonts, variable width + weight), semi-condensed (`font-stretch: 80-88%`), for screen titles, sheet headings and patient names. Pairs with **Anek Bangla** for future Bangla UI.
- **Atkinson Hyperlegible Next** for all body text, labels and buttons. Chosen because it disambiguates 1/l/I and 0/O, which matters for doses.
- **Atkinson Hyperlegible Mono** for every dose, rate, vital, lab value, time and the player's written orders (`font-variant-numeric: tabular-nums`).
- Load from Google Fonts with `display=swap`. Scale: display 28-56px (transition screen only reaches 56px), heading 15-26px, body 13.5-14.5px, label 11-12px.

## Layout

Single column at phone width (360-430px), 12px side gutter. Persistent stack at top: status → patient header (name, bed, age/sex, weight, allergy, level) → time rail (T0 · 6h · D2 · D5 + Rewind). Bottom action bar holds 1-2 square buttons, 46px tall. Content is stacked "sheets" (paper panels with a hairline rule), never cards inside cards. Desktop authoring tool uses a 3-column layout (case/checkpoints · rules · inspector).

## Elevation & Depth

Flat. Depth comes from paper vs ground color and 1px rules. Bottom sheets (rewind, citation) get a 2px graphite top border, not a shadow.

## Shapes

2px radius on everything rectangular (stamped-form look). Only status dots on the time rail and radio buttons are round.

## Components

- **Sheet:** surface background, 1px `rule` border, heading row with `rule-soft` divider.
- **Order line:** time column (faint mono) + order text in blue mono. Changed orders keep the struck-through original above the new one.
- **Nurse note:** paper panel; key phrase highlighted with an amber marker stroke (gradient band behind text, not a full fill).
- **Vitals strip:** 5 equal columns, label above, mono value; abnormal values in red.
- **Nurse challenge:** `error-soft` fill, 1.5px red border, two actions: "Change the order" (primary) / "Give as written" (red outline).
- **Primary button:** blue fill, white text. Signing orders is press-and-hold for 600ms with a ring indicator, then a drawn signature stroke.
- States: focus-visible = 2px blue outline offset 2px; disabled = 40% opacity; loading = "Waiting for connection" text, never a spinner over content.

## Do's and Don'ts

- Do keep blue for the player's own writing and the primary action only.
- Do show every number in mono with units.
- Do cite a source under every debrief correction.
- Do show the scored run in grey dashed lines when comparing a branch.
- Don't add badges, confetti, streak flames, stars or progress rings.
- Don't use icons in circles, gradients, glows, drop-shadow card stacks or stock photos.
- Don't show the diagnosis anywhere before the debrief.
- Don't let a patient's name or ethnicity imply a diagnosis.

## Motion

- **Approach:** minimal-functional.
- **Easing:** enter(ease-out) exit(ease-in) move(ease-in-out)
- **Duration:** micro(80ms) short(200ms) medium(320ms) long(600ms)
- **The one authored moment:** the time advance. The "N hours later" card holds about 1 second while the bar fills, then the next checkpoint's chart slides up from below and the new point plots onto the line.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-10-27 | Initial design system created | Created by /design-consultation from the office-hours design doc, competitor research (Body Interact, AMBOSS, Figure1) and an independent Claude design voice that converged on the ward-chart idea |
| 2026-10-27 | Softened "no game chrome" | Founder: "shouldn't be boring nor overly gamified". Added FCPS-style marks sheet, logbook and rewind compare |
| 2026-10-27 | Mockups hand-built in HTML | gstack image generation needs an OpenAI key; HTML boards in design/flows use the real tokens |
