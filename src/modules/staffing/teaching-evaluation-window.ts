import type { CoverageWindow } from "./qualification-coverage";

export type TeachingEligibilityHorizon="current"|"instructional_window";

/** Current means the actual evaluation instant, including before/after a term.
 * Full-term evaluation must prove continuous coverage of the instructional window.
 * This chooses evidence dates; it does not itself grant classroom access.
 */
export function teachingEvaluationWindow(
  instruction:CoverageWindow,horizon:TeachingEligibilityHorizon,now:Date,
):CoverageWindow{
  if(!Number.isFinite(now.getTime()))throw new Error("Teaching evaluation time must be valid");
  if(!Number.isFinite(instruction.from.getTime())||!Number.isFinite(instruction.through.getTime())||
    instruction.from>=instruction.through)throw new Error("Invalid instructional coverage window");
  if(horizon==="instructional_window")return instruction;
  if(horizon!=="current")throw new Error("Teaching evaluation horizon must be explicit");
  const through=new Date(now.getTime()+1);
  if(!Number.isFinite(through.getTime()))throw new Error("Teaching evaluation time exceeds supported range");
  return {from:new Date(now),through};
}
