# HealMe

Ward-round treatment simulator for doctors. Treat a simulated patient, watch what your orders do at 6 h, day 2 and day 5, rewind and try again, then get a cited debrief and FCPS-style marks.

- Product spec: [docs/design.md](docs/design.md)
- Design system: [DESIGN.md](DESIGN.md)
- Flow mockups: [design/flows/](design/flows/)

## Run

```bash
cd web
npm install
npm run dev      # http://localhost:3000
npx vitest run   # engine tests
```

## Authoring (M2)

Clinicians write and review cases at **/author** (also linked from the ward).

1. **Write.** Start a draft, import case JSON, or "Edit as vN" on a published case. The editor sections are: patient & story, investigations, diagnoses, formulary & dose bands, patient states, harm lists, rules, debrief & marks, and stability/viva/outcomes. There is also a JSON tab.
2. **Check.** Live publish checks in the right column list what is missing. "Preview as player" plays the draft without scoring or logging.
3. **Review.** A *different* clinician opens it under "Waiting for your review". They read every rule in plain words, tick three checks, then send it back with a note or sign off & publish.
4. **Live.** New players get the newest published version. Players already mid-case finish on their version, unless the reviewer marks a **safety correction**, which retires the old version and ends those sessions with an explanation.
5. **Improve.** "Uncovered combinations" lists order sets players signed that no rule matched, so authors know which rules to add.

Cases are stored as versioned JSON in `web/data/cases/<id>/v<n>.json`. The import API is `POST /api/author/cases` with `{ "author": "...", "import": <case JSON> }`, and the export link is in the editor.

## Where things live (web/src)

| Path | What |
|------|------|
| `engine/types.ts` | Case format (checkpoints, states, dose bands, harm lists, rules, cited debrief points) |
| `engine/engine.ts` | Rule engine: dose banding, nurse challenges, harm lists, transitions, marks |
| `engine/validate.ts` | Publish checks; a case that fails is never served |
| `engine/names.ts` | Mixed-ethnicity patient names (cosmetic only) |
| `cases/dka-severe.ts` | First case: severe DKA (FCPS P1) |
| `engine/schema.ts` | Shape check for saved/imported case JSON |
| `server/caseStore.ts` | Versioned case files, review/publish lifecycle, uncovered queue |
| `app/author/`, `components/author/` | Authoring tool: case list, editor, condition builder, review |
| `server/session.ts` | Sessions, runs, rewind branches, and the client view (no hidden states leave the server) |
| `app/` | Ward, case player, debrief |

## Pilot limits (M1)

- Sessions are kept in server memory and vanish on restart (accounts and Postgres arrive in M3).
- Authoring "sign-in" is just a typed name, so the two-clinician rule is enforced by name only until real accounts arrive in M3.
- The DKA case is drafted from JBDS-IP, the 2024 ADA/EASD/JBDS consensus and Davidson's, but still needs sign-off by two named clinicians before real use.
- Peer comparisons show "not enough data" until 30 consented runs exist.
