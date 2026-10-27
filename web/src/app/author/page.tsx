"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { call, ClinicianGate, useClinician } from "@/components/author/fields";
import { levelLabel } from "@/components/ui";
import "./author.css";

type Item = {
  id: string;
  title: string;
  complaint: string;
  level: string;
  latest: { version: number; status: string; author: string; reviewer?: string; updatedAt: number };
  liveVersion: number | null;
  versions: { version: number; status: string }[];
};

const STATUS: Record<string, string> = { draft: "Draft", in_review: "In review", published: "Published", superseded: "Superseded", retired: "Retired (safety fix)" };

export default function AuthorHome() {
  const [who, setWho] = useClinician();
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [title, setTitle] = useState("");
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const load = useCallback(() => call<Item[]>("/api/author/cases").then(setItems).catch((e) => setMsg({ text: e.message, err: true })), []);
  useEffect(() => {
    load();
  }, [load]);

  if (who === null) return <main className="au" />;
  if (!who) return <ClinicianGate onDone={setWho} />;

  const create = async () => {
    try {
      const r = await call<{ id: string; version: number }>("/api/author/cases", "POST", { title: title.trim() || "New case", author: who });
      router.push(`/author/${r.id}/${r.version}`);
    } catch (e) {
      setMsg({ text: (e as Error).message, err: true });
    }
  };
  const newVersion = async (id: string, v: number) => {
    try {
      const r = await call<{ id: string; version: number }>(`/api/author/cases/${id}/${v}`, "POST", { action: "new_version", who });
      router.push(`/author/${r.id}/${r.version}`);
    } catch (e) {
      setMsg({ text: (e as Error).message, err: true });
    }
  };
  const importFile = async (f: File) => {
    try {
      const json = JSON.parse(await f.text());
      const r = await call<{ id: string; version: number }>("/api/author/cases", "POST", { import: json, author: who });
      router.push(`/author/${r.id}/${r.version}`);
    } catch (e) {
      setMsg({ text: (e as Error).message, err: true });
    }
  };

  const mine = items.filter((i) => i.latest.status === "in_review" && i.latest.author !== who);

  return (
    <main className="au">
      <header className="au-top">
        <b>HealMe · Authoring</b>
        <span className="meta">
          <span>{who}</span>
          <button className="lnk" onClick={() => setWho("")}>
            not you?
          </button>
          <Link className="lnk" href="/">
            Ward
          </Link>
        </span>
      </header>
      <div className="au-col" style={{ maxWidth: 1000, width: "100%", margin: "0 auto", gap: 16 }}>
        {mine.length > 0 && (
          <section className="card">
            <h4>Waiting for your review</h4>
            {mine.map((i) => (
              <div key={i.id} className="row" style={{ justifyContent: "space-between" }}>
                <span>
                  <b>{i.title}</b> <span className="pill">v{i.latest.version}</span> <span className="help">by {i.latest.author}</span>
                </span>
                <Link className="bt pri" href={`/author/${i.id}/${i.latest.version}/review`}>
                  Review
                </Link>
              </div>
            ))}
          </section>
        )}

        <section className="card">
          <div className="card-h">
            <h4>Cases</h4>
            <span className="help">{items.length} cases</span>
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th>Case</th>
                <th>Level</th>
                <th>On the ward</th>
                <th>Latest</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td>
                    <b>{i.title || i.id}</b>
                    <div className="help">{i.complaint || "No bed-board complaint yet"}</div>
                  </td>
                  <td>{levelLabel(i.level)}</td>
                  <td className="mono">{i.liveVersion ? `v${i.liveVersion}` : "—"}</td>
                  <td>
                    <span className={`pill ${i.latest.status === "published" ? "good" : i.latest.status === "retired" ? "harm" : ""}`}>
                      v{i.latest.version} · {STATUS[i.latest.status]}
                    </span>
                    <div className="help">
                      {i.latest.author}
                      {i.latest.reviewer ? ` · reviewed by ${i.latest.reviewer}` : ""}
                    </div>
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <div className="row" style={{ justifyContent: "flex-end" }}>
                      {i.latest.status === "in_review" && i.latest.author !== who && (
                        <Link className="bt pri" href={`/author/${i.id}/${i.latest.version}/review`}>
                          Review
                        </Link>
                      )}
                      {(i.latest.status === "published" || i.latest.status === "superseded" || i.latest.status === "retired") && (
                        <button className="bt" onClick={() => newVersion(i.id, i.latest.version)}>
                          Edit as v{i.latest.version + 1}
                        </button>
                      )}
                      <Link className="bt" href={`/author/${i.id}/${i.latest.version}`}>
                        {i.latest.status === "draft" && i.latest.author === who ? "Edit" : "Open"}
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card">
          <h4>Write a new case</h4>
          <div className="row">
            <input className="in" style={{ maxWidth: 420 }} placeholder="Working title, e.g. Acute severe asthma" value={title} onChange={(e) => setTitle(e.target.value)} />
            <button className="bt pri" onClick={create}>
              Start a draft
            </button>
            <span className="help">or</span>
            <button className="bt" onClick={() => file.current?.click()}>
              Import case JSON
            </button>
            <input
              ref={file}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importFile(f);
                e.target.value = "";
              }}
            />
          </div>
          <p className="help">
            Imported cases use the same format as &quot;Download JSON&quot; in the editor and land as your draft. Institutions can also POST that JSON to <code className="mono">/api/author/cases</code>.
          </p>
        </section>
      </div>
      {msg && (
        <div className={`toast ${msg.err ? "err" : ""}`} onClick={() => setMsg(null)}>
          {msg.text}
        </div>
      )}
    </main>
  );
}
