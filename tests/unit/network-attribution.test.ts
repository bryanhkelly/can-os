import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {
  rollupAttributionEvidence,decodeHistoricalNetworkPath,type AttributionEvidence,
} from "@/domain/network-attribution";
import {noncreditPublishCommand,noncreditEnrollCommand} from "@/domain/noncredit-self-enrollment";

const root={id:"root",name:"Network HQ",code:"HQ"};
const state={id:"state",name:"Region",code:"REGION"};
const district={id:"district",name:"District",code:"DISTRICT"};
const local={id:"local",name:"Local Hub",code:"LOCAL"};
const attributed=(changes:Partial<AttributionEvidence>={}):AttributionEvidence=>({
  registrationId:"reg-1",creditedOrganizationId:"church-a",
  organizationName:"Church A",networkMembershipId:"membership-a",
  reportingUnitId:"district",reportingUnitName:"District",
  basis:"self_reported",path:[root,state,district],
  completed:true,verifiedAttendee:true,...changes,
});
const read=(path:string)=>readFileSync(resolve(path),"utf8");
const id="11111111-1111-4111-8111-111111111111";
const release={
  deploymentId:id,adoptionId:id,trainingVersionId:id,courseVersionId:id,
  deliveryMode:"independent" as const,siteId:id,
  opensAt:"2026-11-16T10:00:00Z",closesAt:"2026-12-16T10:00:00Z",
  maxParticipants:100,consentVersion:"pilot-v1",
  consentText:"I accept the documented course enrollment and participation terms.",
};

describe("network attribution is not a parallel enrollment system",()=>{
  it("requires an authorized Site for every published release, including online",()=>{
    expect(noncreditPublishCommand.safeParse(release).success).toBe(true);
    expect(noncreditPublishCommand.safeParse({...release,siteId:null}).success).toBe(false);
    expect(noncreditPublishCommand.safeParse({...release,siteId:undefined}).success).toBe(false);
    expect(noncreditPublishCommand.safeParse({...release,deliveryMode:"facilitated"}).success).toBe(true);
    const service=read("src/modules/enrollment/noncredit-self-enrollment.functions.ts");
    expect(service).toContain("insert(participationAttributions)");
    expect(service).toContain("insert(noncreditSelfEnrollmentClaims)");
    expect(service).toContain('attributionBasis:selectedMembership?"self_reported":"provider_default"');
    const native=read("src/modules/classes/native-class-enrollment.functions.ts");
    expect(native).toContain("insert(participationAttributions)");
    expect(native).toContain("Class enrollment requires a Site");
    const assignment=read("src/modules/classes/native-class-assignment.functions.ts");
    expect(assignment).toContain("insert(participationAttributions)");
  });
  it("permits an optional verifiable affiliate selector but not freeform attribution",()=>{
    const request={releaseId:id,acceptedConsent:true,adultConfirmed:true,
      consentVersion:"pilot-v1",consentSha256:"f".repeat(64)};
    expect(noncreditEnrollCommand.safeParse(request).success).toBe(true);
    expect(noncreditEnrollCommand.safeParse({...request,networkMembershipId:id}).success).toBe(true);
    expect(noncreditEnrollCommand.safeParse({...request,networkMembershipId:"random-name"}).success).toBe(false);
    const directory=read("src/modules/enrollment/noncredit-affiliate-directory.functions.ts");
    expect(directory).toContain('eq(networkMemberships.status,"approved")');
    expect(directory).toContain("eq(networkMemberships.directoryVisible,true)");
  });
  it("counts one registration at each hierarchy level, not three registrations",()=>{
    const {affiliations,networkUnits,uniqueRegistrations}=rollupAttributionEvidence([
      attributed(),
      attributed({registrationId:"reg-2",creditedOrganizationId:"church-b",
        organizationName:"Church B",networkMembershipId:"membership-b",
        reportingUnitId:"local",reportingUnitName:"Local Hub",
        path:[root,state,local],completed:false,verifiedAttendee:false}),
      attributed({registrationId:"reg-3",creditedOrganizationId:"network",
        organizationName:"National HQ",networkMembershipId:null,
        reportingUnitId:null,reportingUnitName:null,
        basis:"provider_default",path:null,completed:true,verifiedAttendee:false}),
    ]);
    expect(uniqueRegistrations).toBe(3);
    expect(affiliations.reduce((sum,x)=>sum+x.registrations,0)).toBe(3);
    expect(networkUnits.find(x=>x.unitId==="root")?.registrations).toBe(2);
    expect(networkUnits.find(x=>x.unitId==="state")?.completed).toBe(1);
    expect(networkUnits.find(x=>x.unitId==="local")?.registrations).toBe(1);
    expect(networkUnits.reduce((sum,x)=>sum+x.registrations,0)).toBeGreaterThan(3);
  });
  it("keeps separate membership identities even when their reporting unit matches",()=>{
    const result=rollupAttributionEvidence([
      attributed({registrationId:"first",networkMembershipId:"membership-older"}),
      attributed({registrationId:"second",networkMembershipId:"membership-newer"}),
    ]);
    expect(result.affiliations).toHaveLength(2);
    expect(result.affiliations.map(x=>x.networkMembershipId).sort())
      .toEqual(["membership-newer","membership-older"]);
    expect(result.networkUnits.find(x=>x.unitId==="district")?.registrations).toBe(2);
    const panel=read("src/components/enrollment/NoncreditNetworkReportPanel.tsx");
    expect(panel).toContain("row.networkMembershipId??\"provider\"");
    expect(panel).toContain("Reporting unit at registration");
  });
  it("rejects duplicate registrations, forged or cyclic snapshot paths",()=>{
    expect(()=>rollupAttributionEvidence([attributed(),attributed()])).toThrow(/twice/);
    expect(()=>rollupAttributionEvidence([attributed({path:[root,state,root]})])).toThrow(/cyclic/);
    expect(()=>rollupAttributionEvidence([attributed({path:null})])).toThrow(/historical membership/);
    expect(()=>rollupAttributionEvidence([attributed({networkMembershipId:null})])).toThrow(/historical membership/);
    expect(()=>rollupAttributionEvidence([attributed({basis:"provider_default"})])).toThrow(/cannot claim/);
    expect(()=>decodeHistoricalNetworkPath([{id:"one",code:"X"}])).toThrow(/Invalid/);
  });
  it("preserves a church\'s historical district when its network hierarchy changes",()=>{
    const nextDistrict={id:"district-new",name:"New District",code:"NEW"};
    const report=rollupAttributionEvidence([
      attributed({registrationId:"older",path:[root,state,district],
        reportingUnitId:"district",reportingUnitName:"District"}),
      attributed({registrationId:"newer",path:[root,state,nextDistrict],
        reportingUnitId:"district-new",reportingUnitName:"New District"}),
    ]);
    expect(report.uniqueRegistrations).toBe(2);
    expect(report.affiliations).toHaveLength(2);
    expect(report.affiliations.every(a=>a.networkMembershipId==="membership-a")).toBe(true);
    expect(report.affiliations.map(a=>a.reportingUnitId).sort())
      .toEqual(["district","district-new"].sort());
    expect(report.networkUnits.find(x=>x.unitId==="root")?.registrations).toBe(2);
    expect(report.networkUnits.find(x=>x.unitId==="district")?.registrations).toBe(1);
    expect(report.networkUnits.find(x=>x.unitId==="district-new")?.registrations).toBe(1);
    expect(()=>rollupAttributionEvidence([
      attributed({reportingUnitId:"district-new",reportingUnitName:"New District",
        path:[root,state,district]}),
    ])).toThrow(/immutable historical path/);
    const service=read("src/modules/enrollment/noncredit-network-report.functions.ts");
    expect(service).toContain("const historicalLeaf=historicalPath?.length");
    expect(service).not.toContain("networkMemberships.reportingUnitId");
    expect(service).toContain("attribution.relationshipSnapshot.creditedOrganizationName");
    const migration=read("database/canonical/v3.0.1/patch-network-attribution-reporting.sql");
    expect(migration).toContain("'creditedOrganizationName',credited_org_name");
    expect(migration).toContain("'creditedOrganizationName',COALESCE(o.display_name,o.legal_name)");
  });
  it("keeps private learner records behind policy and immutable event evidence",()=>{
    const migration=read("database/canonical/v3.0.1/patch-network-attribution-reporting.sql");
    expect(migration).toContain("ALTER COLUMN site_id SET NOT NULL");
    expect(migration).toContain("Network attribution migration blocked");
    expect(migration).toContain("network_reporting_grants");
    expect(migration).toContain("FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("v301_freeze_participation_attribution");
    expect(migration).toContain("Overlapping approved network membership reporting paths");
    expect(migration).toContain("Network hierarchy cannot contain cycles");
    expect(migration).toContain("Network reporting path is not active and effective");
    expect(migration).toContain("valid_from<=NEW.attributed_at");
    expect(migration).toContain("Self-reported selection is limited");
    expect(migration).toContain("v301_noncredit_attribution_required");
    expect(migration).toContain("v301_class_attribution_required");
    expect(migration).toContain("network_member_identifiers");
  });
});
