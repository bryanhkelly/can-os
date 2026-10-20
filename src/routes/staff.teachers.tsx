import { createFileRoute, Link } from "@tanstack/react-router";
import { ProfilePhoto } from "@/components/profiles/ProfilePhoto";
import { useEffect, useState } from "react";
import { listTeachers } from "@/modules/profiles/directory.functions";
import { EmptyState, QueryState, WorkspaceShell } from "@/components/workspace";

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
            setError("");
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
        <QueryState loading={loading && "Loading teachers…"} error={error} isEmpty={teachers.length === 0}
          empty={<EmptyState className="mt-8" title="No teachers matched your search at your school sites." />}>
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
                    <td className="px-5 py-3 font-semibold"><ProfilePhoto personId={teacher.personId} name={teacher.name}/><Link to="/profiles" search={{person:teacher.personId}} className="mt-2 inline-block underline">{teacher.name}</Link></td>
                    <td className="px-5 py-3">{teacher.sections.join(", ")}</td>
                    <td className="px-5 py-3">{teacher.studentCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </QueryState>
    </WorkspaceShell>
  );
}
