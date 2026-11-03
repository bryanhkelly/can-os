#!/usr/bin/env node
/**
 * One-time, transactional transfer of the validated synthetic curriculum,
 * teacher preview, and jurisdiction-review dataset from its Neon branch.
 *
 * Defaults to read-only preview. Never creates accounts, grants, assignments,
 * published curriculum, or school-specific staffing.
 */
import { Pool } from "@neondatabase/serverless";

const PROJECT_ID = "sweet-hall-62441909";
const SOURCE_BRANCH_ID = "br-spring-wave-ar3z6ibn";
const PRODUCTION_BRANCH_ID = "br-restless-sea-ar9ooo55";
const PRODUCTION_CONFIRMATION = "I AUTHORIZE SYNTHETIC DEMO DATA TRANSFER TO NEON MAIN";
const DEMO_JURISDICTIONS = [
  "US-AR", "US-AZ", "US-FL", "US-IA", "US-OK", "US-TX", "US-WI", "US-WV",
];
const DEMO_SOURCE = "can-demo-catalog-factory";
const TEACHER_SOURCE = "can-demo-teacher-marketplace-factory";
const TEACHER_EMAIL_PATTERN = "can.demo.teacher%@example.invalid";

const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1];
};
const apply = process.argv.includes("--apply");
const sourceHost = argument("--source-host");
const targetHost = argument("--target-host") ??
  (process.env.DATABASE_URL && new URL(process.env.DATABASE_URL).hostname);
const targetBranchId = argument("--target-branch");

if (!process.env.DATABASE_URL || !sourceHost || !targetHost || !targetBranchId) {
  throw Error("Set DATABASE_URL and provide --source-host, --target-host, and --target-branch");
}
if (!sourceHost.endsWith(".neon.tech") || !targetHost.endsWith(".neon.tech")) {
  throw Error("Both source and target must be Neon branch hosts");
}
const productionTarget = targetBranchId === PRODUCTION_BRANCH_ID;
if (apply && productionTarget &&
    (!process.argv.includes("--authorize-production") ||
      process.env.DEMO_DATA_PRODUCTION_WRITE_CONFIRMED !== PRODUCTION_CONFIRMATION)) {
  throw Error("Production writes require --authorize-production and the exact DEMO_DATA_PRODUCTION_WRITE_CONFIRMED value");
}
if (apply && !productionTarget &&
    (!process.argv.includes("--authorize-nonproduction") ||
      process.env.DEMO_DATA_NONPRODUCTION_WRITE_CONFIRMED !== targetBranchId)) {
  throw Error("Nonproduction writes require --authorize-nonproduction and DEMO_DATA_NONPRODUCTION_WRITE_CONFIRMED equal to the target branch ID");
}

function branchUrl(host) {
  const url = new URL(process.env.DATABASE_URL);
  url.hostname = host;
  return url.toString();
}

const sourcePool = new Pool({ connectionString: branchUrl(sourceHost) });
const targetPool = new Pool({ connectionString: branchUrl(targetHost) });
const source = await sourcePool.connect();
const target = await targetPool.connect();

function requireCount(name, rows, expected) {
  if (rows.length !== expected) {
    throw Error(`${name}: expected ${expected} source rows, found ${rows.length}`);
  }
  return rows;
}

async function sourceRows(name, query, parameters, expected) {
  const result = await source.query(query, parameters);
  return requireCount(name, result.rows, expected);
}

function addSourceSystem(row, column, sourceSystem) {
  const value = row[column] ?? {};
  return { ...row, [column]: { ...value, sourceSystem } };
}

async function getTargetColumns(table) {
  const result = await target.query(
    `SELECT column_name, data_type, is_nullable, column_default, is_identity
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position`,
    [table],
  );
  if (!result.rows.length) throw Error(`Target table public.${table} is missing`);
  return result.rows;
}

async function preflightRows(table, rows) {
  const columns = await getTargetColumns(table);
  const sourceKeys = new Set(rows.flatMap((row) => Object.keys(row)));
  const missingRequired = columns.filter((column) =>
    !sourceKeys.has(column.column_name) &&
    column.is_nullable === "NO" &&
    column.column_default === null &&
    column.is_identity !== "YES");
  if (missingRequired.length) {
    throw Error(`Target ${table} requires unmapped columns: ${missingRequired.map((column) => column.column_name).join(", ")}`);
  }

  const ids = rows.map((row) => row.id);
  const collisions = await target.query(
    `SELECT id FROM public."${table}" WHERE id = ANY($1::uuid[])`,
    [ids],
  );
  if (collisions.rowCount) {
    throw Error(`Target ${table} already contains ${collisions.rowCount} source IDs; refusing to merge or overwrite`);
  }
  return columns;
}

async function insertRows(table, rows, columns) {
  const available = new Set(columns.map((column) => column.column_name));
  const names = Object.keys(rows[0] ?? {}).filter((name) => available.has(name));
  const jsonColumns = new Set(columns
    .filter((column) => column.data_type === "json" || column.data_type === "jsonb")
    .map((column) => column.column_name));
  const batchSize = 50;
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const parameters = [];
    const tuples = batch.map((row) => {
      const placeholders = names.map((name) => {
        const value = row[name];
        parameters.push(jsonColumns.has(name) && value !== null && value !== undefined
          ? JSON.stringify(value)
          : value);
        return `$${parameters.length}${jsonColumns.has(name) ? "::jsonb" : ""}`;
      });
      return `(${placeholders.join(", ")})`;
    });
    await target.query(
      `INSERT INTO public."${table}" (${names.map((name) => `"${name}"`).join(", ")})
       VALUES ${tuples.join(", ")}`,
      parameters,
    );
  }
}

try {
  await source.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const sourceIdentity = await source.query(
    `SELECT current_database() AS database,
            current_setting('neon.project_id', true) AS project_id,
            current_setting('neon.branch_id', true) AS branch_id`,
  );
  const sourceInfo = sourceIdentity.rows[0];
  if (sourceInfo.database !== "neondb" ||
      sourceInfo.project_id !== PROJECT_ID ||
      sourceInfo.branch_id !== SOURCE_BRANCH_ID) {
    throw Error("Source database/project/branch identity does not match the approved development dataset");
  }

  await target.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  const targetIdentity = await target.query(
    `SELECT current_database() AS database,
            current_setting('neon.project_id', true) AS project_id,
            current_setting('neon.branch_id', true) AS branch_id`,
  );
  const targetInfo = targetIdentity.rows[0];
  if (targetInfo.database !== "neondb" ||
      targetInfo.project_id !== PROJECT_ID ||
      targetInfo.branch_id !== targetBranchId ||
      targetInfo.branch_id === SOURCE_BRANCH_ID) {
    throw Error("Target database/project/branch identity mismatch");
  }
  if (productionTarget !== (targetInfo.branch_id === PRODUCTION_BRANCH_ID)) {
    throw Error("Production target classification mismatch");
  }
  await target.query("SELECT pg_advisory_xact_lock(hashtext('can-os:synthetic-demo-data-transfer'))");

  const publishers = await sourceRows(
    "demo publisher",
    `SELECT * FROM organizations
      WHERE slug = 'can-demo-publisher'
        AND type = 'other_partner'
        AND metadata->>'demoPublisher' = 'true'
        AND metadata->>'isSynthetic' = 'true'`,
    [],
    1,
  );
  const providers = await sourceRows(
    "demo teaching provider",
    `SELECT * FROM organizations
      WHERE slug = 'can-demo-teaching-provider'
        AND type = 'other_partner'
        AND metadata->>'demoProvider' = 'true'
        AND metadata->>'isSynthetic' = 'true'`,
    [],
    1,
  );
  const organizations = [...publishers, ...providers];
  const publisherId = publishers[0].id;
  const providerId = providers[0].id;

  const teachers = await sourceRows(
    "synthetic teacher people",
    `SELECT * FROM people
      WHERE email LIKE $1
        AND metadata->>'sourceSystem' = $2
        AND metadata->>'synthetic' = 'true'
      ORDER BY email`,
    [TEACHER_EMAIL_PATTERN, TEACHER_SOURCE],
    30,
  );
  const teacherIds = teachers.map((row) => row.id);

  const jurisdictions = await sourceRows(
    "demo jurisdictions",
    `SELECT * FROM jurisdictions WHERE code = ANY($1::text[]) ORDER BY code`,
    [DEMO_JURISDICTIONS],
    8,
  );
  const jurisdictionIds = jurisdictions.map((row) => row.id);

  const courses = await sourceRows(
    "importer-owned demo courses",
    `SELECT * FROM course_templates
      WHERE owning_organization_id = $1
        AND code LIKE 'CAN-DEMO-%'
        AND metadata->>'sourceSystem' = $2
      ORDER BY code`,
    [publisherId, DEMO_SOURCE],
    120,
  );
  const courseIds = courses.map((row) => row.id);
  const courseVersions = await sourceRows(
    "draft demo course versions",
    `SELECT v.* FROM course_template_versions v
      WHERE v.course_template_id = ANY($1::uuid[])
        AND v.status = 'draft'
        AND v.curriculum ? 'demoSourceHash'
        AND v.curriculum->>'authoringRequestId' IS NULL
      ORDER BY v.course_template_id, v.version`,
    [courseIds],
    120,
  );
  if (new Set(courseVersions.map((row) => row.course_template_id)).size !== 120) {
    throw Error("Expected exactly one importer-owned draft version per course");
  }
  const versionIds = courseVersions.map((row) => row.id);

  const packs = await sourceRows(
    "private demo pack",
    `SELECT * FROM curriculum_packs
      WHERE publisher_organization_id = $1
        AND slug = 'can-os-demo-catalog'
        AND visibility = 'private'
        AND metadata->>'sourceSystem' = $2`,
    [publisherId, DEMO_SOURCE],
    1,
  );
  const pack = packs[0];
  const packVersions = await sourceRows(
    "demo pack draft",
    `SELECT * FROM curriculum_pack_versions
      WHERE pack_id = $1 AND status = 'draft'
      ORDER BY version DESC`,
    [pack.id],
    1,
  );
  const ownedPackVersion = addSourceSystem(packVersions[0], "metadata", DEMO_SOURCE);
  const packItems = await sourceRows(
    "demo pack items",
    `SELECT i.* FROM curriculum_pack_items i
      WHERE i.pack_version_id = $1
        AND i.course_template_version_id = ANY($2::uuid[])
      ORDER BY i.position`,
    [packVersions[0].id, versionIds],
    120,
  );
  if (new Set(packItems.map((row) => row.course_template_version_id)).size !== 120) {
    throw Error("Demo pack does not reference each of the 120 draft course versions exactly once");
  }

  const memberships = await sourceRows(
    "synthetic teacher memberships",
    `SELECT * FROM memberships
      WHERE organization_id = $1
        AND person_id = ANY($2::uuid[])
        AND metadata->>'sourceSystem' = $3
      ORDER BY person_id`,
    [providerId, teacherIds, TEACHER_SOURCE],
    30,
  );
  const availability = await sourceRows(
    "synthetic instructor availability",
    `SELECT * FROM instructor_availability_windows
      WHERE person_id = ANY($1::uuid[])
        AND metadata->>'sourceSystem' = $2`,
    [teacherIds, TEACHER_SOURCE],
    30,
  );
  const capabilities = await sourceRows(
    "synthetic instructor capabilities",
    `SELECT * FROM instructor_capabilities
      WHERE person_id = ANY($1::uuid[])
        AND course_template_id = ANY($2::uuid[])
        AND metadata->>'sourceSystem' = $3`,
    [teacherIds, courseIds, TEACHER_SOURCE],
    240,
  );
  const offerings = await sourceRows(
    "preview-only capacity offerings",
    `SELECT * FROM instructional_capacity_offerings
      WHERE person_id = ANY($1::uuid[])
        AND metadata->>'sourceSystem' = $2
        AND metadata->>'previewOnly' = 'true'
        AND metadata->>'capacityNotVerified' = 'true'
        AND metadata->>'sharingScope' = 'illustrative_cross_school'
        AND organization_id IS NULL
        AND site_id IS NULL
        AND program_id IS NULL
        AND jurisdiction_id IS NULL`,
    [teacherIds, TEACHER_SOURCE],
    240,
  );

  const profiles = await sourceRows(
    "unverified jurisdiction profiles",
    `SELECT p.* FROM jurisdiction_profile_versions p
      WHERE p.jurisdiction_id = ANY($1::uuid[])
        AND p.status = 'in_review'
        AND p.verification_status = 'unverified'
        AND p.review_owner_person_id IS NULL
        AND p.reviewed_at IS NULL`,
    [jurisdictionIds],
    8,
  );
  if (new Set(profiles.map((row) => row.jurisdiction_id)).size !== 8) {
    throw Error("Expected one unverified in-review jurisdiction profile per demo state");
  }

  const approvals = await sourceRows(
    "synthetic curriculum jurisdiction reviews",
    `SELECT * FROM curriculum_jurisdiction_approvals
      WHERE course_template_version_id = ANY($1::uuid[])
        AND jurisdiction_id = ANY($2::uuid[])
        AND academic_purpose = 'general_instruction'
        AND status = 'under_review'
        AND authority_organization_id = $3
        AND evidence->>'scope' = 'internal_demo_only'
        AND evidence->>'externalAuthorization' = 'false'`,
    [versionIds, jurisdictionIds, publisherId],
    960,
  );
  if (new Set(approvals.map((row) => `${row.course_template_version_id}/${row.jurisdiction_id}`)).size !== 960) {
    throw Error("Expected one internal-demo review for each of 120 versions and eight jurisdictions");
  }

  const courseVersionsWithOwnership = courseVersions.map((row) =>
    addSourceSystem(row, "curriculum", DEMO_SOURCE));
  const transfer = [
    ["organizations", organizations],
    ["jurisdictions", jurisdictions],
    ["people", teachers],
    ["course_templates", courses],
    ["course_template_versions", courseVersionsWithOwnership],
    ["curriculum_packs", packs],
    ["curriculum_pack_versions", [ownedPackVersion]],
    ["curriculum_pack_items", packItems],
    ["memberships", memberships],
    ["instructor_availability_windows", availability],
    ["instructor_capabilities", capabilities],
    ["instructional_capacity_offerings", offerings],
    ["jurisdiction_profile_versions", profiles],
    ["curriculum_jurisdiction_approvals", approvals],
  ];

  const columnMaps = new Map();
  for (const [table, rows] of transfer) {
    columnMaps.set(table, await preflightRows(table, rows));
  }

  const expected = Object.fromEntries(transfer.map(([table, rows]) => [table, rows.length]));
  if (apply) {
    for (const [table, rows] of transfer) {
      await insertRows(table, rows, columnMaps.get(table));
    }

    const verification = await target.query(
      `SELECT
        (SELECT count(*)::int FROM course_templates WHERE owning_organization_id = $1 AND code LIKE 'CAN-DEMO-%') AS courses,
        (SELECT count(*)::int FROM course_template_versions v JOIN course_templates t ON t.id = v.course_template_id WHERE t.owning_organization_id = $1 AND t.code LIKE 'CAN-DEMO-%' AND v.status = 'draft') AS course_versions,
        (SELECT count(*)::int FROM curriculum_packs WHERE publisher_organization_id = $1 AND slug = 'can-os-demo-catalog' AND visibility = 'private') AS packs,
        (SELECT count(*)::int FROM curriculum_pack_items i JOIN curriculum_pack_versions pv ON pv.id = i.pack_version_id JOIN curriculum_packs p ON p.id = pv.pack_id WHERE p.publisher_organization_id = $1 AND p.slug = 'can-os-demo-catalog') AS pack_items,
        (SELECT count(*)::int FROM people WHERE email LIKE $2 AND metadata->>'sourceSystem' = $3) AS teachers,
        (SELECT count(*)::int FROM instructor_capabilities ic JOIN people p ON p.id = ic.person_id WHERE p.email LIKE $2 AND ic.metadata->>'sourceSystem' = $4) AS capabilities,
        (SELECT count(*)::int FROM instructor_availability_windows aw JOIN people p ON p.id = aw.person_id WHERE p.email LIKE $2 AND aw.metadata->>'sourceSystem' = $4) AS availability,
        (SELECT count(*)::int FROM instructional_capacity_offerings co JOIN people p ON p.id = co.person_id WHERE p.email LIKE $2 AND co.metadata->>'sourceSystem' = $4 AND co.metadata->>'previewOnly' = 'true') AS offerings,
        (SELECT count(*)::int FROM jurisdictions WHERE code = ANY($5::text[])) AS jurisdictions,
        (SELECT count(*)::int FROM jurisdiction_profile_versions jp JOIN jurisdictions j ON j.id = jp.jurisdiction_id WHERE j.code = ANY($5::text[]) AND jp.status = 'in_review' AND jp.verification_status = 'unverified') AS profiles,
        (SELECT count(*)::int FROM curriculum_jurisdiction_approvals a JOIN course_template_versions v ON v.id = a.course_template_version_id JOIN course_templates t ON t.id = v.course_template_id WHERE t.owning_organization_id = $1 AND t.code LIKE 'CAN-DEMO-%' AND a.evidence->>'scope' = 'internal_demo_only' AND a.status = 'under_review') AS reviews`,
      [publisherId, TEACHER_EMAIL_PATTERN, TEACHER_SOURCE, TEACHER_SOURCE, DEMO_JURISDICTIONS],
    );
    const counts = verification.rows[0];
    const required = {
      courses: 120, course_versions: 120, packs: 1, pack_items: 120,
      teachers: 30, capabilities: 240, availability: 30, offerings: 240,
      jurisdictions: 8, profiles: 8, reviews: 960,
    };
    for (const [key, count] of Object.entries(required)) {
      if (counts[key] !== count) throw Error(`Post-insert verification failed for ${key}: expected ${count}, found ${counts[key]}`);
    }
    await target.query("COMMIT");
  } else {
    await target.query("ROLLBACK");
  }

  console.log(JSON.stringify({
    apply,
    source: { projectId: sourceInfo.project_id, branchId: sourceInfo.branch_id },
    target: { projectId: targetInfo.project_id, branchId: targetInfo.branch_id },
    expected,
    provenance: {
      courseVersionsMarked: 120,
      packVersionMarked: 1,
      academicApproval: false,
      teacherCredentialsVerified: false,
      previewOfferingsOnly: true,
    },
  }, null, 2));
} catch (error) {
  try { await target.query("ROLLBACK"); } catch { /* preserve the original database error */ }
  throw error;
} finally {
  try { await source.query("ROLLBACK"); } catch { /* read-only transaction may already be closed */ }
  source.release();
  target.release();
  await sourcePool.end();
  await targetPool.end();
}
