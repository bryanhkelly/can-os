import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { mutationErrorMessage, useMutationFeedback } from "@/lib/mutation-feedback";
import {
  FormActions, FormSection, MutationFeedback, WorkspaceNotice, WorkspaceShell,
  useUnsavedChangesGuard,
} from "@/components/workspace";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/choice";
import { Label } from "@/components/ui/label";
import {
  getCanonicalGroupWorkspace, getStudyGroupAvailability,
} from "@/modules/study-groups/canonical-workspace.functions";
import {
  createFacilitatedGroup, createStudentStudyGroup,
} from "@/modules/study-groups/canonical-membership.functions";
import {
  listFacilitatorGroupScopes, listStudentStudyGroupClassmates, listStudentStudyGroupSections,
} from "@/modules/study-groups/study-group-queries.functions";

const loadCreateGroup = async () => {
  const availability = await getStudyGroupAvailability();
  if (!availability.enabled || !availability.creationEnabled || !availability.writesEnabled)
    return { availability, workspace: null, studentSections: [], scopes: [] };
  const workspace = await getCanonicalGroupWorkspace();
  const [studentSections, scopes] = await Promise.all([
    workspace.role === "student" ? listStudentStudyGroupSections() : Promise.resolve([]),
    workspace.role === "teacher" ? listFacilitatorGroupScopes() : Promise.resolve([]),
  ]);
  return { availability, workspace, studentSections, scopes };
};

export const Route = createFileRoute("/groups_/new")({
  loader: safeLoader(loadCreateGroup, {
    authMessage: "Sign in as a student or teacher to create a study group.",
  }),
  component: CreateGroupPage,
});

const backToGroups = <Link to="/groups">Cancel</Link>;

function CreateGroupPage() {
  const outcome = Route.useLoaderData();
  if (!outcome.ok) return <LoaderFailure eyebrow="Study groups" title="Create study group" outcome={outcome} />;
  const { workspace, studentSections, scopes } = outcome.data;
  const blocked = !workspace ? "Creating study groups is unavailable right now."
    : workspace.role === "student" && studentSections.length === 0
    ? "No active enrolled classes are currently available for creating a study group."
    : workspace.role === "student" && workspace.hasEnrollmentGuardian === false
    ? "A linked guardian is required to create a study group. Ask your school to verify your guardian relationship before continuing."
    : workspace.role === "teacher" && workspace.sections.length === 0 && scopes.length === 0
    ? "No active teaching assignments are currently available for creating a study group."
    : null;
  return <WorkspaceShell width="reading" eyebrow="Study groups" title="Create study group"
    subtitle={workspace?.role === "teacher"
      ? "Create a facilitated group for a section you teach, or a site-wide interest group."
      : "Start a group for one of your classes and invite classmates. Your class teacher will facilitate the group, and membership approvals still apply."}
    breadcrumbs={<Link to="/groups" className="underline">Study groups</Link>}>
    {blocked || !workspace
      ? <div className="space-y-4">
          <WorkspaceNotice tone={workspace?.role === "student" && workspace.hasEnrollmentGuardian === false ? "danger" : undefined}>
            {blocked}
          </WorkspaceNotice>
          <Link to="/groups" className="text-sm font-semibold underline">Back to study groups</Link>
        </div>
      : workspace.role === "teacher"
      ? <TeacherCreateGroupForm sections={workspace.sections} scopes={scopes} />
      : <StudentCreateGroupForm sections={studentSections} />}
  </WorkspaceShell>;
}

type Workspace = NonNullable<Awaited<ReturnType<typeof loadCreateGroup>>["workspace"]>;

function TeacherCreateGroupForm({ sections, scopes }: {
  sections: Workspace["sections"];
  scopes: Awaited<ReturnType<typeof listFacilitatorGroupScopes>>;
}) {
  const navigate = useNavigate();
  const [kind, setKind] = useState<"course" | "interest">(sections.length ? "course" : "interest");
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");
  const [siteId, setSiteId] = useState("");
  const [programId, setProgramId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [maxMembers, setMaxMembers] = useState(20);
  const [submitted, setSubmitted] = useState(false);
  const sites = [...new Map(scopes.map(scope => [scope.siteId, { id: scope.siteId, name: scope.siteName }])).values()];
  const sitePrograms = scopes.filter(scope => scope.siteId === siteId);
  const release = useUnsavedChangesGuard(Boolean(title || description));
  const mutation = useMutationFeedback(async () => undefined);
  const busy = mutation.pending || mutation.refreshFailed;
  const capacityInvalid = !Number.isInteger(maxMembers) || maxMembers < 2 || maxMembers > 50;
  return <form noValidate onSubmit={event => {
    event.preventDefault();
    setSubmitted(true);
    if (title.trim().length < 3 || description.trim().length < 10 || capacityInvalid) return;
    if (kind === "course" ? !sectionId : !siteId) return;
    let createdGroupId = "";
    void mutation.run(async () => {
      const created = await createFacilitatedGroup({ data: kind === "course"
        ? { sectionId, title, description, maxMembers }
        : { siteId, programId: programId || null, kind, title, description, maxMembers } });
      createdGroupId = created.groupId;
      return created;
    }, {
      successMessage: "Study group created.",
      commandErrorMessage: "Unable to create the study group.",
      refreshErrorMessage: "The group was created, but it could not be opened. Open Study groups instead of submitting again.",
      refresh: async () => {
        release();
        await navigate({ to: "/groups/$groupId", params: { groupId: createdGroupId } });
      },
    });
  }}>
    <fieldset disabled={busy} className="space-y-8">
      <FormSection title="Group details">
        <Field label="Group type" required className="sm:col-span-2">
          <Select value={kind} onChange={event => { setKind(event.target.value as "course" | "interest"); }}>
            <option value="course">Class study group (one of your sections)</option>
            <option value="interest">Interest group (site-wide)</option>
          </Select>
        </Field>
        {kind === "course"
          ? <Field label="Section" required className="sm:col-span-2"
              error={submitted && !sectionId ? "Choose a teaching section." : undefined}>
              <Select value={sectionId} onChange={event => setSectionId(event.target.value)}>
                {sections.map(section => <option key={section.id} value={section.id}>{section.title}</option>)}
              </Select>
            </Field>
          : <>
            <Field label="School" required className="sm:col-span-2"
              error={submitted && !siteId ? "Choose a school where you teach." : undefined}>
              <Select value={siteId} onChange={event => { setSiteId(event.target.value); setProgramId(""); }}>
                <option value="">Choose a school where you teach</option>
                {sites.map(site => <option key={site.id} value={site.id ?? ""}>{site.name}</option>)}
              </Select>
            </Field>
            <Field label="Program" className="sm:col-span-2"
              description="Leave unselected for a site-wide group across all permitted programs.">
              <Select value={programId} onChange={event => setProgramId(event.target.value)} disabled={!siteId}>
                <option value="">All permitted programs</option>
                {sitePrograms.map(program =>
                  <option key={program.programId} value={program.programId}>{program.programName}</option>)}
              </Select>
            </Field>
          </>}
        <Field label="Group title" required className="sm:col-span-2"
          error={submitted && title.trim().length < 3 ? "Enter a title with at least 3 characters." : undefined}>
          <Input value={title} onChange={event => setTitle(event.target.value)} minLength={3} maxLength={100} />
        </Field>
        <Field label="Description" required className="sm:col-span-2" description="At least 10 characters."
          error={submitted && description.trim().length < 10 ? "Enter a description with at least 10 characters." : undefined}>
          <Textarea value={description} onChange={event => setDescription(event.target.value)} minLength={10} maxLength={2000} />
        </Field>
        <Field label="Capacity" required
          error={submitted && capacityInvalid ? "Choose a whole number from 2 to 50." : undefined}>
          <Input type="number" min={2} max={50} value={maxMembers}
            onChange={event => setMaxMembers(Number(event.target.value))} />
        </Field>
      </FormSection>
    </fieldset>
    <MutationFeedback state={mutation} pendingMessage="Creating study group..." />
    <FormActions submitLabel="Create study group" pendingLabel="Creating study group..."
      pending={mutation.pending} disabled={busy} cancel={backToGroups} />
  </form>;
}

function StudentCreateGroupForm({ sections }: { sections: { id: string; title: string }[] }) {
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
      refreshErrorMessage: "The group was created, but it could not be opened. Open Study groups instead of submitting again.",
      // The saved group is the post-save read; navigate there only after the command succeeds.
      refresh: async () => {
        release();
        await navigate({ to: "/groups/$groupId", params: { groupId: createdGroupId } });
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
