import { GLOBAL_HARMS } from "./engine";
import type { CaseDef, Condition } from "./types";

/** Publish checks from the spec. A case with any error cannot be published. */
export function validateCase(def: CaseDef): string[] {
  const errors: string[] = [];
  const has = (id: string) => id in def.states;

  if (!has(def.initialState)) errors.push(`initialState "${def.initialState}" is not a state`);

  for (let i = 0; i < def.checkpoints.length - 1; i++) {
    const from = def.checkpoints[i];
    const t = def.transitions.find((x) => x.from === from);
    if (!t) {
      errors.push(`checkpoint ${from} has no transition`);
      continue;
    }
    if (t.to !== def.checkpoints[i + 1]) errors.push(`transition from ${from} should go to ${def.checkpoints[i + 1]}`);
    if (!t.defaultState || !has(t.defaultState)) errors.push(`transition ${from} is missing a valid default state`);
    else if (def.states[t.defaultState].checkpoint !== t.to)
      errors.push(`default state for ${from} must belong to checkpoint ${t.to}`);
    for (const r of t.rules) {
      if (!r.then) errors.push(`rule ${r.id} has no THEN state`);
      else if (!has(r.then)) errors.push(`rule ${r.id} points to missing state "${r.then}"`);
      checkFacts(r.when, def, errors, `rule ${r.id}`);
    }
  }

  if (def.caseHarmList.length === 0) errors.push("case harm list is empty");
  for (const h of def.caseHarmList) {
    if (!has(h.state)) errors.push(`harm entry ${h.id} points to missing state "${h.state}"`);
    if (h.cite.length === 0) errors.push(`harm entry ${h.id} has no citation`);
  }

  for (const g of GLOBAL_HARMS) {
    const relevant = !g.drug || def.drugs.some((d) => d.id === g.drug);
    if (relevant && !def.globalHarmStates[g.id]) errors.push(`global harm ${g.id} has no case harm state`);
    const s = def.globalHarmStates[g.id];
    if (s && !has(s)) errors.push(`global harm ${g.id} points to missing state "${s}"`);
  }

  for (const [drug, s] of Object.entries(def.dangerousDoseStates ?? {})) {
    if (!def.drugs.some((d) => d.id === drug)) errors.push(`dangerous-dose state for unknown drug "${drug}"`);
    if (!has(s)) errors.push(`dangerous-dose state for ${drug} points to missing state "${s}"`);
  }

  for (const p of def.debrief) {
    if (p.cite.length === 0) errors.push(`debrief point ${p.id} has no citation`);
    if (!def.checkpoints.includes(p.checkpoint)) errors.push(`debrief point ${p.id} uses unknown checkpoint`);
  }

  const last = def.checkpoints[def.checkpoints.length - 1];
  for (const s of Object.values(def.states)) {
    if (s.checkpoint === last && !s.outcome) errors.push(`final state ${s.id} needs an outcome`);
  }

  if (def.reviewers.length < 1 || def.authors.length < 1) errors.push("case needs an author and a reviewer");
  if (def.authors.some((a) => def.reviewers.includes(a))) errors.push("reviewer must be a different clinician");

  return errors;
}

/** Warn about drug facts that refer to drugs the case doesn't define (typos in rules). */
function checkFacts(c: Condition, def: CaseDef, errors: string[], where: string) {
  if ("all" in c) return c.all.forEach((x) => checkFacts(x, def, errors, where));
  if ("any" in c) return c.any.forEach((x) => checkFacts(x, def, errors, where));
  if ("not" in c) return checkFacts(c.not, def, errors, where);
  const m = /^([a-z0-9_]+)(?:@[a-z_]+)?\.(given|band|route)$/.exec(c.fact);
  if (m && !def.drugs.some((d) => d.id === m[1])) errors.push(`${where} refers to unknown drug "${m[1]}"`);
}
