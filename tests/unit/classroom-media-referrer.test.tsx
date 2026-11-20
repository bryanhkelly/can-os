import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ClassroomMediaSurface } from "@/components/learning/ClassroomMediaSurface";
import { resolveClassVideo } from "@/domain/class-video";

function renderedMedia(url: string) {
  const video = resolveClassVideo(url);
  expect(video).not.toBeNull();
  if (!video) throw new Error("Expected a recognized media source");
  return renderToStaticMarkup(<ClassroomMediaSurface video={video} title="Lesson recording" />);
}

describe("classroom media referrer policy", () => {
  it.each([
    "https://www.youtube.com/watch?v=abcdefghijk",
    "https://youtu.be/abcdefghijk",
    "https://www.youtube-nocookie.com/embed/abcdefghijk",
  ])("sends the site origin to YouTube to prevent player error 153: %s", url => {
    const html = renderedMedia(url);
    expect(html).toContain("https://www.youtube-nocookie.com/embed/abcdefghijk");
    expect(html).toMatch(/referrerpolicy="strict-origin-when-cross-origin"/i);
    expect(html).not.toMatch(/referrerpolicy="no-referrer"/i);
  });

  it("continues suppressing referrers on non-YouTube embeds", () => {
    const html = renderedMedia("https://vimeo.com/12345");
    expect(html).toContain("https://player.vimeo.com/video/12345");
    expect(html).toMatch(/referrerpolicy="no-referrer"/i);
  });

  it("does not change native MP4 playback or expose referrer policy on the video element", () => {
    const html = renderedMedia("https://media.example.test/lesson.mp4?signature=abc");
    expect(html).toContain("<video");
    expect(html).not.toContain("<iframe");
    expect(html).not.toMatch(/referrerpolicy=/i);
  });
});
