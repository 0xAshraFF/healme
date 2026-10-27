# HealMe

Ward-round treatment simulator for doctors. Product spec: `docs/design.md`. Flow mockups: `design/flows/`.

## Design System
Read DESIGN.md before visual or UI work: it defines the fonts, colors, spacing, and
aesthetic direction. Ask the user before departing from it. When reviewing or QA-ing
UI, flag code that doesn't match DESIGN.md.

## Clinical content rules
- Outcomes come only from authored case rules evaluated on the server. Never generate clinical outcomes or debrief text with an LLM at runtime.
- Every debrief point needs a citation (textbook chapter or guideline section). Paraphrase; never paste textbook text.
- Patient names are cosmetic, drawn from mixed-ethnicity pools, and must never change clinical facts.
