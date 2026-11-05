import { Link } from "@tanstack/react-router";

export interface CurriculumProgramOption {
  id: string;
  name: string;
}

export function CurriculumProgramNavigation({
  programs,
  selectedProgramId,
  canPublish,
  destination = "/operations/curriculum-marketplace",
}: {
  programs: readonly CurriculumProgramOption[];
  selectedProgramId?: string;
  canPublish: boolean;
  destination?: "/operations/curriculum-marketplace" | "/operations/curriculum-marketplace/resources" | "/operations/curriculum-marketplace/imports" | "/operations/curriculum-marketplace/roster";
}) {
  return (
    <nav className="flex flex-wrap gap-3" aria-label="Curriculum program scope">
      {programs.map((program) => (
        <Link
          key={program.id}
          to={destination}
          search={{ programId: program.id }}
          aria-current={selectedProgramId === program.id ? "page" : undefined}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          {program.name}
        </Link>
      ))}
      {canPublish && selectedProgramId && (
        <Link
          to="/operations/curriculum"
          search={{ programId: selectedProgramId }}
          className="rounded-lg border px-3 py-2 text-sm underline"
        >
          Curriculum
        </Link>
      )}
    </nav>
  );
}
