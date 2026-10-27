import fs from "node:fs";
import path from "node:path";
import { dkaSevere } from "@/cases/dka-severe";
import { parseCase } from "@/engine/schema";
import type { CaseDef } from "@/engine/types";
import { validateCase } from "@/engine/validate";

// File-backed case store (pilot). One JSON file per case version:
//   data/cases/<caseId>/v<version>.json
// Lifecycle: draft -> in_review -> published -> superseded | retired.
// "retired" means a safety correction replaced it: open sessions on it are ended.

export type CaseStatus = "draft" | "in_review" | "published" | "superseded" | "retired";

export interface CaseEvent {
  at: number;
  who: string;
  action: "created" | "saved" | "imported" | "submitted" | "sent_back" | "published" | "superseded" | "retired";
  note?: string;
}

export interface CaseRecord {
  id: string;
  version: number;
  status: CaseStatus;
  author: string;
  reviewer?: string;
  reviewNote?: string;
  correctionNote?: string; // shown to players whose session was ended by a safety fix
  def: CaseDef;
  history: CaseEvent[];
  updatedAt: number;
}

export class StoreError extends Error {}

const ROOT = process.env.HEALME_DATA_DIR ?? path.join(process.cwd(), "data");
const CASES_DIR = path.join(ROOT, "cases");

function fileFor(id: string, version: number) {
  if (!/^[a-z0-9-]+$/.test(id)) throw new StoreError("Bad case id");
  return path.join(CASES_DIR, id, `v${version}.json`);
}

function write(rec: CaseRecord) {
  rec.updatedAt = Date.now();
  const f = fileFor(rec.id, rec.version);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = `${f}.tmp`;
  const json = JSON.stringify(rec, null, 2);
  fs.writeFileSync(tmp, json);
  // Windows can briefly lock the target (antivirus, indexer): retry the atomic rename, then fall back.
  for (let i = 0; i < 5; i++) {
    try {
      fs.renameSync(tmp, f);
      return;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EPERM" && (e as NodeJS.ErrnoException).code !== "EBUSY") throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20 * (i + 1));
    }
  }
  fs.writeFileSync(f, json);
  fs.rmSync(tmp, { force: true });
}

function read(id: string, version: number): CaseRecord | null {
  try {
    return JSON.parse(fs.readFileSync(fileFor(id, version), "utf8")) as CaseRecord;
  } catch {
    return null;
  }
}

function versionsOf(id: string): CaseRecord[] {
  const dir = path.join(CASES_DIR, id);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .map((f) => /^v(\d+)\.json$/.exec(f))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => read(id, Number(m[1])))
    .filter((r): r is CaseRecord => !!r)
    .sort((a, b) => a.version - b.version);
}

function allIds(): string[] {
  if (!fs.existsSync(CASES_DIR)) return [];
  return fs.readdirSync(CASES_DIR).filter((d) => fs.statSync(path.join(CASES_DIR, d)).isDirectory());
}

/** Built-in pilot cases are written to the store once, as published v1. */
function seed() {
  for (const def of [dkaSevere]) {
    if (versionsOf(def.id).length) continue;
    write({
      id: def.id,
      version: def.version,
      status: "published",
      author: def.authors[0],
      reviewer: def.reviewers[0],
      def,
      history: [{ at: Date.now(), who: "system", action: "imported", note: "Seeded from built-in pilot case" }],
      updatedAt: Date.now(),
    });
  }
}
// Cheap (one directory check per built-in case), so it also recovers if the data folder is removed.
function ensureSeeded() {
  seed();
}

// ---------- Reads ----------

export function listCases() {
  ensureSeeded();
  return allIds().map((id) => {
    const vs = versionsOf(id);
    const latest = vs[vs.length - 1];
    const live = [...vs].reverse().find((v) => v.status === "published");
    return {
      id,
      title: latest.def.diagnosisLabel || latest.def.complaint || id,
      complaint: latest.def.complaint,
      level: latest.def.level,
      latest: { version: latest.version, status: latest.status, author: latest.author, reviewer: latest.reviewer, updatedAt: latest.updatedAt },
      liveVersion: live?.version ?? null,
      versions: vs.map((v) => ({ version: v.version, status: v.status })),
    };
  });
}

export function getRecord(id: string, version: number): CaseRecord {
  ensureSeeded();
  const r = read(id, version);
  if (!r) throw new StoreError(`Case ${id} v${version} not found`);
  return r;
}

/** The version new players get: the newest published one. */
export function livePublished(): CaseDef[] {
  ensureSeeded();
  return allIds()
    .map((id) => [...versionsOf(id)].reverse().find((v) => v.status === "published"))
    .filter((r): r is CaseRecord => !!r)
    .map((r) => r.def);
}

export function getLive(id: string): CaseDef {
  ensureSeeded();
  const r = [...versionsOf(id)].reverse().find((v) => v.status === "published");
  if (!r) throw new StoreError(`No published version of ${id}`);
  return r.def;
}

// ---------- Writes ----------

const BLANK = (id: string, author: string): CaseDef => ({
  id,
  version: 1,
  level: "intern",
  diagnosisLabel: "",
  sex: "F",
  age: 40,
  weightKg: 60,
  allergy: "none",
  ward: "Medicine Ward B",
  bed: "1",
  estMinutes: 20,
  complaint: "",
  history: "",
  exam: "",
  source: { label: "", license: "CC-BY 4.0" },
  authors: [author],
  reviewers: [],
  investigations: [],
  essentialInvestigations: [],
  investigationBudget: 8,
  diagnoses: { options: [], correct: [], acceptable: [] },
  drugs: [],
  caseHarmList: [],
  globalHarmStates: {},
  dangerousDoseStates: {},
  checkpoints: ["T0", "6h", "D2", "D5"],
  initialState: "T0",
  states: {
    T0: {
      id: "T0",
      checkpoint: "T0",
      facts: {},
      vitals: { hr: 80, sbp: 120, dbp: 80, rr: 16, spo2: 98, gcs: 15 },
      results: {},
      nurseNote: { who: "Staff Nurse", time: "", text: "" },
    },
  },
  transitions: [
    { from: "T0", to: "6h", rules: [], defaultState: "", clock: "", headline: "6 hours later", scene: "" },
    { from: "6h", to: "D2", rules: [], defaultState: "", clock: "", headline: "Next morning", scene: "" },
    { from: "D2", to: "D5", rules: [], defaultState: "", clock: "", headline: "Three days later", scene: "" },
  ],
  stability: { all: [] },
  debrief: [],
  vivaQuestion: { q: "", a: "", cite: [] },
  passMark: 30,
  discharge: { recovered: "", complication: "", icu: "Transferred to the intensive care unit.", died: "Died in hospital." },
});

export function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "case"
  );
}

function uniqueId(base: string) {
  const ids = new Set(allIds());
  let id = slugify(base);
  for (let n = 2; ids.has(id); n++) id = `${slugify(base)}-${n}`;
  return id;
}

export function createDraft(title: string, author: string): CaseRecord {
  ensureSeeded();
  requireName(author);
  const id = uniqueId(title);
  const def = BLANK(id, author);
  def.diagnosisLabel = title;
  const rec: CaseRecord = { id, version: 1, status: "draft", author, def, history: [{ at: Date.now(), who: author, action: "created" }], updatedAt: Date.now() };
  write(rec);
  return rec;
}

/** Start editing a published case: copies the newest version into a new draft. One open draft per case. */
export function newVersion(id: string, author: string): CaseRecord {
  ensureSeeded();
  requireName(author);
  const vs = versionsOf(id);
  if (!vs.length) throw new StoreError("Case not found");
  const open = vs.find((v) => v.status === "draft" || v.status === "in_review");
  if (open) throw new StoreError(`v${open.version} is already ${open.status === "draft" ? "a draft" : "in review"}. Finish it first.`);
  const base = vs[vs.length - 1];
  const version = base.version + 1;
  const def: CaseDef = { ...structuredClone(base.def), version, authors: [author], reviewers: [] };
  const rec: CaseRecord = { id, version, status: "draft", author, def, history: [{ at: Date.now(), who: author, action: "created", note: `From v${base.version}` }], updatedAt: Date.now() };
  write(rec);
  return rec;
}

export function importCase(input: unknown, author: string): CaseRecord {
  ensureSeeded();
  requireName(author);
  const parsed = parseCase(input);
  if (!parsed.ok) throw new StoreError(`Import rejected:\n${parsed.errors.join("\n")}`);
  const def = parsed.def;
  const id = uniqueId(def.id);
  const rec: CaseRecord = {
    id,
    version: 1,
    status: "draft",
    author,
    def: { ...def, id, version: 1, authors: [author], reviewers: [] },
    history: [{ at: Date.now(), who: author, action: "imported", note: def.id !== id ? `Imported as ${id} (was ${def.id})` : undefined }],
    updatedAt: Date.now(),
  };
  write(rec);
  return rec;
}

export function saveDraft(id: string, version: number, input: unknown, who: string): CaseRecord {
  const rec = getRecord(id, version);
  if (rec.status !== "draft") throw new StoreError(`v${version} is ${rec.status}; only drafts can be edited.`);
  if (who !== rec.author) throw new StoreError(`Only the author (${rec.author}) can edit this draft.`);
  const parsed = parseCase(input);
  if (!parsed.ok) throw new StoreError(`Not saved:\n${parsed.errors.join("\n")}`);
  // Identity fields are owned by the store, not the editor.
  rec.def = { ...parsed.def, id, version, authors: [rec.author], reviewers: [] };
  rec.history.push({ at: Date.now(), who, action: "saved" });
  write(rec);
  return rec;
}

export function submitForReview(id: string, version: number, who: string): CaseRecord {
  const rec = getRecord(id, version);
  if (rec.status !== "draft") throw new StoreError("Only drafts can be sent for review.");
  if (who !== rec.author) throw new StoreError("Only the author can send it for review.");
  const errors = checksFor(rec.def, { forReview: true });
  if (errors.length) throw new StoreError(`Fix these first:\n${errors.join("\n")}`);
  rec.status = "in_review";
  rec.history.push({ at: Date.now(), who, action: "submitted" });
  write(rec);
  return rec;
}

export function sendBack(id: string, version: number, reviewer: string, note: string): CaseRecord {
  requireName(reviewer);
  const rec = getRecord(id, version);
  if (rec.status !== "in_review") throw new StoreError("This version is not in review.");
  if (reviewer === rec.author) throw new StoreError("The author can't review their own case.");
  if (!note.trim()) throw new StoreError("Say what needs changing.");
  rec.status = "draft";
  rec.reviewNote = note;
  rec.history.push({ at: Date.now(), who: reviewer, action: "sent_back", note });
  write(rec);
  return rec;
}

export function publish(id: string, version: number, reviewer: string, opts: { note?: string; safetyFix?: boolean; correctionNote?: string }): CaseRecord {
  requireName(reviewer);
  const rec = getRecord(id, version);
  if (rec.status !== "in_review") throw new StoreError("Only a version in review can be published.");
  if (reviewer === rec.author) throw new StoreError("A second clinician must sign off. The author can't publish their own case.");
  if (opts.safetyFix && !opts.correctionNote?.trim()) throw new StoreError("Describe the safety correction; players on the old version will see it.");
  rec.def = { ...rec.def, authors: [rec.author], reviewers: [reviewer] };
  const errors = [...new Set([...validateCase(rec.def), ...checksFor(rec.def, { forReview: true })])];
  if (errors.length) throw new StoreError(`Publish blocked:\n${errors.join("\n")}`);
  for (const old of versionsOf(id)) {
    if (old.version !== version && old.status === "published") {
      old.status = opts.safetyFix ? "retired" : "superseded";
      if (opts.safetyFix) old.correctionNote = opts.correctionNote;
      old.history.push({ at: Date.now(), who: reviewer, action: opts.safetyFix ? "retired" : "superseded", note: `Replaced by v${version}` });
      write(old);
    }
  }
  rec.status = "published";
  rec.reviewer = reviewer;
  rec.reviewNote = opts.note;
  rec.history.push({ at: Date.now(), who: reviewer, action: "published", note: opts.note });
  write(rec);
  return rec;
}

function requireName(who: string) {
  if (!who || who.trim().length < 3) throw new StoreError("Enter your name as a clinician first.");
}

/**
 * Checks shown live in the editor. Before review everything in validateCase applies except
 * the reviewer requirement, which only the review step can satisfy.
 */
export function checksFor(def: CaseDef, opts: { forReview?: boolean } = {}): string[] {
  const withReviewer = { ...def, reviewers: def.reviewers.length ? def.reviewers : ["(pending review)"] };
  const errors = validateCase(withReviewer);
  if (!def.complaint.trim()) errors.push("bed-board complaint is empty");
  if (!def.history.trim()) errors.push("history is empty");
  if (!def.source.label.trim()) errors.push("source is empty");
  if (def.diagnoses.correct.length === 0) errors.push("no correct diagnosis marked");
  if (!def.vivaQuestion.q.trim()) errors.push("viva question is empty");
  if (opts.forReview && def.debrief.length === 0) errors.push("no debrief points written");
  for (const d of def.drugs) {
    if (!d.name.trim()) errors.push(`drug ${d.id} has no name`);
    for (const r of d.routes) if (!r.label.trim()) errors.push(`drug ${d.id} route ${r.id} has no label`);
  }
  for (const i of def.investigations) if (!i.name.trim()) errors.push(`investigation ${i.id} has no name`);
  for (const o of def.diagnoses.options) if (!o.label.trim()) errors.push(`diagnosis ${o.id} has no label`);
  const blankCite = (cs: { source: string }[]) => cs.some((c) => !c.source.trim());
  if (def.debrief.some((p) => blankCite(p.cite)) || def.caseHarmList.some((h) => blankCite(h.cite)) || blankCite(def.vivaQuestion.cite))
    errors.push("a citation has no source");
  return errors;
}

// ---------- Uncovered combinations (default-state hits) ----------

const UNCOVERED = path.join(ROOT, "uncovered");

export interface UncoveredEntry {
  version: number;
  checkpoint: string;
  combo: string; // sorted "drug@route:band" list
  count: number;
  lastAt: number;
}

export function logUncovered(id: string, version: number, checkpoint: string, combo: string[]) {
  const f = path.join(UNCOVERED, `${id}.json`);
  let list: UncoveredEntry[] = [];
  try {
    list = JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {}
  const key = [...combo].sort().join(", ") || "(no orders)";
  const hit = list.find((e) => e.version === version && e.checkpoint === checkpoint && e.combo === key);
  if (hit) {
    hit.count++;
    hit.lastAt = Date.now();
  } else list.push({ version, checkpoint, combo: key, count: 1, lastAt: Date.now() });
  fs.mkdirSync(UNCOVERED, { recursive: true });
  fs.writeFileSync(f, JSON.stringify(list, null, 2));
}

export function uncoveredFor(id: string): UncoveredEntry[] {
  try {
    return (JSON.parse(fs.readFileSync(path.join(UNCOVERED, `${id}.json`), "utf8")) as UncoveredEntry[]).sort((a, b) => b.count - a.count);
  } catch {
    return [];
  }
}
