#!/usr/bin/env node
/**
 * Guarded, idempotent CAN synthetic teacher catalog loader.
 * Creates profiles, CAN demo-provider memberships, course capabilities and
 * illustrative capacity offerings on an ISOLATED Neon demo branch only.
 * Never issues logins, role grants, qualifications, reservations, or assignments.
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Pool } from "@neondatabase/serverless";

const argv = process.argv;
const flag = name => {
  const i = argv.indexOf(name);
  return i < 0 ? null : argv[i + 1];
};
const apply = argv.includes("--apply");
const catalogPath = flag("--catalog");
const fixturePath = flag("--teachers");
if (!catalogPath || !fixturePath) throw Error("Use --catalog <catalog.json> --teachers <teachers.json> [--apply]");
if (!process.env.DATABASE_URL) throw Error("DATABASE_URL required");
const host = new URL(process.env.DATABASE_URL).hostname.toLowerCase();
if (apply) {
  if (process.env.DEMO_TEACHERS_ALLOW_WRITE !== "1" ||
      !process.env.DEMO_TEACHERS_DATABASE_CONFIRMED ||
      !process.env.DEMO_TEACHERS_HOST_CONFIRMED ||
      !process.env.CAN_APPLICATION_DB_HOST)
    throw Error("Write requires DEMO_TEACHERS_ALLOW_WRITE=1, confirmed DB/host, and production CAN_APPLICATION_DB_HOST");
  if (host !== process.env.DEMO_TEACHERS_HOST_CONFIRMED.toLowerCase() ||
      host === process.env.CAN_APPLICATION_DB_HOST.toLowerCase())
    throw Error("Refusing non-confirmed or production database host");
  if (!host.endsWith(".neon.tech")) throw Error("Demo teachers can be loaded only into a Neon branch");
}
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
if (catalog.format !== "can-os-demo-catalog-v1" || catalog.provenance?.isSynthetic !== true ||
    !Array.isArray(catalog.courses) || catalog.courses.length !== 120)
  throw Error("Expected synthetic 120-course curriculum manifest");
if (fixture.format !== "can-os-demo-teacher-marketplace-v1" ||
    fixture.provenance?.isSynthetic !== true ||
    fixture.provenance?.credentialsVerified !== false ||
    fixture.provenance?.assignmentsAuthorized !== false ||
    fixture.provider?.slug !== "can-demo-teaching-provider" ||
    fixture.provider?.metadata?.isSynthetic !== true ||
    fixture.teachers?.length !== 30 || fixture.courseTeachers?.length !== 120 ||
    fixture.staffingExamples?.length !== 15)
  throw Error("Unsafe or incomplete demo teacher fixture");

const codes = new Set(catalog.courses.map(course => course.code));
const teacherKeys = new Set(fixture.teachers.map(teacher => teacher.key));
if (codes.size !== 120 || teacherKeys.size !== 30) throw Error("Duplicate course or teacher keys");
const coverage = new Set();
for (const teacher of fixture.teachers) {
  if (!/^CAN-DEMO-TEACHER-\d{2}$/.test(teacher.key) ||
      !/^can\.demo\.teacher\d{2}@example\.invalid$/.test(teacher.email) ||
      !teacher.firstName || !teacher.lastName || teacher.verified !== false ||
      !Array.isArray(teacher.courseCodes) || !teacher.courseCodes.length ||
      new Set(teacher.courseCodes).size !== teacher.courseCodes.length)
    throw Error("Invalid synthetic teacher identity or course mapping");
  for (const code of teacher.courseCodes) {
    if (!codes.has(code)) throw Error("Unknown course " + code);
    coverage.add(code);
  }
}
if (coverage.size !== 120) throw Error("Every curriculum course needs a matching instructor");
for (const match of fixture.courseTeachers) {
  if (!codes.has(match.courseCode) ||
      !teacherKeys.has(match.primaryTeacherKey) ||
      !teacherKeys.has(match.alternateTeacherKey) ||
      match.primaryTeacherKey === match.alternateTeacherKey)
    throw Error("Invalid teacher recommendation for " + match.courseCode);
  for (const key of [match.primaryTeacherKey, match.alternateTeacherKey])
    if (!fixture.teachers.find(t => t.key === key).courseCodes.includes(match.courseCode))
      throw Error("Recommendation inconsistent with instructor capability");
}
for (const sample of fixture.staffingExamples) {
  const match = fixture.courseTeachers.find(c => c.courseCode === sample.courseCode);
  if (!match || sample.status !== "planning_only" ||
      sample.primaryTeacherKey !== match.primaryTeacherKey ||
      sample.alternateTeacherKey !== match.alternateTeacherKey)
    throw Error("Class planning examples must be non-operational and match the course map");
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();
const provenance = key => JSON.stringify({ sourceSystem: "can-demo-teacher-marketplace-factory", demoFixtureKey: key });
const result = { apply, teachers: 30, coursesCovered: 120, recommendedTeacherCourseMappings: 240,
  plannedClassExamples: 15, peopleCreated: 0, membershipsCreated: 0, capabilitiesCreated: 0,
  availabilityCreated: 0, offeringsCreated: 0, actualSectionsCreated: 0, assignmentsCreated: 0 };
try {
  await client.query("BEGIN");
  if (apply) {
    const db = await client.query("SELECT current_database() AS name");
    if (db.rows[0]?.name !== process.env.DEMO_TEACHERS_DATABASE_CONFIRMED)
      throw Error("Database identity mismatch");
  }
  const publisher = await client.query(
    "SELECT id FROM organizations WHERE slug='can-demo-publisher' AND metadata->>'demoPublisher'='true' AND metadata->>'isSynthetic'='true'");
  if (publisher.rowCount !== 1) throw Error("Canonical CAN Demo Publisher missing");
  const storedCourses = await client.query(
    "SELECT code,id FROM course_templates WHERE owning_organization_id=$1 AND code=ANY($2::text[])",
    [publisher.rows[0].id, [...codes]]);
  if (storedCourses.rowCount !== 120) throw Error("Import the matching 120 demo courses before loading teachers");
  const courseIds = new Map(storedCourses.rows.map(row => [row.code, row.id]));
  let provider = await client.query("SELECT id,metadata FROM organizations WHERE slug=$1", [fixture.provider.slug]);
  if (provider.rowCount > 1 || (provider.rowCount === 1 &&
      (provider.rows[0].metadata?.demoProvider !== true || provider.rows[0].metadata?.isSynthetic !== true)))
    throw Error("Only the dedicated synthetic CAN demo teaching provider is allowed");
  let providerId = provider.rows[0]?.id ?? null;
  result.providerExists = Boolean(providerId);
  if (apply) {
    if (!providerId) {
      providerId = randomUUID();
      await client.query(
        "INSERT INTO organizations (id,type,name,slug,metadata) VALUES ($1,'other_partner',$2,$3,$4::jsonb)",
        [providerId, fixture.provider.name, fixture.provider.slug, JSON.stringify(fixture.provider.metadata)]);
      result.providerCreated = true;
    }
    for (const teacher of fixture.teachers) {
      const identity = await client.query(
        "SELECT id,metadata FROM people WHERE email=$1", [teacher.email]);
      if (identity.rowCount > 1 || (identity.rowCount === 1 &&
          identity.rows[0].metadata?.demoFixtureKey !== teacher.key))
        throw Error("Refusing to reuse a person outside this fixture: " + teacher.key);
      let personId = identity.rows[0]?.id;
      if (!personId) {
        personId = randomUUID();
        await client.query(
          "INSERT INTO people (id,legal_first_name,legal_last_name,preferred_name,email,metadata) VALUES ($1,$2,$3,$4,$5,$6::jsonb)",
          [personId,teacher.firstName,teacher.lastName,teacher.firstName,teacher.email,
            JSON.stringify({ sourceSystem:"can-demo-teacher-marketplace-factory",
              demoFixtureKey:teacher.key, synthetic:true, biography:teacher.biography,
              credentialsVerified:false })]);
        result.peopleCreated++;
      }
      const membership = await client.query(
        "INSERT INTO memberships (id,person_id,organization_id,title,metadata) VALUES ($1,$2,$3,$4,$5::jsonb) ON CONFLICT (person_id,organization_id) DO NOTHING RETURNING id",
        [randomUUID(),personId,providerId,"Demonstration Instructor",provenance(teacher.key)]);
      result.membershipsCreated += membership.rowCount;
      const windowKey = teacher.key + "/availability";
      const windows = await client.query(
        "SELECT id FROM instructor_availability_windows WHERE person_id=$1 AND metadata->>'demoFixtureKey'=$2",
        [personId,windowKey]);
      if (windows.rowCount > 1) throw Error("Ambiguous fixture availability for " + teacher.key);
      let windowId = windows.rows[0]?.id;
      if (!windowId) {
        windowId = randomUUID();
        await client.query(
          "INSERT INTO instructor_availability_windows (id,person_id,starts_at,ends_at,timezone,weekly_pattern,metadata) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)",
          [windowId,personId,teacher.availability.startsAt,teacher.availability.endsAt,
            teacher.availability.timezone,JSON.stringify(teacher.availability.weeklyPattern),provenance(windowKey)]);
        result.availabilityCreated++;
      }
      for (const code of teacher.courseCodes) {
        const courseId = courseIds.get(code);
        const capabilityKey = teacher.key + "/course/" + code;
        const existing = await client.query(
          "SELECT id,metadata FROM instructor_capabilities WHERE person_id=$1 AND course_template_id=$2",
          [personId,courseId]);
        if (existing.rowCount > 1 || (existing.rowCount === 1 &&
            existing.rows[0].metadata?.demoFixtureKey !== capabilityKey))
          throw Error("Refusing to modify a non-demo instructor capability: " + capabilityKey);
        let capabilityId = existing.rows[0]?.id;
        if (!capabilityId) {
          capabilityId = randomUUID();
          await client.query(
            "INSERT INTO instructor_capabilities (id,person_id,course_template_id,grade_range,modalities,metadata) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb)",
            [capabilityId,personId,courseId,JSON.stringify(teacher.gradeRange),
              JSON.stringify(teacher.modalities),provenance(capabilityKey)]);
          result.capabilitiesCreated++;
        }
        const offeringKey = teacher.key + "/offering/" + code;
        const offers = await client.query(
          "SELECT id FROM instructional_capacity_offerings WHERE person_id=$1 AND capability_id=$2 AND metadata->>'demoFixtureKey'=$3",
          [personId,capabilityId,offeringKey]);
        if (offers.rowCount > 1) throw Error("Ambiguous fixture offering: " + offeringKey);
        if (!offers.rowCount) {
          await client.query(
            "INSERT INTO instructional_capacity_offerings (id,person_id,capability_id,availability_window_id,modality,max_seats,status,metadata) VALUES ($1,$2,$3,$4,'live_online',$5,'open',$6::jsonb)",
            [randomUUID(),personId,capabilityId,windowId,teacher.maxSeatsPerOffering,
              JSON.stringify({ sourceSystem:"can-demo-teacher-marketplace-factory",
                demoFixtureKey:offeringKey, demoOnly:true, previewOnly:true,
                capacityNotVerified:true, sharingScope:"illustrative_cross_school" })]);
          result.offeringsCreated++;
        }
      }
    }
    await client.query("COMMIT");
  } else {
    await client.query("ROLLBACK");
  }
  console.log(JSON.stringify(result,null,2));
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
