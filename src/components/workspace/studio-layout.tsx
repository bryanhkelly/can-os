import type { ReactNode } from "react";
/** Shared editor geometry, not a builder engine. All slots are route-owned.
 * No nested main; narrow screens preserve reading and focus order. */
export function StudioLayout({ navigation, canvas, inspector, toolbar, footer, navigationLabel = "Editor sections", canvasLabel = "Editing canvas", inspectorLabel = "Properties and preview" }: {
  navigation: ReactNode; canvas: ReactNode; inspector?: ReactNode; toolbar?: ReactNode; footer?: ReactNode;
  navigationLabel?: string; canvasLabel?: string; inspectorLabel?: string;
}) {
  return <div className="min-w-0 space-y-4">
    {toolbar && <div role="group" aria-label="Editor actions" className="flex min-w-0 flex-wrap items-center gap-3 border bg-card p-4">{toolbar}</div>}
    <div className={inspector ? "grid min-w-0 items-start gap-4 xl:grid-cols-[14rem_minmax(0,1fr)_17rem]" : "grid min-w-0 items-start gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]"}>
      <nav aria-label={navigationLabel} className="min-w-0 border bg-card p-4">{navigation}</nav>
      <section aria-label={canvasLabel} className="min-w-0 border bg-card p-4 sm:p-6">{canvas}</section>
      {inspector && <aside aria-label={inspectorLabel} className="min-w-0 border bg-card p-4">{inspector}</aside>}
    </div>
    {footer && <div className="border-t pt-4">{footer}</div>}
  </div>;
}
