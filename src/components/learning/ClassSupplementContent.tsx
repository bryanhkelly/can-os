import { Button } from "@/components/ui/button";
import { ClassVideoPlayer } from "@/components/learning/ClassVideoPlayer";
import { SafeClassExternalLink } from "@/components/learning/SafeClassExternalLink";
import { CommonCartridgeStaticLesson } from "@/components/learning/CommonCartridgeStaticLesson";
import { resolveClassVideo } from "@/domain/class-video";
import type { getClassWorkspace } from "@/modules/learning/class-workspace.functions";

type Workspace = Awaited<ReturnType<typeof getClassWorkspace>>;
export type ClassSupplement = NonNullable<Workspace["supplements"]>[number];

/** Common display for course, lesson, and recorded-stage supplements.
 * Private resource reads are delegated to the authorized Class workspace.
 * This component never requests another learner's download permission.
 */
export function ClassSupplementContent({
  item, presentation = "standard", programId, sectionId, disabled,
  loadPrivateUrl, onDownload,
}: {
  item: ClassSupplement;
  presentation?: "standard" | "classroom";
  programId: string;
  sectionId: string;
  disabled: boolean;
  loadPrivateUrl: (supplementId: string) => Promise<string>;
  onDownload: (supplementId: string) => void | Promise<void>;
}) {
  if (item.kind === "video" || (item.url && resolveClassVideo(item.url))) {
    return <ClassVideoPlayer key={`${item.id}:${item.url ?? item.resourceId}`}
      title={item.title} presentation={presentation}
      url={item.url} loadUrl={!item.url ? () => loadPrivateUrl(item.id) : undefined}/>;
  }
  if (item.url) return <SafeClassExternalLink url={item.url} title={item.title} kind={item.kind}/>;
  if (item.kind === "html" && item.resourceId) return <CommonCartridgeStaticLesson
    programId={programId} sectionId={sectionId} resourceId={item.resourceId}/>;
  if (item.kind === "pdf") return <Button variant="ghost" size="sm" type="button"
    disabled={disabled} onClick={() => void onDownload(item.id)}
    className="underline disabled:opacity-50">{item.title} (private PDF)</Button>;
  return <span>{item.title} (unavailable document)</span>;
}
