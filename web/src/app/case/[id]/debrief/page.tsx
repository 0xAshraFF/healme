"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { api, Cite, CitationSheet, levelLabel } from "@/components/ui";
import type { Citation } from "@/engine/types";
import type { DebriefView } from "@/server/session";

const OUTCOME = { recovered: "Recovered", complication: "Complication", icu: "ICU", died: "Died" } as const;
const CATS: [keyof DebriefView["runs"][number]["marks"], string][] = [
  ["assessment", "Assessment"],
  ["diagnosis", "Diagnosis"],
  ["management", "Initial management"],
  ["monitoring", "Monitoring & follow-up"],
  ["safety", "Safety (challenges, harm)"],
];

export default function Debrief({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [d, setD] = useState<DebriefView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cite, setCite] = useState<Citation | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);

  useEffect(() => {
    api<DebriefView>(`/api/session/${id}/debrief`).then(setD).catch((e) => setErr(e.message));
  }, [id]);

  if (!d)
    return (
      <main className="screen">
        <div className="body">
          {err ? <p className="err">{err}</p> : <p className="muted">Fetching the consultant…</p>}
          <Link className="btn sec" href={`/case/${id}`}>
            Back to the case
          </Link>
        </div>
      </main>
    );

  const scored = d.runs.find((r) => r.scored) ?? d.runs[0];
  const branches = d.runs.filter((r) => r !== scored);
  const corrections = scored.debrief.filter((p) => p.verdict === "miss").length;
  const good = scored.debrief.filter((p) => p.verdict === "good").length;
  const byCp = (cp: string) => scored.debrief.filter((p) => p.checkpoint === cp);
  const t0Points = byCp("T0");
  const later = scored.debrief.filter((p) => p.checkpoint !== "T0");

  return (
    <main className="screen">
      <header className="ph">
        <div className="l1">
          <span className="nm">Consultant&apos;s review</span>
          <span className="bed">{scored.label}</span>
        </div>
        <div className="l2">
          <span>{d.patient}</span>
          <span>{d.diagnosis}</span>
          <span>
            {corrections} corrections · {good} good calls
          </span>
        </div>
      </header>

      <div className="body slide-up">
        {branches.length > 0 && (
          <section className="sheet">
            <div className="sh">
              <h3>Runs side by side</h3>
              <small>{d.runs.length} runs</small>
            </div>
            {[scored, ...branches].slice(0, 2).length === 2 && <Compare a={scored} b={branches[branches.length - 1]} />}
            {branches.length > 1 && (
              <p className="note-s" style={{ padding: "6px 10px 10px" }}>
                Showing your latest branch. Earlier: {branches.slice(0, -1).map((b) => `${b.label} (${OUTCOME[b.outcome]})`).join(", ")}.
              </p>
            )}
          </section>
        )}

        <section className="sheet">
          <div className="sh">
            <h3>Your admission orders</h3>
            <small>red = consultant</small>
          </div>
          {scored.t0Orders.map((o) => {
            const notes = t0Points.filter((p) => p.about === o.drugId);
            return (
              <div key={o.uid} className={`order ${o.stoppedAt ? "stopped" : ""}`} style={{ gridTemplateColumns: "40px 1fr" }}>
                <span className="t">T0</span>
                <span>
                  <span className="txt">{o.text}</span>
                  {notes.map((p) => (
                    <span key={p.id} style={{ display: "block" }}>
                      <span className={`redpen ${p.verdict === "good" ? "good" : ""}`}>
                        {p.verdict === "good" ? "✓ " : "✗ "}
                        {p.text}
                      </span>
                      {p.cite.map((c, i) => (
                        <span key={i}>
                          <Cite c={c} onOpen={setCite} />{" "}
                        </span>
                      ))}
                    </span>
                  ))}
                </span>
              </div>
            );
          })}
          {/* Points about things you didn't order (e.g. missing potassium) */}
          {t0Points
            .filter((p) => !scored.t0Orders.some((o) => o.drugId === p.about))
            .map((p) => (
              <div key={p.id} className="order" style={{ gridTemplateColumns: "40px 1fr" }}>
                <span className="t">T0</span>
                <span>
                  <span className={`redpen ${p.verdict === "good" ? "good" : ""}`} style={{ marginTop: 0 }}>
                    {p.verdict === "good" ? "✓ " : "✗ "}
                    {p.text}
                  </span>
                  {p.cite.map((c, i) => (
                    <span key={i}>
                      <Cite c={c} onOpen={setCite} />{" "}
                    </span>
                  ))}
                </span>
              </div>
            ))}
        </section>

        {later.length > 0 && (
          <section className="sheet">
            <div className="sh">
              <h3>Later on the ward</h3>
            </div>
            {later.map((p) => (
              <div key={p.id} className="order" style={{ gridTemplateColumns: "40px 1fr" }}>
                <span className="t">{p.checkpoint}</span>
                <span>
                  <span className={`redpen ${p.verdict === "good" ? "good" : ""}`} style={{ marginTop: 0 }}>
                    {p.verdict === "good" ? "✓ " : "✗ "}
                    {p.text}
                  </span>
                  {p.cite.map((c, i) => (
                    <span key={i}>
                      <Cite c={c} onOpen={setCite} />{" "}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </section>
        )}

        {scored.insisted.length > 0 && (
          <div className="challenge">
            <div className="who">Safety</div>
            Given after the nurse questioned it: {scored.insisted.join("; ")}.
          </div>
        )}

        <section className="sheet">
          <div className="sh">
            <h3>Peers</h3>
          </div>
          <p className="empty">{d.peer ? d.peer.text : "Not enough data yet. Peer comparisons appear once 30 doctors have finished this case."}</p>
        </section>

        <section className="sheet">
          <div className="sh">
            <h3>Marks · {levelLabel(d.level)}</h3>
            <small>{scored.label}, scored</small>
          </div>
          {CATS.map(([k, label]) => (
            <div className="ln" key={k}>
              <span>{label}</span>
              <span className="v">{scored.marks[k]} / 10</span>
            </div>
          ))}
          <div className="ln" style={{ borderTop: "2px solid var(--ink)" }}>
            <b>Total</b>
            <span className="v" style={{ fontSize: 18, fontWeight: 700, color: scored.total < d.passMark ? "var(--red)" : undefined }}>
              {scored.total} / 50
            </span>
          </div>
          <div className="ln">
            <span className="muted">Pass mark for this level</span>
            <span className="v">{d.passMark} / 50</span>
          </div>
        </section>

        <section className="sheet">
          <div className="sh">
            <h3>Viva question</h3>
            <small>FCPS style</small>
          </div>
          <p className="pad p">{d.viva.q}</p>
          {showAnswer ? (
            <div className="pad" style={{ paddingTop: 0 }}>
              <p className="p">{d.viva.a}</p>
              {d.viva.cite.map((c, i) => (
                <span key={i}>
                  <Cite c={c} onOpen={setCite} />{" "}
                </span>
              ))}
            </div>
          ) : (
            <button className="ln" onClick={() => setShowAnswer(true)}>
              <span className="muted">Answer</span>
              <span className="tag">reveal</span>
            </button>
          )}
        </section>
        <p className="note-s">Citations point to the source section. Lessons are paraphrased by the case author; read the original for the full recommendation.</p>
      </div>

      <div className="foot">
        <Link className="btn sec" href={`/case/${id}`}>
          Rewind &amp; try
        </Link>
        <Link className="btn" href="/">
          Next patient
        </Link>
      </div>
      <CitationSheet c={cite} onClose={() => setCite(null)} />
    </main>
  );
}

function Compare({ a, b }: { a: DebriefView["runs"][number]; b: DebriefView["runs"][number] }) {
  const t0 = (r: typeof a) =>
    r.t0Orders
      .filter((o) => !o.stoppedAt && o.short)
      .map((o) => o.short)
      .join(", ") || "none";
  const row = (cap: string, x: React.ReactNode, y: React.ReactNode) => (
    <>
      <div>
        <div className="cap">{cap}</div>
        {x}
      </div>
      <div>
        <div className="cap">{cap}</div>
        {y}
      </div>
    </>
  );
  const kLine = (r: typeof a) =>
    Object.entries(r.kByCheckpoint)
      .filter(([, k]) => k != null)
      .map(([cp, k]) => (
        <span key={cp} className={(k as number) < 3.5 ? "hi" : ""}>
          {cp} {k}{" "}
        </span>
      ));
  return (
    <div className="grid2" style={{ fontSize: 12.5 }}>
      <div className="lab">
        {a.label} · scored
      </div>
      <div className="lab">
        {b.label} · practice
      </div>
      {row("T0 orders", <span className="ink" style={{ fontSize: 12 }}>{t0(a)}</span>, <span className="ink" style={{ fontSize: 12 }}>{t0(b)}</span>)}
      {row("K+ through the stay", <span className="mono">{kLine(a)}</span>, <span className="mono">{kLine(b)}</span>)}
      {row("Events", <span>{a.events.join(", ") || "None"}</span>, <span>{b.events.join(", ") || "None"}</span>)}
      {row("Stable by", <span className="mono">{a.stableBy}</span>, <span className="mono">{b.stableBy}</span>)}
      {row("Outcome", <b>{OUTCOME[a.outcome]}</b>, <b>{OUTCOME[b.outcome]}</b>)}
      {row("Marks", <span className="mono">{a.total} / 50</span>, <span className="mono faint">practice</span>)}
    </div>
  );
}
