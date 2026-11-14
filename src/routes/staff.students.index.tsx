import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { searchStudents } from "@/modules/profiles/directory.functions";
import { DirectoryPage, DirectoryTable, EmptyState } from "@/components/workspace";
import { useDebouncedDirectorySearch } from "@/lib/use-debounced-directory-search";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/staff/students/")({ component: StaffStudentsPage });

const findStudents = async (query?: string) => (await searchStudents({ data: { query } })).students;

function StaffStudentsPage() {
  const [query, setQuery] = useState("");
  const { rows: students, loading, error, retry } = useDebouncedDirectorySearch(
    query, findStudents, "Student search is unavailable. Try again.",
  );

  return (
    <DirectoryPage eyebrow="Staff" title="Student directory"
      subtitle="Students in your assigned classes or authorized school sites." query={query} onQueryChange={setQuery}
      searchLabel="Search by name" searchPlaceholder="First or last name">
        <DirectoryTable label="Student directory" caption="Students in your assigned classes or authorized school sites."
          rows={students} rowKey={student => student.personId}
          loading={loading && "Loading students…"} error={error} onRetry={retry}
          empty={<EmptyState className="mt-8" kind={query.trim()?"matches":"records"}
            title={query.trim()?"No students matched your search in your authorized classes or school sites.":"No students in your authorized classes or school sites."}
            actions={query.trim()?<Button variant="outline" onClick={()=>setQuery("")}>Clear search</Button>:undefined}/>}
          columns={[
            { id: "student", title: "Student", render: student => <Link className="font-semibold underline"
              to="/staff/students/$personId" params={{personId:student.personId}}>{student.name}</Link> },
            { id: "grade", title: "Grade", render: student => student.gradeLevel ?? "—" },
            { id: "sections", title: "Active sections", render: student => student.activeSectionCount },
            { id: "missing-work", title: "Missing work", render: student => student.openMissingWorkCount },
          ]}/>
    </DirectoryPage>
  );
}
