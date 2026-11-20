import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FullFlowOperationalRecord } from "./FullFlowOperationalRecord";

vi.mock("@tanstack/react-router", () => ({
  Link: ({to,children}: {to:string;children:ReactNode})=><a href={to}>{children}</a>,
}));
type RecordData=NonNullable<Parameters<typeof FullFlowOperationalRecord>[0]["record"]>;

describe("connected institutional operating record", () => {
  it("does not pretend unavailable records are empty or approved", () => {
    const html=renderToStaticMarkup(<FullFlowOperationalRecord record={null} onRetry={()=>{}}/>);
    expect(html).toContain("could not be loaded");
    expect(html).not.toContain("Refreshed");
    expect(html).not.toContain("0 active students");
  });
  it("renders source-owned totals without implying readiness approval", () => {
    const record={asOf:"2026-11-19T20:00:00.000Z",programs:[],
      totals:{activeProgramStudents:0,placedStudents:0,gradedWork:0,unresolvedGuardianResponses:0}
    } as unknown as RecordData;
    const html=renderToStaticMarkup(<FullFlowOperationalRecord record={record} onRetry={()=>{}}/>);
    expect(html).toContain("Connected school operational record");
    expect(html).toContain("Numbers are not simulated readiness approvals");
    expect(html).toContain("No programs match your current school");
  });
});
