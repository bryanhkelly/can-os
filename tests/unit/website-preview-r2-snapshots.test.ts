import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {readSitePreviewShares,sitePreviewShareSchema,createPreviewShareToken,activePreviewShare} from "@/domain/site-preview-sharing";
import {encodeSitePreviewSnapshot,sitePreviewSnapshotDigest,sitePreviewSnapshotKey} from "@/platform/storage/site-preview-snapshots.server";
const site="11111111-1111-4111-8111-111111111111";
const id="22222222-2222-4222-8222-222222222222";
const old={id,tokenDigest:"a".repeat(64),createdAt:"2026-11-20T10:00:00.000Z",
  expiresAt:null,revokedAt:null,sourceRevision:4,pages:{"/":"<html>Legacy</html>"}};
describe("immutable Website R2 preview snapshots",()=>{
  it("reads old inline HTML shares unchanged",()=>{
    expect(sitePreviewShareSchema.safeParse(old).success).toBe(true);
    expect(readSitePreviewShares({websitePreviewSharesV1:[old]})).toHaveLength(1);
  });
  it("stores only scoped private object keys and integrity hashes",()=>{
    const item=encodeSitePreviewSnapshot({"/":"<html>Barton Demo School</html>",
      "/leadership":"<html>Leaders</html>"});
    const key=sitePreviewSnapshotKey(site,id);
    expect(item.digest).toBe(sitePreviewSnapshotDigest(item.text));
    expect(item.paths).toContain("/leadership");
    expect(key).toContain(site+"/"+id+".json");
    const share={...old,pages:undefined,snapshotKey:key,
      snapshotDigest:item.digest,snapshotPaths:item.paths};
    expect(sitePreviewShareSchema.safeParse(share).success).toBe(true);
    expect(sitePreviewShareSchema.safeParse({...share,pages:old.pages}).success).toBe(false);
    expect(sitePreviewShareSchema.safeParse({...share,snapshotPaths:["/admin"]}).success).toBe(false);
  });
  it("preserves token revocation and legacy compatibility",()=>{
    const {token,tokenDigest}=createPreviewShareToken();
    const share={...old,tokenDigest};
    expect(activePreviewShare([share],token,new Date("2026-11-20T10:01:00Z"))).not.toBeNull();
    expect(activePreviewShare([{...share,revokedAt:"2026-11-20T10:01:00.000Z"}],
      token,new Date("2026-11-20T10:02:00Z"))).toBeNull();
  });
  it("shares the saved full website, with immutable private storage",()=>{
    const writer=readFileSync("src/modules/sites/site-preview-sharing.functions.ts","utf8");
    const reader=readFileSync("src/modules/engagement/go-destination-registry.server.ts","utf8");
    const bucket=readFileSync("src/platform/storage/site-preview-snapshots.server.ts","utf8");
    expect(writer).toContain('getPartnerWebsitePreview(actor,undefined,"external-preview")');
    expect(writer).toContain("sitePreviewSnapshotKey(site.id,shareId)");
    expect(writer).toContain("writeSitePreviewSnapshot");
    expect(writer).not.toContain("projectShareableSitePreview({");
    expect(reader).toContain("readSitePreviewSnapshot");
    expect(bucket).toContain("etagDoesNotMatch");
    expect(bucket).toContain("sitePreviewSnapshotDigest(text)!==digest");
  });
});
