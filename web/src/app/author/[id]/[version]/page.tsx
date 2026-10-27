"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useState } from "react";
import { FactList } from "@/components/author/ConditionEditor";
import { call, ClinicianGate, useClinician } from "@/components/author/fields";
import { Debrief, Diagnoses, Ending, Formulary, Harm, Json, Overview, Rules, States, Tests, type Up } from "@/components/author/sections";
import type { CaseDef } from "@/engine/types";
import type { EditorView } from "@/server/author";
import "../../author.css";

const SECTIONS = [
  { id: "overview", label: "Patient & story", C: Overview },
  { id: "tests", label: "Investigations", C: Tests },
  { id: "dx", label: "Diagnoses", C: Diagnoses },
  { id: "drugs", label: "Formulary & dose bands", C: Formulary },
  { id: "states", label: "Patient states", C: States },
  { id: "harm", label: "Harm lists", C: Harm },
  { id: "rules", label: "Rules", C: Rules },
  { id: "debrief", label: "Debrief & marks", C: Debrief },
  { id: "ending", label: "Stability, viva, outcomes", C: Ending },
  { id: "json", label: "JSON", C: Json },
] as const;

const STATUS: Record<string, string> = { draft: "Draft", in_review: "In review", published: "Published", superseded: "Superseded", retired: "Retired" };

export default function Editor({ params }: { params: Promise<{ id: string; version: string }> }) {
  const { id, version } = use(params);
  const [who, setWho] = useClinician();
  const router = useRouter();
  const [view, setView] = useState<EditorView | null>(null);
  const [def, setDef] = useState<CaseDef | null>(null);
  const [dirty, setDirty] = useState(false);
  const [section, setSection] = useState<(typeof SECTIONS)[number]["id"]>("overview");
  const [toast, setToast] = useState<{ text: string; err?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const base = `/api/author/cases/${id}/${version}`;

  const load = useCallback(() => {
    call<EditorView>(base)
      .then((v) => {
        setView(v);
        setDef(v.def);
        setDirty(false);
      })
      .catch((e) => setToast({ text: e.message, err: true }));
  }, [base]);
  useEffect(load, [load]);

  const editable = !!view && view.record.status === "draft" && view.record.author === who;

  const save = useCallback(async () => {
    if (!def || !editable) return;
    setBusy(true);
    try {
      const v = await call<EditorView>(base, "PUT", { def, who });
      setView(v);
      setDef(v.def);
      setDirty(false);
      setToast({ text: v.checks.length ? `Saved. ${v.checks.length} checks still open.` : "Saved. All checks pass." });
    } catch (e) {
      setToast({ text: (e as Error).message, err: true });
    } finally {
      setBusy(false);
    }
  }, [base, def, editable, who]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        save();
      }
    };
    const leave = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("keydown", key);
    window.addEventListener("beforeunload", leave);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("beforeunload", leave);
    };
  }, [save, dirty]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), toast.err ? 8000 : 3000);
    return () => window.clearTimeout(t);
  }, [toast]);

  if (who === null) return <main className="au" />;
  if (!who) return <ClinicianGate onDone={setWho} />;
  if (!view || !def)
    return (
      <main className="au">
        <div className="au-col">{toast ? <p style={{ color: "var(--red)" }}>{toast.text}</p> : <p className="help">Loading case…</p>}</div>
      </main>
    );

  const up: Up = (fn) => {
    if (!editable) return;
    setDef((prev) => {
      const next = structuredClone(prev!);
      fn(next);
      return next;
    });
    setDirty(true);
  };

  const action = async (body: Record<string, unknown>, ok: string) => {
    if (dirty) await save();
    setBusy(true);
    try {
      const v = await call<EditorView>(base, "POST", { ...body, who });
      setView(v);
      setDef(v.def);
      setToast({ text: ok });
    } catch (e) {
      setToast({ text: (e as Error).message, err: true });
    } finally {
      setBusy(false);
    }
  };

  const preview = async () => {
    if (dirty) await save();
    try {
      const r = await call<{ sessionId: string }>(base, "POST", { action: "preview", who });
      window.open(`/case/${r.sessionId}`, "_blank");
    } catch (e) {
      setToast({ text: (e as Error).message, err: true });
    }
  };

  const Section = SECTIONS.find((s) => s.id === section)!.C;
  const r = view.record;
  const counts: Record<string, number> = {
    tests: def.investigations.length,
    dx: def.diagnoses.options.length,
    drugs: def.drugs.length,
    states: Object.keys(def.states).length,
    harm: def.caseHarmList.length,
    rules: def.transitions.reduce((n, t) => n + t.rules.length, 0),
    debrief: def.debrief.length,
  };

  return (
    <main className="au">
      <header className="au-top">
        <span className="row">
          <Link className="lnk" href="/author">
            ← Cases
          </Link>
          <b>{def.diagnosisLabel || id}</b>
        </span>
        <span className="meta">
          <span className={`pill ${r.status === "published" ? "good" : r.status === "retired" ? "harm" : ""}`}>
            v{r.version} · {STATUS[r.status]}
          </span>
          <span>{r.author}</span>
          {dirty && <span style={{ color: "var(--red)" }}>unsaved</span>}
          {editable && (
            <button className="bt pri" onClick={save} disabled={busy || !dirty}>
              Save
            </button>
          )}
        </span>
      </header>

      <div className="au-grid">
        <aside className="au-col au-side-l">
          <div className="card" style={{ padding: 0, gap: 0 }}>
            <nav className="au-nav">
              {SECTIONS.map((s) => (
                <button key={s.id} className={s.id === section ? "on" : ""} onClick={() => setSection(s.id)}>
                  <span>{s.label}</span>
                  {counts[s.id] !== undefined && <span className="n">{counts[s.id]}</span>}
                </button>
              ))}
            </nav>
          </div>
          <div className="card" style={{ gap: 4 }}>
            <span className="help">Level · weight</span>
            <span className="mono">
              {def.level} · {def.weightKg} kg
            </span>
            <span className="help">Checkpoints</span>
            <span className="mono">{def.checkpoints.join(" → ")}</span>
          </div>
        </aside>

        <section className="au-col">
          {!editable && (
            <div className="card" style={{ background: "var(--blue-soft)" }}>
              {r.status === "draft" ? `Read-only: this draft belongs to ${r.author}.` : `Read-only: v${r.version} is ${STATUS[r.status].toLowerCase()}. Start a new version from the case list to change it.`}
            </div>
          )}
          {r.reviewNote && r.status === "draft" && (
            <div className="card" style={{ borderColor: "var(--red)" }}>
              <b>Sent back by reviewer</b>
              <span>{r.reviewNote}</span>
            </div>
          )}
          <h2>{SECTIONS.find((s) => s.id === section)!.label}</h2>
          <fieldset disabled={!editable} style={{ border: 0, display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
            <Section key={section} def={def} up={up} view={view} />
          </fieldset>
          <FactList facts={view.facts} />
        </section>

        <aside className="au-col au-side-r">
          <div className="card" style={{ padding: 0, gap: 0 }}>
            <div className="card-h" style={{ padding: "8px 8px 4px" }}>
              <h4>Checks</h4>
              <span className="help">{dirty ? "as of last save" : "live"}</span>
            </div>
            {view.checks.length === 0 ? (
              <div className="check-ok">✓ All publish checks pass</div>
            ) : (
              <div className="check-list">
                {view.checks.map((c, i) => (
                  <div key={i}>{c}</div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <button className="bt" onClick={preview}>
              Preview as player
            </button>
            {editable && (
              <button className="bt pri" disabled={busy || view.checks.length > 0} onClick={() => action({ action: "submit" }, "Sent for review. A second clinician must sign it off.")}>
                Send for review
              </button>
            )}
            {r.status === "in_review" && r.author !== who && (
              <button className="bt pri" onClick={() => router.push(`/author/${id}/${version}/review`)}>
                Review this version
              </button>
            )}
            {r.status === "in_review" && r.author === who && <span className="help">Waiting for another clinician to review.</span>}
            <a className="lnk" href={`${base}/export`}>
              Download JSON
            </a>
          </div>

          <div className="card">
            <h4>Uncovered combinations</h4>
            <p className="help">Order sets players signed that no rule matched, so the patient went to the default state. Add rules for the common ones.</p>
            {view.uncovered.length === 0 ? (
              <span className="help">None yet.</span>
            ) : (
              view.uncovered.slice(0, 12).map((u, i) => (
                <div key={i} style={{ borderTop: "1px solid var(--rule-soft)", paddingTop: 6 }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <span className="pill">
                      v{u.version} · at {u.checkpoint}
                    </span>
                    <b className="mono">×{u.count}</b>
                  </div>
                  <div className="mono" style={{ fontSize: 11.5, marginTop: 4, wordBreak: "break-word" }}>
                    {u.combo}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="card">
            <h4>History</h4>
            {[...r.history].reverse().slice(0, 8).map((h, i) => (
              <div key={i} className="help">
                <b>{h.action.replace("_", " ")}</b> · {h.who} · {new Date(h.at).toLocaleString()}
                {h.note ? ` — ${h.note}` : ""}
              </div>
            ))}
          </div>
        </aside>
      </div>
      {toast && (
        <div className={`toast ${toast.err ? "err" : ""}`} onClick={() => setToast(null)}>
          {toast.text}
        </div>
      )}
    </main>
  );
}
