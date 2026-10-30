import { describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { resolveAccessContext } from "@/domain/access-context";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
const state = vi.hoisted(() => ({tx:undefined as Tx|undefined}));
vi.mock("@/db/client",()=>({get db(){
  if(!state.tx)throw new Error("Safeguarding sweep tests require a rollback transaction");
  return state.tx;
}}));
const integration=process.env.DATABASE_URL?describe:describe.skip;
integration("scheduled restricted safeguarding handoff",()=>{
  it("routes current fallbacks without narratives, deduplicates retries and stops after human acknowledgment",async()=>{
    const {db:realDb}=await vi.importActual<{db:Database}>("@/db/client");
    const rollback=new Error("rollback-safeguarding-sweep");let checked=false;
    try{await realDb.transaction(async tx=>{
      state.tx=tx;
      const s=await import("@/db/schema");
      const {escalateOverdueSafeguardingConcerns:sweep}=await import("@/modules/safeguarding/safeguarding-overdue.server");
      const {acknowledgeSafeguardingConcern,resolveSafeguardingConcern,completeSafeguardingCaseReview,getSafeguardingCase,assignSafeguardingCaseReview,escalateSafeguardingConcern}=await import("@/modules/safeguarding/safeguarding-service");
      const suffix=crypto.randomUUID().slice(0,8);
      const [org]=await tx.insert(s.organizations).values({type:"christian_school",name:"Safeguarding sweep fixture",slug:"sg-sweep-"+suffix}).returning();
      const [site]=await tx.insert(s.sites).values({organizationId:org!.id,name:"Synthetic campus",slug:"sg-site-"+suffix,timezone:"UTC"}).returning();
      async function responder(label:string){
        const [person]=await tx.insert(s.people).values({legalFirstName:"Synthetic",legalLastName:label}).returning();
        const [account]=await tx.insert(s.accessAccounts).values({emailNormalized:label+"-"+suffix+"@example.invalid",emailVerifiedAt:new Date()}).returning();
        const [grant]=await tx.insert(s.accountPersonGrants).values({personId:person!.id,accountId:account!.id,role:"safeguarding_responder",organizationId:org!.id,siteId:site!.id}).returning();
        return {person:person!,account:account!,grant:grant!};
      }
      const primary=await responder("primary"),deputy=await responder("deputy"),fallback=await responder("fallback");
      await tx.insert(s.safeguardingSiteResponders).values([
        {siteId:site!.id,personId:primary.person.id,responsibility:"primary",appointedByPersonId:primary.person.id},
        {siteId:site!.id,personId:deputy.person.id,responsibility:"deputy",appointedByPersonId:primary.person.id},
        {siteId:site!.id,personId:fallback.person.id,responsibility:"can_lead",appointedByPersonId:primary.person.id},
      ]);
      const now=new Date();
      async function concern(label:string,dueAt=new Date(now.getTime()-60_000)){
        const [incident]=await tx.insert(s.incidents).values({incidentNumber:"SG-SWEEP-"+label+"-"+suffix,
          type:"safeguarding_concern",severity:"high",status:"filed",occurredAt:now,reportedAt:now,
          reporterPersonId:primary.person.id,organizationId:org!.id,siteId:site!.id,
          classification:"safeguarding_restricted",summary:"PROTECTED-NARRATIVE-"+suffix}).returning();
        await tx.insert(s.safeguardingConcerns).values({incidentId:incident!.id,reporterPersonId:primary.person.id,
          idempotencyKey:crypto.randomUUID(),concernKinds:["other"],source:"direct_observation",immediateDanger:"no",
          urgent:false,policyVersion:"synthetic-v1",acknowledgmentDueAt:dueAt});
        return incident!;
      }
      const overdue=await concern("overdue"),future=await concern("future",new Date(now.getTime()+86_400_000));
      // Small pages also prove completed handoffs do not starve later cases.
      expect(await sweep(now,1)).toMatchObject({escalatedCases:1,routedRecipients:2});
      const handoffs=()=>tx.select().from(s.incidentNotifications).where(and(
        eq(s.incidentNotifications.incidentId,overdue.id),eq(s.incidentNotifications.purpose,"safeguarding_overdue_handoff")));
      expect(await handoffs()).toHaveLength(2);
      expect((await sweep(now,1)).routedRecipients).toBe(0);
      expect(await handoffs()).toHaveLength(2);
      const notices=await tx.select({body:s.notifications.body,title:s.notifications.title,resourceType:s.notifications.resourceType})
        .from(s.notifications).where(eq(s.notifications.resourceId,overdue.id));
      expect(notices).toHaveLength(2);
      for(const notice of notices){
        expect(notice.resourceType).toBe("safeguarding_concern");
        expect(JSON.stringify(notice)).not.toContain("PROTECTED-NARRATIVE");
        expect(JSON.stringify(notice)).not.toContain(overdue.incidentNumber);
      }
      expect(await tx.select().from(s.safeguardingCaseAssignments).where(eq(s.safeguardingCaseAssignments.incidentId,future.id))).toHaveLength(0);
      // A replacement roster member receives a fresh, deduplicated handoff.
      const replacement=await responder("replacement");
      await tx.update(s.safeguardingSiteResponders).set({personId:replacement.person.id}).where(and(
        eq(s.safeguardingSiteResponders.siteId,site!.id),eq(s.safeguardingSiteResponders.responsibility,"deputy")));
      expect((await sweep(now,1)).routedRecipients).toBe(1);
      expect(await handoffs()).toHaveLength(3);
      const actor=resolveAccessContext({accountId:replacement.account.id,activeGrantId:replacement.grant.id,sessionId:"synthetic"},[replacement.grant]);
      actor.scope.siteIds=[site!.id];actor.scope.programIds=[];
      await acknowledgeSafeguardingConcern(actor,overdue.id);
      // Canonical pending reviews must not be stranded by restricted-case closure.
      const review={id:crypto.randomUUID()};
      const assignmentInput={incidentId:overdue.id,reviewId:review.id,reviewerPersonId:replacement.person.id,
        kind:"follow_up_review" as const,notes:"Synthetic policy review"};
      expect(await assignSafeguardingCaseReview(actor,assignmentInput)).toMatchObject({replayed:false});
      expect(await assignSafeguardingCaseReview(actor,assignmentInput)).toMatchObject({replayed:true});
      await expect(assignSafeguardingCaseReview(actor,{...assignmentInput,notes:"Different task on the same identifier"}))
        .rejects.toThrow("already in use");
      await expect(assignSafeguardingCaseReview(actor,{...assignmentInput,reviewId:crypto.randomUUID(),reviewerPersonId:primary.person.id}))
        .rejects.toThrow("reviewer must already have current restricted case access");
      await tx.update(s.accountPersonGrants).set({active:false}).where(eq(s.accountPersonGrants.id,fallback.grant.id));
      await expect(assignSafeguardingCaseReview(actor,{...assignmentInput,reviewId:crypto.randomUUID(),reviewerPersonId:fallback.person.id}))
        .rejects.toThrow("reviewer must already have current restricted case access");
      await tx.update(s.accountPersonGrants).set({active:true}).where(eq(s.accountPersonGrants.id,fallback.grant.id));
      const assignedEvents=await tx.select().from(s.domainEvents).where(and(eq(s.domainEvents.aggregateId,overdue.id),eq(s.domainEvents.eventType,"SafeguardingCaseReviewAssigned")));
      expect(assignedEvents).toHaveLength(1);
      expect(JSON.stringify(assignedEvents[0]!.payload)).not.toContain(assignmentInput.notes);
      const summary="The assigned response and internal case reviews have been recorded.";
      await expect(resolveSafeguardingConcern(actor,{incidentId:overdue.id,resolutionSummary:summary}))
        .rejects.toThrow("Complete all assigned restricted case reviews");
      const detail=await getSafeguardingCase(actor,overdue.id);
      expect(detail.reviews).toContainEqual(expect.objectContaining({id:review!.id,status:"pending",canComplete:true}));
      const otherActor=resolveAccessContext({accountId:fallback.account.id,activeGrantId:fallback.grant.id,sessionId:"synthetic"},[fallback.grant]);
      otherActor.scope.siteIds=[site!.id];otherActor.scope.programIds=[];
      const complete={incidentId:overdue.id,reviewId:review!.id,outcome:"The assigned internal review has been completed and recorded."};
      await expect(completeSafeguardingCaseReview(otherActor,complete)).rejects.toThrow("only the named restricted case reviewer");
      expect(await completeSafeguardingCaseReview(actor,complete)).toMatchObject({replayed:false});
      expect(await completeSafeguardingCaseReview(actor,complete)).toMatchObject({replayed:true});
      const reviewEvents=await tx.select().from(s.domainEvents).where(and(eq(s.domainEvents.aggregateId,overdue.id),eq(s.domainEvents.eventType,"SafeguardingCaseReviewCompleted")));
      expect(reviewEvents).toHaveLength(1);
      expect(JSON.stringify(reviewEvents[0]!.payload)).not.toContain(complete.outcome);
      await expect(resolveSafeguardingConcern(actor,{incidentId:overdue.id,resolutionSummary:summary})).resolves.toMatchObject({incidentId:overdue.id});
      const closedBeforeRetry=(await tx.select().from(s.incidents).where(eq(s.incidents.id,overdue.id)))[0]!;
      expect(await resolveSafeguardingConcern(actor,{incidentId:overdue.id,resolutionSummary:summary})).toMatchObject({replayed:true});
      await expect(resolveSafeguardingConcern(actor,{incidentId:overdue.id,resolutionSummary:"A different resolution must not silently replace the original."}))
        .rejects.toThrow("different recorded resolution summary");
      await expect(resolveSafeguardingConcern(otherActor,{incidentId:overdue.id,resolutionSummary:summary}))
        .rejects.toThrow("already closed by another responder");
      const closedAfterRetry=(await tx.select().from(s.incidents).where(eq(s.incidents.id,overdue.id)))[0]!;
      expect(closedAfterRetry.closedAt).toEqual(closedBeforeRetry.closedAt);
      expect(closedAfterRetry.metadata).toEqual(closedBeforeRetry.metadata);
      const closureEvents=await tx.select().from(s.domainEvents).where(and(eq(s.domainEvents.aggregateId,overdue.id),eq(s.domainEvents.eventType,"IncidentClosed")));
      expect(closureEvents).toHaveLength(1);
      expect(await tx.select().from(s.safeguardingExternalReports).where(eq(s.safeguardingExternalReports.incidentId,overdue.id))).toHaveLength(0);

      expect((await sweep(now,1)).routedRecipients).toBe(0);
      const audit=await tx.select().from(s.auditEvents).where(and(eq(s.auditEvents.resourceId,overdue.id),eq(s.auditEvents.action,"safeguarding.concern.escalate_overdue")));
      expect(audit).toHaveLength(2);
      // Urgent intake may have already assigned a fallback. It still receives
      // one deadline notice, rather than being skipped or notified every run.
      const urgent=await concern("already-assigned");
      await tx.insert(s.safeguardingCaseAssignments).values({incidentId:urgent.id,personId:replacement.person.id,responsibility:"deputy"});
      await tx.insert(s.incidentNotifications).values({incidentId:urgent.id,recipientPersonId:replacement.person.id,
        recipientType:"safeguarding_responder",recipientLabel:"deputy",channel:"in_app",purpose:"safeguarding_concern_response",status:"pending"});
      expect((await sweep(now,1)).routedRecipients).toBe(2);
      expect((await sweep(now,1)).routedRecipients).toBe(0);
      expect(await tx.select().from(s.safeguardingCaseAssignments).where(eq(s.safeguardingCaseAssignments.incidentId,urgent.id))).toHaveLength(2);
      await acknowledgeSafeguardingConcern(actor,urgent.id);
      // An explicit case-level revocation must never be resurrected by a sweep.
      const revoked=await concern("revoked");
      await tx.insert(s.safeguardingCaseAssignments).values([
        {incidentId:revoked.id,personId:replacement.person.id,responsibility:"deputy",revokedAt:now,revocationReason:"Synthetic restriction"},
        {incidentId:revoked.id,personId:fallback.person.id,responsibility:"can_lead",revokedAt:now,revocationReason:"Synthetic restriction"},
      ]);
      expect(await sweep(now,1)).toMatchObject({routedRecipients:0,unroutableCases:1});
      expect(await tx.select().from(s.incidentNotifications).where(eq(s.incidentNotifications.incidentId,revoked.id))).toHaveLength(0);
      // A closed fixture is not returned by the subsequent sweep.
      await tx.update(s.incidents).set({status:"closed",closedAt:now,closedByPersonId:primary.person.id}).where(eq(s.incidents.id,revoked.id));
      // No eligible grant means no unsafe assignment; the queued case stays open.
      await tx.update(s.accessAccounts).set({disabled:true}).where(eq(s.accessAccounts.id,replacement.account.id));
      await tx.update(s.accountPersonGrants).set({active:false}).where(eq(s.accountPersonGrants.id,fallback.grant.id));
      const blocked=await concern("blocked");
      expect(await sweep(now,1)).toMatchObject({routedRecipients:0,unroutableCases:1});
      expect(await tx.select().from(s.safeguardingCaseAssignments).where(eq(s.safeguardingCaseAssignments.incidentId,blocked.id))).toHaveLength(0);
      expect((await tx.select({status:s.incidents.status}).from(s.incidents).where(eq(s.incidents.id,blocked.id)))[0]?.status).toBe("filed");
      // Manual handoff follows the same live recipient rules as the sweep.
      const manual=await concern("manual",new Date(now.getTime()+86_400_000));
      await tx.insert(s.safeguardingCaseAssignments).values({incidentId:manual.id,personId:primary.person.id,responsibility:"primary"});
      const primaryActor=resolveAccessContext({accountId:primary.account.id,activeGrantId:primary.grant.id,sessionId:"synthetic"},[primary.grant]);
      primaryActor.scope.siteIds=[site!.id];primaryActor.scope.programIds=[];
      expect(await escalateSafeguardingConcern(primaryActor,manual.id)).toMatchObject({escalated:false,unroutable:true});
      expect(await tx.select().from(s.incidentNotifications).where(eq(s.incidentNotifications.incidentId,manual.id))).toHaveLength(0);
      await tx.update(s.accessAccounts).set({disabled:false,emailVerifiedAt:null}).where(eq(s.accessAccounts.id,replacement.account.id));
      expect(await escalateSafeguardingConcern(primaryActor,manual.id)).toMatchObject({unroutable:true});
      await tx.update(s.accessAccounts).set({emailVerifiedAt:now}).where(eq(s.accessAccounts.id,replacement.account.id));
      expect(await escalateSafeguardingConcern(primaryActor,manual.id)).toMatchObject({escalated:true,responsibilities:["deputy"],unroutable:false});
      expect(await escalateSafeguardingConcern(primaryActor,manual.id)).toMatchObject({escalated:false,unroutable:false});
      expect(await tx.select().from(s.incidentNotifications).where(eq(s.incidentNotifications.incidentId,manual.id))).toHaveLength(1);
      await tx.update(s.safeguardingCaseAssignments).set({revokedAt:now,revocationReason:"Synthetic restriction"})
        .where(and(eq(s.safeguardingCaseAssignments.incidentId,manual.id),eq(s.safeguardingCaseAssignments.personId,replacement.person.id)));
      expect(await escalateSafeguardingConcern(primaryActor,manual.id)).toMatchObject({escalated:false,unroutable:true});
      await tx.update(s.incidents).set({status:"closed",closedAt:now,closedByPersonId:primary.person.id}).where(eq(s.incidents.id,manual.id));
      await expect(escalateSafeguardingConcern(primaryActor,manual.id)).rejects.toThrow("Only an open safeguarding case");
      const unroutableAudit=await tx.select().from(s.auditEvents).where(and(eq(s.auditEvents.resourceId,manual.id),
        eq(s.auditEvents.action,"safeguarding.concern.escalation_unroutable")));
      expect(unroutableAudit).toHaveLength(3);
      checked=true;throw rollback;
    });}catch(error){if(error!==rollback)throw error;}finally{state.tx=undefined;}
    expect(checked).toBe(true);
  },120_000);
});
