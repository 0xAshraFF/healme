import { NextResponse } from "next/server";
import { createDraft, importCase, listCases, StoreError } from "@/server/caseStore";

// Pilot: the clinician name comes from the client. Real sign-in (M3) replaces this.
export function GET() {
  return NextResponse.json(listCases());
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { title?: string; author: string; import?: unknown };
    const rec = body.import !== undefined ? importCase(body.import, body.author) : createDraft(body.title ?? "New case", body.author);
    return NextResponse.json({ id: rec.id, version: rec.version });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: e instanceof StoreError ? 400 : 500 });
  }
}
