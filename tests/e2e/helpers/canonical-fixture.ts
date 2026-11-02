import type { Sql } from "../fixture";

/** Insert one synthetic fixture row and require its generated canonical ID. */
export async function insertFixtureId(
  sql: Sql,
  text: string,
  params: readonly unknown[],
): Promise<string> {
  const rows = (await sql.query(text, [...params])) as Array<{ id: string }>;
  const row = rows[0];
  if (!row) throw new Error(`Insert returned no id: ${text}`);
  return row.id;
}

export function createOrganization(
  sql: Sql,
  input: { type: "can_network" | "christian_school"; name: string; slug: string },
): Promise<string> {
  return insertFixtureId(
    sql,
    `insert into organizations (type, name, slug, metadata)
     values ($1, $2, $3, '{}'::jsonb) returning id`,
    [input.type, input.name, input.slug],
  );
}

export function createSite(
  sql: Sql,
  input: { organizationId: string; name: string; slug: string },
): Promise<string> {
  return insertFixtureId(
    sql,
    `insert into sites (organization_id, name, slug, metadata)
     values ($1, $2, $3, '{}'::jsonb) returning id`,
    [input.organizationId, input.name, input.slug],
  );
}

/** Create the standard synthetic high-school delivery context used by browser flows. */
export function createHighSchoolExtensionProgram(
  sql: Sql,
  input: {
    hostOrganizationId: string;
    siteId: string;
    jurisdictionId: string;
    academicProviderOrganizationId: string;
    creditIssuingOrganizationId: string;
    name: string;
    slug: string;
  },
): Promise<string> {
  return insertFixtureId(
    sql,
    `insert into programs (
       organization_id, site_id, jurisdiction_id, type, status, name, slug,
       grade_range, delivery_model, host_organization_id,
       academic_provider_organization_id, credit_issuing_organization_id, metadata
     ) values ($1, $2, $3, 'high_school_extension', 'active', $4, $5,
       '{"min":"9","max":"12"}'::jsonb,
       '{"onsite":true,"asynchronous":true,"liveOnline":true,"onsiteDaysPerWeek":2}'::jsonb,
       $6, $7, $8, '{}'::jsonb) returning id`,
    [
      input.hostOrganizationId,
      input.siteId,
      input.jurisdictionId,
      input.name,
      input.slug,
      input.hostOrganizationId,
      input.academicProviderOrganizationId,
      input.creditIssuingOrganizationId,
    ],
  );
}

export function createCanonicalSection(
  sql: Sql,
  input: {
    programId: string;
    siteId: string;
    courseTemplateVersionId: string;
    code: string;
    title: string;
    termId: string;
  },
): Promise<string> {
  return insertFixtureId(
    sql,
    `insert into sections (
       program_id, site_id, course_template_version_id, code, title, term_id, metadata
     ) values ($1, $2, $3, $4, $5, $6, '{}'::jsonb) returning id`,
    [
      input.programId,
      input.siteId,
      input.courseTemplateVersionId,
      input.code,
      input.title,
      input.termId,
    ],
  );
}

export function createVerifiedAccessAccount(sql: Sql, email: string): Promise<string> {
  return insertFixtureId(
    sql,
    `insert into access_accounts (email_normalized, email_verified_at)
     values ($1, now()) returning id`,
    [email],
  );
}

export function createSyntheticPersonaGrant(
  sql: Sql,
  input: {
    accountId: string;
    personId: string;
    role: string;
    organizationId: string;
    siteId: string;
  },
): Promise<string> {
  return insertFixtureId(
    sql,
    `insert into account_person_grants (
       account_id, person_id, role, organization_id, site_id, active
     ) values ($1, $2, $3, $4, $5, true) returning id`,
    [input.accountId, input.personId, input.role, input.organizationId, input.siteId],
  );
}
