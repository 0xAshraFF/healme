"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { call, ClinicianGate, useClinician } from "@/components/author/fields";
import { levelLabel } from "@/components/ui";
import type { Citation, Condition } from "@/engine/types";
import type { EditorView } from "@/server/author";
import "../../../author.css";

/** A rule condition in plain words, for reviewers who never touch JSON. */
function say(c: Condition): string {
  if ("all" in c) return c.all.length ? c.all.map(say).join(" AND ") : "always";
  if ("any" in c) return c.any.length ? `(${c.any.map(say).join(" OR ")})` : "never";
  if ("not" in c) return `NOT ${say(c.not)}`;
  if (c.op === "in") return `${c.fact} is ${(c.value as unknown[]).join(" or ")}`;
  if (c.value === true && c.op === "==") return c.fact.replace(/\.given$/, " given");
  return `${c.fact} ${c.op} ${String(c.value)}`;
}
const cites = (cs: Citation[]) => cs.map((c) => `${c.source.split(":")[0]}${c.section ? ` · ${c.section}` : ""}`).join("; ");

export default function Review({ params }: { params: Promise<{ id: string; version: string }> }) {
  const { id, version } = use(params);
  const [who, setWho] = useClinician();
  const router = useRouter();
  const [view, setView] = useState<EditorView | null>(null);
  const [note, setNote] = useState("");
  const [safetyFix, setSafetyFix] = useState(false);
  const [correction, setCorrection] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [checked, setChecked] = useState({ rules: false, harm: false, cites: false });
  const base = `/api/author/cases/${id}/${version}`;

  useEffect(() => {
    call<EditorView>(base)
      .then(setView)
      .catch((e) => setErr(e.message));
  }, [base]);

  if (who === null) return <main className="au" />;
  if (!who) return <ClinicianGate onDone={setWho} />;
  if (!view) return <main className="au">{err ? <p className="au-col">{err}</p> : <p className="au-col help">Loading…</p>}</main>;

  const d = view.def;
  const r = view.record;
  const own = r.author === who;
  const canAct = r.status === "in_review" && !own;
  const allChecked = checked.rules && checked.harm && checked.cites;

  const act = async (body: Record<string, unknown>) => {
    setErr(null);
    try {
      await call(base, "POST", { ...body, who });
      router.push("/author");
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const preview = async () => {
    const res = await call<{ sessionId: string }>(base, "POST", { action: "preview", who });
    window.open(`/case/${res.sessionId}`, "_blank");
  };

  return (
    <main className="au">
      <header className="au-top">
        <span className="row">
          <Link className="lnk" href="/author">
            ← Cases
          </Link>
          <b>
            Review · {d.diagnosisLabel} v{r.version}
          </b>
        </span>
        <span className="meta">
          <span>Author: {r.author}</span>
          <span>Reviewer: {who}</span>
        </span>
      </header>
      <div className="au-col" style={{ maxWidth: 980, width: "100%", margin: "0 auto", gap: 14 }}>
        {own && <div className="card" style={{ borderColor: "var(--red)" }}>You wrote this version, so you can&apos;t review it. A different clinician must sign it off.</div>}
        {r.status !== "in_review" && <div className="card">This version is {r.status.replace("_", " ")}, not waiting for review.</div>}

        <section className="card">
          <div className="card-h">
            <h4>Summary</h4>
            <button className="bt" onClick={preview}>
              Play it as a trainee
            </button>
          </div>
          <table className="tbl">
            <tbody>
              <tr>
                <td>Patient</td>
                <td>
                  {d.age}
                  {d.sex}, {d.weightKg} kg · {levelLabel(d.level)} · &quot;{d.complaint}&quot;
                </td>
              </tr>
              <tr>
                <td>Hidden diagnosis</td>
                <td>{d.diagnosisLabel}</td>
              </tr>
              <tr>
                <td>Source</td>
                <td>
                  {d.source.label} ({d.source.license})
                </td>
              </tr>
              <tr>
                <td>Rules / states / harm entries / debrief points</td>
                <td className="mono">
                  {d.transitions.reduce((n, t) => n + t.rules.length, 0)} / {Object.keys(d.states).length} / {d.caseHarmList.length} / {d.debrief.length}
                </td>
              </tr>
              <tr>
                <td>Publish checks</td>
                <td>{view.checks.length === 0 ? <span style={{ color: "var(--green)" }}>✓ all pass</span> : <span style={{ color: "var(--red)" }}>{view.checks.join("; ")}</span>}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="card">
          <h4>What happens to the patient</h4>
          {d.transitions.map((t) => (
            <div key={t.from}>
              <div className="pill" style={{ display: "inline-block", marginBottom: 6 }}>
                {t.from} → {t.to}
              </div>
              <table className="tbl">
                <tbody>
                  {[...t.rules]
                    .sort((a, b) => (a.kind === "harm" ? 0 : 1) - (b.kind === "harm" ? 0 : 1) || a.priority - b.priority)
                    .map((rule) => (
                      <tr key={rule.id}>
                        <td className="mono" style={{ width: 150, fontSize: 12 }}>
                          {rule.id}
                        </td>
                        <td style={{ fontSize: 12.5 }}>
                          <span className="kw">IF</span> {say(rule.when)}
                          {rule.note && <div className="help">{rule.note}</div>}
                        </td>
                        <td style={{ width: 220 }}>
                          → <b>{rule.then}</b>
                          <div className="help">{d.states[rule.then]?.event ?? d.states[rule.then]?.nurseNote.text.slice(0, 70)}</div>
                        </td>
                      </tr>
                    ))}
                  <tr>
                    <td className="kw">otherwise</td>
                    <td />
                    <td>
                      → <b>{t.defaultState || "—"}</b>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ))}
          <label className="chk">
            <input type="checkbox" checked={checked.rules} onChange={(e) => setChecked({ ...checked, rules: e.target.checked })} />I checked every rule and state against the source and guidelines
          </label>
        </section>

        <section className="card">
          <h4>Harm</h4>
          <table className="tbl">
            <tbody>
              {d.caseHarmList.map((h) => (
                <tr key={h.id}>
                  <td className="mono">{h.drug ?? `class: ${h.classTag}`}</td>
                  <td>{h.reason}</td>
                  <td>→ {h.state}</td>
                </tr>
              ))}
              {Object.entries(d.dangerousDoseStates ?? {}).map(([drug, s]) => (
                <tr key={drug}>
                  <td className="mono">{drug} (dangerous dose)</td>
                  <td>Given after the nurse&apos;s challenge</td>
                  <td>→ {s}</td>
                </tr>
              ))}
              {Object.entries(d.globalHarmStates).map(([g, s]) => (
                <tr key={g}>
                  <td className="mono">{g}</td>
                  <td>Global harm</td>
                  <td>→ {s}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <label className="chk">
            <input type="checkbox" checked={checked.harm} onChange={(e) => setChecked({ ...checked, harm: e.target.checked })} />
            The harm list covers what is contraindicated for this patient
          </label>
        </section>

        <section className="card">
          <h4>Debrief lessons and citations</h4>
          <table className="tbl">
            <tbody>
              {d.debrief.map((p) => (
                <tr key={p.id}>
                  <td style={{ width: 70 }}>
                    <span className={`pill ${p.verdict === "good" ? "good" : "harm"}`}>
                      {p.checkpoint} {p.verdict === "good" ? `+${p.points}` : p.penalty ? `−${p.penalty}` : "✗"}
                    </span>
                  </td>
                  <td>
                    {p.text}
                    <div className="help mono" style={{ fontSize: 11 }}>
                      {cites(p.cite) || "NO CITATION"}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <label className="chk">
            <input type="checkbox" checked={checked.cites} onChange={(e) => setChecked({ ...checked, cites: e.target.checked })} />I verified each citation points to the right section, and no textbook text is copied
          </label>
        </section>

        <section className="card">
          <h4>Decision</h4>
          <textarea className="in" rows={3} placeholder="Reviewer note (required to send back; shown in the history when publishing)" value={note} onChange={(e) => setNote(e.target.value)} />
          <label className="chk">
            <input type="checkbox" checked={safetyFix} onChange={(e) => setSafetyFix(e.target.checked)} />
            This is a safety correction: retire the current live version and end sessions still playing it
          </label>
          {safetyFix && <textarea className="in" rows={2} placeholder="What was wrong (players on the old version will see this)" value={correction} onChange={(e) => setCorrection(e.target.value)} />}
          {err && <p style={{ color: "var(--red)", whiteSpace: "pre-line" }}>{err}</p>}
          <div className="row">
            <button className="bt" disabled={!canAct} onClick={() => act({ action: "send_back", note })}>
              Send back to {r.author}
            </button>
            <button className="bt pri" disabled={!canAct || !allChecked || view.checks.length > 0} onClick={() => act({ action: "publish", note, safetyFix, correctionNote: correction })}>
              Sign off &amp; publish v{r.version}
            </button>
            {canAct && !allChecked && <span className="help">Tick the three checks above to sign off.</span>}
          </div>
          <p className="help">Players already partway through an older version finish on it, unless this is a safety correction.</p>
        </section>
      </div>
    </main>
  );
}
