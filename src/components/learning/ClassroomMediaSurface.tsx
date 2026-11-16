import type { Ref, VideoHTMLAttributes } from "react";
import type { resolveClassVideo } from "@/domain/class-video";

type ResolvedVideo = NonNullable<ReturnType<typeof resolveClassVideo>>;
/** Approved caption tracks must be rights-checked by the supplying media
 * service before rendering. This renderer never fetches or signs caption URLs.
 */
export type ApprovedClassCaptionTrack={
  src:string;language:string;label:string;default?:boolean;
};
function validCaptionTrack(track:ApprovedClassCaptionTrack){
  try{
    const url=new URL(track.src);
    return url.protocol==="https:"&&/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(track.language)
      &&track.label.trim().length>0;
  }catch{return false;}
}
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
  iframeClassName="aspect-video w-full border",captionTracks=[],...events
}:{
  video:ResolvedVideo;
  title:string;
  videoRef?:Ref<HTMLVideoElement>;
  videoClassName?:string;
  iframeClassName?:string;
  captionTracks?:readonly ApprovedClassCaptionTrack[];
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
    {captionTracks.filter(validCaptionTrack).map(track=><track
      key={track.src+":"+track.language}
      kind="captions" src={track.src} srcLang={track.language}
      label={track.label} default={track.default}/>)}
    Your browser does not support video playback.
  </video>;
}
