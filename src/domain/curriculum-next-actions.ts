import type { JourneyEvidence } from "./curriculum-journey-readiness";

/** Operational guidance for the school registrar; no E2E or credit claims. */
export type CurriculumNextAction={
 key:string; title:string; detail:string; destination:"packs"|"launch"|"none";
};
export function schoolCurriculumNextActions(evidence:JourneyEvidence):CurriculumNextAction[]{
 const actions:CurriculumNextAction[]=[];
 const classes=evidence.classes;
 if(!evidence.installedPacks)
  actions.push({key:"install",title:"Review curriculum packs",detail:"No published publisher packs have been added to this school's library.",destination:"packs"});
 else if(!evidence.adoptedPacks)
  actions.push({key:"adopt",title:"Adopt a curriculum release",detail:"Installed packs are not yet adopted for this program.",destination:"packs"});
 if(evidence.adoptedPacks>0&&!classes.length)
  actions.push({key:"sections",title:"Provision classes from adopted curriculum",detail:"Adoption is complete but no classes currently use those releases.",destination:"launch"});
 if(classes.length){
  const noLessons=classes.filter(c=>!c.publishedLessonCount).length;
  const noTeachers=classes.filter(c=>!c.teacherCount).length;
  const noStudents=classes.filter(c=>!c.studentCount).length;
  const noAssignments=classes.filter(c=>c.teacherCount>0&&!c.assignedAssessmentCount).length;
  if(noLessons)actions.push({key:"content",title:"Review classes without published lesson content",
   detail:`${noLessons} class(es) reference a course with no published lessons. Verify the pinned publisher release.`,destination:"launch"});
  if(noTeachers)actions.push({key:"teachers",title:"Assign teaching staff",
   detail:`${noTeachers} class(es) still need an assigned teacher.`,destination:"launch"});
  if(noStudents)actions.push({key:"students",title:"Review class enrollment",
   detail:`${noStudents} class(es) have no active enrolled students. Complete the normal school enrollment and scheduling process.`,destination:"none"});
  if(noAssignments)actions.push({key:"assignments",title:"Coordinate first classroom assignments",
   detail:`${noAssignments} staffed class(es) have no published assessments yet. Ask assigned teachers to use their class planning workspace.`,destination:"none"});
 }
 return actions;
}
