import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { searchStudents } from "@/modules/profiles/directory.functions";
import { EmptyState, QueryState, WorkspaceShell } from "@/components/workspace";
import { useDebouncedDirectorySearch } from "@/lib/use-debounced-directory-search";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

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
        <label className="mt-8 block max-w-sm text-sm font-semibold">
          Search by name
          <input
            className="mt-2 w-full rounded-lg border bg-background p-3"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="First or last name"
          />
        </label>
        <QueryState loading={loading && "Loading students…"} error={error} onRetry={retry} isEmpty={students.length === 0}
          empty={<EmptyState className="mt-8" title="No students matched your search at your school sites." />}>
          <div className="mt-8 rounded-xl border bg-card">
            <Table aria-label="Student directory" className="text-left">
              <TableHeader>
                <TableRow className="text-xs uppercase tracking-wider text-muted-foreground">
                  <TableHead scope="col" className="px-5 py-3 font-semibold">Student</TableHead>
                  <TableHead scope="col" className="px-5 py-3 font-semibold">Grade</TableHead>
                  <TableHead scope="col" className="px-5 py-3 font-semibold">Active sections</TableHead>
                  <TableHead scope="col" className="px-5 py-3 font-semibold">Missing work</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((student) => (
                  <TableRow key={student.personId}>
                    <TableCell className="px-5 py-3">
                      <Link className="font-semibold underline" to="/staff/students/$personId" params={{personId:student.personId}}>
                        {student.name}
                      </Link>
                    </TableCell>
                    <TableCell className="px-5 py-3">{student.gradeLevel ?? "—"}</TableCell>
                    <TableCell className="px-5 py-3">{student.activeSectionCount}</TableCell>
                    <TableCell className="px-5 py-3">{student.openMissingWorkCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </QueryState>
    </WorkspaceShell>
  );
}
