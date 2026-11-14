import { useCallback, useRef, useState } from "react";
import { resolveClassVideo, safeClassVideoSourceLink } from "@/domain/class-video";
import { normalizeClientError } from "@/lib/client-error";
import { Play, VideoOff } from "lucide-react";
import { Button } from "@/components/ui/button";

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

function ClassVideoPlayerSession({ title, url, loadUrl, resourceId, declaredVideo = true, presentation = "standard" }: ClassVideoPlayerProps) {
  const initialVideo = !loadUrl && url ? resolveClassVideo(url, declaredVideo) : null;
  const [source, setSource] = useState<string | null>(
    presentation === "classroom" && initialVideo?.kind === "file" ? url ?? null : null,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [playbackRevision, setPlaybackRevision] = useState(0);
  const player = useRef<HTMLVideoElement>(null);
  const attachPlayer = useCallback((element: HTMLVideoElement | null) => {
    player.current = element;
    setReady(Boolean(element && element.readyState >= 1 && Number.isFinite(element.duration)));
    setSpeed(element?.playbackRate ?? 1);
  }, []);
  const inFlight = useRef(false);
  const video = source ? resolveClassVideo(source, true) : url ? resolveClassVideo(url, declaredVideo) : null;
  const sourceLink = safeClassVideoSourceLink(url);
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
      setReady(false);
      setSpeed(1);
    } catch (failure) {
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
  return <section aria-label={`Video: ${title}`} className={presentation === "classroom" ? "classroom-player" : "space-y-3"} data-learning-content>
    {presentation === "standard" && <h3 className="font-semibold">{title}</h3>}
    <div className={presentation === "classroom" ? "classroom-player-screen" : undefined}>
    {!source && (loadUrl || video) && <button type="button" disabled={pending}
      data-learning-resource-id={resourceId} onClick={() => void open()}
      className="flex aspect-video min-h-48 w-full flex-col items-center justify-center gap-4 border bg-muted p-6 text-sm font-semibold hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50">
      <Play aria-hidden="true" className="size-12 text-primary"/>
      <span>{pending ? "Loading video..." : "Play video"}</span>
    </button>}
    {!source && !loadUrl && !video && <ClassVideoPlaceholder title="Recording unavailable" headingLevel={presentation === "classroom" ? 2 : 3}
      message={url ? "This video source is not supported for embedded playback. Use the source link below." : "No video recording has been attached."}/>}
    {source && video?.kind === "embed" && <iframe src={video.src} title={title}
      className="aspect-video w-full rounded border" allow="fullscreen; picture-in-picture; encrypted-media"
      allowFullScreen referrerPolicy="no-referrer" />}
    {source && video?.kind === "file" && <video ref={attachPlayer} key={`${source}:${playbackRevision}`} src={video.src} controls playsInline
      preload="metadata" aria-label={title} className="aspect-video w-full rounded bg-black"
      onLoadedMetadata={event => setReady(Number.isFinite(event.currentTarget.duration))}
      onRateChange={event => setSpeed(event.currentTarget.playbackRate)}
      onError={() => { setReady(false); setError("This video could not be played. Retry playback or check the source format and permissions."); }}>
      Your browser does not support video playback.
    </video>}
    </div>
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
      <button type="button" disabled={pending} onClick={() => { setPlaybackRevision(value => value + 1); setSource(null); void open(); }}
        className="mt-2 underline">Retry playback</button></div>}
  </section>;
}
