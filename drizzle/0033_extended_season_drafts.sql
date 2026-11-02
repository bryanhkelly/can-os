-- First-class draft planning state. Existing registration seasons retain their status.
-- Do not make new extended-program seasons registrable before safeguarding and staffing checks.
ALTER TYPE "public"."activity_season_status" ADD VALUE IF NOT EXISTS 'draft';
