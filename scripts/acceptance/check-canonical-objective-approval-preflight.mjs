#!/usr/bin/env node
/** Read-only QA gate. Does NOT create, approve, release or modify any record.
 * Use only with a disposable QA connection and a reviewed publisher Org UUID.
 */
import { Pool } from "@neondatabase/serverless";

if(process.env.CAN_CANONICAL_ASSESSMENT_APPROVAL_PREFLIGHT!=="1")
  throw new Error("Set CAN_CANONICAL_ASSESSMENT_APPROVAL_PREFLIGHT=1");
const url=process.env.DATABASE_URL;
const org=process.env.CAN_CANONICAL_ASSESSMENT_QA_ORGANIZATION_ID;
if(!url||!org||!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(org))
  throw new Error("Supply isolated QA DATABASE_URL and publisher Organization UUID");
const roles={
  reviewer:"can_v30_assess_reviewer_"+org.replaceAll("-","").toLowerCase(),
  publisher:"can_v30_assess_publisher_"+org.replaceAll("-","").toLowerCase(),
};
const functions=[
  "education_v30.v301_list_objective_review_queue(uuid,uuid,text)",
  "education_v30.v301_objective_assessment_snapshot(uuid,uuid,uuid,text)",
  "education_v30.v301_record_objective_assessment_review(uuid,uuid,uuid,text,uuid,text,text,text)",
  "education_v30.v301_publish_objective_assessment(uuid,uuid,uuid)",
];
const pool=new Pool({connectionString:url,max:1});
const blockers=[];
try{
  const client=await pool.connect();
  try{
    await client.query("BEGIN READ ONLY");
    try{
      const {rows:roleRows}=await client.query(
        `SELECT rolname,rolcanlogin,rolinherit,rolsuper,rolbypassrls,
                rolcreatedb,rolcreaterole
         FROM pg_roles WHERE rolname=ANY($1::text[])`,[Object.values(roles)]);
      for(const role of Object.values(roles)){
        const found=roleRows.find(row=>row.rolname===role);
        if(!found)blockers.push("missing independent role "+role);
        else if(found.rolcanlogin||found.rolinherit||found.rolsuper||
          found.rolbypassrls||found.rolcreatedb||found.rolcreaterole)
          blockers.push("unrestricted review or publisher role "+role);
      }
      for(const sig of functions){
        const {rows}=await client.query(
          "SELECT to_regprocedure($1)::text AS signature",[sig]);
        if(!rows[0]?.signature)blockers.push("function not installed: "+sig);
      }
      const checks=[
        [roles.reviewer,functions[2],true],
        [roles.publisher,functions[3],true],
        [roles.reviewer,functions[3],false],
        [roles.publisher,functions[2],false],
      ];
      for(const [role,fn,expected] of checks){
        try{
          const {rows}=await client.query(
            "SELECT has_function_privilege($1,$2,'EXECUTE') AS allowed",[role,fn]);
          if(rows[0]?.allowed!==expected)
            blockers.push("incorrect review/publish permission "+role+" "+fn);
        }catch(error){blockers.push("missing role/function privilege "+String(error.message));}
      }
      for(const role of Object.values(roles)){
        for(const [table,privilege] of [
          ["assessment_item_secure_keys","SELECT"],
          ["assessment_versions","UPDATE"],
          ["assessment_item_review_decisions","INSERT"],
          ["assessment_form_review_decisions","INSERT"],
          ["assessment_attempt_results","SELECT"],
        ]){
          try{
            const {rows}=await client.query(
              "SELECT has_table_privilege($1,$2,$3) AS allowed",
              [role,"education_v30."+table,privilege]);
            if(rows[0]?.allowed)blockers.push(role+" must not have direct "+privilege+" on "+table);
          }catch(error){blockers.push(String(error.message));}
        }
      }
      const {rows:bindings}=await client.query(
        `SELECT purpose_code,db_role::text
         FROM education_v30.database_role_organization_bindings
         WHERE organization_id=$1::uuid AND status='approved'
           AND purpose_code=ANY($2::text[])
           AND valid_from<=clock_timestamp()
           AND (valid_through IS NULL OR valid_through>clock_timestamp())`,
        [org,["assessment_reviewer","assessment_publisher"]]);
      for(const [purpose,role] of [
        ["assessment_reviewer",roles.reviewer],
        ["assessment_publisher",roles.publisher]]){
        if(!bindings.some(row=>row.purpose_code===purpose&&row.db_role===role))
          blockers.push("missing current bound role "+purpose);
      }
      const {rows:appointments}=await client.query(
        `SELECT assignment.role_code,count(*)::integer AS current_count
         FROM education_v30.professional_role_assignments assignment
         JOIN education_v30.evidence_document_versions e
           ON e.id=assignment.authority_evidence_id
         JOIN education_v30.evidence_documents document
           ON document.id=e.document_id
         WHERE assignment.appointing_organization_id=$1::uuid
           AND assignment.organization_id=$1::uuid
           AND assignment.role_code=ANY($2::text[])
           AND assignment.state='approved'
           AND assignment.begins_at<=clock_timestamp()
           AND (assignment.ends_at IS NULL OR assignment.ends_at>clock_timestamp())
           AND e.verified_at IS NOT NULL
           AND e.verified_by_person_id IS NOT NULL
           AND (e.valid_from IS NULL OR e.valid_from<=CURRENT_DATE)
           AND (e.valid_through IS NULL OR e.valid_through>=CURRENT_DATE)
           AND document.owning_organization_id=$1::uuid
         GROUP BY assignment.role_code`,
         [org,["assessment_reviewer","assessment_publisher"]]);
      for(const purpose of ["assessment_reviewer","assessment_publisher"]){
        if(!appointments.some(row=>row.role_code===purpose&&row.current_count>0))
          blockers.push("no current evidence-backed Person appointment for "+purpose);
      }
      console.log(JSON.stringify({
        readOnly:true,organizationId:org,roles,
        personAppointments:appointments,blockers,
        note:"Read-only privilege inspection, not proof of passing review, publication, encryption or authenticated browser flow.",
      },null,2));
      if(blockers.length)process.exitCode=1;
    }finally{await client.query("ROLLBACK");}
  }finally{client.release();}
}catch(error){
  console.error("Read-only canonical objective approval QA failed:",error.message);
  process.exitCode=2;
}finally{await pool.end();}
