import { NextResponse } from "next/server";
import { getRecord } from "@/server/caseStore";

type Ctx = { params: Promise<{ id: string; version: string }> };

/** Download a version as plain case JSON (the same format the import API accepts). */
export async function GET(_req: Request, { params }: Ctx) {
  const { id, version } = await params;
  try {
    const rec = getRecord(id, Number(version));
    return new NextResponse(JSON.stringify(rec.def, null, 2), {
      headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${id}-v${version}.json"` },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 404 });
  }
}
