#!/usr/bin/env node
/**
 * Generates CAN Academy's synthetic teacher marketplace alongside the 120-course
 * curriculum fixture. Does not create real credentials, teaching grants,
 * capacity reservations, or school assignments.
 *
 * node scripts/demo-teacher-marketplace-factory.mjs --catalog /tmp/can-demo-catalog.json --output /tmp/can-demo-teachers.json
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const arg = name => {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
};
const catalogPath = arg("--catalog");
const outputPath = arg("--output");
if (!catalogPath || !outputPath || catalogPath.startsWith("--") || outputPath.startsWith("--"))
  throw Error("Use --catalog <generated-catalog.json> --output <teacher-fixture.json>");

const catalog = JSON.parse(readFileSync(resolve(catalogPath), "utf8"));
if (catalog.format !== "can-os-demo-catalog-v1" ||
    catalog.provenance?.isSynthetic !== true ||
    !Array.isArray(catalog.courses) || catalog.courses.length !== 120)
  throw Error("The teacher fixture requires the canonical 120-course synthetic catalog");

const subjects = [
  ["Mathematics", 4], ["Science", 4], ["English and Literature", 4],
  ["History and Social Studies", 4], ["Bible and Theology", 4],
  ["World Languages", 4], ["Arts and Electives", 3],
  ["Enrichment and Career", 3],
];
const names = [
  ["Morgan", "Ellis"], ["Jasmine", "Carter"], ["Andre", "Coleman"], ["Priya", "Shah"],
  ["Naomi", "Brooks"], ["Daniel", "Rivera"], ["Amara", "Okafor"], ["Ethan", "Chen"],
  ["Camila", "Morales"], ["Miles", "Bennett"], ["Leila", "Hassan"], ["Jordan", "Price"],
  ["Simone", "Walker"], ["Noah", "Nguyen"], ["Elena", "Santos"], ["Marcus", "Bell"],
  ["Grace", "Kim"], ["Samuel", "Johnson"], ["Rachel", "Davis"], ["Ibrahim", "Saleh"],
  ["Ava", "Mitchell"], ["David", "Patel"], ["Sofia", "Reyes"], ["Isaiah", "Moore"],
  ["Maya", "Turner"], ["Owen", "Williams"], ["Zoe", "Robinson"],
  ["Caleb", "Hughes"], ["Nia", "Thompson"], ["Lucia", "Garcia"],
];
if (subjects.reduce((total, [, count]) => total + count, 0) !== names.length)
  throw Error("Teacher allocation must total 30");

const teachers = [];
const teachersBySubject = new Map();
let next = 0;
for (const [subject, count] of subjects) {
  const group = [];
  for (let i = 0; i < count; i++) {
    const index = next++;
    const key = "CAN-DEMO-TEACHER-" + String(index + 1).padStart(2, "0");
    const [firstName, lastName] = names[index];
    const weeklyDays = [
      [1, 2, 3, 4, 5], [0, 1, 3, 5], [2, 3, 4, 6], [0, 2, 4, 6],
    ][index % 4];
    const teacher = {
      key, firstName, lastName,
      email: "can.demo.teacher" + String(index + 1).padStart(2, "0") + "@example.invalid",
      biography: "Synthetic CAN Academy " + subject + " instructor profile for product demonstrations only. Background and experience are illustrative, not verified.",
      primarySubject: subject,
      gradeRange: { min: "K", max: "12" },
      modalities: ["live_online", "hybrid"],
      verified: false,
      availability: {
        startsAt: "2027-01-01T00:00:00.000Z",
        endsAt: "2029-01-01T00:00:00.000Z",
        timezone: "America/Los_Angeles",
        weeklyPattern: { days: weeklyDays, startTime: "08:00", endTime: "20:00" },
      },
      maxSeatsPerOffering: 30,
      courseCodes: [],
    };
    group.push(teacher);
    teachers.push(teacher);
  }
  teachersBySubject.set(subject, group);
}
const courseTeachers = [];
const seenCourses = new Set();
const offsets = new Map();
for (const course of catalog.courses) {
  if (seenCourses.has(course.code)) throw Error("Duplicate course: " + course.code);
  seenCourses.add(course.code);
  const group = teachersBySubject.get(course.subject);
  if (!group?.length) throw Error("Unrecognized curriculum subject " + course.subject);
  const offset = offsets.get(course.subject) ?? 0;
  offsets.set(course.subject, offset + 1);
  const primary = group[offset % group.length];
  const alternate = group[(offset + 1) % group.length];
  for (const teacher of [primary, alternate]) teacher.courseCodes.push(course.code);
  courseTeachers.push({
    courseCode: course.code, primaryTeacherKey: primary.key, alternateTeacherKey: alternate.key,
  });
}
if (seenCourses.size !== 120 || teachers.length !== 30 ||
    courseTeachers.some(entry => entry.primaryTeacherKey === entry.alternateTeacherKey))
  throw Error("Demo teacher coverage is incomplete");

const staffingExamples = catalog.courses.filter(course => course.deepDemo).map(course => {
  const match = courseTeachers.find(entry => entry.courseCode === course.code);
  return {
    courseCode: course.code,
    classCode: "CAN-DEMO-CLASS-" + course.code.replace("CAN-DEMO-", ""),
    primaryTeacherKey: match.primaryTeacherKey,
    alternateTeacherKey: match.alternateTeacherKey,
    status: "planning_only",
    note: "Illustrative class staffing suggestion, not a section or teacher assignment.",
  };
});
if (staffingExamples.length !== 15) throw Error("Expected 15 featured class staffing examples");

const payload = {
  format: "can-os-demo-teacher-marketplace-v1",
  provenance: {
    sourceType: "can-demo-teacher-factory",
    isSynthetic: true, credentialsVerified: false, assignmentsAuthorized: false,
    offeringAvailabilityConfirmed: false,
  },
  provider: {
    slug: "can-demo-teaching-provider", name: "CAN Demo Teaching Provider",
    organizationType: "other_partner", metadata: { demoProvider: true, isSynthetic: true },
  },
  teachers,
  courseTeachers,
  staffingExamples,
};
mkdirSync(dirname(resolve(outputPath)), { recursive: true });
writeFileSync(resolve(outputPath), JSON.stringify(payload, null, 2) + "\n");
console.log(JSON.stringify({
  output: resolve(outputPath), teachers: teachers.length,
  coursesCovered: seenCourses.size, teacherCourseMappings: teachers.reduce((n, t) => n + t.courseCodes.length, 0),
  classPlanningExamples: staffingExamples.length,
}, null, 2));
