"use client";

import { useRef, useState } from "react";
import type { Citation, Vitals } from "@/engine/types";

export const LEVELS = [
  { id: "intern", label: "Intern" },
  { id: "mbbs", label: "MBBS" },
  { id: "fcps1", label: "FCPS P1" },
  { id: "fcps2", label: "FCPS P2" },
] as const;
export const levelLabel = (id: string) => LEVELS.find((l) => l.id === id)?.label ?? id;

export function PatientHeader(p: { name: string; bed: string; age: number; sex: string; weightKg: number; allergy: string; level: string }) {
  return (
    <header className="ph">
      <div className="l1">
        <span className="nm">{p.name}</span>
        <span className="bed">Bed {p.bed}</span>
      </div>
      <div className="l2">
        <span>
          {p.age}
          {p.sex}
        </span>
        <span>{p.weightKg} kg</span>
        <span>Allergy: {p.allergy}</span>
        <span className="lvl">{levelLabel(p.level)}</span>
      </div>
    </header>
  );
}

export function TimeRail({ checkpoints, current, done, onRewind, canRewind }: { checkpoints: string[]; current: string; done: string[]; onRewind?: () => void; canRewind?: boolean }) {
  const idx = Math.max(0, checkpoints.indexOf(current));
  const pct = checkpoints.length > 1 ? (idx / (checkpoints.length - 1)) * 100 : 0;
  return (
    <div className="rail">
      <div className="track" aria-label={`Timeline, now at ${current}`}>
        <div className="line">
          <i style={{ width: `${pct}%` }} />
        </div>
        <div className="stops">
          {checkpoints.map((c) => (
            <div key={c} className={`stop ${c === current ? "now" : done.includes(c) ? "done" : ""}`}>
              <div className="dot" />
              <span>{c}</span>
            </div>
          ))}
        </div>
      </div>
      {onRewind && (
        <button className="rw" onClick={onRewind} disabled={!canRewind}>
          Rewind
        </button>
      )}
    </div>
  );
}

const abn = {
  hr: (v: number) => v > 100 || v < 50,
  sbp: (v: number) => v < 100,
  rr: (v: number) => v > 22 || v < 10,
  spo2: (v: number) => v < 94,
  gcs: (v: number) => v < 15,
  grbs: (v: number | string) => typeof v === "string" || v > 11 || v < 4,
};

export function VitalsStrip({ v }: { v: Vitals }) {
  const cell = (k: string, val: React.ReactNode, bad: boolean) => (
    <div>
      <div className="k">{k}</div>
      <div className={`v ${bad ? "hi" : ""}`}>{val}</div>
    </div>
  );
  return (
    <div className="vit">
      {cell("HR", v.hr, abn.hr(v.hr))}
      {cell("BP", `${v.sbp}/${v.dbp}`, abn.sbp(v.sbp))}
      {cell("RR", v.rr, abn.rr(v.rr))}
      {v.gcs !== undefined && v.gcs < 15 ? cell("GCS", v.gcs, true) : cell("SpO2", `${v.spo2}%`, abn.spo2(v.spo2))}
      {cell("GRBS", v.grbs ?? "—", v.grbs !== undefined && abn.grbs(v.grbs))}
    </div>
  );
}

export function NurseNote({ n }: { n: { who: string; time: string; text: string; highlight?: string } }) {
  const parts = n.highlight && n.text.includes(n.highlight) ? n.text.split(n.highlight) : [n.text];
  return (
    <div className="nurse">
      <div className="who">
        {n.who} · {n.time}
      </div>
      {parts.length === 2 ? (
        <>
          {parts[0]}
          <mark>{n.highlight}</mark>
          {parts[1]}
        </>
      ) : (
        n.text
      )}
    </div>
  );
}

/** Press and hold for 600ms to commit. Keyboard: Enter/Space held also works; a plain click does nothing. */
export function HoldButton({ label, onDone, disabled }: { label: string; onDone: () => void; disabled?: boolean }) {
  const [holding, setHolding] = useState(false);
  const [hint, setHint] = useState(false);
  const t = useRef<number | null>(null);
  const start = () => {
    if (disabled) return;
    setHolding(true);
    t.current = window.setTimeout(() => {
      setHolding(false);
      onDone();
    }, 600);
  };
  const cancel = () => {
    if (t.current) {
      window.clearTimeout(t.current);
      t.current = null;
      if (holding) setHint(true);
    }
    setHolding(false);
  };
  return (
    <button
      className={`btn ${holding ? "holding" : ""}`}
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !e.repeat && start()}
      onKeyUp={cancel}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="fill" />
      <span style={{ position: "relative" }}>{holding ? "Signing…" : hint ? "Keep holding to sign" : label}</span>
    </button>
  );
}

export function Cite({ c, onOpen }: { c: Citation; onOpen?: (c: Citation) => void }) {
  const short = c.source.split(":")[0].split(",")[0];
  return (
    <button className="cite" onClick={() => onOpen?.(c)}>
      {short}
      {c.section ? ` · ${c.section}` : ""}
    </button>
  );
}

export function CitationSheet({ c, onClose }: { c: Citation | null; onClose: () => void }) {
  if (!c) return null;
  return (
    <div className="sheet-over" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Source">
        <div className="mono faint" style={{ fontSize: 11 }}>
          Source
        </div>
        <div style={{ fontFamily: "var(--head)", fontStretch: "88%", fontWeight: 700, fontSize: 20, lineHeight: 1.15 }}>{c.source}</div>
        {c.section && <div className="mono" style={{ fontSize: 12 }}>Section: {c.section}</div>}
        {c.year && <div className="mono faint" style={{ fontSize: 12 }}>{c.year}</div>}
        <p className="note-s">The lesson is paraphrased by the case author. Read the original for the full recommendation.</p>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn sec" onClick={onClose}>
            Close
          </button>
          {c.url && (
            <a className="btn" href={c.url} target="_blank" rel="noreferrer">
              Open source
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/** Observation chart: K+ where measured, with the player's orders under each column. */
export function ObsChart({
  points,
  compare,
}: {
  points: { cp: string; k: number | null; orders: string[] }[];
  compare?: { cp: string; k: number | null }[];
}) {
  const W = 336;
  const H = 128;
  const x0 = 34;
  const cols = points.length;
  const colX = (i: number) => x0 + 24 + (i * (W - x0 - 48)) / Math.max(1, cols - 1);
  const y = (k: number) => 8 + ((6.5 - Math.min(6.5, Math.max(2, k))) / 4.5) * (H - 16);
  const line = (ps: { k: number | null }[]) =>
    ps
      .map((p, i) => (p.k == null ? null : `${colX(i)},${y(p.k)}`))
      .filter(Boolean)
      .join(" ");
  const maxOrders = Math.max(1, ...points.map((p) => p.orders.length));
  const totalH = H + 20 + maxOrders * 13 + 6;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${totalH}`} role="img" aria-label="Potassium trend with your orders">
      <defs>
        <pattern id="grid" width="12" height="12" patternUnits="userSpaceOnUse">
          <path d="M12 0H0V12" fill="none" stroke="var(--rule-soft)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect x={x0} y={8} width={W - x0 - 4} height={H - 16} fill="url(#grid)" />
      <rect x={x0} y={y(5.5)} width={W - x0 - 4} height={y(3.5) - y(5.5)} fill="var(--green)" opacity=".08" />
      {[6, 5.5, 3.5, 2.5].map((v) => (
        <text key={v} x={2} y={y(v) + 3} fontFamily="var(--mono)" fontSize="10" fill="var(--ink-3)">
          {v.toFixed(1)}
        </text>
      ))}
      {points.map((p, i) => (
        <line key={p.cp} x1={colX(i)} y1={8} x2={colX(i)} y2={H - 8} stroke="var(--rule)" />
      ))}
      {compare && <polyline points={line(compare)} fill="none" stroke="var(--ink-3)" strokeWidth="1.5" strokeDasharray="4 3" />}
      <polyline points={line(points)} fill="none" stroke="var(--ink)" strokeWidth="2" />
      {points.map((p, i) =>
        p.k == null ? null : (
          <g key={p.cp}>
            <circle cx={colX(i)} cy={y(p.k)} r={4.5} fill={p.k < 3.5 || p.k > 5.5 ? "var(--red)" : "var(--ink)"} />
            <text
              x={i === cols - 1 ? colX(i) - 8 : colX(i) + 7}
              textAnchor={i === cols - 1 ? "end" : "start"}
              y={y(p.k) - 6}
              fontFamily="var(--mono)"
              fontSize="11"
              fontWeight="700"
              fill={p.k < 3.5 || p.k > 5.5 ? "var(--red)" : "var(--ink)"}
            >
              {p.k}
            </text>
          </g>
        ),
      )}
      {points.map((p, i) => (
        <text key={`l${p.cp}`} x={colX(i)} y={H + 4} textAnchor="middle" fontFamily="var(--mono)" fontSize="10" fill="var(--ink-2)">
          {p.cp}
        </text>
      ))}
      <line x1={x0} y1={H + 10} x2={W - 4} y2={H + 10} stroke="var(--rule-soft)" />
      {points.map((p, i) =>
        p.orders.map((o, j) => (
          <text key={`o${p.cp}${j}`} x={colX(i)} y={H + 22 + j * 13} textAnchor="middle" fontFamily="var(--mono)" fontSize="9.5" fill="var(--blue)">
            {o}
          </text>
        )),
      )}
    </svg>
  );
}

export async function api<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, body === undefined ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Something went wrong");
  return json as T;
}
