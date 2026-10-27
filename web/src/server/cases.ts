import type { CaseDef } from "@/engine/types";
import { getLive, getRecord, livePublished, type CaseRecord } from "./caseStore";

/** Cases on the ward: the newest published version of each. */
export function wardCases(): CaseDef[] {
  return livePublished();
}

/** A specific version (sessions are pinned to the version they started on), or the live one. */
export function getCase(id: string, version?: number): CaseDef {
  return version ? getRecord(id, version).def : getLive(id);
}

export function caseStatus(id: string, version: number): Pick<CaseRecord, "status" | "correctionNote"> {
  const r = getRecord(id, version);
  return { status: r.status, correctionNote: r.correctionNote };
}
