import { db } from "@/db/client";
import {
accessAccounts,
admissionSeatPools,
actions,
applications,
consentRecords,
enrollments,
guardianRelationships,
householdMemberships,
households,
journeys,
journeyRequirements,
people,
programs,
publicAdmissionsInterests,
publicFamilyStartRequests,
schoolYears,
studentProfiles
} from "@/db/schema";
import { assertApplicationAcceptance,assertApplicationRetryOwnership } from "@/domain/admissions-transitions";
import { assertGuardianApplicationOpening } from "@/domain/guardian-application-opening";
import {
assertFamilyApplicationRetry,
assertVerifiedFamilyStudentReuse,
schoolYearMatchesFamilyProgram,
} from "@/domain/family-application-handoff";
import { lockAttendanceConfigurationAtSite } from "@/domain/attendance-configuration-lock";
import {
assertCapability,
assertProgramScope,
AuthorizationError,
type CommandContext,
} from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { assertEnrollmentFormApproved, enrollmentJourneyDefinitionKey } from "@/domain/enrollment-form";
import { lockAdmissionsApplication } from "@/domain/admissions-application-lock";
import { assertApplicationOffersAllowed } from "@/domain/admissions-policy";
import { instantiateJourneyFromDefinition } from "@/modules/journeys/instantiate";
import { requireChurchHostedOperatingServices } from "@/modules/programs/program-site-authorization.server";
import { emitEvent,writeAudit } from "@/platform/mutation";
import { and,desc,eq,inArray,isNotNull,isNull,or,sql } from "drizzle-orm";

/** Enrollment commands must never interpret an absent program grant as global access. */
function requireEnrollmentProgramScope(context:CommandContext,programId:string):void {
  if (!context.scope.programIds?.includes(programId)) throw new AuthorizationError(`program scope: ${programId}`);
  assertProgramScope(context,programId);
}

export async function startFamilyApplication(
  context: CommandContext,
  input: {
    programId: string;
    idempotencyKey: string;
    householdId?: string;
    householdDisplayName?: string;
    schoolYearId?: string;
    existingStudentProfileId?: string;
    /** Existing guardian-requested origin transfer; not destination admission authority. */
    originTransferActionId?: string;
    confirmedTransferDestination?: true;
    destinationRecordsReleaseAuthorized?: true;
    familyStartRequestId?: string;
    source?: "family_account" | "published_site";
    student: {
      legalFirstName: string;
      legalLastName: string;
      preferredName?: string;
      gradeLevel?: string;
    };
    guardianRelationshipLabel?: string;
    journeyDefinitionKey?: string;
    /** Only the verified guardian-facing server command may set this. */
    parentSelfService?: true;
  },
): Promise<{
  applicationId: string;
  householdId: string;
  studentProfileId: string;
  journeyId: string;
}> {
  assertCapability(context, "enrollment.apply");
  // Check current program authorization even on an idempotency retry. A prior
  // submission does not preserve access after the guardian grant is revoked.
  if (!context.scope.programIds?.includes(input.programId)) {
    throw new AuthorizationError(`program scope: ${input.programId}`);
  }
  if (!context.actorPersonId) throw new Error("Guardian identity is required");
  if ((input.existingStudentProfileId || input.familyStartRequestId || input.originTransferActionId) && !input.parentSelfService) {
    throw new AuthorizationError("verified guardian application handoff");
  }
  const actorPersonId = context.actorPersonId;
  const accountId = "accountId" in context && typeof context.accountId === "string"
    ? context.accountId : null;

  return db.transaction(async (tx) => {
    if (input.parentSelfService) {
      // Serialize concurrent submissions by this verified adult and Program,
      // including first submissions where no Household exists yet. A retry
      // and a fresh browser request must not create duplicate Student people.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"family-application:"+actorPersonId+":"+input.programId}))`);
      const [opening] = await tx.select({status:programs.status,organizationId:programs.organizationId,
        siteId:programs.siteId}).from(programs).where(eq(programs.id,input.programId)).for("share").limit(1);
      assertGuardianApplicationOpening(opening,context.scope);
      await requireChurchHostedOperatingServices(tx,input.programId,["admissions","school_of_record"]);
    }

    // An origin transfer belongs to this parent and existing student; it
    // never authorizes entry into a destination school on its own.
    let originTransfer: {actionId:string;programId:string;siteId:string|null;destinationSchoolName:string;metadata:Record<string,unknown>}|null=null;
    if(input.originTransferActionId){
      if(input.confirmedTransferDestination!==true||
         input.destinationRecordsReleaseAuthorized!==true)
        throw new AuthorizationError("Guardian must explicitly authorize academic-record release to this receiving school");
      if(!input.existingStudentProfileId)
        throw new AuthorizationError("Transfer requires a verified existing student");
      const [origin]=await tx.select({
        id:actions.id,type:actions.type,status:actions.status,
        subjectType:actions.subjectType,subjectId:actions.subjectId,
        siteId:actions.siteId,programId:actions.programId,metadata:actions.metadata,
      }).from(actions).where(eq(actions.id,input.originTransferActionId)).for("update").limit(1);
      if(!origin||origin.type!=="guardian_enrollment_change_request"||
         origin.subjectType!=="student_profile"||
         origin.subjectId!==input.existingStudentProfileId||
         origin.metadata.kind!=="transfer"||
         origin.metadata.requestedByGuardianPersonId!==actorPersonId||
         typeof origin.metadata.recordsReleaseConsentId!=="string"||
         typeof origin.metadata.destinationSchoolName!=="string"||
         !origin.metadata.destinationSchoolName.trim()||
         !origin.programId||origin.programId===input.programId||
         origin.status==="cancelled")
        throw new AuthorizationError("Verified origin transfer from this parent and student");
      originTransfer={actionId:origin.id,programId:origin.programId,siteId:origin.siteId,
        destinationSchoolName:origin.metadata.destinationSchoolName,metadata:origin.metadata};
    }
    const [existing] = await tx
      .select({
        applicationId: applications.id,
        householdId: applications.householdId,
        studentProfileId: applications.studentProfileId,
        submittedByPersonId: applications.submittedByPersonId,
        programId: applications.programId,
        metadata: applications.metadata,
      })
      .from(applications)
      .where(eq(applications.idempotencyKey, input.idempotencyKey))
      .limit(1);

    if (existing) {
      assertApplicationRetryOwnership(existing,actorPersonId,input.programId);
      if((typeof existing.metadata.originTransferActionId==="string"?
           existing.metadata.originTransferActionId:null)!==(originTransfer?.actionId??null))
        throw new Error("Application request ID reused for a different transfer");
      assertFamilyApplicationRetry({application:{...existing,metadata:existing.metadata??{}},
        studentProfileId:input.existingStudentProfileId,
        schoolYearId:input.schoolYearId,familyStartRequestId:input.familyStartRequestId});
      if (input.householdId && input.householdId !== existing.householdId) {
        throw new Error("Application request key was reused for another Household");
      }
      // Ownership of an old submission is not sufficient if household access was revoked.
      const [activeMembership] = await tx.select({id:householdMemberships.id}).from(householdMemberships)
        .where(and(eq(householdMemberships.householdId,existing.householdId),eq(householdMemberships.personId,actorPersonId))).limit(1);
      if (!activeMembership) throw new Error("Guardian is no longer a member of the Application Household");
      if (input.existingStudentProfileId) {
        const [profile] = await tx.select({personId:studentProfiles.personId}).from(studentProfiles)
          .where(eq(studentProfiles.id,input.existingStudentProfileId)).limit(1);
        const [relationship] = profile ? await tx.select({metadata:guardianRelationships.metadata,
          canManageEnrollment:guardianRelationships.canManageEnrollment}).from(guardianRelationships)
          .where(and(eq(guardianRelationships.guardianPersonId,actorPersonId),
            eq(guardianRelationships.studentPersonId,profile.personId))).limit(1) : [];
        const [studentMembership] = await tx.select({id:householdMemberships.id}).from(householdMemberships)
          .where(and(eq(householdMemberships.householdId,existing.householdId),
            eq(householdMemberships.personId,profile?.personId??""))).limit(1);
        assertVerifiedFamilyStudentReuse({relationship:relationship ? {
          verification:relationship.metadata.verification,
          canManageEnrollment:relationship.canManageEnrollment,
        } : null,adultHouseholdMember:true,studentHouseholdMember:!!studentMembership});
      }
      const [existingJourney] = await tx
        .select({ id: journeys.id })
        .from(journeys)
        .where(
          and(
            eq(journeys.participantType, "application"),
            eq(journeys.participantId, existing.applicationId),
          ),
        )
        .limit(1);

      if (!existingJourney) {
        throw new Error("Existing application is missing its enrollment Journey");
      }

      return {
        applicationId: existing.applicationId,
        householdId: existing.householdId,
        studentProfileId: existing.studentProfileId,
        journeyId: existingJourney.id,
      };
    }

    // One origin transfer points to one receiving-school application.
    // A second destination requires a fresh parent request and review.
    if(originTransfer&&typeof originTransfer.metadata.destinationApplicationId==="string")
      throw new Error("This transfer already has a destination school application. Continue the existing application.");

    const [program] = await tx
      .select({ id: programs.id, organizationId: programs.organizationId,
        siteId: programs.siteId, metadata: programs.metadata })
      .from(programs)
      .where(eq(programs.id, input.programId))
      .limit(1);
    if (!program) throw new Error("Program not found");
    requireEnrollmentProgramScope(context, input.programId);
    if(originTransfer){
      if(!program.siteId||originTransfer.siteId===program.siteId)
        throw new Error("Transfer admission must be for a different school Site from the origin");
      const priorDestination=originTransfer.metadata.destinationFamilyStartProgramId;
      if(typeof priorDestination==="string"&&priorDestination!==program.id)
        throw new Error("This transfer's verified family invitation was for a different receiving school. Contact admissions to reconcile the destination before submitting.");
    }

    if (input.schoolYearId) {
      const [year] = await tx.select({id:schoolYears.id,organizationId:schoolYears.organizationId,
        siteId:schoolYears.siteId,programId:schoolYears.programId,status:schoolYears.status})
        .from(schoolYears).where(eq(schoolYears.id,input.schoolYearId)).limit(1);
      if (!schoolYearMatchesFamilyProgram(year,program)) {
        throw new Error("School year must be active and belong to the application's Program and Site");
      }
    }

    let familyStart: {id:string;email:string;firstName:string;lastName:string} | undefined;
    if (input.familyStartRequestId) {
      if (!accountId || !program.siteId) throw new AuthorizationError("verified family account and Site");
      const [start] = await tx.select({id:publicFamilyStartRequests.id,
        email:publicFamilyStartRequests.emailNormalized,
        firstName:publicFamilyStartRequests.adultFirstName,
        lastName:publicFamilyStartRequests.adultLastName})
        .from(publicFamilyStartRequests)
        .innerJoin(accessAccounts,and(
          eq(accessAccounts.id,accountId),
          eq(accessAccounts.emailNormalized,publicFamilyStartRequests.emailNormalized),
        ))
        .where(and(
          eq(publicFamilyStartRequests.id,input.familyStartRequestId),
          eq(publicFamilyStartRequests.programId,program.id),
          eq(publicFamilyStartRequests.siteId,program.siteId),
          isNotNull(publicFamilyStartRequests.consumedAt),
          isNotNull(accessAccounts.emailVerifiedAt),
        )).limit(1);
      if (!start) throw new AuthorizationError("verified family start for this account, Site and Program");
      familyStart = start;
      // If this verified-email start was initiated from an existing family
      // transfer, never silently create a second Student Person. The original
      // verified student and original Action must be reused by this request.
      const linkedTransfers=await tx.select({id:actions.id})
        .from(actions).where(and(
          eq(actions.type,"guardian_enrollment_change_request"),
          eq(actions.subjectType,"student_profile"),
          sql`${actions.metadata}->>'kind' = 'transfer'`,
          sql`${actions.metadata}->>'requestedByGuardianPersonId' = ${actorPersonId}`,
          sql`${actions.metadata}->>'destinationFamilyStartRequestId' = ${start.id}`,
          sql`${actions.metadata}->>'destinationFamilyStartProgramId' = ${program.id}`,
        )).limit(10);
      if(linkedTransfers.length&&
         (!input.existingStudentProfileId||!input.originTransferActionId||
          !linkedTransfers.some(transfer=>transfer.id===input.originTransferActionId)))
        throw new Error("This verified school invitation belongs to an existing student transfer. Reuse the verified student and linked transfer request; contact admissions if the student is not listed.");
    }

    let householdId = input.householdId;
    let actorHouseholdMember = false;
    if (input.existingStudentProfileId && !householdId) {
      throw new Error("Select the student's existing shared Household");
    }

    if (householdId) {
      const [membership] = await tx
        .select({ id: householdMemberships.id })
        .from(householdMemberships)
        .where(
          and(
            eq(householdMemberships.householdId, householdId),
            eq(householdMemberships.personId, actorPersonId),
          ),
        )
        .limit(1);

      if (!membership) {
        throw new Error("Guardian is not a member of the supplied Household");
      }
      actorHouseholdMember = true;
      // Serialize sibling submissions within the same household. Never merge
      // two children based solely on a matching name; require admissions
      // review if the household already has that student's open application.
      if(input.parentSelfService)await tx.select({id:households.id}).from(households)
        .where(eq(households.id,householdId)).for("update").limit(1);
    } else {
      const [household] = await tx
        .insert(households)
        .values({
          displayName:
            input.householdDisplayName ??
            `${input.student.legalLastName} Household`,
        })
        .returning({ id: households.id });

      if (!household) throw new Error("Failed to create Household");
      householdId = household.id;

      await tx.insert(householdMemberships).values({
        householdId,
        personId: actorPersonId,
        relationshipLabel: "guardian",
        isPrimaryContact: true,
      });
      actorHouseholdMember = true;
    }

    if(input.parentSelfService) {
      const [duplicate] = await tx.select({id:applications.id}).from(applications)
        .innerJoin(studentProfiles,eq(studentProfiles.id,applications.studentProfileId))
        .innerJoin(people,eq(people.id,studentProfiles.personId))
        .where(and(eq(applications.programId,input.programId),
          inArray(applications.stage,["inquiry","application","eligibility","accepted"]),
          ...(input.existingStudentProfileId ? [
            eq(applications.studentProfileId,input.existingStudentProfileId),
          ] : [
            // Never match a new student by surname alone outside this exact
            // authenticated adult's submission or selected Household.
            sql`(${applications.submittedByPersonId} = ${actorPersonId}
              OR ${applications.householdId} = ${householdId})`,
            sql`lower(btrim(${people.legalFirstName})) = ${input.student.legalFirstName.trim().toLowerCase()}`,
            sql`lower(btrim(${people.legalLastName})) = ${input.student.legalLastName.trim().toLowerCase()}`,
          ]),
        )).limit(1);
      if(duplicate)throw new Error("This student already has an open application for this Program. Continue that application or contact admissions for identity resolution.");
    }

    let studentProfileId: string;
    let reusedVerifiedStudent = false;
    if (input.existingStudentProfileId) {
      const [profile] = await tx.select({id:studentProfiles.id,personId:studentProfiles.personId})
        .from(studentProfiles).where(eq(studentProfiles.id,input.existingStudentProfileId))
        .for("update").limit(1);
      const [studentPerson] = profile ? await tx.select({id:people.id}).from(people)
        .where(and(eq(people.id,profile.personId),eq(people.active,true))).limit(1) : [];
      if (!profile || !studentPerson) throw new AuthorizationError("active existing student identity");
      const [relationship] = await tx.select({metadata:guardianRelationships.metadata,
        canManageEnrollment:guardianRelationships.canManageEnrollment}).from(guardianRelationships)
        .where(and(eq(guardianRelationships.guardianPersonId,actorPersonId),
          eq(guardianRelationships.studentPersonId,profile.personId))).for("share").limit(1);
      const [studentMembership] = await tx.select({id:householdMemberships.id}).from(householdMemberships)
        .where(and(eq(householdMemberships.householdId,householdId),
          eq(householdMemberships.personId,profile.personId))).limit(1);
      assertVerifiedFamilyStudentReuse({relationship:relationship ? {
        verification:relationship.metadata.verification,
        canManageEnrollment:relationship.canManageEnrollment,
      } : null,adultHouseholdMember:actorHouseholdMember,
        studentHouseholdMember:!!studentMembership});
      studentProfileId = profile.id;
      reusedVerifiedStudent = true;
    } else {
      const [studentPerson] = await tx
        .insert(people)
        .values({
          legalFirstName: input.student.legalFirstName,
          legalLastName: input.student.legalLastName,
          preferredName: input.student.preferredName,
        })
        .returning({ id: people.id });

      if (!studentPerson) throw new Error("Failed to create Student Person");

      await tx.insert(householdMemberships).values({
        householdId,
        personId: studentPerson.id,
        relationshipLabel: "student",
        isPrimaryContact: false,
      });

      await tx.insert(guardianRelationships).values({
        guardianPersonId: actorPersonId,
        studentPersonId: studentPerson.id,
        relationshipLabel: input.guardianRelationshipLabel ?? "parent",
        ...(input.parentSelfService ? {canViewAcademics:false,canManageEnrollment:false,
          canSubmitAttendanceExcuse:false,
          metadata:{verification:"pending",source:"authenticated_guardian_application"}} : {}),
      });

      const [studentProfile] = await tx
        .insert(studentProfiles)
        .values({
          personId: studentPerson.id,
          gradeLevel: input.student.gradeLevel,
        })
        .returning({ id: studentProfiles.id });

      if (!studentProfile) throw new Error("Failed to create StudentProfile");
      studentProfileId = studentProfile.id;
    }

    const source = familyStart ? "published_site" : input.source ??
      (input.parentSelfService ? "family_account" : undefined);
    const [application] = await tx
      .insert(applications)
      .values({
        householdId,
        studentProfileId,
        programId: input.programId,
        stage: "application",
        idempotencyKey: input.idempotencyKey,
        submittedByPersonId: actorPersonId,
        submittedAt: new Date(),
        ...(input.parentSelfService ? {metadata:{
          origin:"authenticated_guardian_application",
          guardianVerification:reusedVerifiedStudent ? "verified" : "pending",
          contactPersonId:actorPersonId,
          studentIdentityReused:reusedVerifiedStudent,
          ...(source ? {source} : {}),
          ...(originTransfer?{
            originTransferActionId:originTransfer.actionId,
            originTransferProgramId:originTransfer.programId,
            originTransferSiteId:originTransfer.siteId,
            originTransferDestinationSchoolName:originTransfer.destinationSchoolName,
            destinationConfirmedByGuardianPersonId:actorPersonId,
          }:{}),
          ...(program.siteId ? {siteId:program.siteId} : {}),
          ...(input.schoolYearId ? {schoolYearId:input.schoolYearId} : {}),
          ...(familyStart ? {publicFamilyStartRequestId:familyStart.id} : {}),
        }} : {}),
      })
      .returning({ id: applications.id });

    if (!application) throw new Error("Failed to create Application");

    const definitionKey = enrollmentJourneyDefinitionKey(program.metadata, input.journeyDefinitionKey);

    const { journeyId } = await instantiateJourneyFromDefinition(tx, {
      definitionKey,
      subjectType: "application",
      subjectId: application.id,
      organizationId: program.organizationId,
      programId: input.programId,
      ownerPersonId: actorPersonId,
      insertErrorLabel: "Enrollment",
    });

    let destinationRecordsReleaseConsentId:string|null=null;
    if(originTransfer){
      // A destination school's registrar may only receive this student's
      // official records after an explicit, verified guardian release to the
      // exact receiving Program. This is separate from the origin-school
      // release to a free-form named destination.
      const [consent]=await tx.insert(consentRecords).values({
        subjectType:"application",subjectId:application.id,
        consentType:"academic_records_destination_program_release",
        signerPersonId:actorPersonId,version:"can-transfer-program-release-v1",
        signatureEvidence:{
          acknowledged:true,originTransferActionId:originTransfer.actionId,
          destinationApplicationId:application.id,destinationProgramId:program.id,
          destinationSiteId:program.siteId,
          destinationOrganizationId:program.organizationId,
          studentProfileId,guardianPersonId:actorPersonId,
          scope:"official_transcript_only",
        },
      }).returning({id:consentRecords.id});
      if(!consent)throw new Error("Could not save specific destination records authorization");
      destinationRecordsReleaseConsentId=consent.id;
      const [currentApp]=await tx.select({metadata:applications.metadata})
        .from(applications).where(eq(applications.id,application.id)).limit(1);
      await tx.update(applications).set({
        metadata:{...currentApp?.metadata,destinationRecordsReleaseConsentId:consent.id},
      }).where(eq(applications.id,application.id));
      await tx.update(actions).set({
        metadata:{...originTransfer.metadata,
          destinationRecordsReleaseConsentId:consent.id,
          destinationApplicationId:application.id,
          destinationProgramId:input.programId,
          destinationApplicationSubmittedAt:new Date().toISOString(),
        },
        updatedAt:new Date(),
      }).where(eq(actions.id,originTransfer.actionId));
      await writeAudit(tx,context,{
        action:"application.transfer_origin_linked",
        entityType:"application",entityId:application.id,
        scope:{organizationId:program.organizationId,siteId:program.siteId,programId:input.programId},
        after:{originTransferActionId:originTransfer.actionId,
          destinationProgramId:input.programId,studentProfileId},
      });
    }

    if (familyStart && program.siteId) {
      // A matching public inquiry is provenance only. The email challenge and
      // account were verified above; the child's guardian relationship remains
      // pending unless an existing verified relationship was explicitly reused.
      const [interest] = await tx.select({id:publicAdmissionsInterests.id,
        status:publicAdmissionsInterests.status,source:publicAdmissionsInterests.source}).from(publicAdmissionsInterests)
        .where(and(
          eq(publicAdmissionsInterests.programId,program.id),
          eq(publicAdmissionsInterests.siteId,program.siteId),
          inArray(publicAdmissionsInterests.status,["new","contacted"]),
          isNull(publicAdmissionsInterests.applicationId),
          isNotNull(publicAdmissionsInterests.contactConsentAt),
          sql`lower(btrim(${publicAdmissionsInterests.contactEmail})) = ${familyStart.email}`,
          sql`lower(btrim(${publicAdmissionsInterests.contactFirstName})) = ${familyStart.firstName.trim().toLocaleLowerCase("en-US")}`,
          sql`lower(btrim(${publicAdmissionsInterests.contactLastName})) = ${familyStart.lastName.trim().toLocaleLowerCase("en-US")}`,
          // A different, still linked email challenge is not evidence that
          // this verified account responded to that earlier outreach.
          or(isNull(publicAdmissionsInterests.familyStartRequestId),
             eq(publicAdmissionsInterests.familyStartRequestId,familyStart.id)),
        )).orderBy(
          sql`CASE WHEN ${publicAdmissionsInterests.familyStartRequestId} = ${familyStart.id} THEN 0 ELSE 1 END`,
          desc(publicAdmissionsInterests.createdAt),
        ).for("update").limit(1);
      if (interest) {
        const now = new Date();
        await tx.update(publicAdmissionsInterests).set({applicationId:application.id,
          status:"converted",convertedAt:now,convertedByPersonId:actorPersonId,updatedAt:now})
          .where(eq(publicAdmissionsInterests.id,interest.id));
        await tx.update(applications).set({metadata:{
          origin:"authenticated_guardian_application",
          guardianVerification:reusedVerifiedStudent ? "verified" : "pending",
          contactPersonId:actorPersonId,studentIdentityReused:reusedVerifiedStudent,
          source:interest.source,siteId:program.siteId,
          ...(originTransfer?{
            originTransferActionId:originTransfer.actionId,
            originTransferProgramId:originTransfer.programId,
            originTransferSiteId:originTransfer.siteId,
            originTransferDestinationSchoolName:originTransfer.destinationSchoolName,
            destinationConfirmedByGuardianPersonId:actorPersonId,
            destinationRecordsReleaseConsentId,
          }:{}),
          ...(input.schoolYearId ? {schoolYearId:input.schoolYearId} : {}),
          publicFamilyStartRequestId:familyStart.id,publicInterestId:interest.id,
        }}).where(eq(applications.id,application.id));
        await emitEvent(tx,{eventType:EventTypes.PublicAdmissionsInterestConverted,
          aggregateType:"public_admissions_interest",aggregateId:interest.id,
          actorPersonId,organizationId:program.organizationId,siteId:program.siteId,
          programId:program.id,payload:{applicationId:application.id,status:"converted",
            verifiedFamilyStartRequestId:familyStart.id}});
        await writeAudit(tx,context,{action:"admissions.public_interest.convert",
          entityType:"public_admissions_interest",entityId:interest.id,
          scope:{organizationId:program.organizationId,siteId:program.siteId,programId:program.id},
          before:{status:interest.status},after:{status:"converted",applicationId:application.id,
            verifiedEmailFamilyStart:true,guardianRelationshipVerification:reusedVerifiedStudent?"verified":"pending"}});
      }
    }

    await emitEvent(tx, {
      eventType: EventTypes.ApplicationStarted,
      aggregateType: "application",
      aggregateId: application.id,
      actorPersonId: actorPersonId,
      payload: {
        householdId,
        studentProfileId,
        programId: input.programId,
        siteId: program.siteId,
        schoolYearId: input.schoolYearId ?? null,
        source: source ?? null,
        studentIdentityReused: reusedVerifiedStudent,
        originTransferActionId:originTransfer?.actionId??null,
        journeyId,
      },
    });

    await writeAudit(tx, context, {
      action: "application.start",
      entityType: "application",
      entityId: application.id,
      scope: {
        organizationId: program.organizationId,
        siteId: program.siteId,
        programId: input.programId,
      },
      after: {
        stage: "application",
        householdId,
        studentProfileId,
        siteId: program.siteId,
        schoolYearId: input.schoolYearId ?? null,
        source: source ?? null,
        studentIdentityReused: reusedVerifiedStudent,
      },
      contextExtras: { idempotencyKey: input.idempotencyKey },
    });

    return {
      applicationId: application.id,
      householdId,
      studentProfileId,
      journeyId,
    };
  });
}

export async function acceptApplication(
  context: CommandContext,
  applicationId: string,
  decisionNote?: string,
): Promise<void> {
  assertCapability(context, "enrollment.decide");

  await db.transaction(async (tx) => {
    await lockAdmissionsApplication(tx, applicationId);
    const [current] = await tx
      .select()
      .from(applications)
      .where(eq(applications.id, applicationId))
      .for("update")
      .limit(1);

    if (!current) throw new Error("Application not found");
    requireEnrollmentProgramScope(context, current.programId);
    // Admission acceptance under CAN's school-of-record authority requires
    // live, independently verified church/CAN services; an inquiry does not.
    await requireChurchHostedOperatingServices(tx,current.programId,[
      "admissions","school_of_record",
    ]);
    assertApplicationOffersAllowed(current);
    if (current.stage === "accepted") return;
    assertApplicationAcceptance(current.stage);

    const decidedAt = new Date();

    await tx
      .update(applications)
      .set({
        stage: "accepted",
        decidedAt,
        decisionNote,
        updatedAt: decidedAt,
      })
      .where(eq(applications.id, applicationId));

    await emitEvent(tx, {
      eventType: EventTypes.ApplicationAccepted,
      aggregateType: "application",
      aggregateId: applicationId,
      actorPersonId: context.actorPersonId,
      payload: {
        studentProfileId: current.studentProfileId,
        programId: current.programId,
      },
    });

    await writeAudit(tx, {
      actorPersonId: context.actorPersonId,
      action: "application.accept",
      resourceType: "application",
      resourceId: applicationId,
      scope: { programId: current.programId },
      before: { stage: current.stage },
      after: { stage: "accepted" },
      context: {
        requestId: context.requestId ?? null,
        decisionNote: decisionNote ?? null,
      },
    });
  });
}

export { completeJourneyRequirement } from "@/modules/journeys/complete-requirement";

export async function activateEnrollmentFromApplication(
  context: CommandContext,
  applicationId: string,
  schoolYearId: string,
): Promise<string> {
  assertCapability(context, "enrollment.activate");

  return db.transaction(async (tx) => {
    await lockAdmissionsApplication(tx, applicationId);
    const [application] = await tx
      .select()
      .from(applications)
      .where(eq(applications.id, applicationId))
      .for("update")
      .limit(1);

    if (!application) throw new Error("Application not found");
    requireEnrollmentProgramScope(context, application.programId);
    const hostedAgreement=await requireChurchHostedOperatingServices(tx,application.programId,[
      "admissions","school_of_record",
    ]);
    // Legacy direct activation has no accepted guardian offer or atomic
    // Section assignment. It must not serve an independently church-hosted
    // CAN Academy even when a seat pool has not yet been configured.
    if(hostedAgreement)
      throw new Error("Church-hosted activation requires an accepted admission offer and a staffed Section in one transaction");
    assertApplicationOffersAllowed(application);
    if (application.stage !== "accepted") {
      throw new Error("Application must be accepted before activation");
    }
    // Fail closed: the legacy activation path does not reserve seats or validate
    // accepted offers atomically. Configured pools require the forthcoming
    // transactional offer-to-enrollment service.
    const [seatPool] = await tx.select({ id: admissionSeatPools.id })
      .from(admissionSeatPools)
      .where(and(eq(admissionSeatPools.programId, application.programId),
        eq(admissionSeatPools.schoolYearId, schoolYearId)))
      .limit(1);
    if (seatPool) {
      throw new Error("Enrollment activation requires the seat-pool transaction workflow");
    }

    const [programForYear] = await tx.select({
      id: programs.id,
      organizationId: programs.organizationId,
      siteId: programs.siteId,
      status: programs.status,
    }).from(programs).where(eq(programs.id, application.programId)).for("share").limit(1);
    // The legacy path must honor the same school-opening boundary as
    // accepted-offer activation. Recruiting before opening is permitted;
    // creating an active student roster before opening is not.
    if(programForYear?.status!=="active")
      throw new Error("School must be activated before an accepted application can become an active enrollment");
    const [schoolYear] = await tx.select({
      id: schoolYears.id,
      organizationId: schoolYears.organizationId,
      siteId: schoolYears.siteId,
      programId: schoolYears.programId,
    }).from(schoolYears).where(eq(schoolYears.id, schoolYearId)).limit(1);
    // GF23 establishes the Site's effective academic year. It may be shared
    // by multiple Programs at that Site, or explicitly program-scoped.
    // Site-less virtual programs require an explicitly program-scoped year.
    if (!programForYear || !schoolYear ||
        schoolYear.organizationId !== programForYear.organizationId) {
      throw new Error("School year must belong to the application's program or its host site");
    }
    const yearMatchesProgram = programForYear.siteId === null
      ? schoolYear.programId === application.programId
      : schoolYear.siteId === programForYear.siteId &&
        (schoolYear.programId === null || schoolYear.programId === application.programId);
    if (!yearMatchesProgram) {
      throw new Error("School year must belong to the application's program or its host site");
    }
    // Enrollment adds a new onsite roster member. Serialize with the
    // same site configuration lock that attendance marking holds.
    if (programForYear.siteId) {
      await lockAttendanceConfigurationAtSite(tx, programForYear.siteId);
    }

    const [journey] = await tx
      .select()
      .from(journeys)
      .where(
        and(
          eq(journeys.participantType, "application"),
          eq(journeys.participantId, applicationId),
        ),
      )
      .for("update")
      .limit(1);

    const [existing] = await tx
      .select({ id: enrollments.id })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.studentProfileId, application.studentProfileId),
          eq(enrollments.kind, "program"),
          eq(enrollments.programId, application.programId),
          eq(enrollments.schoolYearId, schoolYearId),
          eq(enrollments.status, "active"),
        ),
      )
      .limit(1);

    if (existing) return existing.id;

    if (!journey || journey.status !== "ready") {
      throw new Error("Enrollment Journey must be ready before activation");
    }
    const blockingRequirements = await tx.select({
      status: journeyRequirements.status, metadata: journeyRequirements.metadata, evidence: journeyRequirements.evidence,
    }).from(journeyRequirements).where(and(eq(journeyRequirements.journeyId, journey.id), eq(journeyRequirements.blocking, true)));
    if (blockingRequirements.some(requirement => requirement.status !== "complete"))
      throw new Error("Blocking enrollment requirements remain.");
    for (const requirement of blockingRequirements)
      assertEnrollmentFormApproved(requirement.metadata, requirement.evidence);

    const [enrollment] = await tx
      .insert(enrollments)
      .values({
        studentProfileId: application.studentProfileId,
        kind: "program",
        status: "active",
        organizationId: (
          await tx
            .select({ organizationId: programs.organizationId })
            .from(programs)
            .where(eq(programs.id, application.programId))
            .limit(1)
        )[0]!.organizationId,
        programId: application.programId,
        schoolYearId,
        startedAt: new Date(),
      })
      .returning({ id: enrollments.id });

    if (!enrollment) throw new Error("Failed to activate Enrollment");

    const activatedAt = new Date();

    await tx
      .update(journeys)
      .set({
        status: "active",
        completedAt: activatedAt,
        updatedAt: activatedAt,
      })
      .where(eq(journeys.id, journey.id));

    await writeAudit(tx, {
      actorPersonId: context.actorPersonId,
      action: "journey.activate",
      resourceType: "journey",
      resourceId: journey.id,
      scope: { programId: application.programId },
      before: { status: journey.status },
      after: { status: "active" },
      context: {
        requestId: context.requestId ?? null,
        applicationId,
        enrollmentId: enrollment.id,
      },
    });

    await emitEvent(tx, {
      eventType: EventTypes.EnrollmentActivated,
      aggregateType: "enrollment",
      aggregateId: enrollment.id,
      actorPersonId: context.actorPersonId,
      payload: {
        applicationId,
        studentProfileId: application.studentProfileId,
        programId: application.programId,
        schoolYearId,
      },
    });

    await writeAudit(tx, {
      actorPersonId: context.actorPersonId,
      action: "enrollment.activate",
      resourceType: "enrollment",
      resourceId: enrollment.id,
      scope: { programId: application.programId },
      after: {
        status: "active",
        kind: "program",
        schoolYearId,
      },
      context: {
        requestId: context.requestId ?? null,
        applicationId,
        journeyId: journey.id,
      },
    });

    return enrollment.id;
  });
}
