import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ClassVideoPlayer } from "@/components/learning/ClassVideoPlayer";
import { classVideoFileSchema, classVideoKey, classVideoKeyPattern, hasVideoSignature, resolveClassVideo, videoUploadPolicy } from "@/domain/class-video";

describe("linked class video", () => {
  it.each([
    ["https://www.youtube.com/watch?v=abcdefghijk", "https://www.youtube-nocookie.com/embed/abcdefghijk"],
    ["https://youtu.be/abcdefghijk?si=tracking", "https://www.youtube-nocookie.com/embed/abcdefghijk"],
    ["https://m.youtube.com/shorts/abcdefghijk", "https://www.youtube-nocookie.com/embed/abcdefghijk"],
    ["https://www.youtube-nocookie.com/embed/abcdefghijk", "https://www.youtube-nocookie.com/embed/abcdefghijk"],
    ["https://vimeo.com/12345", "https://player.vimeo.com/video/12345"],
    ["https://vimeo.com/12345/abc123", "https://player.vimeo.com/video/12345?h=abc123"],
    ["https://player.vimeo.com/video/12345?h=abc123", "https://player.vimeo.com/video/12345?h=abc123"],
  ])("normalizes provider URL %s", (url, src) => {
    expect(resolveClassVideo(url)).toEqual({ kind: "embed", src });
  });
  it.each([
    "javascript:alert(1)", "http://vimeo.com/12345", "https://youtube.com.evil.test/watch?v=abcdefghijk",
    "https://youtube.com@evil.test/watch?v=abcdefghijk", "https://www.youtube.com/watch?v=invalid",
    "https://player.vimeo.com/video/not-an-id", "https://vimeo.com/123?h=<script>",
    "https://example.test/not-a-video", "https://youtu.be:444/abcdefghijk", "not a url",
  ])("does not embed unsafe or unrecognized URL %s", url => {
    expect(resolveClassVideo(url)).toBeNull();
  });
  it("supports direct video files, signed querystrings and explicit stream resources", () => {
    expect(resolveClassVideo("https://media.test/lesson.MP4?signature=abc")).toEqual({
      kind: "file", src: "https://media.test/lesson.MP4?signature=abc",
    });
    expect(resolveClassVideo("https://private.test/object?signature=abc", true)?.kind).toBe("file");
    expect(resolveClassVideo("https://media.test/movie.webm")?.kind).toBe("file");
  });
  it("does not load third-party frames or media before explicit playback", () => {
    const markup = renderToStaticMarkup(<ClassVideoPlayer title="Lesson video" url="https://youtu.be/abcdefghijk"/>);
    expect(markup).toContain("Play video");
    expect(markup).toContain("Open Lesson video at source");
    expect(markup).not.toContain("<iframe");
    expect(markup).not.toContain("<video");
    const privateMarkup = renderToStaticMarkup(<ClassVideoPlayer title="Private lesson" loadUrl={async () => "https://private.test/movie"}/>);
    expect(privateMarkup).toContain("Play video");
    expect(privateMarkup).not.toContain("private.test");
  });
});

describe("class video upload policy", () => {
  const file = { fileName: "lesson.mp4", contentType: "video/mp4", size: 16 };
  it("enforces the exact 500 MiB ceiling and minimum sample size", () => {
    expect(videoUploadPolicy.maxBytes).toBe(524288000);
    expect(classVideoFileSchema.safeParse({ ...file, size: 524288000 }).success).toBe(true);
    expect(classVideoFileSchema.safeParse({ ...file, size: 524288001 }).success).toBe(false);
    expect(classVideoFileSchema.safeParse({ ...file, size: 15 }).success).toBe(false);
    expect(classVideoFileSchema.safeParse({ ...file, size: 16.5 }).success).toBe(false);
  });
  it("rejects mismatched extensions, unapproved MIME types and blank file names", () => {
    for (const change of [{ fileName: "movie.html" }, { contentType: "video/quicktime" }, { fileName: "" },
      { fileName: "movie.webm" }]) expect(classVideoFileSchema.safeParse({ ...file, ...change }).success).toBe(false);
    expect(classVideoFileSchema.safeParse({ fileName: "movie.webm", contentType: "video/webm", size: 100 }).success).toBe(true);
  });
  it("checks MP4 and WebM container signatures", () => {
    const mp4 = new Uint8Array(16); mp4.set([0x66,0x74,0x79,0x70],4);
    const webm = new Uint8Array(16); webm.set([0x1a,0x45,0xdf,0xa3]);
    expect(hasVideoSignature("video/mp4",mp4)).toBe(true);
    expect(hasVideoSignature("video/webm",webm)).toBe(true);
    expect(hasVideoSignature("video/mp4",webm)).toBe(false);
    expect(hasVideoSignature("video/webm",mp4)).toBe(false);
    expect(hasVideoSignature("video/mp4",mp4.slice(0,8))).toBe(false);
    expect(hasVideoSignature("text/html",mp4)).toBe(false);
  });
  it("binds private keys to uploader, class, pinned version and resource", () => {
    const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
    const key = classVideoKey(id(1),id(2),id(3),id(4));
    expect(classVideoKeyPattern.test(key)).toBe(true);
    expect(key).not.toBe(classVideoKey(id(5),id(2),id(3),id(4)));
    expect(key).not.toBe(classVideoKey(id(1),id(5),id(3),id(4)));
    expect(key).not.toBe(classVideoKey(id(1),id(2),id(5),id(4)));
  });
});
