import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { searchStudents } from "@/modules/profiles/directory.functions";
import { EmptyState, WorkspaceShell, DirectoryTable } from "@/components/workspace";
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
    <WorkspaceShell eyebrow="CAN OS · Staff" title="Student directory"
      subtitle="Students at your school sites. Select a student to open their 360 profile.">
        <Field label="Search by name" className="mt-8 max-w-sm">
          <Input type="search" value={query} onChange={event=>setQuery(event.target.value)}
            placeholder="First or last name"/>
        </Field>
        <DirectoryTable presentation="banded" label="Student directory"
          caption="Student records returned within your verified school and role scope."
          rows={students} rowKey={student=>student.personId}
          loading={loading && "Loading students…"} error={error} onRetry={retry}
          empty={<EmptyState className="mt-8" title="No students matched your search at your school sites."/>}
          columns={[
            {id:"student",title:"Student",render:student=><div>
              <Link to="/staff/students/$personId" params={{personId:student.personId}}
                className="font-semibold underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">{student.name}</Link>
              <p className="mt-1 text-xs text-muted-foreground">Open authorized student profile →</p>
            </div>},
            {id:"grade",title:"Grade",render:student=>student.gradeLevel??"—"},
            {id:"classes",title:"Classes",render:student=>student.activeSectionCount},
            {id:"missing",title:"Missing work",render:student=>student.openMissingWorkCount},
          ]}
        />
    </WorkspaceShell>
  );
}
