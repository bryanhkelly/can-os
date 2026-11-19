import { buttonVariants } from "@/components/ui/button";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { MutationFeedback } from "@/components/workspace/mutation-feedback";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { WorkspaceShell } from "@/components/workspace";
import { FamilyInvitationBatchList } from "@/components/admissions/FamilyInvitationBatchList";
import { FamilyInvitationForm } from "@/components/admissions/FamilyInvitationForm";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import {
  listFamilyInvitations, sendFamilyInvitations, retryFamilyInvitationBatch,
} from "@/modules/enrollment/family-invitations.functions";
import {
  readSiteMarketingSuggestionsV61, listSiteMarketingPackagesV61,
} from "@/modules/programs/site-marketing-packages-v61.functions";
import { containsProtectedInstitutionalClaim } from "@/domain/site-local-content";
import { DomainError } from "@/domain/errors";
import { plural } from "@/lib/format";

/**
 * A Launch Studio recruitment handoff stays within its exact Site and uses
 * the existing preopening-interest invitation command, never a new CRM or
 * an early application/enrollment activation.
 */
const searchSchema = z.object({
  siteId: z.string().uuid().optional(),
  purpose: z.enum(["interest", "application"]).default("application"),
  packageId: z.string().uuid().optional(),
});

export const Route = createFileRoute("/admissions/invite-families")({
  validateSearch: (search: Record<string, unknown>) => searchSchema.parse(search),
  loaderDeps: ({ search }) => ({
    siteId: search.siteId, purpose: search.purpose, packageId: search.packageId,
  }),
  loader: ({ deps }) => safeLoader(async () => {
    const data = await listFamilyInvitations();
    if (deps.packageId && (!deps.siteId || deps.purpose!=="interest"))
      throw new DomainError("UNAVAILABLE","A family interest Package requires its exact Site and interest mode.");
    if (deps.packageId && !data.programs.some(program=>
      program.siteId===deps.siteId && program.purpose==="interest"))
      throw new DomainError("UNAVAILABLE","No authorized Program can send interest invitations for this Site.");
    // A saved, active interest Package is referenced by ID, not copied into
    // another marketing store. An unrelated or archived Package never silently
    // falls back to generic words for a live messaging operation.
    const packages = deps.packageId
      ? await listSiteMarketingPackagesV61({data:{siteId:deps.siteId!}})
      : null;
    const selectedPackage = packages?.find(item=>item.id===deps.packageId &&
      item.siteId===deps.siteId && item.status==="draft" &&
      item.content.purpose==="interest-invitation");
    if(deps.packageId && !selectedPackage)
      throw new DomainError("UNAVAILABLE","This family invitation Package is no longer available for the selected Site.");
    const originalHeadline=selectedPackage?.content.headline.trim()??"";
    const originalMessage=selectedPackage?.content.message.trim()??"";
    // Check the FULL saved content before shortening a headline to the
    // invitation service's 120-character email subject bound.
    if(selectedPackage && (originalHeadline.length<3 || !originalMessage ||
      containsProtectedInstitutionalClaim(originalHeadline+" "+originalMessage)))
      throw new DomainError("VALIDATION_FAILED",
        "Review the saved Package for protected claims or missing email details before sending.");
    const packageStarter=selectedPackage
      ? {headline:originalHeadline.slice(0,120),message:originalMessage}
      : null;
    const suggestions = deps.siteId && deps.purpose === "interest" && !packageStarter
      ? await readSiteMarketingSuggestionsV61({ data: { siteId: deps.siteId } }).catch(() => null)
      : null;
    return { ...data, suggestions, packageStarter };
  }, {
    authMessage: "Sign in with an authorized receiving-school registrar grant to manage family invitations.",
  })(),
  component: FamilyInvitationsPage,
});

type Data = Awaited<ReturnType<typeof listFamilyInvitations>> & {
  suggestions: Awaited<ReturnType<typeof readSiteMarketingSuggestionsV61>> | null;
  packageStarter:{headline:string;message:string}|null;
};
type Selection = z.infer<typeof searchSchema>;

function FamilyInvitationsPage() {
  const result = Route.useLoaderData();
  const selection = Route.useSearch();
  if (!result.ok) return <LoaderFailure eyebrow="Admissions"
    title="Invite prospective families" outcome={result}/>;
  return <FamilyInvitationsWorkspace
    key={(selection.siteId ?? "all") + ":" + selection.purpose + ":" + (selection.packageId??"")}
    data={result.data} selection={selection}/>;
}

function FamilyInvitationsWorkspace({data,selection}:{data:Data;selection:Selection}) {
  const router = useRouter();
  const isInterest = selection.purpose === "interest";
  const eligible = data.programs.filter(program =>
    program.purpose === selection.purpose && (!selection.siteId || program.siteId === selection.siteId));
  const [programId,setProgramId] = useState(eligible[0]?.id ?? "");
  const selectedProgramId = eligible.some(program => program.id === programId)
    ? programId : eligible[0]?.id ?? "";
  const starter = isInterest
    ? data.packageStarter ?? data.suggestions?.["interest-invitation"].content
    : null;
  const [contacts,setContacts] = useState("");
  const [introduction,setIntroduction] = useState(starter?.message ??
    (isInterest
      ? "We are exploring learning opportunities for our community and would welcome your interest. This is not an application or an enrollment offer."
      : "You're invited to start an application at our school. Please verify your email using the private secure link in this invitation. This is not an offer of enrollment."));
  const [subject,setSubject] = useState(starter?.headline.slice(0,120) ??
    (isInterest ? "Stay connected with our learning community" : "Invitation to apply to our school"));
  const [requestId,setRequestId] = useState(() => crypto.randomUUID());
  const mutation = useMutationFeedback(() => router.invalidate());
  const busy = mutation.pending || mutation.refreshFailed;
  const batches = data.batches.filter(batch =>
    batch.purpose === selection.purpose && (!selection.siteId || batch.siteId === selection.siteId));

  async function submit(event:FormEvent) {
    event.preventDefault();
    if (busy || !selectedProgramId || !contacts.trim()) return;
    if (!window.confirm(isInterest
      ? "Queue interest invitations for the listed consenting adults? This does not create applications, approve a Site or open enrollment."
      : "Queue secure application invitations to the listed family email addresses? This does not verify legal guardianship, accept an application, or enroll a child.")) return;
    await mutation.run(async () => {
      const result = await sendFamilyInvitations({data:{
        requestId, programId:selectedProgramId, rawContacts:contacts,
        subject, introduction, purpose:selection.purpose, confirmed:true,
      }});
      setRequestId(crypto.randomUUID());
      setContacts("");
      return result;
    }, {
      successMessage:result => result.created
        ? plural(result.recipientCount, isInterest ? "interest invitation" : "secure application invitation") +
          " queued. Provider delivery and family response appear below."
        : "This invitation request is already queued. No duplicate invitations were created.",
      commandErrorMessage: "Unable to queue family invitations.",
    });
  }

  async function retry(batchId:string) {
    if (busy) return;
    await mutation.run(() => retryFamilyInvitationBatch({data:{batchId}}), {
      successMessage:result=>result.retried>0
        ? plural(result.retried,"unaccepted invitation")+" queued for retry. Already accepted recipients will not be sent again."
        : "No unaccepted failed recipients remain in this batch.",
      commandErrorMessage: "Could not retry invitations.",
    });
  }

  return <WorkspaceShell eyebrow={isInterest?"Introduce / Recruit Families / Learners":"Admissions"}
    title={isInterest?"Invite families to express interest":"Invite families to apply"}
    subtitle={isInterest
      ? "Send consent-aware interest invitations for eligible, developing Programs. Interest does not authorize applications, opening or enrollment."
      : "Send verified-email application invitations for authorized receiving Programs. No child identity or admissions decision is inferred."}
    actions={<div className="flex flex-wrap gap-2">
      {selection.siteId&&<Link to="/launch/site" search={{siteId:selection.siteId,module:"recruit"}}
        className={buttonVariants({variant:"outline"})}>Back to Launch Studio</Link>}
      <Link to="/admissions" className={buttonVariants({variant:"outline"})}>Admissions</Link>
    </div>}>
    <MutationFeedback state={mutation} pendingMessage="Queuing invitations..."/>
    {isInterest&&<p className="mt-4 text-sm text-muted-foreground">
      {data.packageStarter
        ? "The editable subject and introduction below came from the selected saved Marketing Package. Review every claim and identify consenting adults before sending."
        : starter
          ? "The editable introduction below is suggested from your saved Site Story and intended audiences. Review it and identify consenting adults before sending."
          : "A safe starter message is provided. Review the details and identify consenting adults before sending."}
      {" "}The email presentation uses the existing saved Site Brand and independently authorized delivery service.
    </p>}
    <FamilyInvitationForm purpose={selection.purpose} programs={eligible}
      draft={{programId:selectedProgramId,contacts,subject,introduction}} busy={busy}
      onChange={patch=>{
        if(patch.programId!==undefined)setProgramId(patch.programId);
        if(patch.contacts!==undefined)setContacts(patch.contacts);
        if(patch.subject!==undefined)setSubject(patch.subject);
        if(patch.introduction!==undefined)setIntroduction(patch.introduction);
      }} onSubmit={event=>void submit(event)}/>
    <FamilyInvitationBatchList batches={batches} busy={busy} onRetry={batchId=>void retry(batchId)}/>
  </WorkspaceShell>;
}
