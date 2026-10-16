import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listTeachers } from "@/modules/profiles/directory.functions";

export const Route = createFileRoute("/staff/teachers")({ component: StaffTeachersPage });

type TeacherRow = Awaited<ReturnType<typeof listTeachers>>["teachers"][number];

function StaffTeachersPage() {
  const [query, setQuery] = useState("");
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    const handle = setTimeout(() => {
      listTeachers({ data: { query: query.trim() || undefined } })
        .then((result) => {
          if (active) {
            setTeachers(result.teachers);
            setLoading(false);
          }
        })
        .catch(() => {
          if (active) {
            setTeachers([]);
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
        <h1 className="mt-2 font-serif text-4xl">Teacher directory</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Teachers leading sections at your school sites, with current rosters.
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
        {loading && <p className="mt-8 text-sm" role="status">Loading teachers…</p>}
        {error && <p className="mt-8 rounded-lg border p-4 text-sm" role="alert">{error}</p>}
        {!loading && !error && teachers.length === 0 && (
          <p className="mt-8 text-sm">No teachers matched your search at your school sites.</p>
        )}
        {!loading && !error && teachers.length > 0 && (
          <div className="mt-8 overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-3 font-semibold">Teacher</th>
                  <th className="px-5 py-3 font-semibold">Sections</th>
                  <th className="px-5 py-3 font-semibold">Students</th>
                </tr>
              </thead>
              <tbody>
                {teachers.map((teacher) => (
                  <tr key={teacher.personId} className="border-b last:border-0 align-top">
                    <td className="px-5 py-3 font-semibold">{teacher.name}</td>
                    <td className="px-5 py-3">{teacher.sections.join(", ")}</td>
                    <td className="px-5 py-3">{teacher.studentCount}</td>
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
