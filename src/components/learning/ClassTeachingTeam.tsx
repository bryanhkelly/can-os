import { Link } from "@tanstack/react-router";
import { WorkspacePanel } from "@/components/workspace";

export function ClassTeachingTeam({ teachers }: { teachers: readonly { personId: string; name: string }[] }) {
  return (
    <WorkspacePanel title="Teaching team">
      <ul className="space-y-2 text-sm">
        {teachers.map((teacher) => (
          <li key={teacher.personId}>
            <Link to="/profiles" search={{ person: teacher.personId }} className="underline">
              {teacher.name}
            </Link>
          </li>
        ))}
      </ul>
      {!teachers.length && (
        <p className="text-sm text-muted-foreground">No teaching team is assigned.</p>
      )}
    </WorkspacePanel>
  );
}
