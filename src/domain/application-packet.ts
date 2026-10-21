import { z } from "zod";

export const applicationGrades = ["TK", "K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"] as const;
const text = (max = 200) => z.string().trim().max(max);
const date = text(10).refine(value => !value || (
  /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value
), "Enter a valid date");
export const applicationAddressSchema = z.object({
  line1: text(), line2: text(), city: text(), region: text(), postalCode: text(30), country: text(100),
}).strict();
export const applicationContactSchema = z.object({
  firstName: text(100), lastName: text(100), relationship: text(100),
  email: text(254).refine(value => !value || z.string().email().safeParse(value).success, "Enter a valid contact email"),
  phone: text(50),
}).strict();
export const applicationSchoolSchema = z.object({
  name: text(), location: text(), grade: text(30), from: date, to: date, reasonForLeaving: text(2000),
}).strict();
export const applicationPacketSchema = z.object({
  version: z.literal(1),
  schoolYear: text(9).refine(value => {
    if (!value) return true;
    const match = /^(\d{4})-(\d{4})$/.exec(value);
    return Boolean(match && Number(match[2]) === Number(match[1]) + 1);
  }, "Use consecutive years, for example 2026-2027"),
  student: z.object({
    middleName: text(100), preferredName: text(100), birthDate: date, primaryLanguage: text(100),
  }).strict(),
  households: z.array(z.object({
    name: text(), address: applicationAddressSchema,
    contacts: z.array(applicationContactSchema).min(1).max(4),
  }).strict()).min(1).max(2),
  siblings: z.array(z.object({ name: text(), grade: text(30), school: text() }).strict()).max(10),
  history: z.object({
    firstSchool: z.boolean(),
    schools: z.array(applicationSchoolSchema).max(6),
    learningInterests: text(3000), additionalInformation: text(3000),
  }).strict(),
}).strict().superRefine((packet, context) => {
  if (packet.history.firstSchool && packet.history.schools.length)
    context.addIssue({ code: "custom", path: ["history", "schools"], message: "Remove previous schools when this is the student's first school" });
  packet.history.schools.forEach((school, index) => {
    if (school.from && school.to && school.from > school.to)
      context.addIssue({ code: "custom", path: ["history", "schools", index, "to"], message: "Attendance end date must follow its start date" });
  });
});
export type ApplicationPacket = z.infer<typeof applicationPacketSchema>;
export const familyApplicationDetails = z.object({
  studentFirstName: z.string().trim().min(1).max(100), studentLastName: z.string().trim().min(1).max(100),
  gradeLevel: z.enum(applicationGrades), statement: text(3000),
  packet: applicationPacketSchema.optional(),
}).strict();
export type FamilyApplicationDetails = z.infer<typeof familyApplicationDetails>;
export function emptyApplicationContact(): ApplicationPacket["households"][number]["contacts"][number] {
  return { firstName: "", lastName: "", relationship: "", email: "", phone: "" };
}
export function emptyApplicationHousehold(): ApplicationPacket["households"][number] {
  return { name: "", address: { line1: "", line2: "", city: "", region: "", postalCode: "", country: "" },
    contacts: [emptyApplicationContact()] };
}
export function emptyApplicationPacket(): ApplicationPacket {
  return { version: 1, schoolYear: "", student: { middleName: "", preferredName: "", birthDate: "", primaryLanguage: "" },
    households: [emptyApplicationHousehold()], siblings: [],
    history: { firstSchool: false, schools: [], learningInterests: "", additionalInformation: "" } };
}
export const packetSections = [
  { key: "student", title: "Student information" },
  { key: "family", title: "Family and households" },
  { key: "history", title: "Previous schools and interests" },
] as const;
export type PacketSection = typeof packetSections[number]["key"];
export type ApplicationFieldIssue = { path: string; section: PacketSection; message: string };
export function applicationPacketFieldIssues(packet: ApplicationPacket, statement: string,
  today = new Date().toISOString().slice(0, 10)): ApplicationFieldIssue[] {
  const issues: ApplicationFieldIssue[] = [];
  function add(path: string, section: PacketSection, message: string) {
    if (!issues.some(issue => issue.path === path)) issues.push({ path, section, message });
  }
  const parsed = applicationPacketSchema.safeParse(packet);
  if (!parsed.success) for (const issue of parsed.error.issues) {
    const root = issue.path[0];
    add(issue.path.join("."), root === "households" || root === "siblings" ? "family" :
      root === "history" ? "history" : "student", issue.message);
  }
  if (!packet.schoolYear.trim()) add("schoolYear", "student", "Enter the requested school year.");
  if (!packet.student.birthDate || packet.student.birthDate >= today)
    add("student.birthDate", "student", "Enter a date of birth before today.");
  if (!packet.student.primaryLanguage.trim()) add("student.primaryLanguage", "student", "Enter the primary language.");
  packet.households.forEach((household, index) => {
    const prefix = `households.${index}`;
    if (!household.name.trim()) add(`${prefix}.name`, "family", "Enter a household name.");
    for (const [key, label] of [["line1", "street address"], ["city", "city"], ["region", "state / province"],
      ["postalCode", "postal code"], ["country", "country"]] as const) {
      if (!household.address[key].trim()) add(`${prefix}.address.${key}`, "family", `Enter the ${label}.`);
    }
    household.contacts.forEach((contact, contactIndex) => {
      for (const [key, label] of [["firstName", "contact first name"], ["lastName", "contact last name"],
        ["relationship", "relationship to student"], ["email", "contact email"], ["phone", "contact phone"]] as const) {
        if (!contact[key].trim()) add(`${prefix}.contacts.${contactIndex}.${key}`, "family", `Enter the ${label}.`);
      }
    });
  });
  packet.siblings.forEach((sibling, index) => {
    for (const [key, label] of [["name", "sibling name"], ["grade", "sibling grade / age"], ["school", "sibling school or not attending"]] as const)
      if (!sibling[key].trim()) add(`siblings.${index}.${key}`, "family", `Enter the ${label}, or remove this sibling.`);
  });
  if (!packet.history.firstSchool && !packet.history.schools.length)
    add("history.firstSchool", "history", "Add a previous school or select that this is the student's first school.");
  packet.history.schools.forEach((school, index) => {
    for (const [key, label] of [["name", "school name"], ["location", "school city / country"],
      ["grade", "last grade attended"], ["reasonForLeaving", "reason for leaving"]] as const)
      if (!school[key].trim()) add(`history.schools.${index}.${key}`, "history", `Enter the ${label}.`);
  });
  if (!packet.history.learningInterests.trim()) add("history.learningInterests", "history", "Enter the student's learning interests.");
  if (!statement.trim()) add("statement", "history", "Explain your interest in this program.");
  return issues;
}
export function applicationPacketProgress(packet: ApplicationPacket | null, statement: string, today = new Date().toISOString().slice(0, 10)) {
  const missing: Record<PacketSection, string[]> = { student: [], family: [], history: [] };
  if (!packet) {
    missing.student.push("School year, date of birth and primary language");
    missing.family.push("Household address and contact information");
    missing.history.push("School history and learning interests");
    return missing;
  }
  for (const issue of applicationPacketFieldIssues(packet, statement, today)) {
    const match = /^households\.(\d+)(?:\.contacts\.(\d+))?/.exec(issue.path);
    const label = match ? `Household ${Number(match[1]) + 1}${match[2] !== undefined ? `, contact ${Number(match[2]) + 1}` : ""}` :
      issue.path === "schoolYear" ? "Requested school year" : "";
    missing[issue.section].push(label ? `${label}: ${issue.message}` : issue.message);
  }
  return missing;
}
export function readApplicationPacket(metadata: Record<string, unknown>) {
  return metadata.applicationPacket === undefined ? null : applicationPacketSchema.parse(metadata.applicationPacket);
}
