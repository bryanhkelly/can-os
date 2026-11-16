import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import type { SitePublishedClassListing } from "@/domain/site-content-channels";

type Reader=Pick<typeof db,"execute">;
const uuid=z.string().uuid();
const deliveryMode=z.enum(["self_paced","scheduled","facilitated","hybrid"]);
const candidate=z.object({
  classId:uuid,title:z.string().min(1).max(300),
  deliveryMode,nextStartsAt:z.coerce.date().nullable(),
}).strict();

/** Public Class Offering catalog under a separately approved Site link.
 * Never returns private, unlisted or draft Classes, rosters, room URLs,
 * facilitator identities or public enrollment promises. */
export async function readLinkedSitePublishedClasses(
  publicSiteId:string,executor:Reader=db,
):Promise<SitePublishedClassListing[]> {
  if(process.env.CAN_UNIFIED_CLASS_COMMANDS_ENABLED!=="true" ||
     !uuid.safeParse(publicSiteId).success)return [];
  const links=await executor.execute(sql`
    SELECT canonical_site_id AS "canonicalSiteId"
    FROM public.site_canonical_identity_links
    WHERE public_site_id=${publicSiteId}::uuid AND status='approved'
  `);
  if(links.rows.length!==1)return [];
  const canonicalSiteId=uuid.parse(links.rows[0]?.canonicalSiteId);
  const rows=await executor.execute(sql`
    SELECT DISTINCT c.id AS "classId",c.title AS "title",
      c.delivery_mode AS "deliveryMode",
      (SELECT MIN(ds.starts_at)
       FROM education_v30.class_sessions cs
       INNER JOIN education_v30.delivery_sessions ds
         ON ds.id=cs.delivery_session_id AND ds.site_id=c.site_id
       INNER JOIN education_v30.facilitated_classroom_plans fp
         ON fp.id=cs.classroom_plan_id AND fp.state<>'cancelled'
       WHERE cs.class_id=c.id AND ds.starts_at>=CURRENT_TIMESTAMP
      ) AS "nextStartsAt"
    FROM education_v30.classes c
    INNER JOIN education_v30.class_offerings co ON co.class_id=c.id
    INNER JOIN education_v30.class_offering_versions cv
      ON cv.class_id=c.id AND cv.class_offering_id=co.id
    INNER JOIN education_v30.sites s
      ON s.id=c.site_id AND s.status='active'
    INNER JOIN education_v30.program_deployments pd
      ON pd.id=c.deployment_id AND pd.status='active'
    INNER JOIN education_v30.education_operations op
      ON op.id=pd.operation_id AND op.status='active'
    INNER JOIN education_v30.deployment_offering_adoptions adoption
      ON adoption.id=c.adoption_id
      AND adoption.deployment_id=c.deployment_id
      AND adoption.offering_version_id=c.offering_version_id
      AND adoption.approval_status='approved'
      AND adoption.valid_from<=CURRENT_TIMESTAMP
      AND (adoption.valid_through IS NULL OR adoption.valid_through>CURRENT_TIMESTAMP)
    INNER JOIN education_v30.offering_versions ov
      ON ov.id=c.offering_version_id AND ov.lifecycle='published'
      AND ov.published_at IS NOT NULL
    INNER JOIN education_v30.offerings catalog
      ON catalog.id=ov.offering_id AND catalog.status='active'
      AND catalog.id=pd.offering_id
    INNER JOIN education_v30.offering_courses pairing
      ON pairing.offering_version_id=ov.id
      AND pairing.course_version_id=c.course_version_id
    INNER JOIN education_v30.course_versions course
      ON course.id=c.course_version_id AND course.lifecycle='published'
      AND course.published_at IS NOT NULL
    WHERE c.site_id=${canonicalSiteId}::uuid
      AND c.state='active'
      AND cv.state='published' AND cv.visibility='public'
      AND cv.published_at IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM education_v30.education_operation_organization_roles role
        WHERE role.operation_id=pd.operation_id
          AND role.organization_id=c.operating_organization_id
          AND role.role_code='operator' AND role.status='approved'
          AND role.valid_from<=CURRENT_TIMESTAMP
          AND (role.valid_through IS NULL OR role.valid_through>CURRENT_TIMESTAMP)
      )
      AND EXISTS (
        SELECT 1 FROM education_v30.education_operation_sites os
        WHERE os.operation_id=pd.operation_id AND os.site_id=c.site_id
          AND os.valid_from<=CURRENT_TIMESTAMP
          AND (os.valid_through IS NULL OR os.valid_through>CURRENT_TIMESTAMP)
      )
      AND EXISTS (
        SELECT 1 FROM education_v30.site_organization_roles sr
        WHERE sr.site_id=c.site_id
          AND sr.organization_id=c.operating_organization_id
          AND sr.role_code IN ('operator','host')
          AND sr.valid_from<=CURRENT_TIMESTAMP
          AND (sr.valid_through IS NULL OR sr.valid_through>CURRENT_TIMESTAMP)
      )
      AND (c.delivery_mode='self_paced' OR EXISTS (
        SELECT 1 FROM education_v30.deployment_sites ds
        WHERE ds.deployment_id=c.deployment_id AND ds.site_id=c.site_id
      ))
    ORDER BY c.title,c.id
    LIMIT 40
  `);
  return rows.rows.flatMap(row=>{
    const checked=candidate.safeParse(row);
    return checked.success ? [{
      classId:checked.data.classId,title:checked.data.title,
      deliveryMode:checked.data.deliveryMode,
      nextStartsAt:checked.data.nextStartsAt?.toISOString()??null,
    }] : [];
  });
}

/** Unsupported schema/permissions never make an otherwise valid Site fail.
 * This optional public read fails closed and logs no sensitive detail. */
export async function readOptionalSitePublishedClasses(
  publicSiteId:string,executor:Reader=db,
):Promise<SitePublishedClassListing[]> {
  try{return await readLinkedSitePublishedClasses(publicSiteId,executor);}
  catch(error){
    console.error("Optional public Class catalog unavailable",{
      errorType:error instanceof Error?error.name:"unknown",
    });
    return [];
  }
}
