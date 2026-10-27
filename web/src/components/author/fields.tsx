"use client";

import { useEffect, useState } from "react";
import type { Citation } from "@/engine/types";

export function Txt({ label, value, onChange, mono, placeholder }: { label: string; value: string | undefined; onChange: (v: string) => void; mono?: boolean; placeholder?: string }) {
  return (
    <label className="f">
      <span>{label}</span>
      <input className={mono ? "mono" : ""} value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function Num({ label, value, onChange, step }: { label: string; value: number | undefined; onChange: (v: number) => void; step?: number }) {
  // Keep the raw text so "0." and "" can be typed; commit numbers only.
  const [raw, setRaw] = useState(value === undefined ? "" : String(value));
  useEffect(() => {
    if (Number(raw) !== value) setRaw(value === undefined ? "" : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <label className="f">
      <span>{label}</span>
      <input
        className="mono"
        inputMode="decimal"
        step={step}
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value.trim() !== "" && Number.isFinite(n)) onChange(n);
        }}
      />
    </label>
  );
}

export function Sel<T extends string>({ label, value, options, onChange }: { label: string; value: T | undefined; options: (T | { value: T; label: string })[]; onChange: (v: T) => void }) {
  return (
    <label className="f">
      <span>{label}</span>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value as T)}>
        {value === undefined || value === "" ? <option value="">Choose…</option> : null}
        {options.map((o) => {
          const v = typeof o === "string" ? o : o.value;
          const l = typeof o === "string" ? o : o.label;
          return (
            <option key={v} value={v}>
              {l}
            </option>
          );
        })}
      </select>
    </label>
  );
}

export function Area({ label, value, onChange, rows = 3, help }: { label: string; value: string | undefined; onChange: (v: string) => void; rows?: number; help?: string }) {
  return (
    <label className="f">
      <span>{label}</span>
      <textarea rows={rows} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
      {help && <small className="help">{help}</small>}
    </label>
  );
}

export const CITE_PRESETS: Citation[] = [
  { source: "Davidson's Principles and Practice of Medicine, 24th ed.", section: "", year: 2023 },
  { source: "JBDS-IP: The Management of Diabetic Ketoacidosis in Adults", section: "", year: 2023, url: "https://abcd.care/joint-british-diabetes-societies-jbds-inpatient-care-group" },
  { source: "Hyperglycemic Crises in Adults With Diabetes: A Consensus Report (ADA/EASD/JBDS/AACE/DTS), Diabetes Care", section: "", year: 2024 },
  { source: "Surviving Sepsis Campaign: International Guidelines", section: "", year: 2021, url: "https://www.sccm.org/survivingsepsiscampaign/guidelines-and-resources" },
  { source: "GINA: Global Strategy for Asthma Management and Prevention", section: "", year: 2024, url: "https://ginasthma.org/reports/" },
  { source: "KDIGO Clinical Practice Guideline for Acute Kidney Injury", section: "", year: 2012, url: "https://kdigo.org/guidelines/acute-kidney-injury/" },
  { source: "NICE guideline", section: "", year: 2024, url: "https://www.nice.org.uk/guidance" },
  { source: "WHO Model Formulary", section: "" },
  { source: "Kumar & Clark's Clinical Medicine, 10th ed.", section: "", year: 2020 },
];

export function CitationEditor({ value, onChange }: { value: Citation[]; onChange: (v: Citation[]) => void }) {
  const set = (i: number, c: Partial<Citation>) => onChange(value.map((x, j) => (j === i ? { ...x, ...c } : x)));
  return (
    <div className="f">
      <span>Citations {value.length === 0 && <b style={{ color: "var(--red)" }}>(required)</b>}</span>
      {value.map((c, i) => (
        <div key={i} className="row" style={{ alignItems: "stretch" }}>
          <input className="in" style={{ flex: 3 }} placeholder="Source (book or guideline)" value={c.source} onChange={(e) => set(i, { source: e.target.value })} />
          <input className="in" style={{ flex: 2 }} placeholder="Chapter / section" value={c.section} onChange={(e) => set(i, { section: e.target.value })} />
          <input className="in mono" style={{ width: 70 }} placeholder="Year" value={c.year ?? ""} onChange={(e) => set(i, { year: e.target.value ? Number(e.target.value) || undefined : undefined })} />
          <input className="in mono" style={{ flex: 2 }} placeholder="https://…" value={c.url ?? ""} onChange={(e) => set(i, { url: e.target.value || undefined })} />
          <button className="lnk red" onClick={() => onChange(value.filter((_, j) => j !== i))}>
            remove
          </button>
        </div>
      ))}
      <div className="row">
        <select
          className="in"
          style={{ width: "auto" }}
          value=""
          onChange={(e) => {
            const p = CITE_PRESETS[Number(e.target.value)];
            if (p) onChange([...value, { ...p }]);
          }}
        >
          <option value="">+ Add a common source…</option>
          {CITE_PRESETS.map((p, i) => (
            <option key={i} value={i}>
              {p.source}
            </option>
          ))}
        </select>
        <button className="lnk" onClick={() => onChange([...value, { source: "", section: "" }])}>
          + other source
        </button>
      </div>
      <small className="help">Point to the chapter or section. Write the lesson in your own words; never paste textbook text.</small>
    </div>
  );
}

/** Pilot sign-in: the clinician types their name; real accounts arrive in M3. */
export function useClinician(): [string | null, (n: string) => void] {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    try {
      setName(localStorage.getItem("healme.clinician") ?? "");
    } catch {
      setName("");
    }
  }, []);
  const save = (n: string) => {
    try {
      localStorage.setItem("healme.clinician", n);
    } catch {}
    setName(n);
  };
  return [name, save];
}

export function ClinicianGate({ onDone }: { onDone: (n: string) => void }) {
  const [n, setN] = useState("");
  return (
    <main className="au">
      <div className="au-col" style={{ maxWidth: 460, margin: "10dvh auto" }}>
        <h2>HealMe · Authoring</h2>
        <p className="help">Cases are written by one clinician and signed off by a different one. Enter your name as it should appear on the case.</p>
        <Txt label="Your name" value={n} onChange={setN} placeholder="Dr. Anika Rahman" />
        <p className="help">Pilot: this is not a sign-in yet. Accounts with verified registration numbers come with M3.</p>
        <button className="bt pri" disabled={n.trim().length < 3} onClick={() => onDone(n.trim())}>
          Continue
        </button>
      </div>
    </main>
  );
}

export async function call<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, { method, cache: "no-store", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Something went wrong");
  return json as T;
}
