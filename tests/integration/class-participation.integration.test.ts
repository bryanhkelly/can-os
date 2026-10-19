import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { roleCapabilities, type AccessContext } from "@/domain/access-context";
import type { Database } from "@/db/client";
import type { ClassTransaction } from "@/modules/learning/class-access.server";

const state = vi.hoisted(() => ({
  tx: undefined as ClassTransaction | undefined,
  actor: undefined as AccessContext | undefined,
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    parse: (value: unknown) => value,
    validator(parse: (value: unknown) => unknown) { this.parse = parse; return this; },
    handler(callback: (input: { data: unknown }) => unknown) {
      return (input?: { data: unknown }) => callback({ data: this.parse(input?.data) });
    },
  }),
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => new Request("http://localhost"), setResponseHeader: vi.fn() }));
vi.mock("@/modules/identity/command-context.server", () => ({
  getCommandContext: async () => { if (!state.actor) throw new Error("Missing test actor"); return state.actor; },
}));
vi.mock("@/db/client", () => ({
  get db() { if (!state.tx) throw new Error("Class tests must stay in the rollback transaction"); return state.tx; },
}));
vi.mock("@/platform/storage/r2", () => ({
  signPrivateObjectUrl: vi.fn(() => "https://private.example/signed"),
  createPrivateUploadUrl: vi.fn(() => "https://private.example/upload"),
  verifyPrivateObject: vi.fn(),
}));

function first<T>(rows: T[]): T {
  const value = rows[0];
  if (!value) throw new Error("Missing integration fixture row");
  return value;
}
const integration = process.env.DATABASE_URL ? describe : describe.skip;
integration("class participation cross-workspace flow", () => {
  it("persists real class participation, enforces relationships, and rolls back schema plus fixtures", async () => {
    const { db: database } = await vi.importActual<{ db: Database }>("@/db/client");
    const s = await import("@/db/schema");
    const rollback = new Error("rollback-class-participation-fixtures");
    const suffix = crypto.randomUUID().slice(0, 8);
    const before = await database.execute(sql`select to_regclass('public.lesson_progress')::text as progress,
      to_regclass('public.submission_annotations')::text as annotations`);
    let checked = false;
    await database.transaction(async tx => {
      state.tx = tx;
      // Test the new DDL without migrating or modifying this branch's existing ledger.
      const missing = await tx.execute(sql`select to_regclass('public.lesson_progress') as progress`);
      if (!missing.rows[0]?.progress) {
        for (const statement of readFileSync("drizzle/0022_stale_sphinx.sql", "utf8").split("--> statement-breakpoint")) {
          if (statement.trim()) await tx.execute(sql.raw(statement));
        }
      }
      const org = first(await tx.insert(s.organizations).values({ type: "christian_school", name: "Class Test School", slug: `class-${suffix}` }).returning());
      const site = first(await tx.insert(s.sites).values({ organizationId: org.id, name: "Class Test Site", slug: `class-${suffix}` }).returning());
      const jurisdiction = first(await tx.insert(s.jurisdictions).values({ code: `class-${suffix}`, name: "Synthetic class jurisdiction" }).returning());
      const program = first(await tx.insert(s.programs).values({
        organizationId: org.id, siteId: site.id, jurisdictionId: jurisdiction.id, type: "high_school_extension",
        status: "active", name: "Class Test Program", slug: `class-${suffix}`,
        gradeRange: { min: "9", max: "12" }, deliveryModel: { onsite: true, asynchronous: true, liveOnline: false },
        hostOrganizationId: org.id, academicProviderOrganizationId: org.id, creditIssuingOrganizationId: org.id,
      }).returning());
      const people = await tx.insert(s.people).values([
        { legalFirstName: "Student", legalLastName: "ClassFixture" },
        { legalFirstName: "Parent", legalLastName: "ClassFixture" },
        { legalFirstName: "Teacher", legalLastName: "ClassFixture" },
        { legalFirstName: "Unrelated", legalLastName: "ClassFixture" },
      ]).returning();
      const [student, parent, teacher, unrelated] = people;
      if (!student || !parent || !teacher || !unrelated) throw new Error("Missing fixture identities");
      const profile = first(await tx.insert(s.studentProfiles).values({ personId: student.id, gradeLevel: "10" }).returning());
      const relationship = first(await tx.insert(s.guardianRelationships).values({
        guardianPersonId: parent.id, studentPersonId: student.id, canViewAcademics: true, relationshipLabel: "parent",
      }).returning());
      const { createAcademicTimeFixture } = await import("./helpers/academic-time");
      const time = await createAcademicTimeFixture({ organizationId: org.id, siteId: site.id, programId: program.id, suffix });
      const template = first(await tx.insert(s.courseTemplates).values({
        owningOrganizationId: org.id, code: `class-${suffix}`, title: "Close reading", subject: "English",
      }).returning());
      const resourceDocumentId = crypto.randomUUID();
      const version = first(await tx.insert(s.courseTemplateVersions).values({
        courseTemplateId: template.id, version: 1, status: "published", publishedAt: new Date(),
        curriculum: { learning: { version: 1, syllabus: "Read, discuss and revise.", modules: [
          { id: "reading", title: "Close reading", lessons: [{ id: "evidence", title: "Use evidence", body: "Read the passage closely." }] },
        ], resources: [{ id: "library", title: "Library", url: "https://www.loc.gov/" },
          { id: "reading", title: "Private reading", documentId: resourceDocumentId }] } },
      }).returning());
      const resourceKey = `learning/resources/${version.id}/${crypto.randomUUID()}`;
      await tx.insert(s.documents).values({
        id: resourceDocumentId, subjectType: "course_template_version", subjectId: version.id,
        category: "class_resource", fileName: "reading.pdf", storageProvider: "cloudflare_r2",
        storageKey: resourceKey, uploadedByPersonId: teacher.id,
      });
      const section = first(await tx.insert(s.sections).values({
        programId: program.id, siteId: site.id, termId: time.term.id, title: "English", code: `class-${suffix}`,
        courseTemplateVersionId: version.id,
      }).returning());
      await tx.insert(s.sectionTeachers).values({ sectionId: section.id, personId: teacher.id });
      const enrollment = first(await tx.insert(s.enrollments).values({
        studentProfileId: profile.id, kind: "section", status: "active", organizationId: org.id,
        programId: program.id, sectionId: section.id, schoolYearId: time.schoolYear.id,
      }).returning());
      const assessment = first(await tx.insert(s.assessments).values({
        sectionId: section.id, title: "Explain your evidence", status: "published", pointsPossible: "10",
        instructions: "Explain a passage.", createdByPersonId: teacher.id,
      }).returning());
      const submission = first(await tx.insert(s.submissions).values({
        assessmentId: assessment.id, studentProfileId: profile.id, status: "submitted", response: { text: "My evidence supports the claim." },
        submittedAt: new Date(),
      }).returning());
      function act(role: string, personId: string) {
        state.actor = { role, actorPersonId: personId, accountId: crypto.randomUUID(), sessionId: crypto.randomUUID(),
          grantId: crypto.randomUUID(), capabilities: new Set(roleCapabilities[role] ?? []),
          scope: { organizationIds: [org.id], siteIds: [site.id], programIds: [program.id] } };
        return state.actor;
      }
      const classes = await import("@/modules/learning/class-workspace.functions");
      const communication = await import("@/modules/learning/class-communication.functions");
      const annotations = await import("@/modules/learning/submission-annotations.functions");
      const discussions = await import("@/modules/learning/discussion-teacher.functions");
      const teacherDiscussions = await import("@/modules/learning/discussion-teacher-query.functions");
      const studentDiscussions = await import("@/modules/learning/course-discussions.functions");
      const posts = await import("@/modules/learning/discussion-post.functions");
      const family = await import("@/modules/family/guardian-assignments.functions");
      const messaging = await import("@/modules/communication/messages.functions");
      act("student", student.id);
      expect((await classes.getClassDirectory()).classes.map(row => row.id)).toEqual([section.id]);
      const studentView = await classes.getClassWorkspace({ data: { sectionId: section.id } });
      expect(studentView.content?.modules[0]?.lessons[0]?.title).toBe("Use evidence");
      expect(studentView.roster).toEqual([]);
      const { signPrivateObjectUrl } = await import("@/platform/storage/r2");
      const download = { sectionId: section.id, resourceId: "reading" };
      await expect(classes.getClassResourceDownload({ data: download })).rejects.toThrow(/verified class resource/);
      expect(signPrivateObjectUrl).not.toHaveBeenCalled();
      await tx.update(s.documents).set({ verifiedAt: new Date() }).where(eq(s.documents.id, resourceDocumentId));
      expect((await classes.getClassResourceDownload({ data: download })).downloadUrl).toBe("https://private.example/signed");
      expect(signPrivateObjectUrl).toHaveBeenLastCalledWith(expect.objectContaining({ key: resourceKey, expiresSeconds: 60, method: "GET" }));
      for (const change of [
        { subjectId: crypto.randomUUID() }, { storageKey: `learning/resources/${crypto.randomUUID()}/${crypto.randomUUID()}` },
        { sensitivityTier: "restricted" }, { expiresAt: new Date("2000-01-01") }, { storageProvider: "public" },
      ]) {
        await tx.update(s.documents).set(change).where(eq(s.documents.id, resourceDocumentId));
        await expect(classes.getClassResourceDownload({ data: download })).rejects.toThrow(/verified class resource/);
        await tx.update(s.documents).set({ subjectId: version.id, storageKey: resourceKey,
          sensitivityTier: "standard", expiresAt: null, storageProvider: "cloudflare_r2" }).where(eq(s.documents.id, resourceDocumentId));
      }
      await expect(classes.getClassResourceDownload({ data: { ...download, resourceId: "library" } })).rejects.toThrow(/configured private/);
      expect(signPrivateObjectUrl).toHaveBeenCalledTimes(1);
      const completion = { sectionId: section.id, versionId: version.id, lessonId: "evidence", completed: true };
      await classes.setLessonCompletion({ data: completion });
      await classes.setLessonCompletion({ data: completion });
      expect(await tx.select().from(s.lessonProgress).where(eq(s.lessonProgress.sectionId, section.id))).toHaveLength(1);
      expect(await tx.select().from(s.domainEvents).where(and(eq(s.domainEvents.eventType, "LessonCompletionChanged"),
        sql`${s.domainEvents.payload}->>'sectionId' = ${section.id}`))).toHaveLength(1);
      await expect(classes.setLessonCompletion({ data: { ...completion, lessonId: "fabricated" } })).rejects.toThrow(/Lesson unavailable/);
      await expect(classes.setLessonCompletion({ data: { ...completion, versionId: crypto.randomUUID() } })).rejects.toThrow(/version/);
      act("guardian", parent.id);
      await expect(classes.getClassWorkspace({ data: { sectionId: section.id } })).rejects.toThrow(/selected child/);
      const parentView = await classes.getClassWorkspace({ data: { sectionId: section.id, studentPersonId: student.id } });
      expect(parentView.progress[0]?.completedAt).toBeTruthy();
      expect(parentView.roster).toEqual([]);
      await expect(classes.setLessonCompletion({ data: completion })).rejects.toThrow(/student lesson/);
      act("teacher", teacher.id);
      expect((await classes.getClassWorkspace({ data: { sectionId: section.id } })).roster[0]?.completedLessons).toBe(1);
      const announcement = { id: crypto.randomUUID(), sectionId: section.id, title: "Bring your reading notes", body: "We will discuss the passage together." };
      await communication.publishClassAnnouncement({ data: announcement });
      await communication.publishClassAnnouncement({ data: announcement });
      await expect(communication.publishClassAnnouncement({ data: { ...announcement, body: "Different content" } })).rejects.toThrow(/different content/);
      const annotation = { id: crypto.randomUUID(), submissionId: submission.id, startOffset: 3, endOffset: 11, quote: "evidence", comment: "Name the specific evidence." };
      await annotations.addSubmissionAnnotation({ data: annotation });
      await annotations.addSubmissionAnnotation({ data: annotation });
      await expect(annotations.addSubmissionAnnotation({ data: { ...annotation, comment: "Changed content" } })).rejects.toThrow(/different content/);
      expect((await annotations.getSubmissionAnnotations({ data: { submissionId: submission.id } })).annotations).toHaveLength(1);
      await expect(annotations.addSubmissionAnnotation({ data: { ...annotation, id: crypto.randomUUID(), quote: "tampered" } })).rejects.toThrow(/must match/);
      act("student", student.id);
      expect((await classes.getClassWorkspace({ data: { sectionId: section.id } })).announcements).toHaveLength(1);
      expect((await annotations.getSubmissionAnnotations({ data: { submissionId: submission.id } })).annotations).toEqual([]);
      await expect(annotations.addSubmissionAnnotation({ data: { ...annotation, id: crypto.randomUUID() } })).rejects.toThrow(/teacher annotation/);
      act("guardian", parent.id);
      expect((await annotations.getSubmissionAnnotations({ data: { submissionId: submission.id } })).annotations).toEqual([]);
      await tx.update(s.submissions).set({ status: "graded", score: "0", gradedAt: new Date(), feedback: { comment: "Review the evidence." } }).where(eq(s.submissions.id, submission.id));
      expect((await annotations.getSubmissionAnnotations({ data: { submissionId: submission.id } })).annotations[0]?.comment).toBe(annotation.comment);
      const assignments = await family.getGuardianAssignments({ data: { studentPersonId: student.id } });
      expect(assignments.assignments[0]).toMatchObject({ score: "0.00", instructions: "Explain a passage.", feedback: "Review the evidence." });
      const message = { assessmentId: assessment.id, studentPersonId: student.id, messageId: crypto.randomUUID(), body: "How can we help with revision?" };
      const conversation = await communication.startAssignmentConversation({ data: message });
      await communication.startAssignmentConversation({ data: message });
      await expect(communication.startAssignmentConversation({ data: { ...message, body: "Changed content" } })).rejects.toThrow(/different content/);
      expect(await tx.select().from(s.communicationMessages).where(eq(s.communicationMessages.threadId, conversation.threadId))).toHaveLength(1);
      expect((await messaging.getThread({ data: { threadId: conversation.threadId } })).thread.contextHref).toContain("/guardian/academics?");
      act("teacher", teacher.id);
      await messaging.replyToThread({ data: { threadId: conversation.threadId, body: "Please review my annotation." } });
      const prompt = await discussions.createCourseDiscussion({ data: { sectionId: section.id, subject: "Discuss evidence", prompt: "What supports the claim?" } });
      expect((await teacherDiscussions.getTeacherCourseDiscussions()).threads.some(row => row.id === prompt.id)).toBe(true);
      act("student", student.id);
      const reply = await posts.postDiscussionMessage({ data: { threadId: prompt.id, body: "The passage supports it.", parentMessageId: null } });
      expect((await studentDiscussions.getCourseDiscussions())[0]?.messages.some(row => row.id === reply.id)).toBe(true);
      act("teacher", teacher.id);
      await posts.postDiscussionMessage({ data: { threadId: prompt.id, body: "Which sentence?", parentMessageId: reply.id } });
      await discussions.moderateDiscussionMessage({ data: { messageId: reply.id, hidden: true } });
      await discussions.setCourseDiscussionLock({ data: { threadId: prompt.id, locked: true } });
      act("student", student.id);
      expect((await studentDiscussions.getCourseDiscussions())[0]?.messages.find(row => row.id === reply.id)?.body).toBe("[Message hidden by teacher]");
      await expect(posts.postDiscussionMessage({ data: { threadId: prompt.id, body: "A locked reply", parentMessageId: null } })).rejects.toThrow(/locked/);
      // Real, non-fixture-tagged groups must discover/open through the same enrollment policy.
      const groups = await import("@/modules/study-groups/study-group-queries.functions");
      const group = first(await tx.insert(s.studyGroups).values({ title: "Reading partners", description: "Read and discuss together.",
        kind: "course", siteId: site.id, programId: program.id, sectionId: section.id, facilitatorPersonId: teacher.id }).returning());
      expect(await groups.listStudyGroups()).toEqual([]);
      await tx.insert(s.enrollments).values({ studentProfileId: profile.id, kind: "program", status: "active",
        organizationId: org.id, programId: program.id, schoolYearId: time.schoolYear.id });
      expect((await groups.listStudyGroups()).some(row => row.id === group.id)).toBe(true);
      expect((await groups.getStudyGroupDetail({ data: { groupId: group.id } })).memberStatus).toBeNull();
      await tx.insert(s.studyGroupMemberships).values({ groupId: group.id, personId: student.id, status: "approved" });
      expect((await groups.getStudyGroupDetail({ data: { groupId: group.id } })).memberStatus).toBe("approved");
      // Real teacher identity/profile links and private photo persistence.
      const profiles = await import("@/modules/profiles/person-profile.functions");
      expect((await profiles.getPersonProfile({ data: { personId: teacher.id } })).sections[0]?.id).toBe(section.id);
      expect((await profiles.getProfilePhoto({ data: { personId: teacher.id } })).url).toBeNull();
      await expect(profiles.getPersonProfile({ data: { personId: parent.id } })).rejects.toThrow(/profile relationship/);
      const photoInput = { fileName: "portrait.png", mimeType: "image/png" as const, size: 128 };
      expect(() => profiles.beginProfilePhotoUpload({ data: { ...photoInput, size: 2 * 1024 * 1024 + 1 } })).toThrow();
      const upload = await profiles.beginProfilePhotoUpload({ data: photoInput });
      expect(upload.key).toMatch(new RegExp(`^profiles/${student.id}/`));
      const storage = await import("@/platform/storage/r2");
      expect(storage.createPrivateUploadUrl).toHaveBeenCalledWith(expect.objectContaining({
        key: upload.key, contentType: "image/png", contentLength: 128, maxContentLength: 2 * 1024 * 1024, expiresSeconds: 180,
      }));
      await expect(profiles.finishProfilePhotoUpload({ data: { ...photoInput, key: `profiles/${teacher.id}/${crypto.randomUUID()}` } }))
        .rejects.toThrow(/own profile/);
      vi.mocked(storage.verifyPrivateObject).mockRejectedValueOnce(new Error("Photo signature mismatch"));
      await expect(profiles.finishProfilePhotoUpload({ data: { ...photoInput, key: upload.key } })).rejects.toThrow(/signature mismatch/);
      expect(await tx.select().from(s.documents).where(eq(s.documents.storageKey, upload.key))).toHaveLength(0);
      const savedPhoto = await profiles.finishProfilePhotoUpload({ data: { ...photoInput, key: upload.key } });
      expect(storage.verifyPrivateObject).toHaveBeenCalledWith(expect.objectContaining({
        key: upload.key, expectedContentType: "image/png", expectedSize: 128, verifySignature: expect.any(Function),
      }));
      expect((await profiles.finishProfilePhotoUpload({ data: { ...photoInput, key: upload.key } })).documentId).toBe(savedPhoto.documentId);
      expect(await tx.select().from(s.auditEvents).where(and(eq(s.auditEvents.resourceId, savedPhoto.documentId),
        eq(s.auditEvents.action, "profile.photo_changed")))).toHaveLength(1);
      expect((await profiles.getProfilePhoto({ data: {} })).url).toBe("https://private.example/signed");
      act("guardian", parent.id);
      expect((await profiles.getPersonProfile({ data: { personId: teacher.id } })).kind).toBe("Teacher");
      expect((await profiles.getProfilePhoto({ data: { personId: student.id } })).url).toBe("https://private.example/signed");
      act("guardian", unrelated.id);
      await expect(profiles.getProfilePhoto({ data: { personId: student.id } })).rejects.toThrow(/profile relationship/);
      // A distinct counselor grant shares the canonical support lifecycle with specialists.
      const counselor = first(await tx.insert(s.people).values({ legalFirstName: "Counselor", legalLastName: "Fixture" }).returning());
      const counselorAccount = first(await tx.insert(s.accessAccounts).values({ emailNormalized: `counselor-${suffix}@can-os.invalid` }).returning());
      await tx.insert(s.accountPersonGrants).values({ accountId: counselorAccount.id, personId: counselor.id,
        role: "counselor", organizationId: org.id, siteId: site.id });
      const support = await import("@/modules/support/support-referrals.functions");
      const coaching = await import("@/modules/support/coach.functions");
      act("teacher", teacher.id);
      const referral = await support.createSupportReferral({ data: { studentProfileId: profile.id, category: "personal",
        priority: "normal", observations: "Help the student plan schoolwork.", includeEvidence: false } });
      expect(first(await tx.select().from(s.actions).where(eq(s.actions.id, referral.referralId))).ownerPersonId).toBeNull();
      act("counselor", counselor.id);
      expect((await coaching.getCoachCaseload()).students.some(row => row.studentProfileId === profile.id)).toBe(true);
      await support.advanceSupportReferral({ data: { referralId: referral.referralId, nextStage: "accepted", note: "School support accepted.", area: "counselor" } });
      expect(first(await tx.select().from(s.actions).where(eq(s.actions.id, referral.referralId))).ownerPersonId).toBe(counselor.id);
      await support.saveSupportPlan({ data: { referralId: referral.referralId, goal: "Organize weekly assignments.",
        intervention: "Weekly school planning check-in.", targetDate: "2027-11-01" } });
      const service = await support.scheduleSupportService({ data: { referralId: referral.referralId, kind: "planning", scheduledAt: "2027-10-25T15:00:00Z" } });
      await expect(support.advanceSupportReferral({ data: { referralId: referral.referralId, nextStage: "review", note: "Not complete yet." } })).rejects.toThrow(/Complete/);
      await support.completeSupportService({ data: { referralId: referral.referralId, serviceId: service.id, outcome: "Student has a weekly plan." } });
      await coaching.logCoachOutreach({ data: { studentProfileId: profile.id, note: "Discussed the school plan with family.", outcome: "contacted" } });
      expect((await coaching.getCoachStudentHistory({ data: { studentProfileId: profile.id } })).timeline.some(row => row.kind === "coach_outreach")).toBe(true);
      await support.advanceSupportReferral({ data: { referralId: referral.referralId, nextStage: "review", note: "School plan reviewed." } });
      await support.advanceSupportReferral({ data: { referralId: referral.referralId, nextStage: "closed", note: "Support goals achieved." } });
      await expect(support.advanceSupportReferral({ data: { referralId: referral.referralId, nextStage: "closed", note: "Repeat close." } })).rejects.toThrow(/already closed/);
      const counselorActor = state.actor;
      if (!counselorActor) throw new Error("Missing counselor context");
      state.actor = { ...counselorActor, scope: { ...counselorActor.scope, programIds: [crypto.randomUUID()] } };
      await expect(coaching.getCoachStudentHistory({ data: { studentProfileId: profile.id } })).rejects.toThrow(/scope/);
      expect(await support.getSupportReferrals()).toEqual([]);
      act("student", student.id);
      await expect(support.saveSupportPlan({ data: { referralId: referral.referralId, goal: "Unauthorized", intervention: "Unauthorized", targetDate: "2027-11-01" } })).rejects.toThrow(/role/);
      const teacherActor = act("teacher", teacher.id);
      state.actor = { ...teacherActor, scope: { ...teacherActor.scope, programIds: [crypto.randomUUID()] } };
      await expect(classes.getClassWorkspace({ data: { sectionId: section.id } })).rejects.toThrow(/program/);
      expect((await teacherDiscussions.getTeacherCourseDiscussions()).threads).toEqual([]);
      act("teacher", teacher.id);
      await tx.delete(s.sectionTeachers).where(and(eq(s.sectionTeachers.sectionId, section.id), eq(s.sectionTeachers.personId, teacher.id)));
      await expect(messaging.getThread({ data: { threadId: conversation.threadId } })).rejects.toThrow(/assigned teacher/);
      const generic = first(await tx.insert(s.communicationThreads).values({
        subject: "General family conversation", createdByPersonId: parent.id,
      }).returning());
      await tx.insert(s.communicationParticipants).values({ threadId: generic.id, participantId: parent.id, participantType: "person" });
      act("guardian", unrelated.id);
      expect((await classes.getClassDirectory()).classes).toEqual([]);
      await expect(classes.getClassWorkspace({ data: { sectionId: section.id, studentPersonId: student.id } })).rejects.toThrow(/relationship/);
      await expect(annotations.getSubmissionAnnotations({ data: { submissionId: submission.id } })).rejects.toThrow(/relationship/);
      act("teacher", unrelated.id);
      await expect(classes.getClassWorkspace({ data: { sectionId: section.id } })).rejects.toThrow(/assigned teacher/);
      act("guardian", parent.id);
      await tx.update(s.guardianRelationships).set({ canViewAcademics: false }).where(eq(s.guardianRelationships.id, relationship.id));
      const visibleThreads = (await messaging.listMyThreads()).threads;
      expect(visibleThreads.some(thread => thread.id === conversation.threadId)).toBe(false);
      expect(visibleThreads.some(thread => thread.id === generic.id)).toBe(true);
      await expect(messaging.getThread({ data: { threadId: conversation.threadId } })).rejects.toThrow(/relationship/);
      await expect(messaging.replyToThread({ data: { threadId: conversation.threadId, body: "No longer authorized" } })).rejects.toThrow(/relationship/);
      expect((await messaging.getThread({ data: { threadId: generic.id } })).thread.contextHref).toBeNull();
      await messaging.replyToThread({ data: { threadId: generic.id, body: "General messaging remains available." } });
      await tx.update(s.guardianRelationships).set({ canViewAcademics: true }).where(eq(s.guardianRelationships.id, relationship.id));
      act("student", student.id);
      await tx.update(s.enrollments).set({ status: "withdrawn" }).where(eq(s.enrollments.id, enrollment.id));
      await expect(classes.getClassWorkspace({ data: { sectionId: section.id } })).rejects.toThrow(/enrollment/);
      await expect(classes.setLessonCompletion({ data: { ...completion, completed: false } })).rejects.toThrow(/enrollment/);
      expect(await tx.select().from(s.auditEvents).where(inArray(s.auditEvents.action, [
        "learning.lesson_completion", "learning.announcement_publish", "learning.submission_annotate", "communication.assignment_message",
      ]))).not.toHaveLength(0);
      checked = true;
      throw rollback;
    }).catch(cause => { if (cause !== rollback) throw cause; })
      .finally(() => { state.tx = undefined; });
    expect(checked).toBe(true);
    const after = await database.execute(sql`select to_regclass('public.lesson_progress')::text as progress,
      to_regclass('public.submission_annotations')::text as annotations`);
    expect(after.rows).toEqual(before.rows);
    expect(await database.select({ id: s.organizations.id }).from(s.organizations)
      .where(eq(s.organizations.slug, `class-${suffix}`))).toEqual([]);
  }, 120_000);
});
