-- Ephemeral CI database: minimal canonical parent-table signatures only.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TYPE organization_type AS ENUM ('can_network','denomination','church','christian_school','microschool_operator','consortium','other_partner');
CREATE TABLE organizations(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE sites(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE programs(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE people(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE documents(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE curriculum_packs(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE curriculum_pack_versions(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE curriculum_adoptions(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE activities(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE field_trips(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE site_local_content_versions(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
