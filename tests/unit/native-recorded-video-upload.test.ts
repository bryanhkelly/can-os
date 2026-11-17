import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { classVideoFileSchema, hasVideoSignature, videoUploadPolicy } from "@/domain/class-video";
import { instructionalTrackAssetStorageKey } from "@/domain/instructional-tracks";

const read=(path:string)=>readFileSync(path,"utf8");
const id="12345678-1234-4123-8123-1234567890ab";

describe("native /class recorded-video upload contract",()=>{
  it("accepts only bounded, accurately labeled MP4 or WebM files",()=>{
    const original={fileName:"session-1.mp4",contentType:"video/mp4",size:1024};
    expect(classVideoFileSchema.safeParse(original).success).toBe(true);
    expect(classVideoFileSchema.safeParse({...original,fileName:"session-1.exe"}).success).toBe(false);
    expect(classVideoFileSchema.safeParse({...original,contentType:"text/html"}).success).toBe(false);
    expect(classVideoFileSchema.safeParse({...original,size:videoUploadPolicy.maxBytes+1}).success).toBe(false);
  });

  it("reuses the canonical immutable media key and checks magic bytes",()=>{
    expect(instructionalTrackAssetStorageKey(id)).toBe(
      "learning/instructional-track/"+id);
    const mp4=new Uint8Array(16);
    mp4.set([0x66,0x74,0x79,0x70],4);
    expect(hasVideoSignature("video/mp4",mp4)).toBe(true);
    expect(hasVideoSignature("video/webm",mp4)).toBe(false);
  });

  it("authorizes publisher Course appointment twice and verifies immutable R2 content",()=>{
    const source=read("src/modules/learning/recorded-video-upload.functions.ts");
    expect(source).toContain('capability: "instructional_track.author"');
    expect(source).toContain('eq(courseVersions.lifecycle, "published")');
    expect(source).toContain("verifyPrivateObject({");
    expect(source).toContain("hashPrivateObjectSha256({");
    expect(source).toContain("getCommandContext(getRequest())");
    expect(source).toContain("requireCurrentPublisher(tx,actor,data.courseVersionId)");
    expect(source).toContain("acknowledgedRights:z.literal(true)");
    expect(source).toContain('lifecycle:"draft",publishedAt:null');
    expect(source).toContain("sha256,");
    expect(source).toContain("prior.sha256!==sha256");
    expect(source).not.toContain('lifecycle:"published"');
  });

  it("rejects public playback of draft assets and previews only creator-owned versions",()=>{
    const service=read("src/modules/learning/recorded-video-upload.functions.ts");
    expect(service).toContain("getOwnRecordedVideoPreview");
    expect(service).toContain("terms.uploadedByPersonId!==actor.actorPersonId");
    expect(service).toContain('eq(contentAssetVersions.lifecycle,"draft")');
    expect(service).toContain('method:"GET",key:record');
    const ui=read("src/components/learning/ProviderVideoUploadForm.tsx");
    expect(ui).toContain("getOwnRecordedVideoPreview");
    expect(ui).toContain("<ClassVideoPlayer");
    expect(ui).toContain("Private draft · Review required");
    expect(ui).toContain("createPrivateUploadTask");
    const home=read("src/components/learning/ProviderInstructionHome.tsx");
    expect(home).toContain("<ProviderVideoUploadForm versions={versions}/>");
  });

  it("streams bounded server-side checksums rather than trusting the browser",()=>{
    const storage=read("src/platform/storage/r2.ts");
    expect(storage).toContain("export async function hashPrivateObjectSha256");
    expect(storage).toContain('createHash("sha256")');
    expect(storage).toContain("total>expectedSize");
    expect(storage).toContain('signPrivateObjectUrl({');
  });
});
