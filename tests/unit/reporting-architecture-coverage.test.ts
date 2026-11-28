import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { REPORTABLE_EVENT_CATALOG } from "@/domain/reportable-event-catalog";

const read = (path: string) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");

describe("reporting event architecture",()=>{
  it("registers every governed source event with the existing outbox worker",()=>{
    const worker=read("src/workers/domain-event-worker.ts");
    const registration = "for (const eventType of Object.keys(REPORTABLE_EVENT_CATALOG))";
    expect(worker).toContain(registration);
    expect(worker).toContain("persistReportingSourceReceipt(eventId)");
    expect(worker).toContain("reportingProjectionEnabled()");
    expect(Object.keys(REPORTABLE_EVENT_CATALOG).length).toBeGreaterThan(10);
  });
  it("does not register a normalized event twice",()=>{
    const worker=read("src/workers/domain-event-worker.ts");
    const passThrough=worker.slice(worker.indexOf("// Lifecycle facts already"),worker.indexOf("// Source-linked events MUST"));
    for(const event of Object.keys(REPORTABLE_EVENT_CATALOG)) expect(passThrough).not.toContain("EventTypes."+event+",");
  });
  it("does not hide unowned retry receipts from Site source-quality counts",()=>{
    const reader=read("src/modules/insights/site-reporting-source-query.server.ts");
    const join=reader.match(/\.leftJoin\(reportingSourceEventReceipts,\s*and\(([\s\S]*?)\)\)\s*\.where/)?.[1] ?? "";
    expect(join).toContain("eq(reportingSourceEventReceipts.eventId, domainEvents.id)");
    expect(join).toContain("eq(reportingSourceEventReceipts.organizationId, site.organizationId)");
    expect(join).toContain("eq(reportingSourceEventReceipts.siteId, site.id)");
    expect(join).toContain("lte(reportingSourceEventReceipts.projectedAt, asOf)");
  });
  it("keeps operational modules on one typed emitter",()=>{
    const paths=[
      "src/modules/programs/site-information-v61.functions.ts",
      "src/modules/programs/site-programs-audiences-v61.functions.ts",
      "src/modules/programs/site-marketing-packages-v61.server.ts",
      "src/modules/programs/site-marketing-artifacts.functions.ts",
      "src/modules/enrollment/interest-events.server.ts",
      "src/modules/operations/site-rooms.server.ts",
      "src/modules/sites/site-content-package.server.ts",
      "src/modules/sites/site-brand.server.ts",
      "src/modules/sites/site-local-content.server.ts",
      "src/modules/sites/site-publication.server.ts",
      "src/modules/sites/academic-program-publication.server.ts",
      "src/modules/programs/program-launch-service.ts",
      "src/modules/communication/engagement-campaigns-service.server.ts",
    ];
    for(const path of paths){
      const src=read(path);
      expect(src, path).toContain("emitReportableChange");
      expect(src, path).not.toContain("emitReportableEvent(");
    }
  });
});
