import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { REPORTABLE_EVENT_CATALOG } from "@/domain/reportable-event-catalog";
import { EventTypes } from "@/domain/event-types";

const read = (path: string) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");

describe("reporting event architecture",()=>{
  it("registers every governed source event with the existing outbox worker",()=>{
    const worker=read("src/workers/domain-event-worker.ts");
    for (const [name,value] of Object.entries(EventTypes)) {
      if (!Object.hasOwn(REPORTABLE_EVENT_CATALOG, value)) continue;
      expect(worker, "Missing worker registration for "+name)
        .toContain("EventTypes."+name);
    }
  });
  it("keeps operational modules on one typed emitter",()=>{
    const paths=[
      "src/modules/programs/site-information-v61.functions.ts",
      "src/modules/programs/site-programs-audiences-v61.functions.ts",
      "src/modules/programs/site-marketing-packages-v61.functions.ts",
      "src/modules/programs/site-marketing-artifacts.functions.ts",
      "src/modules/enrollment/interest-events.server.ts",
      "src/modules/operations/site-rooms.server.ts",
    ];
    for(const path of paths){
      const src=read(path);
      expect(src, path).toContain("emitReportableChange");
      expect(src, path).not.toContain("emitReportableEvent(");
    }
  });
});
