import { z } from "zod";

export const videoUploadPolicy = {
  contentTypes: ["video/mp4", "video/webm"],
  minBytes: 16,
  maxBytes: 500 * 1024 * 1024,
};
export const classVideoFileSchema = z.object({
  fileName: z.string().trim().min(1).max(150),
  contentType: z.enum(["video/mp4", "video/webm"]),
  size: z.number().int().min(videoUploadPolicy.minBytes).max(videoUploadPolicy.maxBytes),
}).refine(value => value.contentType === "video/mp4" ? /\.mp4$/i.test(value.fileName) : /\.webm$/i.test(value.fileName),
  "Choose an MP4 or WebM file with a matching file extension.");

export const classVideoKeyPattern = /^learning\/videos\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/i;
export function classVideoKey(personId: string, sectionId: string, versionId: string, resourceId: string) {
  return `learning/videos/${personId}/${sectionId}/${versionId}/${resourceId}`;
}

export function hasVideoSignature(type: string, bytes: Uint8Array) {
  if (bytes.length < 16) return false;
  return type === "video/mp4"
    ? String.fromCharCode(...bytes.slice(4, 8)) === "ftyp"
    : type === "video/webm" && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
}

/** A fallback source link is navigation, not permission to load arbitrary URLs. */
export function safeClassVideoSourceLink(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port
      ? url.href : null;
  } catch {
    return null;
  }
}

/** Only canonical provider embeds are framed; arbitrary sites remain external links. */
export function resolveClassVideo(value: string, declaredVideo = false):
  { kind: "embed" | "file"; src: string } | null {
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  if (["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtube-nocookie.com"].includes(host)) {
    const id = host === "youtu.be" ? url.pathname.slice(1) :
      url.pathname === "/watch" ? url.searchParams.get("v") :
      /^\/(?:embed|shorts|live)\/([^/]+)$/.exec(url.pathname)?.[1];
    return id && /^[A-Za-z0-9_-]{11}$/.test(id)
      ? { kind: "embed", src: `https://www.youtube-nocookie.com/embed/${id}` } : null;
  }
  if (["vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(host)) {
    const match = /^\/(?:video\/)?(\d+)(?:\/([A-Za-z0-9]+))?$/.exec(url.pathname);
    if (!match) return null;
    const hash = match[2] ?? url.searchParams.get("h");
    if (hash && !/^[A-Za-z0-9]+$/.test(hash)) return null;
    return { kind: "embed", src: `https://player.vimeo.com/video/${match[1]}${hash ? `?h=${hash}` : ""}` };
  }
  return declaredVideo || /\.(mp4|webm)$/i.test(url.pathname) ? { kind: "file", src: url.href } : null;
}
