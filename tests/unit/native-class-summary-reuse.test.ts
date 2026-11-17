import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read=(path:string)=>readFileSync(new URL(`../../${path}`,import.meta.url),"utf8");

describe("shared native Class summary",()=>{
  it("uses the existing 6.1 facts and status components without creating another route",()=>{
    const summary=read("src/components/learning/NativeClassSummary.tsx");
    expect(summary).toContain('import { RecordFacts, StatusBadge } from "@/components/workspace"');
    expect(summary).toContain('<Link to="/class/$classId"');
    expect(summary).toContain('search={{view:"manage",tab:"overview"}}');
    expect(summary).toContain("children");
    expect(summary).not.toContain("createServerFn");
    expect(summary).not.toContain("createFileRoute");
    expect(summary).not.toContain("useQuery");
  });

  it("keeps operator commands in the authorized manager, not the reusable summary",()=>{
    const manager=read("src/components/learning/NativeClassManager.tsx");
    const summary=read("src/components/learning/NativeClassSummary.tsx");
    expect(manager).toContain("<NativeClassSummary");
    expect(manager).toContain("activateUnifiedClass");
    expect(manager).toContain("publishUnifiedClassOffering");
    expect(manager).toContain("closeUnifiedClassOffering");
    expect(summary).not.toContain("activateUnifiedClass");
    expect(summary).not.toContain("publishUnifiedClassOffering");
  });

  it("reuses the same summary in the Site handoff without broadening its reads",()=>{
    const handoff=read("src/components/launch-studio/SiteNativeClassHandoff.tsx");
    expect(handoff).toContain("<NativeClassSummary item={item}>");
    expect(handoff).toContain("getMyUnifiedClassDrafts({data:{siteId:canonicalSiteId!}})");
    expect(handoff).toContain("Assign a Class facilitator");
    expect(handoff).toContain("Review Sessions");
    expect(handoff).not.toContain("resolveSiteClassLink");
  });
});
