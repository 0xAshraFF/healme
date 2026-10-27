"use client";

import { useState } from "react";
import type { Band, Condition } from "@/engine/types";
import type { EditorView } from "@/server/author";

type Leaf = Extract<Condition, { fact: string }>;
type Row = { not: boolean; leaf: Leaf };
type Facts = EditorView["facts"];
const BANDS: Band[] = ["none", "low", "therapeutic", "high", "dangerous"];
const OPS = ["==", "!=", "<", "<=", ">", ">=", "in"] as const;

/** Simple shapes (one leaf, or ALL/ANY of leaves that may be negated) get a form; anything deeper gets JSON. */
type Mode = "all" | "any" | "none";

function toRows(c: Condition): { mode: Mode; rows: Row[] } | null {
  const row = (x: Condition): Row | null => {
    if ("fact" in x) return { not: false, leaf: x };
    if ("not" in x && "fact" in x.not) return { not: true, leaf: x.not };
    return null;
  };
  // NOT (ANY of …) reads as "NONE of these".
  if ("not" in c && "any" in c.not) {
    const rows = c.not.any.map(row);
    return rows.some((r) => r === null) ? null : { mode: "none", rows: rows as Row[] };
  }
  if ("fact" in c || "not" in c) {
    const r = row(c);
    return r ? { mode: "all", rows: [r] } : null;
  }
  const list = "all" in c ? c.all : c.any;
  const rows = list.map(row);
  if (rows.some((r) => r === null)) return null;
  return { mode: "all" in c ? "all" : "any", rows: rows as Row[] };
}

function fromRows(mode: Mode, rows: Row[]): Condition {
  const items = rows.map((r) => (r.not ? { not: r.leaf } : r.leaf));
  if (mode === "none") return { not: { any: items } };
  if (items.length === 1) return items[0];
  return mode === "all" ? { all: items } : { any: items };
}

export function ConditionEditor({ value, onChange, facts, emptyMeans = "always" }: { value: Condition; onChange: (c: Condition) => void; facts: Facts; emptyMeans?: string }) {
  const parsed = toRows(value);
  const [json, setJson] = useState<string | null>(null);
  const kindOf = (key: string) => [...facts.orders, ...facts.patient, ...facts.other].find((f) => f.key === key)?.kind;

  if (!parsed || json !== null) {
    const text = json ?? JSON.stringify(value, null, 2);
    return (
      <div className="cond">
        <span className="kw">Advanced condition (nested groups), edited as JSON</span>
        <textarea className="json" style={{ minHeight: 120 }} value={text} onChange={(e) => setJson(e.target.value)} />
        <div className="row">
          <button
            className="bt"
            onClick={() => {
              try {
                onChange(JSON.parse(text));
                setJson(null);
              } catch {
                alert("That isn't valid JSON yet.");
              }
            }}
          >
            Apply
          </button>
          {parsed && (
            <button className="lnk" onClick={() => setJson(null)}>
              back to form
            </button>
          )}
        </div>
      </div>
    );
  }

  const { mode, rows } = parsed;
  const setRows = (r: Row[]) => onChange(fromRows(mode, r));
  const setRow = (i: number, r: Partial<Row>) => setRows(rows.map((x, j) => (j === i ? { ...x, ...r } : x)));
  const setLeaf = (i: number, l: Partial<Leaf>) => setRow(i, { leaf: { ...rows[i].leaf, ...l } as Leaf });

  return (
    <div className="cond">
      <div className="row">
        <span className="kw">IF</span>
        {rows.length > 1 || mode === "none" ? (
          <select className="in" style={{ width: "auto" }} value={mode} onChange={(e) => onChange(fromRows(e.target.value as Mode, rows))}>
            <option value="all">ALL of these are true</option>
            <option value="any">ANY of these is true</option>
            <option value="none">NONE of these is true</option>
          </select>
        ) : rows.length === 0 ? (
          <span className="kw">(no conditions: {emptyMeans})</span>
        ) : null}
      </div>
      {rows.map((r, i) => {
        const kind = kindOf(r.leaf.fact);
        const isBand = kind === "band" || r.leaf.op === "in";
        return (
          <div className="cond-row" key={i}>
            <select className="in" value={r.not ? "not" : ""} onChange={(e) => setRow(i, { not: e.target.value === "not" })} aria-label="negate">
              <option value=""> </option>
              <option value="not">NOT</option>
            </select>
            <input
              className="in mono"
              list="fact-list"
              value={r.leaf.fact}
              onChange={(e) => {
                const k = kindOf(e.target.value);
                if (k === "band") setLeaf(i, { fact: e.target.value, op: "in", value: ["therapeutic", "high"] } as Partial<Leaf>);
                else if (k === "bool") setLeaf(i, { fact: e.target.value, op: "==", value: true } as Partial<Leaf>);
                else setLeaf(i, { fact: e.target.value });
              }}
              placeholder="fact, e.g. kcl.band or k"
            />
            <select
              className="in"
              value={r.leaf.op}
              onChange={(e) => {
                const op = e.target.value as Leaf["op"];
                setLeaf(i, (op === "in" ? { op, value: Array.isArray(r.leaf.value) ? r.leaf.value : [] } : { op, value: Array.isArray(r.leaf.value) ? "" : r.leaf.value }) as Partial<Leaf>);
              }}
            >
              {OPS.map((o) => (
                <option key={o} value={o}>
                  {o === "in" ? "is one of" : o}
                </option>
              ))}
            </select>
            {isBand && r.leaf.op === "in" ? (
              <div className="bands">
                {BANDS.map((b) => {
                  const vals = (r.leaf.value as string[]) ?? [];
                  const on = vals.includes(b);
                  return (
                    <button key={b} className={on ? "on" : ""} onClick={() => setLeaf(i, { value: on ? vals.filter((x) => x !== b) : [...vals, b] } as Partial<Leaf>)}>
                      {b}
                    </button>
                  );
                })}
              </div>
            ) : kind === "bool" || typeof r.leaf.value === "boolean" ? (
              <select className="in" value={String(r.leaf.value)} onChange={(e) => setLeaf(i, { value: e.target.value === "true" } as Partial<Leaf>)}>
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            ) : (
              <input
                className="in mono"
                value={String(r.leaf.value ?? "")}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setLeaf(i, { value: e.target.value.trim() !== "" && Number.isFinite(n) ? n : e.target.value } as Partial<Leaf>);
                }}
              />
            )}
            <button className="lnk red" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="remove condition">
              ✕
            </button>
          </div>
        );
      })}
      <div className="row">
        <button className="lnk" onClick={() => setRows([...rows, { not: false, leaf: { fact: "", op: "==", value: true } }])}>
          + condition
        </button>
        <button className="lnk" onClick={() => setJson(JSON.stringify(value, null, 2))}>
          edit as JSON
        </button>
      </div>
    </div>
  );
}

/** Render once per page; every ConditionEditor's fact input uses it for suggestions. */
export function FactList({ facts }: { facts: Facts }) {
  return (
    <datalist id="fact-list">
      {[...facts.orders, ...facts.patient, ...facts.other].map((f) => (
        <option key={f.key} value={f.key}>
          {f.label}
        </option>
      ))}
    </datalist>
  );
}
