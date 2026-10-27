import { NextResponse } from "next/server";
import { listWard } from "@/server/session";

export function GET() {
  return NextResponse.json(listWard());
}
