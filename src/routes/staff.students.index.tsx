import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { searchStudents } from "@/modules/profiles/directory.functions";
import { DirectoryTable, EmptyState, WorkspaceShell } from "@/components/workspace";
import { useDebouncedDirectorySearch } from "@/lib/use-debounced-directory-search";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/staff/students/")({ component: StaffStudentsPage });

const findStudents = async (query?: string) => (await searchStudents({ data: { query } })).students;

function StaffStudentsPage() {
  const [query, setQuery] = useState("");
  const { rows: students, loading, error, retry } = useDebouncedDirectorySearch(
    query, findStudents, "Student search is unavailable. Try again.",
  );

  return (
    <WorkspaceShell eyebrow="Staff" title="Student directory"
      subtitle="Students at your school sites. Select a student to open their 360 profile.">
        <Field label="Search by name" className="mt-8 max-w-sm">
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="First or last name"
          />
        </Field>
        <DirectoryTable label="Student directory" caption="Students at your authorized school sites."
          rows={students} rowKey={student => student.personId}
          loading={loading && "Loading students…"} error={error} onRetry={retry}
          empty={<EmptyState className="mt-8" title="No students matched your search at your school sites." />}
          columns={[
            { id: "student", title: "Student", render: student => <Link className="font-semibold underline"
              to="/staff/students/$personId" params={{personId:student.personId}}>{student.name}</Link> },
            { id: "grade", title: "Grade", render: student => student.gradeLevel ?? "—" },
            { id: "sections", title: "Active sections", render: student => student.activeSectionCount },
            { id: "missing-work", title: "Missing work", render: student => student.openMissingWorkCount },
          ]}/>
    </WorkspaceShell>
  );
}
