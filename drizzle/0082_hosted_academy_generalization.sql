-- Rename the canonical school model without retaining a second church-specific mode.
-- PostgreSQL renames enum labels in place; existing Program rows retain their meaning.
ALTER TYPE "program_type" RENAME VALUE 'church_hosted_academy' TO 'hosted_academy';
