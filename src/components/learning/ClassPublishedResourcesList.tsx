import { Button } from "@/components/ui/button";
import { ClassVideoPlayer } from "@/components/learning/ClassVideoPlayer";
import { SafeClassExternalLink } from "@/components/learning/SafeClassExternalLink";
import { resolveClassVideo } from "@/domain/class-video";
import type { ClassContent } from "@/domain/class-content";

/** One published-resource renderer for both class-level and lesson-level
 * materials. Private downloads remain commands delegated to the authorized
 * Class workspace, rather than fetching signed URLs inside shared UI.
 */
export function ClassPublishedResourcesList({
  items, disabled, onDownload,
}: {
  items: ClassContent["resources"];
  disabled: boolean;
  onDownload: (resourceId:string)=>void|Promise<void>;
}) {
  return <ul className="space-y-3">{items.map(item => <li key={item.id} className=" border p-3 text-sm">
      {item.url && resolveClassVideo(item.url) ? <ClassVideoPlayer title={item.title} url={item.url} resourceId={item.id} declaredVideo={false}/> :
        item.url ? <SafeClassExternalLink url={item.url} title={item.title} kind="external" resourceId={item.id}/> :
        <Button variant="ghost" size="sm" type="button" data-learning-resource-id={item.id} disabled={disabled} onClick={() => void onDownload(item.id)} className="underline">{item.title}</Button>}
    </li>)}</ul>;
}
