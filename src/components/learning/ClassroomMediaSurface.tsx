import type { Ref, VideoHTMLAttributes } from "react";
import type { resolveClassVideo } from "@/domain/class-video";

type ResolvedVideo = NonNullable<ReturnType<typeof resolveClassVideo>>;
type VideoEvents = Pick<VideoHTMLAttributes<HTMLVideoElement>,
  "onLoadedMetadata" | "onRateChange" | "onPlay" | "onPause" | "onEnded" | "onError">;

/**
 * Single validated media renderer for learner-led, academic and facilitated
 * playback. The parent controls when media is authorized and loaded.
 * A facilitator/projector may issue commands, but this renderer does not
 * equate those commands with individual completion, attendance or awards.
 */
export function ClassroomMediaSurface({
  video,title,videoRef,videoClassName="aspect-video w-full bg-black",
  iframeClassName="aspect-video w-full border",...events
}:{
  video:ResolvedVideo;
  title:string;
  videoRef?:Ref<HTMLVideoElement>;
  videoClassName?:string;
  iframeClassName?:string;
}&VideoEvents){
  if(video.kind==="embed"){
    return <iframe key={video.src} title={title} src={video.src}
      className={iframeClassName}
      allow="fullscreen; picture-in-picture; encrypted-media"
      allowFullScreen referrerPolicy="no-referrer"/>;
  }
  return <video key={video.src} ref={videoRef} src={video.src}
    playsInline controls preload="metadata" aria-label={title}
    className={videoClassName} {...events}>
    Your browser does not support video playback.
  </video>;
}
