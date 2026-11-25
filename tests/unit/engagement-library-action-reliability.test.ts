import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source=readFileSync(new URL("../../src/components/launch-studio/SiteEngagementLibrary.tsx",import.meta.url),"utf8");
describe("Engagement library action reliability",()=>{
  it("fences all mutations synchronously until the request settles",()=>{
    expect(source).toContain("if(pending.current||loading||linksLoading)return false;");
    expect(source.match(/!beginMutation\(\)/g)).toHaveLength(3);
    expect(source.match(/finally\{endMutation\(\);\}/g)).toHaveLength(3);
    expect(source).toContain("pending.current=false;setBusy(false)");
  });
  it("clears prior failures on explicit refresh and blocks stale selection changes",()=>{
    expect(source).toContain('setError("");setMessage("");setConfirmation(null);');
    expect(source).toContain("onClick={refreshLibrary}");
    expect(source).toContain("if(pending.current)return;\n          setSelected");
  });
});
