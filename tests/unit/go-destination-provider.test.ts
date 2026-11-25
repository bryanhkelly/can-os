import {beforeEach,describe,expect,it,vi} from "vitest";
vi.mock("@/platform/storage/site-preview-snapshots.server",()=>({
  sitePreviewSnapshotKey:vi.fn((site:string,id:string)=>site+"/"+id),
  readSitePreviewSnapshot:vi.fn(),
}));
import {readSitePreviewSnapshot} from "@/platform/storage/site-preview-snapshots.server";
import {goDestinationKinds} from "@/domain/site-go-links";
import {executeSiteGoDestination,goDestinationAuthoring,inspectGoDestination,listGoDestinationChoices} from "@/modules/engagement/go-destination-registry.server";

const site="11111111-1111-4111-8111-111111111111";
const snapshotId="22222222-2222-4222-8222-222222222222";
const code="K7x2p9AaB3cD";
const destination={kind:"website-preview" as const,snapshotId,snapshotDigest:"a".repeat(64),sourceRevision:3,brandVersionId:site};
const home='<html><head><title>Test</title></head><body><a href="/programs">Programs</a></body></html>';
describe("Go destination provider dispatch",()=>{
  beforeEach(()=>vi.resetAllMocks());
  it("registers authoring for every declared destination kind",()=>{
    expect(goDestinationKinds.map(kind=>goDestinationAuthoring(kind))).toEqual([
      "catalog","catalog","catalog","catalog","catalog","specialized",
    ]);
  });
  it("does not offer specialized snapshots in generic authoring",async()=>{
    expect(await listGoDestinationChoices(site,"website-preview")).toEqual([]);
  });
  it("renders an immutable snapshot through its provider",async()=>{
    vi.mocked(readSitePreviewSnapshot).mockResolvedValue({"/":home,"/programs":home});
    const result=await executeSiteGoDestination(site,destination,code);
    expect(result?.mode).toBe("website-preview");
    if(result?.mode==="website-preview")expect(result.html).toContain("/go/"+code+"?page=%2Fprograms");
    expect(readSitePreviewSnapshot).toHaveBeenCalledWith(site+"/"+snapshotId,destination.snapshotDigest);
  });
  it("fails closed for missing artifacts, private paths and malformed payloads",async()=>{
    vi.mocked(readSitePreviewSnapshot).mockResolvedValue(null);
    expect(await executeSiteGoDestination(site,destination,code)).toBeNull();
    expect((await inspectGoDestination(site,destination,code)).available).toBe(false);
    vi.mocked(readSitePreviewSnapshot).mockClear();
    expect(await executeSiteGoDestination(site,destination,code,"/admin")).toBeNull();
    expect(await executeSiteGoDestination(site,{kind:"website-preview"},code)).toBeNull();
    expect(readSitePreviewSnapshot).not.toHaveBeenCalled();
  });
});
