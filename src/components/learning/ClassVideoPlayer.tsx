import { useCallback, useEffect, useRef, useState } from "react";
import { resolveClassVideo, safeClassVideoSourceLink } from "@/domain/class-video";
import { ClassroomMediaSurface, type ApprovedClassCaptionTrack } from "@/components/learning/ClassroomMediaSurface";
import { normalizeClientError } from "@/lib/client-error";
import { Play, VideoOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isSharedDeviceMode } from "@/domain/session-client";
import { advanceNativeVideoProgress, nativeVideoCoverage, normalizeNativeVideoProgress, type NativeVideoProgress } from "@/domain/native-video-progress";

export function ClassVideoPlaceholder({ title, message, headingLevel = 2 }: {
  title: string; message: string; headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return <div className="flex aspect-video min-h-48 flex-col items-center justify-center gap-4 border bg-muted px-6 py-8 text-center" role="status">
    <VideoOff aria-hidden="true" className="size-10 text-muted-foreground"/>
    <div><Heading className="font-serif text-2xl font-semibold">{title}</Heading>
      <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">{message}</p></div>
  </div>;
}

type ClassVideoPlayerProps = {
  title: string;
  url?: string | null;
  loadUrl?: () => Promise<string>;
  resourceId?: string;
  declaredVideo?: boolean;
  presentation?: "standard" | "classroom";
  captionTracks?: readonly ApprovedClassCaptionTrack[];
  /** Observations only. External embeds do not prove playback or watch time. */
  onPlaybackEvent?: (kind: "video_opened" | "video_played" | "video_paused" | "video_ended", resourceId: string) => void;
  /** Observational watch-heartbeat from focused, genuinely advancing native playback; never attendance. */
  onVideoEngagement?: (durationMs: number) => void;
  /** Scoped by course attempt and asset ID; stored locally, never as academic credit. */
  resumeKey?: string;
  /** Optional non-sensitive playback failure diagnostic. */
  onPlaybackError?: (reason: "load" | "media") => void;
};

export function ClassVideoPlayer(props: ClassVideoPlayerProps) {
  // React may retain this component when a teacher replaces the URL of the
  // same resource. Re-key internal playback state rather than displaying an
  // old video or retaining a signed URL from the previous source.
  const sourceIdentity = [
    props.resourceId ?? props.title,
    props.url ?? "",
    props.declaredVideo ?? true,
    props.presentation ?? "standard",
  ].join("|");
  return <ClassVideoPlayerSession key={sourceIdentity} {...props}/>;
}

function ClassVideoPlayerSession({ title, url, loadUrl, resourceId, declaredVideo = true, presentation = "standard", onPlaybackEvent, onVideoEngagement, resumeKey, onPlaybackError, captionTracks = [] }: ClassVideoPlayerProps) {
  // Do not fetch third-party media or private signed URLs during SSR or on
  // initial navigation. Even preload="metadata" initiates a network request.
  // All formats, including direct MP4/WebM, require a deliberate Play action.
  const [source, setSource] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [playbackRevision, setPlaybackRevision] = useState(0);
  const player = useRef<HTMLVideoElement>(null);
  const [progress, setProgress] = useState<NativeVideoProgress | null>(null);
  const progressRef = useRef<NativeVideoProgress | null>(null);
  const persistenceBlocked = useRef(false);
  const lastPosition = useRef<{position:number;at:number} | null>(null);
  const persistedAt = useRef(0);
  const progressStorageKey = resumeKey && resourceId
    ? "can-native-video-progress:" + resumeKey + ":" + resourceId : null;

  // Shared devices never retain video bookmarks in durable browser storage.
  // Existing CAN account-handoff/sign-out cleanup clears both storage areas.
  const flushProgress = useCallback(() => {
    if (!progressStorageKey || persistenceBlocked.current) return;
    let next = progressRef.current;
    const element = player.current;
    if (next && element && Number.isFinite(element.currentTime) &&
        Number.isFinite(element.duration) && Math.abs(next.duration-element.duration) <= 1) {
      next = advanceNativeVideoProgress(next, element.currentTime, element.currentTime,
        element.duration, 0, false);
      if (next) progressRef.current = next;
    }
    if (!next) return;
    try {
      const storage = isSharedDeviceMode() ? window.sessionStorage : window.localStorage;
      storage.setItem(progressStorageKey, JSON.stringify(next));
      persistedAt.current = Date.now();
    } catch { /* Browser storage is optional. Never block lesson playback. */ }
  }, [progressStorageKey]);

  useEffect(() => {
    persistenceBlocked.current = false;
    progressRef.current = null;
    lastPosition.current = null;
    persistedAt.current = 0;
    if (!progressStorageKey) { setProgress(null); return; }
    try {
      const storage = isSharedDeviceMode() ? window.sessionStorage : window.localStorage;
      const raw = storage.getItem(progressStorageKey);
      const restored = raw ? normalizeNativeVideoProgress(JSON.parse(raw)) : null;
      if (raw && !restored) storage.removeItem(progressStorageKey);
      progressRef.current = restored;
      setProgress(restored);
    } catch { setProgress(null); }
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushProgress();
    };
    const onPageHide = () => flushProgress();
    const onAccountHandoff = () => {
      persistenceBlocked.current = true;
      progressRef.current = null;
      lastPosition.current = null;
    };
    window.addEventListener("can:clear-learning-video", onAccountHandoff);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      flushProgress();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("can:clear-learning-video", onAccountHandoff);
    };
  }, [progressStorageKey, flushProgress]);

  function observePosition(element: HTMLVideoElement) {
    if (!progressStorageKey || !Number.isFinite(element.duration) || element.duration <= 0) return;
    const now = Date.now(), previous = lastPosition.current;
    const position = element.currentTime;
    lastPosition.current = {position,at:now};
    if (!previous) return;
    const next = advanceNativeVideoProgress(
      progressRef.current, previous.position, position, element.duration,
      (now-previous.at)/1000,
      !element.paused && !element.seeking && element.readyState >= 3 &&
        document.visibilityState === "visible" && document.hasFocus(), now,
    );
    if (!next) return;
    progressRef.current = next;
    setProgress(next);
    if (now - persistedAt.current >= 4_000 || element.ended) flushProgress();
  }
  function resumeSavedPosition() {
    const element = player.current;
    const saved = progressRef.current;
    if (!element || !saved || !Number.isFinite(element.duration) ||
        Math.abs(saved.duration - element.duration) > 1 ||
        saved.position < 10 || saved.position >= element.duration - 5) return;
    element.currentTime = saved.position;
    lastPosition.current = {position:saved.position,at:Date.now()};
  }
  const attachPlayer = useCallback((element: HTMLVideoElement | null) => {
    player.current = element;
    setReady(Boolean(element && element.readyState >= 1 && Number.isFinite(element.duration)));
    setSpeed(element?.playbackRate ?? 1);
  }, []);
  const inFlight = useRef(false);
  const video = source ? resolveClassVideo(source, true) : url ? resolveClassVideo(url, declaredVideo) : null;
  const sourceLink = safeClassVideoSourceLink(url);
  // Actual native media playback can be hands-free. Track short observed
  // intervals only while the tab is foreground, media is advancing and playback
  // is not paused/seeking/buffering. Embedded YouTube/Vimeo cannot be verified.
  // Event time is bounded again by the server and never grants attendance.
  useEffect(() => {
    if (!source || video?.kind !== "file" || !onVideoEngagement) return;
    let lastWall = Date.now();
    let lastMedia = player.current?.currentTime ?? 0;
    const check = () => {
      const element = player.current;
      const now = Date.now();
      const media = element?.currentTime ?? 0;
      if (!element || element.paused || element.ended || element.seeking ||
          element.readyState < 3 || document.visibilityState !== "visible" ||
          !document.hasFocus() || !Number.isFinite(media)) {
        lastWall = now; lastMedia = media;
        return;
      }
      const elapsed = now - lastWall;
      const advanced = (media - lastMedia) * 1000;
      if (elapsed >= 25_000) {
        if (advanced >= 1_000 && elapsed <= 90_000) {
          const bounded = Math.floor(Math.min(elapsed, advanced, 60_000));
          if (bounded > 0) onVideoEngagement(bounded);
        }
        lastWall = now; lastMedia = media;
      }
    };
    const timer = window.setInterval(check, 5_000);
    return () => window.clearInterval(timer);
  }, [source, video?.kind, onVideoEngagement]);
  async function open() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError("");
    try {
      const next = loadUrl ? await loadUrl() : url;
      if (!next || !resolveClassVideo(next, declaredVideo)) {
        setError("This video source is not supported. Use a YouTube, Vimeo or direct HTTPS video link.");
        return;
      }
      setSource(next);
      // Only native media offers locally observable playback. An embedded
      // provider launch is not evidence of viewing.
      if (resourceId && resolveClassVideo(next, declaredVideo)?.kind === "file")
        onPlaybackEvent?.("video_opened", resourceId);
      setReady(false);
      setSpeed(1);
    } catch (failure) {
      onPlaybackError?.("load");
      setError(normalizeClientError(failure, "Unable to load this video. Retry playback.").message);
    } finally { inFlight.current = false; setPending(false); }
  }
  function seek(seconds: number) {
    const element = player.current;
    if (!element || !ready) return;
    element.currentTime = Math.max(0, Math.min(element.duration, element.currentTime + seconds));
  }
  function changeSpeed() {
    const element = player.current;
    if (!element || !ready) return;
    const rates = [1, 1.25, 1.5, 2, 0.75];
    const next = rates[(rates.indexOf(element.playbackRate) + 1) % rates.length]!;
    element.playbackRate = next;
    setSpeed(next);
  }
  return <section aria-label={`Video: ${title}`} className={presentation === "classroom" ? "classroom-player" : "space-y-3"} data-learning-content data-learning-video-player>
    {presentation === "standard" && <h3 className="font-semibold">{title}</h3>}
    <div className={presentation === "classroom" ? "classroom-player-screen" : undefined}>
    {!source && (loadUrl || video) && <Button variant="outline" type="button" disabled={pending}
      data-learning-resource-id={resourceId} onClick={() => void open()}
      className="flex aspect-video min-h-48 w-full flex-col items-center justify-center gap-4 border bg-muted p-6 text-sm font-semibold hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50">
      <Play aria-hidden="true" className="size-12 text-primary"/>
      <span>{pending ? "Loading video..." : "Play video"}</span>
    </Button>}
    {!source && !loadUrl && !video && <ClassVideoPlaceholder title="Recording unavailable" headingLevel={presentation === "classroom" ? 2 : 3}
      message={url
        ? sourceLink
          ? "This video source is not supported for embedded playback. Use the source link below."
          : "This video source is unavailable or unsafe. Ask your school to replace the link."
        : "No video recording has been attached."}/>}
    {source && video && <ClassroomMediaSurface key={source+":"+playbackRevision}
      video={video} title={title} videoRef={attachPlayer} captionTracks={captionTracks}
      iframeClassName="aspect-video w-full  border"
      videoClassName="aspect-video w-full  bg-black"
      onLoadedMetadata={event => setReady(Number.isFinite(event.currentTarget.duration))}
      onTimeUpdate={event => observePosition(event.currentTarget)}
      onSeeked={event => { observePosition(event.currentTarget); flushProgress(); lastPosition.current = {position:event.currentTarget.currentTime,at:Date.now()}; }}
      onRateChange={event => setSpeed(event.currentTarget.playbackRate)}
      onPlay={() => { if (resourceId) onPlaybackEvent?.("video_played", resourceId); }}
      onEnded={() => { flushProgress(); if (resourceId) onPlaybackEvent?.("video_ended", resourceId); }}
      onPause={event => { observePosition(event.currentTarget); flushProgress(); if (resourceId && !event.currentTarget.ended) onPlaybackEvent?.("video_paused", resourceId); }}
      onError={() => { onPlaybackError?.("media"); setReady(false); setError("This video could not be played. Retry playback or check the source format and permissions."); }}
    />}
    </div>
    {source && video?.kind === "file" && ready && progress && progress.position >= 10 && progress.position < progress.duration - 5 &&
      Math.abs(progress.duration - (player.current?.duration ?? 0)) <= 1 &&
      <div className="flex flex-wrap items-center gap-3 border-t px-3 py-2 text-xs">
        <Button variant="outline" size="sm" type="button" onClick={resumeSavedPosition}>Resume at {Math.floor(progress.position / 60)}:{String(Math.floor(progress.position % 60)).padStart(2, "0")}</Button>
        <span className="text-muted-foreground">Approximately {nativeVideoCoverage(progress)}% of this video observed in this browser. Not academic completion.</span>
      </div>}
    {presentation === "classroom" && <div className="classroom-player-footer">
      <div className="min-w-0">{presentation === "classroom" ? <h2 className="text-xs font-semibold">{title}</h2> : <h3 className="text-xs font-semibold">{title}</h3>}
        <p className="mt-1 text-3xs text-muted-foreground">{video?.kind === "embed" ? "Playback controls are provided by the video provider." : "Pause, replay, and review at your own pace."}</p></div>
      {video?.kind === "file" && <div className="flex items-center gap-2" role="group" aria-label="Playback controls">
        <Button size="sm" variant="outline" disabled={!ready || Boolean(error)} onClick={() => seek(-10)} aria-label="-10s, back ten seconds">-10s</Button>
        <Button size="sm" variant="outline" disabled={!ready || Boolean(error)} onClick={() => seek(10)} aria-label="+10s, forward ten seconds">+10s</Button>
        <Button size="sm" variant="outline" disabled={!ready || Boolean(error)} onClick={changeSpeed} aria-label={`${speed}x, change playback speed, current speed ${speed} times`}>{speed}x</Button>
      </div>}
    </div>}
    {sourceLink && <a href={sourceLink} target="_blank" rel="noopener noreferrer" data-learning-resource-id={resourceId}
      aria-label={`Open ${presentation === "classroom" ? "video" : title} at source: ${title}`}
      className={presentation === "classroom" ? "block border-t px-4 py-2 text-3xs text-muted-foreground underline" : "block text-xs underline"}>Open {presentation === "classroom" ? "video" : title} at source</a>}
    {error && <div role="alert" className="text-sm"><p>{error}</p>
      <Button variant="ghost" type="button" disabled={pending} onClick={() => { setPlaybackRevision(value => value + 1); setSource(null); void open(); }}
        className="mt-2 underline">Retry playback</Button></div>}
  </section>;
}
