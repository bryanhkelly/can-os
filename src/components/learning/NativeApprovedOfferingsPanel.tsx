import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { getUnifiedClassCourseOptions, getMyUnifiedClassDrafts } from "@/modules/classes/unified-class.functions";

export type AuthorizedOfferingOption = Awaited<ReturnType<typeof getUnifiedClassCourseOptions>>["items"][number];
type ClassDraft = Awaited<ReturnType<typeof getMyUnifiedClassDrafts>>[number];

export type AuthorizedOfferingGroup = {
  id: string;
  first: AuthorizedOfferingOption;
  components: readonly AuthorizedOfferingOption[];
};

/** One read-only, controlled catalog for publisher Offerings and local Classes.
 * The parent owns search, Course configuration, pagination and authorization;
 * selected IDs are revalidated by native Class commands.
 */
export function NativeApprovedOfferingsPanel({
  groups, classes, search, searchDraft, loaded, hasNextPage, loadingMore,
  onSearchDraftChange, onSearch, onClear, onConfigureCourse, onLoadMore,
}: {
  groups: readonly AuthorizedOfferingGroup[];
  classes: readonly ClassDraft[];
  search: string;
  searchDraft: string;
  loaded: boolean;
  hasNextPage?: boolean;
  loadingMore: boolean;
  onSearchDraftChange: (value: string) => void;
  onSearch: (value: string) => void;
  onClear: () => void;
  onConfigureCourse: (option: AuthorizedOfferingOption) => void;
  onLoadMore: () => void | Promise<unknown>;
}) {
  return <section className="mt-5 border border-border bg-card p-5" aria-label="Approved Offering hierarchy">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl">Programs, Courses and local Classes</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Published publisher products are adopted once per authorized Deployment.
            Each Course retains its published version; local Classes configure delivery without rewriting content.
            Standalone Courses do not require a Program or network membership.
          </p>
        </div>
        <div className="flex flex-wrap gap-4 text-sm font-semibold">
          <Link to="/canonical/blueprints" className="underline">Approved Blueprints</Link>
          <Link to="/canonical/lab/deployments" className="underline">Deployments and adoptions</Link>
          <Link to="/class" search={{view:"activities"}} className="underline">Learning activities</Link>
        </div>
      </div>
      {loaded&&groups.length===0&&<p className="mt-4 text-sm text-muted-foreground">
        {search
          ?"No matching approved Courses are visible for this search. Clear the search to inspect the current operator catalog."
          :"No approved published Course adoption is visible for the current operator scope. Publisher approval and local adoption are separate."}
      </p>}
      <form className="mt-4 flex flex-wrap items-end gap-2" onSubmit={event=>{event.preventDefault();onSearch(searchDraft.trim());}}>
        <Label className="min-w-[15rem] flex-1 text-sm font-semibold" htmlFor="authorized-course-search">
          Find approved Programs or Courses
          <Input id="authorized-course-search" value={searchDraft}
            onChange={event=>onSearchDraftChange(event.target.value)} maxLength={100}
            placeholder="Course name, code, Program or Deployment"
            className="mt-1 min-h-11"/>
        </Label>
        <Button type="submit" variant="outline">Search</Button>
        {search&&<Button type="button" variant="outline"
          onClick={onClear}>Clear</Button>}
      </form>
      <p className="mt-2 text-xs text-muted-foreground">Authorized Course results are paginated. Program component counts reflect the loaded page, not the full Offering.</p>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {groups.map(group=><article key={group.id} className="border border-border p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group.first.offeringKind==="program"?"Program Offering":group.first.offeringKind==="course"?"Course Offering":"Published Offering"} · v{group.first.offeringVersionNo}
          </p>
          <h3 className="mt-1 text-base font-semibold">{group.first.offeringTitle}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {group.components.length} loaded Course component(s) · {group.first.deploymentName} · Publisher content is read-only
          </p>
          <ul className="mt-3 space-y-2">
            {group.components.map(row=><li key={row.courseVersionId} className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-2 text-sm">
              <div>
                <p className="font-semibold">{row.courseTitle} · v{row.courseVersionNo}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.isRequired?"Required":"Optional"} · {row.siteOptions.length} authorized delivery Site(s)
                </p>
                {classes.filter(item=>item.deploymentId===row.deploymentId&&
                  item.courseVersionId===row.courseVersionId&&
                  item.offeringVersionId===row.offeringVersionId).map(cls=>
                    <Link key={cls.classId} to="/class/$classId"
                      params={{classId:cls.classId}} search={{view:"manage",tab:"sessions"}}
                      className="mt-2 block text-xs font-semibold underline">
                      {cls.title} · {cls.state} · Sessions
                    </Link>)}
              </div>
              <Button type="button" size="sm" variant="outline"
                onClick={()=>onConfigureCourse(row)}>Configure Class</Button>
            </li>)}
          </ul>
        </article>)}
      </div>
      {hasNextPage&&<Button type="button" variant="outline"
        disabled={loadingMore} className="mt-4"
        onClick={()=>void onLoadMore()}>
        {loadingMore?"Loading…":"Load more authorized Courses"}
      </Button>}
    </section>;
}
