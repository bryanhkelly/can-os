-- Single host-neutral academy Program model; the PostgreSQL enum label is
-- renamed in place, preserving existing Program rows without a second model.
ALTER TYPE "program_type" RENAME VALUE 'church_hosted_academy' TO 'hosted_academy';
