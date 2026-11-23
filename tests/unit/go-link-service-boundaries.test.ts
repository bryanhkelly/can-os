import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read=(path:string)=>readFileSync(new URL("../../"+path,import.meta.url),"utf8");
describe("Go Link service boundary and privacy contracts",()=>{
  it("requires the same registry at creation and resolution",()=>{
    const create=read("src/modules/engagement/site-go-links.functions.ts");
    const resolve=read("src/modules/engagement/site-go-links.server.ts");
    expect(create).toContain("inspectGoDestination(");
    expect(resolve).toContain("inspectGoDestination(");
    expect(resolve).toContain("goLinkAvailability(link)");
    expect(create).toContain("authorizedPackage(");
    expect(create).toContain("listAvailableGoDestinations");
    expect(create).toContain("inspectSavedGoLink");
    expect(create).toContain("setSiteGoLinkPaused");
  });
  it("keeps public redirect observation anonymous and non-blocking",()=>{
    const schema=read("src/db/schema/site-go-links.ts");
    const resolver=read("src/modules/engagement/site-go-links.server.ts");
    expect(schema).toContain("siteGoLinkDailyVisits");
    expect(schema).not.toContain("visitorPersonId");
    expect(schema).not.toContain("visitorIpAddress");
    expect(resolver).toContain("onConflictDoUpdate");
    expect(resolver).toContain("catch{");
  });
  it("reads verified registration claims only from the authoritative enrollment source",()=>{
    const evidence=read("src/modules/engagement/go-link-evidence.server.ts");
    expect(evidence).toContain("noncreditSelfEnrollmentClaims.referralCode");
    expect(evidence).toContain("noncreditSelfEnrollmentClaims.siteId");
    expect(evidence).toContain("noncreditSelfEnrollmentClaims.releaseId");
    expect(evidence).toContain('"canonical_noncredit_claim"');
    expect(evidence).toContain('"not_connected"');
    expect(evidence).not.toContain("participantPersonId");
    const editor=read("src/components/launch-studio/GoLinkWorkspace.tsx");
    expect(editor).toContain("Verified outcome attribution is not connected");
    expect(editor).toContain("Test Link does not record a visit");
  });
  it("never expands public short codes to arbitrary redirect destinations",()=>{
    const source=read("src/domain/site-go-links.ts");
    expect(source).not.toContain("z.string().url()");
    expect(source).toContain("goDestinationSchema");
    const resolver=read("src/modules/engagement/site-go-links.server.ts");
    expect(resolver).not.toContain("request.headers.get");
    expect(resolver).not.toContain("referer");
  });
  it("registers the new private aggregate table in ordered SQL migration",()=>{
    const journal=JSON.parse(read("drizzle/meta/_journal.json"));
    const last=journal.entries.at(-1);
    expect(last).toMatchObject({idx:107,tag:"0107_site_go_link_capabilities"});
    const migration=read("drizzle/0107_site_go_link_capabilities.sql");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL");
    expect(migration).toContain("site_go_link_daily_visits");
  });
});
