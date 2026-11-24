import {eq,sql} from "drizzle-orm";
import {db} from "@/db/client";
import {organizations,accessAccounts} from "@/db/schema";
import type {AccessContext} from "@/domain/access-context";
import {AuthorizationError} from "@/domain/command-context";
import {isDemoAccountEmail} from "@/domain/local-demo-access";
import {assertNetworkReportingReadinessReader,assessNetworkReportingReadiness,type NetworkReadinessCounts} from "@/domain/network-reporting-readiness";
import {requireCurrentNetworkAgreement} from "@/modules/networks/network-agreement.server";

/** Only setup inventory is returned. No participant, attribution, host name,
 * document, source payload or outcome records are read or returned.
 */
export async function readNetworkReportingReadiness(actor:AccessContext){
  if(actor.scope.organizationIds?.length!==1)throw new AuthorizationError("single denomination HQ scope");
  const networkId=actor.scope.organizationIds[0]!;
  return db.transaction(async tx=>{
    const [organization]=await tx.select({id:organizations.id,type:organizations.type})
      .from(organizations).where(eq(organizations.id,networkId)).limit(1);
    if(!organization)throw new AuthorizationError("verified denomination organization");
    assertNetworkReportingReadinessReader(actor,organization);
    const [account]=await tx.select({verifiedAt:accessAccounts.emailVerifiedAt,disabled:accessAccounts.disabled,email:accessAccounts.emailNormalized})
      .from(accessAccounts).where(eq(accessAccounts.id,actor.accountId)).limit(1);
    if(!account?.verifiedAt||account.disabled||isDemoAccountEmail(account.email))throw new AuthorizationError("verified non-demo network HQ account");
    const now=new Date();
    await requireCurrentNetworkAgreement(tx,networkId,now);
    const result=await tx.execute(sql`
      WITH units AS (
        SELECT count(*)::int configured,
          count(*) FILTER(WHERE status='active' AND valid_from<=${now.toISOString()}::timestamptz
            AND (valid_through IS NULL OR valid_through>${now.toISOString()}::timestamptz))::int active
        FROM public.network_units WHERE network_organization_id=${networkId}::uuid
      ), memberships AS (
        SELECT count(*)::int configured,
          count(*) FILTER(WHERE status='approved' AND reviewed_at IS NOT NULL AND reviewed_by_person_id IS NOT NULL AND evidence_version_id IS NOT NULL
            AND reviewed_at<=${now.toISOString()}::timestamptz AND valid_from<=${now.toISOString()}::timestamptz
            AND (valid_through IS NULL OR valid_through>${now.toISOString()}::timestamptz))::int current
        FROM public.network_reporting_memberships WHERE network_organization_id=${networkId}::uuid
      ), grants AS (
        SELECT count(*)::int configured,
          count(*) FILTER(WHERE revoked_at IS NULL AND valid_from<=${now.toISOString()}::timestamptz
            AND (valid_through IS NULL OR valid_through>${now.toISOString()}::timestamptz) AND cardinality(allowed_metrics)>0)::int current,
          count(DISTINCT host_organization_id) FILTER(WHERE revoked_at IS NULL AND valid_from<=${now.toISOString()}::timestamptz
            AND (valid_through IS NULL OR valid_through>${now.toISOString()}::timestamptz) AND cardinality(allowed_metrics)>0)::int hosts
        FROM public.network_reporting_grants WHERE network_organization_id=${networkId}::uuid
      )
      SELECT units.configured AS "configuredUnits",units.active AS "activeUnits",
        memberships.configured AS "configuredMemberships",memberships.current AS "currentMemberships",
        grants.configured AS "configuredGrants",grants.current AS "currentGrants",grants.hosts AS "currentGrantHosts"
      FROM units CROSS JOIN memberships CROSS JOIN grants
    `);
    const counts=result.rows[0] as unknown as NetworkReadinessCounts|undefined;
    if(!counts)throw Error("Network setup inventory unavailable");
    return {networkOrganizationId:networkId,asOf:now.toISOString(),...assessNetworkReportingReadiness(counts)};
  },{isolationLevel:"repeatable read",accessMode:"read only"});
}
