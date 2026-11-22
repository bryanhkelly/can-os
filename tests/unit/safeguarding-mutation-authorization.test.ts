import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { resolveAccessContext, type VerifiedAccessGrant } from "@/domain/access-context";
import { accessAccounts, accountPersonGrants, incidents, people, safeguardingCaseAssignments } from "@/db/schema";
import {
  loadIncidentAndAssignmentForMutation,
  authorizeEvidenceOrExternalReporterForMutation,
  currentSafeguardingGrantPredicate,
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
  const joins:unknown[]=[];
  const lockTargets:unknown[][]=[];
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
          innerJoin:(joined:unknown)=>{ joins.push(joined);return chain; },
          for:(mode:string,options?:{of?:unknown[]})=>{
            locks.push(label+":"+mode);if(options?.of)lockTargets.push(options.of);
            return chain;
          },
          limit:async()=>result,
        };
        return chain;
      },
    }),
  } as unknown as Parameters<typeof loadIncidentAndAssignmentForMutation>[0];
  return {tx,locks,joins,lockTargets};
}

describe("transaction-bound restricted safeguarding authorization",()=>{
  it("locks incident, live Person grant and named assignment before returning permission",async()=>{
    const {tx,locks,joins,lockTargets}=lockedTx();
    const result=await loadIncidentAndAssignmentForMutation(
      tx,actor(),"incident-a","safeguarding.respond");
    expect(result).toMatchObject({incident,assignment});
    expect(locks).toEqual(["incident:update","grant:share","assignment:share"]);
    expect(joins).toEqual([accessAccounts,people]);
    expect(lockTargets).toEqual([[accountPersonGrants,accessAccounts,people]]);
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

describe("live safeguarding membership SQL scope",()=>{
  const dialect=new PgDialect();
  it("constrains membership, original Site, verified account and active Person",()=>{
    const {sql,params}=dialect.sqlToQuery(currentSafeguardingGrantPredicate(actor()));
    expect(sql).toContain('"account_person_grants"."organization_id"');
    expect(sql).toContain('"account_person_grants"."site_id"');
    expect(sql).toContain('"access_accounts"."person_id"');
    expect(sql).toContain('"access_accounts"."disabled"');
    expect(sql).toContain('"access_accounts"."email_verified_at"');
    expect(sql).toContain('"people"."active"');
    for(const value of ["org-a","site-a","account-a","person-a","grant-a","safeguarding_responder"])
      expect(params).toContain(value);
  });
  it("preserves the original Organization-wide scope instead of expanding a Site",()=>{
    const wide={...actor(),grantSiteId:null};
    const {sql,params}=dialect.sqlToQuery(currentSafeguardingGrantPredicate(wide));
    expect(sql).toMatch(/"account_person_grants"."site_id" is null/i);
    expect(params).not.toContain("site-a");
  });
  it("rejects an unscoped or multi-Organization actor at mutation time",()=>{
    const noOrg=actor();noOrg.scope.organizationIds=[];
    expect(()=>currentSafeguardingGrantPredicate(noOrg)).toThrow();
    const multiOrg=actor();multiOrg.scope.organizationIds=["org-a","org-b"];
    expect(()=>currentSafeguardingGrantPredicate(multiOrg)).toThrow();
  });
});
