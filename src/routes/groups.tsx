import {
  createFileRoute,
  Link,
  redirect,
  useRouter,
} from "@tanstack/react-router";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { formatTimestamp } from "@/modules/calendar/timezone";
import {
  CreateAction,
  EmptyState,
  EntityCard,
  MutationFeedback,
  StatusBadge,
  WorkspaceNotice,
  WorkspacePanel,
  WorkspaceShell,
} from "@/components/workspace";
import { groupSessionSelectionSchema } from "@/lib/route-search";
import {
  getCanonicalGroupWorkspace,
  getStudyGroupAvailability,
} from "@/modules/study-groups/canonical-workspace.functions";
import { decideCanonicalGroupMembership } from "@/modules/study-groups/canonical-membership.functions";
import { resolveCanonicalGroupReport } from "@/modules/study-groups/canonical-moderation.functions";

const groupSearchSchema = groupSessionSelectionSchema.pick({ group: true });
const loadGroups = async () => {
  const availability = await getStudyGroupAvailability();
  if (!availability.enabled) return { availability, workspace: null };
  return { availability, workspace: await getCanonicalGroupWorkspace() };
};

export const Route = createFileRoute("/groups")({
  validateSearch: (search: Record<string, unknown>): { group?: string } =>
    groupSearchSchema.parse(search),
  // Legacy ?group= selection links resolve to the dedicated detail page.
  beforeLoad: ({ search }) => {
    if (search.group)
      throw redirect({
        to: "/groups/$groupId",
        params: { groupId: search.group },
      });
  },
  loader: safeLoader(loadGroups, {
    authMessage: "Sign in as a student or teacher to access your study groups.",
  }),
  component: GroupsPage,
});

type Data = Awaited<ReturnType<typeof loadGroups>>;
type Workspace = NonNullable<Data["workspace"]>;
type Group = Workspace["groups"][number];

export function groupKindLabel(kind: Group["kind"]): string {
  return kind === "course" ? "Course group" : "Interest group";
}

export function nextGroupSession(
  group: Group,
): Group["sessions"][number] | null {
  const now = Date.now();
  return (
    group.sessions.find(
      (session) =>
        !session.cancelled && new Date(session.startsAt).getTime() > now,
    ) ?? null
  );
}

function GroupsPage() {
  const outcome = Route.useLoaderData();
  if (!outcome.ok)
    return (
      <LoaderFailure eyebrow="Groups" title="Study groups" outcome={outcome} />
    );
  return <GroupsView data={outcome.data} />;
}

function GroupsView({ data }: { data: Data }) {
  const router = useRouter();
  const mutation = useMutationFeedback(() => router.invalidate());
  const busy = mutation.pending || mutation.refreshFailed;
  const { availability, workspace } = data;
  if (!workspace)
    return (
      <WorkspaceShell eyebrow="Collaboration" title="Study groups">
        <WorkspaceNotice>
          Study groups are currently unavailable.
        </WorkspaceNotice>
      </WorkspaceShell>
    );
  const canCreate =
    availability.creationEnabled &&
    availability.writesEnabled &&
    (workspace.role === "teacher" || workspace.hasEnrollmentGuardian !== false);
  const pendingRequests =
    workspace.role === "teacher"
      ? workspace.groups.flatMap((group) =>
          group.pendingMembers.map((member) => ({ group, member })),
        )
      : [];
  const openReports =
    workspace.role === "teacher"
      ? workspace.groups.flatMap((group) =>
          group.reports.map((report) => ({ group, report })),
        )
      : [];
  async function run(work: () => Promise<unknown>, message: string) {
    await mutation.run(work, {
      successMessage: message,
      commandErrorMessage: "Unable to save group change.",
    });
  }
  return (
    <WorkspaceShell
      width="wide"
      eyebrow="Collaboration"
      title="Study groups"
      breadcrumbs={
        <Link to="/home" className="underline">
          Workspace home
        </Link>
      }
      subtitle={
        workspace.role === "teacher"
          ? "Open a group you facilitate to manage membership, sessions and discussion."
          : "Learn together across classes and interests. Open a group for sessions, discussion and membership."
      }
      actions={
        canCreate && (
          <CreateAction>
            <Link to="/groups/new">Create study group</Link>
          </CreateAction>
        )
      }
    >
      <div className="mt-6 space-y-6">
        <MutationFeedback
          state={mutation}
          pendingMessage="Saving group change..."
        />
        {workspace.role === "student" &&
          workspace.hasEnrollmentGuardian === false && (
            <WorkspaceNotice tone="danger">
              A linked guardian is required to request study group membership.
              Ask your school to verify your guardian relationship.
            </WorkspaceNotice>
          )}
        {workspace.role === "teacher" && (
          <WorkspacePanel
            title="Membership requests"
            description="Approvals require current guardian permission."
          >
            {pendingRequests.map(({ group, member }) => (
              <div
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b py-3"
              >
                <div>
                  <p className="text-sm font-medium">
                    {member.studentName} ·{" "}
                    <Link
                      to="/groups/$groupId"
                      params={{ groupId: group.id }}
                      className="underline"
                    >
                      {group.title}
                    </Link>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {member.guardianReady
                      ? "Guardian permission recorded"
                      : "Awaiting guardian permission"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={busy || !availability.membershipEnabled}
                    className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50"
                    onClick={() =>
                      void run(
                        () =>
                          decideCanonicalGroupMembership({
                            data: {
                              groupId: group.id,
                              studentPersonId: member.studentPersonId,
                              approve: false,
                            },
                          }),
                        "Membership declined.",
                      )
                    }
                  >
                    Decline
                  </button>
                  <button
                    disabled={
                      busy ||
                      !availability.membershipEnabled ||
                      !member.guardianReady
                    }
                    className="rounded-lg bg-foreground px-3 py-2 text-xs text-background disabled:opacity-50"
                    onClick={() =>
                      void run(
                        () =>
                          decideCanonicalGroupMembership({
                            data: {
                              groupId: group.id,
                              studentPersonId: member.studentPersonId,
                              approve: true,
                            },
                          }),
                        "Membership approved.",
                      )
                    }
                  >
                    Approve
                  </button>
                </div>
              </div>
            ))}
            {pendingRequests.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No pending membership requests.
              </p>
            )}
          </WorkspacePanel>
        )}
        {workspace.role === "teacher" && (
          <WorkspacePanel
            title="Content moderation"
            description="Reported posts across your facilitated groups."
          >
            {openReports.map(({ group, report }) => (
              <div key={report.id} className="border-b py-3">
                <p className="text-xs font-semibold">
                  <Link
                    to="/groups/$groupId"
                    params={{ groupId: group.id }}
                    className="underline"
                  >
                    {group.title}
                  </Link>
                </p>
                <p className="mt-2 text-sm">Reason: {report.reason}</p>
                <blockquote className="mt-2 rounded border bg-muted p-3 text-sm whitespace-pre-wrap">
                  {report.postBody ?? "The reported post is unavailable."}
                </blockquote>
                {report.postHidden && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Post already hidden
                  </p>
                )}
                <div className="mt-2 flex gap-2">
                  <button
                    disabled={busy || !availability.moderationEnabled}
                    className="rounded border px-3 py-2 text-xs disabled:opacity-50"
                    onClick={() =>
                      void run(
                        () =>
                          resolveCanonicalGroupReport({
                            data: {
                              reportId: report.id,
                              hidePost: true,
                            },
                          }),
                        "Reported post hidden.",
                      )
                    }
                  >
                    Hide and resolve
                  </button>
                  <button
                    disabled={busy || !availability.moderationEnabled}
                    className="rounded border px-3 py-2 text-xs disabled:opacity-50"
                    onClick={() =>
                      void run(
                        () =>
                          resolveCanonicalGroupReport({
                            data: {
                              reportId: report.id,
                              hidePost: false,
                            },
                          }),
                        "Report reviewed; content retained.",
                      )
                    }
                  >
                    Resolve only
                  </button>
                </div>
              </div>
            ))}
            {openReports.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No open content reports.
              </p>
            )}
          </WorkspacePanel>
        )}
        <section
          aria-label="Available study groups"
          className="grid gap-4 md:grid-cols-2"
        >
          {workspace.groups.map((group) => {
            const next = nextGroupSession(group);
            return (
              <EntityCard
                key={group.id}
                title={group.title}
                subtitle={`${groupKindLabel(group.kind)} · Facilitated by ${group.facilitatorName}`}
                status={
                  workspace.role === "student" ? (
                    <StatusBadge
                      tone={
                        group.membershipStatus === "approved"
                          ? "success"
                          : group.membershipStatus === "pending"
                            ? "attention"
                            : "neutral"
                      }
                    >
                      {group.membershipStatus ?? "Not joined"}
                    </StatusBadge>
                  ) : (
                    <StatusBadge tone="neutral">Facilitator</StatusBadge>
                  )
                }
                meta={
                  `${group.memberCount} of ${group.maxMembers} members` +
                  (next
                    ? ` · Next session ${formatTimestamp(next.startsAt, group.timezone)}`
                    : "")
                }
                openLabel="Open group"
                renderLink={({ className, children }) => (
                  <Link
                    to="/groups/$groupId"
                    params={{ groupId: group.id }}
                    className={className}
                    aria-label={`Open ${group.title} study group`}
                  >
                    {children}
                  </Link>
                )}
              >
                <p className="line-clamp-3">{group.description}</p>
              </EntityCard>
            );
          })}
        </section>
        {workspace.groups.length === 0 && (
          <EmptyState
            title={
              workspace.role === "teacher"
                ? "You have no facilitated study groups yet."
                : "There are no available groups for your active program enrollments."
            }
            description={
              workspace.role === "teacher"
                ? "Create a group for a section you teach to get started."
                : "Groups require active program enrollment and, for course groups, matching class enrollment. Contact your school if an expected group is missing."
            }
          />
        )}
      </div>
    </WorkspaceShell>
  );
}
