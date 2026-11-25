import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {renderSharedSitePreview} from "@/domain/site-preview-sharing";
import {encodeSitePreviewSnapshot,sitePreviewSnapshotDigest,sitePreviewSnapshotKey} from "@/platform/storage/site-preview-snapshots.server";
const site="11111111-1111-4111-8111-111111111111";
const id="22222222-2222-4222-8222-222222222222";
describe("immutable Website R2 preview snapshots",()=>{
  it("stores only scoped private object keys and integrity hashes",()=>{
    const item=encodeSitePreviewSnapshot({"/":"<html>Barton Demo School</html>",
      "/leadership":"<html>Leaders</html>"});
    const key=sitePreviewSnapshotKey(site,id);
    expect(item.digest).toBe(sitePreviewSnapshotDigest(item.text));
    expect(item.paths).toContain("/leadership");
    expect(key).toContain(site+"/"+id+".json");
    expect(()=>encodeSitePreviewSnapshot({"/admin":"private"} as never)).toThrow();
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
  it("keeps external navigation within one Go code and disables private or live actions",()=>{
    const code="K7x2p9AaB3cD";
    const html='<html><head><title>Test</title></head><body><a href="/programs">Programs</a><a href="/admin">Admin</a><a href="https://example.org/enroll">Enroll</a><a href="#main">Skip</a><form action="/enroll"><input name="email"></form></body></html>';
    const out=renderSharedSitePreview(html,code,["/","/programs"]);
    expect(out).toContain('/go/'+code+'?page=%2Fprograms');
    expect(out).not.toContain('/site-preview-share?');
    expect(out).not.toContain('href="/admin"');
    expect(out).not.toContain('href="https://example.org/enroll"');
    expect(out).not.toContain('<form');
    expect(out).toContain('href="#main"');
    expect(out).toContain('noindex,nofollow');
  });
});
