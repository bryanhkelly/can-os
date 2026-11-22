import { describe, expect, it } from "vitest";
import { resolveAccessContext, type VerifiedAccessGrant } from "@/domain/access-context";
import { accountPersonGrants, incidents, safeguardingCaseAssignments } from "@/db/schema";
import {
  loadIncidentAndAssignmentForMutation,
  authorizeEvidenceOrExternalReporterForMutation,
} from "@/modules/safeguarding/safeguarding-access-queries.server";

const grant: VerifiedAccessGrant = {
  id: "grant-a", accountId: "account-a", personId: "person-a",
  role: "safeguarding_responder", organizationId: "org-a",
  siteId: "site-a", active: true,
};
const actor = () => {
  const context = resolveAccessContext({
    accountId:grant.accountId, sessionId:"session-a", activeGrantId:grant.id,
  },[grant]);
  context.scope.programIds=["program-a"];
  return context;
};
const incident = {
  id:"incident-a", type:"safeguarding_concern",
  classification:"safeguarding_restricted", reporterPersonId:"reporter-a",
  organizationId:"org-a", siteId:"site-a", programId:"program-a",
};
const assignment = {
  personId:"person-a", responsibility:"primary", revokedAt:null,
};

/** Contract stub simulates PostgreSQL's locked row selection. It cannot
 * substitute for a real concurrent-transaction acceptance test. */
function lockedTx(options:{
  activeGrant?:boolean; activeAssignment?:boolean; resource?:typeof incident;
}={}) {
  const locks:string[]=[];
  const tx={
    select:()=>({
      from:(table:unknown)=>{
        const label=table===incidents?"incident":table===accountPersonGrants?"grant":
          table===safeguardingCaseAssignments?"assignment":"unknown";
        const result=label==="incident"?[options.resource??incident]:
          label==="grant"?(options.activeGrant===false?[]:[{id:grant.id}]):
          label==="assignment"?(options.activeAssignment===false?[]:[assignment]):[];
        const chain={
          where:()=>chain,
          for:(mode:string)=>{locks.push(label+":"+mode);return chain;},
          limit:async()=>result,
        };
        return chain;
      },
    }),
  } as unknown as Parameters<typeof loadIncidentAndAssignmentForMutation>[0];
  return {tx,locks};
}

describe("transaction-bound restricted safeguarding authorization",()=>{
  it("locks incident, live Person grant and named assignment before returning permission",async()=>{
    const {tx,locks}=lockedTx();
    const result=await loadIncidentAndAssignmentForMutation(
      tx,actor(),"incident-a","safeguarding.respond");
    expect(result).toMatchObject({incident,assignment});
    expect(locks).toEqual(["incident:update","grant:share","assignment:share"]);
  });

  it("fails closed on grant deactivation or case-assignment revocation",async()=>{
    for(const input of [{activeGrant:false},{activeAssignment:false}]){
      const {tx,locks}=lockedTx(input);
      await expect(loadIncidentAndAssignmentForMutation(
        tx,actor(),"incident-a","safeguarding.respond")).rejects.toThrow();
      expect(locks[0]).toBe("incident:update");
    }
  });

  it("rejects a sibling Site even if a live grant and named assignment are returned",async()=>{
    const {tx}=lockedTx({resource:{...incident,siteId:"site-b"}});
    await expect(loadIncidentAndAssignmentForMutation(
      tx,actor(),"incident-a","safeguarding.respond")).rejects.toThrow();
  });

  it("uses the same locks for non-reporter external report mutations",async()=>{
    const {tx,locks}=lockedTx();
    await expect(authorizeEvidenceOrExternalReporterForMutation(
      tx,actor(),"incident-a","safeguarding.external_report.record")).resolves.toMatchObject(incident);
    expect(locks).toEqual(["incident:update","grant:share","assignment:share"]);
  });
});
