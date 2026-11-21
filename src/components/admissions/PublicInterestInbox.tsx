import { mutationErrorMessage, useMutationFeedback } from "@/lib/mutation-feedback";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { WorkspaceNotice } from "@/components/workspace";
import { PublicInterestRecordCard } from "@/components/admissions/PublicInterestRecordCard";
import {
  assignPublicSiteInterestToProgram, invitePublicAdmissionsInterestToApply, listPublicAdmissionsInterests,
  setPublicAdmissionsInterestStatus,
} from "@/modules/enrollment/public-admissions-interest.functions";

type Page = Awaited<ReturnType<typeof listPublicAdmissionsInterests>>;
type Row = Page["items"][number];

/** These records contain unverified parent-supplied contact data. */
export function PublicInterestInbox({ initialPage, siteId, programId, availablePrograms=[] }: {
  initialPage:Page; siteId?:string; programId?:string;
  availablePrograms:readonly {id:string;name:string;siteId:string|null}[];
}) {
  const router = useRouter();
  const [olderRows,setOlderRows] = useState<Row[]>([]);
  const [programSelections,setProgramSelections] = useState<Record<string,string>>({});
  const [nextCursor,setNextCursor] = useState<string|null>(initialPage.nextCursor);
  const [loadingMore,setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const [loadError,setLoadError] = useState("");
  useEffect(() => {
    setOlderRows([]);
    setNextCursor(initialPage.nextCursor);
  }, [initialPage]);
  const seen = new Set<string>();
  const items = [...initialPage.items,...olderRows].filter(row => {
    if ((siteId&&row.siteId!==siteId)||(programId&&row.programId!==programId)||
      seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
  async function loadMore() {
    if (!nextCursor || loadingMoreRef.current) return;
    loadingMoreRef.current=true;
    setLoadingMore(true);setLoadError("");
    try {
      const page=await listPublicAdmissionsInterests({data:{
        cursor:nextCursor,siteId,programId,
      }});
      setOlderRows(current=>[...current,...page.items]);
      setNextCursor(page.nextCursor);
    } catch (cause) {
      setLoadError(mutationErrorMessage(cause, "Unable to load older inquiries."));
    } finally {loadingMoreRef.current=false;setLoadingMore(false);}
  }
  const mutation = useMutationFeedback(() => router.invalidate());
  const busy = mutation.pending || mutation.refreshFailed;
  async function changeStatus(row: Row, status: "contacted" | "closed") {
    await mutation.run(() => setPublicAdmissionsInterestStatus({
        data: { interestId: row.id, status },
      }), {
      successMessage: status === "contacted"
        ? "Contact recorded. This does not verify a guardian or create an Application."
        : "Interest request closed.",
      commandErrorMessage: "Could not update interest.",
    });
  }
  async function assignToProgram(row:Row) {
    const programId=programSelections[row.id];
    if(!programId||!availablePrograms.some(item=>item.id===programId&&item.siteId===row.siteId))
      return;
    await mutation.run(()=>assignPublicSiteInterestToProgram({
      data:{interestId:row.id,programId},
    }),{
      successMessage:"Site interest linked to an authorized Program. You can now use the standard application workflow.",
      commandErrorMessage:"Could not link this interest. Confirm that Program admissions are currently authorized.",
    });
  }
  async function inviteToApply(row: Row) {
    await mutation.run(() => invitePublicAdmissionsInterestToApply({data:{interestId:row.id}}), {
      successMessage: "Verified-email application invitation requested. This does not verify guardianship or create an Application.",
      commandErrorMessage: "Could not invite family to apply.",
    });
  }

  return <section className="mt-8  border bg-card p-5">
    <h2 className="font-serif text-2xl">Prospective participants and inquiries</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      Track consented Site-wide and Program-specific requests from public websites and pre-opening invitations.
      Follow-up requires the adult's affirmative consent. Once CAN authorizes
      admissions, send a verified-email application invitation or continue reviewed
      registrar intake. An inquiry never proves guardianship or grants school access.
    </p>
    <MutationFeedback state={mutation} pendingMessage="Saving interest..." className="mt-3"/>
    <div className="mt-4 grid gap-3">
      {items.map(row => <PublicInterestRecordCard key={row.id} row={row} busy={busy}
        programChoices={availablePrograms.filter(item=>item.siteId===row.siteId)}
        selectedProgramId={programSelections[row.id]??""}
        onSelectProgram={id=>setProgramSelections(current=>({...current,[row.id]:id}))}
        onAssign={assignToProgram}
        onInvite={inviteToApply} onStatusChange={changeStatus} />)}
      {items.length === 0 && <p className="text-sm text-muted-foreground">
        {nextCursor ? "No matching inquiries on this page. Load older records to continue."
          : "No Site or Program interest requests in your authorized scope yet."}
      </p>}
    </div>
    {loadError&&<WorkspaceNotice tone="danger" className="mt-3">{loadError}</WorkspaceNotice>}
    {nextCursor&&<Button type="button" size="sm" disabled={loadingMore||busy}
      onClick={()=>void loadMore()} variant="outline" className="mt-4">
      {loadingMore?"Loading older inquiries…":"Load older inquiries"}
    </Button>}
  </section>;
}
