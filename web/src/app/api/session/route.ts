import { NextResponse } from "next/server";
import { createSession } from "@/server/session";

export async function POST(req: Request) {
  try {
    const { caseId, seed } = (await req.json()) as { caseId: string; seed?: string };
    const s = createSession(caseId, typeof seed === "string" ? seed.slice(0, 64) : undefined);
    return NextResponse.json({ id: s.id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
