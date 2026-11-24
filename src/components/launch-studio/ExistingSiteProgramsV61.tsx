import { compactUuidUrlValue } from "@/domain/opaque-url-id";
import { WorkspacePanel, WorkspaceNotice, StatusBadge } from "@/components/workspace";
import {
  existingSiteProgramPresentation,
  type ExistingSiteProgramsStateV61,
} from "@/domain/site-existing-programs-v61";

/**
 * One presentation for the Site's actual canonical Programs in both Launch
 * Overview and Establish. Planning interests never write to these records.
 */
export function ExistingSiteProgramsV61({ result, siteId, onOverview = false }: {
  result: ExistingSiteProgramsStateV61;
  siteId: string;
  onOverview?: boolean;
}) {
  const editHref = "/launch/site?siteId=" + compactUuidUrlValue(siteId) + "&module=programs-audiences";
  return <WorkspacePanel title="Existing Programs at this Site"
    description="These are your saved Program records, separate from new ideas you choose in Programs & Audiences."
    actions={onOverview ? <a className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline"
      href={editHref}>Explore additional Programs</a> : undefined}>
    {result.state === "ready" && result.visibility === "assigned" &&
      <p className="mb-3 text-xs text-muted-foreground">Showing Programs included in your authorized Program access. Other Site Programs may exist.</p>}
    {result.state === "unavailable" ? <WorkspaceNotice tone="attention">
      Existing Programs could not be loaded. This does not mean your Site has no Programs.
      Reload Launch Studio to try again.
    </WorkspaceNotice> : result.programs.length === 0 ?
      <p className="text-sm text-muted-foreground">{result.visibility === "assigned"
        ? "No existing Programs are visible within your current Program access."
        : "No existing Programs are recorded for this Site yet."}
        You can explore new ideas below without creating or activating a Program.</p> :
      <div className="space-y-3" aria-label="Existing Site Program records">
        {result.programs.map(program => {
          const presented = existingSiteProgramPresentation(program);
          return <article key={program.id} className="min-w-0 border border-border/70 bg-background p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold">{program.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{presented.typeLabel}</p>
              </div>
              <StatusBadge tone="neutral">{presented.statusLabel}</StatusBadge>
            </div>
            {presented.detail && <p className="mt-3 text-sm text-muted-foreground">{presented.detail}</p>}
          </article>;
        })}
        <p className="text-xs leading-5 text-muted-foreground">
          Status reflects the internal Program record. It does not confirm publication, approval to open,
          available seats or permission to accept applications.
        </p>
      </div>}
  </WorkspacePanel>;
}
