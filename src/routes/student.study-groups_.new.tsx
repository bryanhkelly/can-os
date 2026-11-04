import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { listStudentStudyGroupSections, listStudentStudyGroupClassmates, hasStudentStudyGroupGuardian } from "@/modules/study-groups/study-group-queries.functions";
import { getStudyGroupAvailability } from "@/modules/study-groups/canonical-workspace.functions";
import { createStudentStudyGroup } from "@/modules/study-groups/canonical-membership.functions";
import { mutationErrorMessage, useMutationFeedback } from "@/lib/mutation-feedback";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/choice";
import { Label } from "@/components/ui/label";
import { FormActions, FormSection, MutationFeedback, WorkspaceNotice, WorkspaceShell, useUnsavedChangesGuard } from "@/components/workspace";

const loadCreateStudyGroup = async () => {
  const { enabled, writesEnabled, creationEnabled } = await getStudyGroupAvailability();
  if (!enabled || !creationEnabled || !writesEnabled) return { available: false as const, sections: [], hasEnrollmentGuardian: null };
  const [sections, hasEnrollmentGuardian] = await Promise.all([listStudentStudyGroupSections(), hasStudentStudyGroupGuardian()]);
  return { available: true as const, sections, hasEnrollmentGuardian };
};

export const Route = createFileRoute("/student/study-groups_/new")({
  loader: safeLoader(loadCreateStudyGroup, { authMessage: "Sign in with an authorized student account to create a study group." }),
  component: CreateStudyGroupPage,
});

const backToGroups = <Link to="/student/study-groups" search={{}}>Cancel</Link>;

function CreateStudyGroupPage() {
  const outcome = Route.useLoaderData();
  if (!outcome.ok) return <LoaderFailure eyebrow="Study Groups" title="Create study group" outcome={outcome} />;
  const { available, sections, hasEnrollmentGuardian } = outcome.data;
  const blocked = !available ? "Creating study groups is unavailable right now."
    : sections.length === 0 ? "No active enrolled classes are currently available for creating a study group."
    : hasEnrollmentGuardian === false ? "A linked guardian is required to create a study group. Ask your school to verify your guardian relationship before continuing."
    : null;
  return <WorkspaceShell width="reading" eyebrow="Study Groups" title="Create study group"
    subtitle="Start a group for one of your classes and invite classmates. Your class teacher will facilitate the group, and membership approvals still apply."
    breadcrumbs={<Link to="/student/study-groups" search={{}} className="underline">Study Groups</Link>}>
    {blocked
      ? <div className="space-y-4"><WorkspaceNotice tone={hasEnrollmentGuardian === false ? "danger" : undefined}>{blocked}</WorkspaceNotice>
        <Link to="/student/study-groups" search={{}} className="text-sm font-semibold underline">Back to Study Groups</Link></div>
      : <CreateStudyGroupForm sections={sections} />}
  </WorkspaceShell>;
}

function CreateStudyGroupForm({ sections }: { sections: { id: string; title: string }[] }) {
  const navigate = useNavigate();
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");
  const [title, setTitle] = useState(""), [description, setDescription] = useState("");
  const [inviteeIds, setInviteeIds] = useState<string[]>([]);
  const [classmates, setClassmates] = useState<Awaited<ReturnType<typeof listStudentStudyGroupClassmates>>>([]);
  const [rosterLoading, setRosterLoading] = useState(false), [rosterError, setRosterError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const release = useUnsavedChangesGuard(!!(title || description || inviteeIds.length));
  const mutation = useMutationFeedback(async () => undefined);
  const busy = mutation.pending || mutation.refreshFailed;

  useEffect(() => {
    let active = true;
    setClassmates([]); setInviteeIds([]); setRosterError("");
    if (!sectionId) return;
    setRosterLoading(true);
    listStudentStudyGroupClassmates({ data: { sectionId } })
      .then(result => { if (active) setClassmates(result); })
      .catch(error => { if (active) setRosterError(mutationErrorMessage(error, "Unable to load classmates.")); })
      .finally(() => { if (active) setRosterLoading(false); });
    return () => { active = false; };
  }, [sectionId]);

  const inviteError = submitted && inviteeIds.length === 0 ? "Choose at least one classmate to invite." : undefined;
  return <form onSubmit={event => {
    event.preventDefault();
    setSubmitted(true);
    if (inviteeIds.length === 0) return;
    let createdGroupId = "";
    void mutation.run(async () => {
      const created = await createStudentStudyGroup({ data: {
        sectionId, title, description, inviteePersonIds: inviteeIds, maxMembers: Math.max(20, inviteeIds.length + 1),
      } });
      createdGroupId = created.groupId;
      return created;
    }, {
      successMessage: "Group created and invitations sent. Your membership is awaiting guardian permission and facilitator approval.",
      commandErrorMessage: "Unable to create the study group.",
      refreshErrorMessage: "The group was created, but it could not be opened. Open Study Groups instead of submitting again.",
      // The saved group is the post-save read; navigate there only after the command succeeds.
      refresh: async () => {
        release();
        await navigate({ to: "/student/study-groups", search: { group: createdGroupId } });
      },
    });
  }}>
    <fieldset disabled={busy} className="space-y-8">
      <FormSection title="Group details">
        <Field label="Class" required className="sm:col-span-2">
          <Select value={sectionId} onChange={event => setSectionId(event.target.value)}>
            {sections.map(section => <option key={section.id} value={section.id}>{section.title}</option>)}
          </Select>
        </Field>
        <Field label="Group name" required className="sm:col-span-2">
          <Input value={title} onChange={event => setTitle(event.target.value)} minLength={3} maxLength={100} />
        </Field>
        <Field label="What will you study together?" required description="At least 10 characters." className="sm:col-span-2">
          <Textarea value={description} onChange={event => setDescription(event.target.value)} minLength={10} maxLength={2000} />
        </Field>
      </FormSection>
      <FormSection title="Invite classmates" description="Only currently enrolled classmates in the chosen class are listed.">
        <div role="group" aria-label="Classmates to invite" aria-describedby={inviteError ? "invitees-error" : undefined} className="space-y-2 sm:col-span-2">
          {rosterLoading && <p role="status" className="text-sm text-muted-foreground">Loading classmates...</p>}
          {rosterError && <p role="alert" className="text-sm text-destructive">{rosterError}</p>}
          {!rosterLoading && !rosterError && classmates.length === 0 && <p className="text-sm text-muted-foreground">There are no other currently enrolled classmates in this class.</p>}
          {classmates.map(classmate => <Label key={classmate.id} className="flex items-center gap-3">
            <Checkbox checked={inviteeIds.includes(classmate.id)} onChange={event => setInviteeIds(ids =>
              event.target.checked ? [...ids, classmate.id] : ids.filter(id => id !== classmate.id))} />
            {classmate.firstName} {classmate.lastName}
          </Label>)}
          {inviteError && <p id="invitees-error" role="alert" className="text-sm text-destructive">{inviteError}</p>}
        </div>
      </FormSection>
    </fieldset>
    <MutationFeedback state={mutation} pendingMessage="Creating study group..." />
    <FormActions submitLabel="Create study group" pendingLabel="Creating study group..." pending={mutation.pending}
      disabled={busy || rosterLoading || !sectionId} cancel={backToGroups} />
  </form>;
}
