import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { searchStudents } from "@/modules/profiles/directory.functions";

export const Route = createFileRoute("/staff/students")({ component: StaffStudentsPage });

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
    <main className="min-h-screen bg-background px-6 py-10 text-foreground">
      <div className="mx-auto max-w-5xl">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">CAN OS · Staff</p>
        <h1 className="mt-2 font-serif text-4xl">Student directory</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Students at your school sites. Select a student to open their 360 profile.
        </p>
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
        {loading && <p className="mt-8 text-sm" role="status">Loading students…</p>}
        {error && <p className="mt-8 rounded-lg border p-4 text-sm" role="alert">{error}</p>}
        {!loading && !error && students.length === 0 && (
          <p className="mt-8 text-sm">No students matched your search at your school sites.</p>
        )}
        {!loading && !error && students.length > 0 && (
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
                      <a className="font-semibold underline" href={`/staff/students/${student.personId}`}>
                        {student.name}
                      </a>
                    </td>
                    <td className="px-5 py-3">{student.gradeLevel ?? "—"}</td>
                    <td className="px-5 py-3">{student.activeSectionCount}</td>
                    <td className="px-5 py-3">{student.openMissingWorkCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
