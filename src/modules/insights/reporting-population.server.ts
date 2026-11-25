import { inArray } from "drizzle-orm";
import type { db } from "@/db/client";
import { organizations } from "@/db/schema";
import { classifyOwnedData } from "@/domain/domain-classification";

/** Accept only Organization IDs from a previously authorized source scope.
 * Domains are current classification evidence, never permission or historical
 * event provenance. A missing domain remains unknown. */
export async function readAuthorizedOwnerDomains(
  reader:Pick<typeof db,"select">, authorizedOrganizationIds:readonly string[],
):Promise<Map<string,string|null>>{
  const ids=[...new Set(authorizedOrganizationIds)];
  if(!ids.length)return new Map();
  if(ids.length>10000)throw new Error("Reporting Organization scope exceeds safe bound");
  const rows=await reader.select({id:organizations.id,domain:organizations.domain})
    .from(organizations).where(inArray(organizations.id,ids));
  const result=new Map(rows.map(row=>[row.id,row.domain] as const));
  if(ids.some(id=>!result.has(id)))throw new Error("Reporting operating Organization unavailable");
  return result;
}

export async function readAuthorizedOwnerClassification(
  reader:Pick<typeof db,"select">, authorizedOrganizationId:string,
){
  const domains=await readAuthorizedOwnerDomains(reader,[authorizedOrganizationId]);
  return {dataClassification:classifyOwnedData(domains.get(authorizedOrganizationId)),
    classificationBasis:"current_operating_organization_domain" as const};
}
