"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, LEVELS, levelLabel } from "@/components/ui";
import { patientName } from "@/engine/names";

type Bed = { id: string; level: string; bed: string; age: number; sex: string; complaint: string; estMinutes: number; source: { label: string; license: string } };
type Profile = { role: string; exam: string };

const ROLES = ["Final-year MBBS student", "Intern doctor", "Resident / trainee"];
const EXAMS = [
  { id: "mbbs", label: "MBBS Final Prof" },
  { id: "fcps1", label: "FCPS Part 1 (Medicine)" },
  { id: "fcps2", label: "FCPS Part 2" },
  { id: "intern", label: "Nothing right now" },
];

function readProfile(): Profile | null {
  try {
    const raw = localStorage.getItem("healme.profile");
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

export default function Ward() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [beds, setBeds] = useState<Bed[]>([]);
  const [level, setLevel] = useState("fcps1");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A fresh name for each admission, drawn from many origins. Sent with "take bed" so it sticks.
  const [seed] = useState(() => Math.random().toString(36).slice(2));

  useEffect(() => {
    const p = readProfile();
    setProfile(p);
    if (p) setLevel(p.exam);
    api<Bed[]>("/api/ward").then(setBeds).catch((e) => setError(e.message));
  }, []);

  if (profile === undefined) return <main className="screen" />;
  if (profile === null)
    return (
      <Onboarding
        onDone={(p) => {
          try {
            localStorage.setItem("healme.profile", JSON.stringify(p));
          } catch {}
          setProfile(p);
          setLevel(p.exam);
        }}
      />
    );

  const here = beds.filter((b) => b.level === level);
  const take = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      const { id: sid } = await api<{ id: string }>("/api/session", { caseId: id, seed: `${seed}:${id}` });
      router.push(`/case/${sid}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };

  return (
    <main className="screen">
      <div className="body" style={{ paddingTop: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h1 className="h2">Medicine Ward B</h1>
          <span className="mono muted" style={{ fontSize: 11 }}>
            Night duty
          </span>
        </div>
        <div className="tabs" role="tablist" aria-label="Level">
          {LEVELS.map((l) => (
            <button key={l.id} role="tab" aria-selected={level === l.id} className={level === l.id ? "on" : ""} onClick={() => setLevel(l.id)}>
              {l.label}
            </button>
          ))}
        </div>
        <section className="sheet">
          <div className="sh">
            <h3>New admissions</h3>
            <small>{here.length} {here.length === 1 ? "bed" : "beds"}</small>
          </div>
          {here.length === 0 ? (
            <p className="empty">
              No {levelLabel(level)} patients on the ward yet. Cases are added as doctors write and review them.
            </p>
          ) : (
            here.map((b) => (
              <button key={b.id} className="ln" style={{ display: "block", padding: "10px" }} onClick={() => take(b.id)} disabled={!!busy}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span className="mono" style={{ fontSize: 12 }}>
                    Bed {b.bed} · {patientName(`${seed}:${b.id}`, b.sex as "F" | "M").full} · {b.age}
                    {b.sex}
                  </span>
                  <span className="tag">{levelLabel(b.level)}</span>
                </div>
                <div style={{ fontSize: 14.5, fontWeight: 700, marginTop: 3 }}>{b.complaint}</div>
                <div className="note-s" style={{ marginTop: 3 }}>
                  ~{b.estMinutes} min · {b.source.license}
                </div>
              </button>
            ))
          )}
        </section>
        {error && <p className="err">{error}</p>}
        <p className="note-s">
          Pilot version. Your choices on a case are recorded only to improve the case; no name or phone number is collected. HealMe is for education, not for treating real
          patients.
        </p>
        <p className="note-s">
          Clinician?{" "}
          <Link href="/author" style={{ textDecoration: "underline" }}>
            Write or review a case
          </Link>
        </p>
      </div>
      {here[0] && (
        <div className="foot">
          <button className="btn" onClick={() => take(here[0].id)} disabled={!!busy}>
            {busy ? "Admitting…" : `Take Bed ${here[0].bed}`}
          </button>
        </div>
      )}
    </main>
  );
}

function Onboarding({ onDone }: { onDone: (p: Profile) => void }) {
  const [role, setRole] = useState(ROLES[1]);
  const [exam, setExam] = useState("fcps1");
  const [consent, setConsent] = useState(false);
  return (
    <main className="screen">
      <div className="body" style={{ paddingTop: 28, gap: 14 }}>
        <div className="wordmark">
          Heal<i>Me</i>
        </div>
        <p className="p muted" style={{ maxWidth: 300 }}>
          Treat a patient tonight. See what your orders did by morning.
        </p>
        <section className="sheet">
          <div className="sh">
            <h3>I am</h3>
          </div>
          {ROLES.map((r) => (
            <button key={r} className="opt" onClick={() => setRole(r)} aria-pressed={role === r}>
              <span className={`radio ${role === r ? "on" : ""}`} />
              {r}
            </button>
          ))}
        </section>
        <section className="sheet">
          <div className="sh">
            <h3>Preparing for</h3>
          </div>
          {EXAMS.map((x) => (
            <button key={x.id} className="opt" onClick={() => setExam(x.id)} aria-pressed={exam === x.id}>
              <span className={`radio ${exam === x.id ? "on" : ""}`} />
              {x.label}
            </button>
          ))}
        </section>
        <section className="sheet">
          <button className="opt" style={{ alignItems: "flex-start" }} onClick={() => setConsent(!consent)} aria-pressed={consent}>
            <span className={`box ${consent ? "on" : ""}`} style={{ marginTop: 2 }} />
            <span>
              <b>Pilot consent.</b> My choices on each case are recorded so the doctors writing the cases can fix them. No name or phone number is collected, and pilot data is deleted
              when accounts launch.
            </span>
          </button>
        </section>
      </div>
      <div className="foot">
        <button className="btn" disabled={!consent} onClick={() => onDone({ role, exam })}>
          Go to the ward
        </button>
      </div>
    </main>
  );
}
