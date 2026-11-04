import { createFileRoute, Link } from "@tanstack/react-router";
import { ProfilePhoto } from "@/components/profiles/ProfilePhoto";
import { useState } from "react";
import { listTeachers } from "@/modules/profiles/directory.functions";
import { EmptyState, WorkspaceShell } from "@/components/workspace";
import { useDebouncedDirectorySearch } from "@/lib/use-debounced-directory-search";
import { DirectoryTable } from "@/components/workspace/directory-table";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/staff/teachers")({ component: StaffTeachersPage });

const findTeachers = async (query?: string) => (await listTeachers({ data: { query } })).teachers;

function StaffTeachersPage() {
  const [query, setQuery] = useState("");
  const { rows: teachers, loading, error, retry } = useDebouncedDirectorySearch(
    query, findTeachers, "Teacher search is unavailable. Try again.",
  );

  return (
    <WorkspaceShell eyebrow="Staff" title="Teacher directory"
      subtitle="Teachers leading sections at your school sites, with current rosters.">
        <Field label="Search by name" className="mt-8 max-w-sm">
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="First or last name"
          />
        </Field>
        <DirectoryTable label="Teacher directory" caption="Teachers and current section rosters at your authorized school sites."
          rows={teachers} rowKey={teacher => teacher.personId}
          loading={loading && "Loading teachers…"} error={error} onRetry={retry}
          empty={<EmptyState className="mt-8" title="No teachers matched your search at your school sites." />}
          columns={[
            { id: "teacher", title: "Teacher", render: teacher => <>
              <ProfilePhoto personId={teacher.personId} name={teacher.name}/>
              <Link to="/profiles" search={{person:teacher.personId}}
                className="mt-2 inline-block rounded font-semibold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{teacher.name}</Link>
            </> },
            { id: "sections", title: "Sections", render: teacher => teacher.sections.join(", ") },
            { id: "students", title: "Students", render: teacher => teacher.studentCount },
          ]}/>
    </WorkspaceShell>
  );
}
