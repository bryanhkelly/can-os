import { Lightbulb, Sparkles } from "lucide-react";
import { WorkspacePanel } from "@/components/workspace";

/**
 * Contextual, read-only companion to Launch Studio's editor.
 * Everything shown here is already available in the current authorized screen.
 * Draft selections are suggestions, never approvals, published claims or facts
 * obtained from another Site.
 */
export type SiteGuideContentV61 = {
  summary?: string;
  highlights?: readonly string[];
  insight?: string;
  connection?: string;
  next?: string;
};

export function SiteGuideV61({ guide }: { guide: SiteGuideContentV61 }) {
  const highlights = (guide.highlights ?? []).filter(Boolean).slice(0, 3);
  return <WorkspacePanel title="Site Guide">
    <div className="space-y-4 text-sm leading-6">
      {(guide.summary || highlights.length > 0) && <section aria-label="Your direction" className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your direction</p>
        {guide.summary && <p>{guide.summary}</p>}
        {highlights.length > 0 && <div className="flex flex-wrap gap-2">
          {highlights.map((item, index) => <span key={index}
            className="border bg-muted px-2 py-1 text-xs leading-5">{item}</span>)}
        </div>}
      </section>}
      {guide.insight && <section aria-label="Worth considering" className="border-t pt-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Lightbulb aria-hidden="true" className="size-4 text-primary"/>Worth considering
        </h3>
        <p className="mt-2 text-muted-foreground">{guide.insight}</p>
      </section>}
      {guide.connection && <section aria-label="How this connects" className="border-t pt-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles aria-hidden="true" className="size-4 text-primary"/>How this connects
        </h3>
        <p className="mt-2 text-muted-foreground">{guide.connection}</p>
      </section>}
      {guide.next && <section aria-label="What comes next" className="border-t pt-4">
        <h3 className="text-sm font-semibold">What comes next</h3>
        <p className="mt-1 text-muted-foreground">{guide.next}</p>
      </section>}
    </div>
  </WorkspacePanel>;
}
