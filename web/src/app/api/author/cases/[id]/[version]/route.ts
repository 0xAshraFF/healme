import { NextResponse } from "next/server";
import { editorViewFor } from "@/server/author";
import { newVersion, publish, saveDraft, sendBack, StoreError, submitForReview } from "@/server/caseStore";
import { createSession } from "@/server/session";

type Ctx = { params: Promise<{ id: string; version: string }> };

const fail = (e: unknown) => NextResponse.json({ error: (e as Error).message }, { status: e instanceof StoreError ? 400 : 500 });

export async function GET(_req: Request, { params }: Ctx) {
  const { id, version } = await params;
  try {
    return NextResponse.json(editorViewFor(id, Number(version)));
  } catch (e) {
    return fail(e);
  }
}

/** Save the whole draft. */
export async function PUT(req: Request, { params }: Ctx) {
  const { id, version } = await params;
  try {
    const { def, who } = (await req.json()) as { def: unknown; who: string };
    saveDraft(id, Number(version), def, who);
    return NextResponse.json(editorViewFor(id, Number(version)));
  } catch (e) {
    return fail(e);
  }
}

type Body =
  | { action: "submit"; who: string }
  | { action: "send_back"; who: string; note: string }
  | { action: "publish"; who: string; note?: string; safetyFix?: boolean; correctionNote?: string }
  | { action: "new_version"; who: string }
  | { action: "preview"; who: string };

export async function POST(req: Request, { params }: Ctx) {
  const { id, version } = await params;
  const v = Number(version);
  try {
    const b = (await req.json()) as Body;
    switch (b.action) {
      case "submit":
        submitForReview(id, v, b.who);
        break;
      case "send_back":
        sendBack(id, v, b.who, b.note);
        break;
      case "publish":
        publish(id, v, b.who, { note: b.note, safetyFix: b.safetyFix, correctionNote: b.correctionNote });
        break;
      case "new_version": {
        const rec = newVersion(id, b.who);
        return NextResponse.json({ id: rec.id, version: rec.version });
      }
      case "preview": {
        const s = createSession(id, `preview:${Date.now()}`, v);
        return NextResponse.json({ sessionId: s.id });
      }
      default:
        throw new StoreError("Unknown action");
    }
    return NextResponse.json(editorViewFor(id, v));
  } catch (e) {
    return fail(e);
  }
}
