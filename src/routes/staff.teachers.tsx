import { createFileRoute, Link } from "@tanstack/react-router";
import { ProfilePhoto } from "@/components/profiles/ProfilePhoto";
import { useState } from "react";
import { listTeachers } from "@/modules/profiles/directory.functions";
import { DirectoryPage, EmptyState } from "@/components/workspace";
import { useDebouncedDirectorySearch } from "@/lib/use-debounced-directory-search";
import { DirectoryTable } from "@/components/workspace/directory-table";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/staff/teachers")({ component: StaffTeachersPage });

const findTeachers = async (query?: string) => (await listTeachers({ data: { query } })).teachers;

function StaffTeachersPage() {
  const [query, setQuery] = useState("");
  const { rows: teachers, loading, error, retry } = useDebouncedDirectorySearch(
    query, findTeachers, "Teacher search is unavailable. Try again.",
  );

  return (
    <DirectoryPage eyebrow="Staff" title="Teacher directory"
      subtitle="Teachers leading sections at your school sites, with current rosters."
      query={query} onQueryChange={setQuery} searchLabel="Search by name" searchPlaceholder="First or last name">
        <DirectoryTable label="Teacher directory" caption="Teachers and current section rosters at your authorized school sites."
          rows={teachers} rowKey={teacher => teacher.personId}
          loading={loading && "Loading teachers…"} error={error} onRetry={retry}
          empty={<EmptyState className="mt-8" kind={query.trim()?"matches":"records"}
            title={query.trim()?"No teachers matched your search at your school sites.":"No teachers in your authorized school sites."}
            actions={query.trim()?<Button variant="outline" onClick={()=>setQuery("")}>Clear search</Button>:undefined}/>}
          columns={[
            { id: "teacher", title: "Teacher", render: teacher => <>
              <ProfilePhoto personId={teacher.personId} name={teacher.name}/>
              <Link to="/profiles" search={{person:teacher.personId}}
                className="mt-2 inline-block rounded font-semibold underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{teacher.name}</Link>
            </> },
            { id: "sections", title: "Sections", render: teacher => teacher.sections.join(", ") },
            { id: "students", title: "Students", render: teacher => teacher.studentCount },
          ]}/>
    </DirectoryPage>
  );
}
