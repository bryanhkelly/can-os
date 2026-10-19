export function launchReadiness(requirements: { status: string; blocking: boolean; title: string }[]) {
  const complete = requirements.filter(item => item.status === "complete").length;
  const blockers = requirements.filter(item => item.blocking && item.status !== "complete");
  return {
    complete, total: requirements.length, blockers,
    percentage: requirements.length ? Math.round(complete / requirements.length * 100) : null,
  };
}
