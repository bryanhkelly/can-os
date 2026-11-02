import { createFileRoute, Link } from "@tanstack/react-router";
import { ProfilePhoto } from "@/components/profiles/ProfilePhoto";
import { useState } from "react";
import { listTeachers } from "@/modules/profiles/directory.functions";
import { EmptyState, QueryState, WorkspaceShell } from "@/components/workspace";
import { useDebouncedDirectorySearch } from "@/lib/use-debounced-directory-search";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

export const Route = createFileRoute("/staff/teachers")({ component: StaffTeachersPage });

const findTeachers = async (query?: string) => (await listTeachers({ data: { query } })).teachers;

function StaffTeachersPage() {
  const [query, setQuery] = useState("");
  const { rows: teachers, loading, error, retry } = useDebouncedDirectorySearch(
    query, findTeachers, "Teacher search is unavailable. Try again.",
  );

  return (
    <WorkspaceShell eyebrow="CAN OS · Staff" title="Teacher directory"
      subtitle="Teachers leading sections at your school sites, with current rosters.">
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
        <QueryState loading={loading && "Loading teachers…"} error={error} onRetry={retry} isEmpty={teachers.length === 0}
          empty={<EmptyState className="mt-8" title="No teachers matched your search at your school sites." />}>
          <div className="mt-8 rounded-xl border bg-card">
            <Table aria-label="Teacher directory" className="text-left">
              <TableHeader>
                <TableRow className="text-xs uppercase tracking-wider text-muted-foreground">
                  <TableHead scope="col" className="px-5 py-3 font-semibold">Teacher</TableHead>
                  <TableHead scope="col" className="px-5 py-3 font-semibold">Sections</TableHead>
                  <TableHead scope="col" className="px-5 py-3 font-semibold">Students</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teachers.map((teacher) => (
                  <TableRow key={teacher.personId}>
                    <TableCell className="px-5 py-3 align-top font-semibold"><ProfilePhoto personId={teacher.personId} name={teacher.name}/><Link to="/profiles" search={{person:teacher.personId}} className="mt-2 inline-block underline">{teacher.name}</Link></TableCell>
                    <TableCell className="px-5 py-3 align-top">{teacher.sections.join(", ")}</TableCell>
                    <TableCell className="px-5 py-3 align-top">{teacher.studentCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </QueryState>
    </WorkspaceShell>
  );
}
