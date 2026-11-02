import { Link } from "@tanstack/react-router";
import { WorkspacePanel } from "@/components/workspace";

export interface ClassDirectoryEntry {
  id: string;
  title: string;
  code: string;
  studentPersonId?: string | null;
  studentName?: string | null;
}

/** Renders only classes provided by the authorized directory loader. */
export function ClassDirectoryCards({
  classes,
  role,
}: {
  classes: readonly ClassDirectoryEntry[];
  role: string;
}) {
  return (
    <>
      <div className="mt-7 grid gap-4 md:grid-cols-2">
        {classes.map((section) => (
          <WorkspacePanel
            key={`${section.id}:${section.studentPersonId}`}
            title={section.title}
            description={role === "guardian" ? section.studentName ?? section.code : section.code}
          >
            <Link
              to="/classes"
              search={{
                section: section.id,
                student: role === "guardian" ? section.studentPersonId ?? undefined : undefined,
              }}
              className="inline-block rounded-lg bg-foreground px-4 py-2 text-sm text-background"
            >
              Open class
            </Link>
          </WorkspacePanel>
        ))}
      </div>
      {!classes.length && (
        <p role="status" className="mt-7 rounded-xl border p-5 text-sm">
          No active classes are available in this membership.
        </p>
      )}
    </>
  );
}
