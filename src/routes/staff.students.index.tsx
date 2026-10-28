import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { searchStudents } from "@/modules/profiles/directory.functions";
import { EmptyState, QueryState, WorkspaceShell } from "@/components/workspace";

export const Route = createFileRoute("/staff/students/")({ component: StaffStudentsPage });

type StudentRow = Awaited<ReturnType<typeof searchStudents>>["students"][number];

function StaffStudentsPage() {
  const [query, setQuery] = useState("");
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    const handle = setTimeout(() => {
      searchStudents({ data: { query: query.trim() || undefined } })
        .then((result) => {
          if (active) {
            setStudents(result.students);
            setError("");
            setLoading(false);
          }
        })
        .catch(() => {
          if (active) {
            setStudents([]);
            setError("Sign in with an authorized staff account.");
            setLoading(false);
          }
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [query]);

  return (
    <WorkspaceShell eyebrow="CAN OS · Staff" title="Student directory"
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
        <QueryState loading={loading && "Loading students…"} error={error} isEmpty={students.length === 0}
          empty={<EmptyState className="mt-8" title="No students matched your search at your school sites." />}>
          <div className="mt-8 overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-3 font-semibold">Student</th>
                  <th className="px-5 py-3 font-semibold">Grade</th>
                  <th className="px-5 py-3 font-semibold">Active sections</th>
                  <th className="px-5 py-3 font-semibold">Missing work</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.personId} className="border-b last:border-0">
                    <td className="px-5 py-3">
                      <Link className="font-semibold underline" to="/staff/students/$personId" params={{personId:student.personId}}>
                        {student.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3">{student.gradeLevel ?? "—"}</td>
                    <td className="px-5 py-3">{student.activeSectionCount}</td>
                    <td className="px-5 py-3">{student.openMissingWorkCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </QueryState>
    </WorkspaceShell>
  );
}
