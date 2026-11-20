import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { WorkspaceLinkNavigation } from "@/components/workspace/workspace-link-navigation";

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
    <WorkspaceLinkNavigation label="Curriculum program scope" surface="plain" className="gap-3">
      {programs.map((program) => (
        <Button asChild key={program.id} variant="outline" size="sm"
          className={selectedProgramId === program.id ? "min-h-11 border-primary bg-accent text-primary" : "min-h-11"}>
          <Link to={destination} search={{ programId: program.id }}
            aria-current={selectedProgramId === program.id ? "page" : undefined}>{program.name}</Link>
        </Button>
      ))}
      {canPublish && selectedProgramId && (
        <Button asChild variant="outline" size="sm" className="min-h-11"><Link to="/operations/curriculum"
          search={{ programId: selectedProgramId }}>Curriculum</Link></Button>
      )}
    </WorkspaceLinkNavigation>
  );
}
