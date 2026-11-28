import {sql} from "drizzle-orm";
import {z} from "zod";
import type {db} from "@/db/client";
import type {RelationshipRegistrationFact} from "@/domain/relationship-registration-projection";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
const uuid=z.string().uuid();
const rowSchema=z.object({
  sourceId:uuid,personId:uuid,courseVersionId:uuid.nullable(),deliverySiteId:uuid,
  operatingOrganizationId:uuid,registeredAt:z.coerce.date().transform(d=>d.toISOString()),
  currentStatus:z.string(),offeringId:uuid,classId:uuid.nullable(),
});
/** INTERNAL source adapter. Owner IDs must be derived from current independently
 * accepted agreement authority in the same transaction. This is not an API.
 * No source row leaves the server. Site-less records and inferred Program
 * links are deliberately outside this adapter. Noncredit claims must reconcile
 * to the exact original release; retries or partial joins cannot invent facts. */
export async function readRelationshipRegistrationFacts(tx:Tx,options:{
  source:"native_class_enrollment"|"noncredit_registration";ownerIds:readonly string[];
  from:string;to:string;
}):Promise<RelationshipRegistrationFact[]>{
  const owners=z.array(uuid).max(1000).parse([...new Set(options.ownerIds)]);
  if(!owners.length)return [];
  const from=new Date(options.from),to=new Date(options.to);
  if(!Number.isFinite(from.getTime())||!Number.isFinite(to.getTime())||from>=to||
    to.getTime()-from.getTime()>366*86400000)throw Error("Bounded closed registration window required");
  const ownerList=sql.join(owners.map(id=>sql`${id}::uuid`),sql`, `);
  const range=(column:ReturnType<typeof sql>)=>sql`${column}>=${from.toISOString()}::timestamptz AND ${column}<${to.toISOString()}::timestamptz`;
  const query=options.source==="native_class_enrollment"?sql`
    SELECT e.id AS "sourceId",e.learner_person_id AS "personId",c.course_version_id AS "courseVersionId",
      c.site_id AS "deliverySiteId",c.operating_organization_id AS "operatingOrganizationId",
      e.enrolled_at AS "registeredAt",e.status AS "currentStatus",v.offering_id AS "offeringId",c.id AS "classId"
    FROM public.class_enrollments e JOIN public.classes c ON c.id=e.class_id
    JOIN public.sites s ON s.id=c.site_id AND s.organization_id=c.operating_organization_id
    JOIN public.offering_versions v ON v.id=c.offering_version_id
    JOIN public.deployment_offering_adoptions a ON a.id=c.adoption_id
      AND a.deployment_id=c.deployment_id AND a.offering_version_id=v.id AND a.offering_id=v.offering_id
    JOIN public.program_deployments d ON d.id=c.deployment_id AND d.offering_id=v.offering_id
    WHERE c.operating_organization_id IN (${ownerList}) AND ${range(sql`e.enrolled_at`)}
    ORDER BY e.id LIMIT 100001`:sql`
    SELECT n.id AS "sourceId",n.participant_person_id AS "personId",r.course_version_id AS "courseVersionId",
      q.site_id AS "deliverySiteId",n.registering_organization_id AS "operatingOrganizationId",
      n.registered_at AS "registeredAt",n.status AS "currentStatus",v.offering_id AS "offeringId",NULL::uuid AS "classId"
    FROM public.noncredit_registrations n
    JOIN public.noncredit_self_enrollment_claims q ON q.registration_id=n.id
      AND q.participant_person_id=n.participant_person_id
    JOIN public.noncredit_self_enrollment_releases r ON r.id=q.release_id AND r.site_id=q.site_id
      AND r.registering_organization_id=n.registering_organization_id
      AND r.deployment_id=n.deployment_id AND r.adoption_id=n.adoption_id
      AND r.offering_version_id=n.offering_version_id AND r.training_version_id=n.training_version_id
    JOIN public.sites s ON s.id=q.site_id AND s.organization_id=n.registering_organization_id
    JOIN public.offering_versions v ON v.id=n.offering_version_id
    JOIN public.deployment_offering_adoptions a ON a.id=n.adoption_id
      AND a.deployment_id=n.deployment_id AND a.offering_version_id=v.id AND a.offering_id=v.offering_id
    JOIN public.program_deployments d ON d.id=n.deployment_id AND d.offering_id=v.offering_id
    WHERE n.registering_organization_id IN (${ownerList}) AND ${range(sql`n.registered_at`)}
    ORDER BY n.id LIMIT 100001`;
  const result=await tx.execute(query);
  if(result.rows.length>100000)throw Error("Canonical registration source exceeds bounded report window");
  const rows=z.array(rowSchema).parse(result.rows);
  // Identical duplicates are intentionally not silently reconciled here.
  // A source adapter is responsible for its one-row-per-record grain.
  if(new Set(rows.map(r=>r.sourceId)).size!==rows.length)throw Error("Registration source requires identity reconciliation");
  return rows.map(row=>({...row,source:options.source,programId:null,creditedOrganizationId:null}));
}
