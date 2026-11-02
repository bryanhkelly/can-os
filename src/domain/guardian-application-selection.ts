type Program = { id: string; schoolYears?: readonly { id: string; name: string }[] };

/** URL selections are intent only; submission still requires server authorization. */
export function guardianApplicationSelection<T extends Program>(programs: readonly T[], selection: {
  requestedProgramId?: string;
  familyStartRequestId?: string;
  programId: string;
  schoolYearId: string;
}) {
  const requested = programs.find(program => program.id === selection.requestedProgramId);
  const unavailable = Boolean(
    (selection.requestedProgramId && !requested) ||
    (selection.familyStartRequestId && !selection.requestedProgramId),
  );
  const eligiblePrograms = unavailable ? [] : selection.familyStartRequestId
    ? programs.filter(program => program.id === selection.requestedProgramId) : programs;
  const program = eligiblePrograms.find(program => program.id === selection.programId);
  const years = program?.schoolYears ?? [];
  const year = selection.schoolYearId ? years.find(year => year.id === selection.schoolYearId)
    : years.length === 1 ? years[0] : undefined;
  return { programs: eligiblePrograms, program, year, unavailable };
}

