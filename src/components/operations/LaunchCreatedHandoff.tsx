import { Link } from "@tanstack/react-router";
import { programTypes } from "@/domain/program-offerings";

export type LaunchCreatedResult = {
  programId: string;
  journeyId: string;
  programType: (typeof programTypes)[number];
  publicSiteDraft: {
    siteId: string;
    host: string;
    status: "draft" | "published";
    created: boolean;
  } | null;
};

export function LaunchCreatedHandoff({created}:{created:LaunchCreatedResult|null}){
 return <>
            {created && <div role="status" className="mt-4 rounded-lg border p-3 text-sm">
              <p className="font-semibold">Your school has been saved.</p>
              <p className="mt-1">Continue with your academic year, first classroom, school website and family invitations. Your progress is saved as you go.</p>
              <nav aria-label="Next steps for your new program" className="mt-4 flex flex-wrap gap-3">
                <Link to="/operations/launch" search={{siteId:created.publicSiteDraft?.siteId,programId:created.programId}}
                  hash="launch-academic-year" className="rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground">Continue school setup →</Link>
                <Link to="/operations/launch" search={{siteId:created.publicSiteDraft?.siteId,programId:created.programId}}
                  hash="invite-families" className="rounded-lg border px-4 py-3 text-sm font-semibold">Invite families →</Link>
              </nav>
              <p className="mt-3 text-xs text-muted-foreground">These are planning actions, not authorization to open. Institutional agreements, academic readiness and child safety must still be independently approved before active enrollment or onsite attendance.</p>
              {created.publicSiteDraft && <details className="mt-3 rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-semibold">Optional: website and marketing setup</summary>
                <p className="font-semibold">
                  {created.publicSiteDraft.created
                    ? "Website draft automatically prepared"
                    : "Existing Site website address retained"}
                </p>
                <p className="mt-1 font-mono">{created.publicSiteDraft.host}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {created.publicSiteDraft.status === "published"
                    ? "The Site already has a marketing approval; launch does not change its status or open admissions."
                    : "Private draft only. Publishing requires a separate authorized review; no admissions or hosting is opened."}
                </p>
                <Link to="/sites/$siteId/publish"
                  params={{siteId:created.publicSiteDraft.siteId}}
                  className="mt-2 inline-block underline">
                  Review Site website (separate publisher grant required) →
                </Link>
              </details>}
              {!created.publicSiteDraft && <p className="mt-2 text-xs text-muted-foreground">
                No local Site was selected, so this Program launch has no Site website draft.
              </p>}
            </div>}

 </>;
}
