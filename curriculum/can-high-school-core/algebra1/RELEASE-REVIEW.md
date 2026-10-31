# CAN Algebra I — instructional coverage and release gate

**Status: DRAFT / NOT CREDIT READY / NOT ADOPTED.** This directory is publisher-authored source material, not a CAN-approved academic course release or evidence of delivered instruction. CAN, as school of record, retains instructional and records authority. Church sites cannot independently authorize academic release.

## Verified source inventory

- Yearlong blueprint: 36 mapped instructional weeks, 9 units, 180 planned 55-minute lessons.
- Week 1: 5 structured lessons, 2 assessments, teacher-only lesson guide.
- Week 2: 5 structured draft lessons, 5 teacher-only daily guides, 2 separate draft assessments, 1 teacher-only assessment-key file.
- Week 3: 5 original structured draft lessons and a teacher-only guide with worked answers.
- Week 4: 5 original cumulative assessment, feedback and reassessment lesson drafts with protected guide.\n- Week 5: 5 original functions, notation and domain lessons with protected teacher guide.\n- Week 6: 5 original table, coordinate graph and representation lessons with protected teacher guide.\n- Weeks 7–36: planning entries only. **150 of 180 planned daily lessons remain unwritten.**
- None of these counts means the lessons have been professionally reviewed, published, adopted or taught.

## Prerequisite and dependency sequence

| Unit | Weeks | Core dependency |
| --- | --- | --- |
| 1 | 1–4 | Signed-number arithmetic, distributive property, equality and linear equation reasoning |
| 2 | 5–8 | Unit 1 algebraic expressions and solving for unknown quantities |
| 3 | 9–12 | Unit 2 functions, coordinate graphs, input-output and rate of change |
| 4 | 13–16 | Unit 3 linear graphs and equivalent equations |
| 5 | 17–20 | Unit 2 function notation, Unit 3 rates and linear-vs-multiplicative comparisons |
| 6 | 21–24 | Unit 1 symbolic manipulation and Unit 5 exponent operations |
| 7 | 25–28 | Unit 6 polynomial operations and Unit 3 graph interpretation |
| 8 | 29–32 | Units 2–7 function representations and model interpretation |
| 9 | 33–36 | Cumulative integration of Units 1–8; no automatic credit or mastery inference |

The table records instructional prerequisites, not proof that the student has mastered them. Teachers must diagnose prerequisite gaps and provide differentiated instruction.

## Packaging

Run `node scripts/package-algebra1.mjs --report` to validate the existing authored inventory and report coverage. Run `node scripts/package-algebra1.mjs --write /tmp/can-algebra1-draft.json` to create a **student-facing draft** in the canonical class-content v1 format. The script does not write to any database, adopt a course, publish to a class, or include teacher answer keys. The generated file must undergo the normal publisher versioning, CAN academic review, authorization and adoption workflow. **Do not publish the generated two-week draft as a full-year Algebra I course.**

## Review and publication checklist

1. Qualified mathematics reviewer verifies each derivation, mathematical notation, contextual model, scoring key and standard alignment. Review the Week 2 bus and fraction problems especially carefully.
2. Validate pacing and accessibility: readable equations, alternate representations, language scaffolds, screen-reader interpretation, individualized accommodations, and enrichment.
3. Complete all missing Weeks 7–36 daily instruction, guided and independent practice, checks, standalone formative and mastery assessments, protected keys, teacher guides and reteaching plans.
4. Validate licensing of every external source and attached resource; current included instructional text is identified as original CAN-created material, with standards links used only for reference.
5. Validate the assembled class-content v1 draft with canonical schemas, teacher-only guide mapping and real publisher import/preview. Verify student roles cannot access any answer-key artifacts.
6. Obtain formal CAN academic approval and separate school adoption decisions before release. Preserve actual instructional records, student work, and assessment evidence through the existing CAN systems.

## Remaining known limitations

The packager checks structure, nonempty activities, lesson pacing, matching guide IDs, and assessment rubric totals, but cannot independently certify mathematical accuracy, professional academic review, accommodation quality, licensing ownership or production import. It deliberately fails to assert yearlong readiness.
