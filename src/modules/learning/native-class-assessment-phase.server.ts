import {sql} from "drizzle-orm";
import {db} from "@/db/client";
import {AuthorizationError} from "@/domain/command-context";
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
export const finalClassAssessmentPurposes=["formative","practice","readiness","mastery"] as const;
export function matchesNativeClassAssessmentPhase(purpose:string,phase:"baseline"|"final"){
 return phase==="baseline"?purpose==="diagnostic":finalClassAssessmentPurposes.some(value=>value===purpose);
}
/** Diagnostic assessments must never become completion evidence, including on an older database. */
export async function assertNativeClassDiagnosticAuthority(tx:Tx){
 const gate=await tx.execute(sql`
  SELECT EXISTS(
   SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
   JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE t.tgname='ws3_class_completion_decision_insert_guard'
     AND t.tgrelid=to_regclass('education_v30.class_outcomes')
     AND NOT t.tgisinternal AND t.tgenabled IN ('O','A')
     AND n.nspname='education_v30' AND p.proname='ws3_guard_class_completion_decision'
     AND position('definition.purpose IN (''formative'',''practice'',''readiness'',''mastery'')' in pg_get_functiondef(p.oid))>0
  ) AND EXISTS(
   SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='education_v30' AND p.proname='v301_ws3_class_completion_is_current'
     AND p.oid=to_regprocedure('education_v30.v301_ws3_class_completion_is_current(uuid)')
     AND position('definition.purpose IN (''formative'',''practice'',''readiness'',''mastery'')' in pg_get_functiondef(p.oid))>0
  ) AS installed
 `);
 if(gate.rows[0]?.installed!==true)throw new AuthorizationError("Native Class diagnostic requires phase-aware completion database authority");
}
