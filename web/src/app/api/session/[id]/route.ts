import { NextResponse } from "next/server";
import { act, ActionError, view, type Action } from "@/server/session";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    return NextResponse.json(view(id));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 404 });
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  try {
    const action = (await req.json()) as Action;
    const result = act(id, action);
    return NextResponse.json({ result, view: view(id) });
  } catch (e) {
    const status = e instanceof ActionError ? 400 : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
