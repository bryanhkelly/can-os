import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read=(path:string)=>readFileSync(new URL("../../"+path,import.meta.url),"utf8");
describe("Canonical public Go Link sharing",()=>{
  it("never uses preview window origin for a public Go Link",()=>{
    const copy=read("src/components/links/CopyLinkButton.tsx");
    expect(copy).toContain('destination.kind==="go"');
    expect(copy).toContain("getCanonicalGoLinkShareOrigin()");
    expect(copy).toContain("loadApprovedOrigin().then");
    expect(copy).toContain('setState("blocked")');
    const server=read("src/modules/engagement/go-link-share-origin.functions.ts");
    expect(server).toContain("CAN_ACCESS_PUBLIC_ORIGIN");
    expect(server).toContain('url.protocol!=="https:"');
  });
});
