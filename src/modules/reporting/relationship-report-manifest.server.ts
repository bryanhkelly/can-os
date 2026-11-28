import {createHash} from "node:crypto";
import {canonicalJson} from "@/lib/canonical-json";
import type {RelationshipRegistrationFact} from "@/domain/relationship-registration-projection";
import type {ReportingRelationship,RelationshipMetric} from "@/domain/bottom-up-reporting-relationships";
import type {RegistrationSourceCoverage} from "@/domain/relationship-source-reconciliation";

/** Internal fingerprint of the exact calculation inputs, including excluded
 * joined facts. Not a frozen source snapshot, completeness proof or approval.
 * Never expose this digest or underlying facts to a report recipient. */
export function fingerprintRelationshipRegistrationCalculation(input:{
 recipientOrganizationId:string;population:"real"|"synthetic";metric:RelationshipMetric;
 window:{from:string;to:string;asOf:string};agreements:readonly ReportingRelationship[];
 facts:readonly RelationshipRegistrationFact[];sourceJoin:RegistrationSourceCoverage;
 projection:{status:string;value:number|null;distinctContributors:number;agreementIds:readonly string[]};
}):string{
 const {facts,agreements,projection,...header}=input;
 const sort=(values:readonly unknown[])=>values.map(canonicalJson).sort();
 const hash=createHash("sha256");
 hash.update(canonicalJson({schemaVersion:1,kind:"internal_registration_calculation",...header,projection:{...projection,agreementIds:[...projection.agreementIds].sort()}})+"\n");
 hash.update(canonicalJson({agreements:sort(agreements)})+"\n");
 for(const fact of sort(facts))hash.update(fact+"\n");
 return hash.digest("hex");
}
