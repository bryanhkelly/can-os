-- GF26 additive migration. Apply to isolated synthetic Neon branch first.
BEGIN;
CREATE TABLE IF NOT EXISTS study_groups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, description text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('course','interest')),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
 visibility text NOT NULL DEFAULT 'site' CHECK(visibility IN ('site','network')),
 site_id uuid REFERENCES sites(id) ON DELETE RESTRICT,
 program_id uuid REFERENCES programs(id) ON DELETE RESTRICT,
 section_id uuid REFERENCES sections(id) ON DELETE RESTRICT,
 facilitator_person_id uuid NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
 max_members integer NOT NULL DEFAULT 20 CHECK(max_members BETWEEN 2 AND 50),
 requires_approval boolean NOT NULL DEFAULT true,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS study_group_site_idx ON study_groups(site_id);
CREATE INDEX IF NOT EXISTS study_group_section_idx ON study_groups(section_id);
CREATE TABLE IF NOT EXISTS study_group_memberships (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 group_id uuid NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
 person_id uuid NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
 role text NOT NULL DEFAULT 'student' CHECK(role IN ('student','facilitator','tutor')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','declined','left')),
 reviewed_by_person_id uuid REFERENCES people(id) ON DELETE RESTRICT,joined_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT study_group_member_uq UNIQUE(group_id,person_id)
);
CREATE INDEX IF NOT EXISTS study_group_person_idx ON study_group_memberships(person_id);
CREATE TABLE IF NOT EXISTS study_group_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),group_id uuid NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
 title text NOT NULL,agenda text NOT NULL DEFAULT '',starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL,location text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT study_group_session_time_chk CHECK(ends_at>starts_at)
);
CREATE INDEX IF NOT EXISTS study_group_session_idx ON study_group_sessions(group_id,starts_at);
CREATE TABLE IF NOT EXISTS study_group_posts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),group_id uuid NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
 author_person_id uuid NOT NULL REFERENCES people(id) ON DELETE RESTRICT,body text NOT NULL,
 parent_post_id uuid REFERENCES study_group_posts(id) ON DELETE SET NULL,
 hidden boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS study_group_post_idx ON study_group_posts(group_id,created_at);
CREATE TABLE IF NOT EXISTS study_group_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),group_id uuid NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
 reporter_person_id uuid NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
 post_id uuid REFERENCES study_group_posts(id) ON DELETE SET NULL,
 reason text NOT NULL,status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS study_group_report_idx ON study_group_reports(group_id,status);
-- Attendance extension (safe to re-run)
CREATE TABLE IF NOT EXISTS study_group_session_attendance (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 session_id uuid NOT NULL REFERENCES study_group_sessions(id) ON DELETE CASCADE,
 person_id uuid NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
 rsvp text NOT NULL DEFAULT 'going' CHECK(rsvp IN ('going','maybe','declined')),
 attended boolean,
 recorded_by_person_id uuid REFERENCES people(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT study_group_session_person_uq UNIQUE(session_id,person_id)
);
COMMIT;
