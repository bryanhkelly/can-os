# GitHub and Neon branch cleanup inventory — 2026-11-01

Canonical development: `FullFlow`; preserve `main`. Cleanup is administrative, not feature integration.

## Branch retention manifest (before cleanup)

| Branch | Head SHA |
|---|---|
| `FullFlow` | `b0ef4bfe4a64668a8993d308f9a8bf88bfde1e68` |
| `design/full-site-refresh` | `c372ee739f232cd9774f1186781ef34059842762` |
| `feature/algebra1-teacher-guide-bite3` | `695b1875ec8a49772390048bf6325d6f9e81c112` |
| `feature/algebra1-week01-class-pilot` | `74c07a7695a9a7059fc70f4565c3a0308c76109d` |
| `feature/algebra1-week02-day01-publisher-draft` | `2e48edde884a7a4ba43d3e7aac33e5d3bf293638` |
| `feature/algebra1-week02-day02-literal-equations` | `9523bcef3a49c70fb830534fa36388f968b3f65b` |
| `feature/algebra1-week02-day03-both-sides` | `9b02411793099bb4d24bb39f02307e05a9933af1` |
| `feature/algebra1-week02-publisher-model-cleanup` | `ee9dca40b43749ca784e99e3519329dbfbcede40` |
| `feature/algebra1-week02-unit-foundation` | `0d748e7a2b258ccd2ec9e3e0d2d6aafd6958f836` |
| `feature/browser-school-curriculum-adoption` | `f2d465542b6e8c379d455c0d758bc0f64a3b391c` |
| `feature/curriculum-classroom-evidence-bite1` | `6c5be2b34c595f2c0a4792bcd1fbbe163df6f080` |
| `feature/curriculum-journey-readiness` | `dc2fc8ec2110992790718ffaba1b91eed32db40e` |
| `feature/curriculum-lesson-linked-work` | `9a9f783a68d8346aaebff9dc4461ca0e2fca06e8` |
| `feature/curriculum-marketplace-valor-core` | `a157b6d8f8c4942f4611b0bc5402ff0365b97f72` |
| `feature/curriculum-one-click-acceptance-workflow` | `89c70f2a68c6623c75457aaa55bdda502ba730d6` |
| `feature/curriculum-portability-resources-20261021` | `6c877ba3e14907f74a6a9a86b2d29ac4f350d6e3` |
| `feature/curriculum-publisher-org-classroom-realignment` | `32eac4632cdd9361b1d8c4ab19a1679352858a0a` |
| `feature/curriculum-publisher-outline-navigation` | `25d7fa97a9a43c3771eb16f5abeb98e7cc634843` |
| `feature/curriculum-real-org-to-classroom-acceptance` | `fb778a48cbe7e7003dec9ffcea64da36c514d6f0` |
| `feature/curriculum-school-adopter-permissions` | `191409d46a3908413acc7dcbd6f99cabf9ed6451` |
| `feature/curriculum-school-class-selection` | `83d06eff5ff0c65b559aa7c48bc933a49cedea52` |
| `feature/curriculum-school-course-review` | `d2ec92c56b917d51410f270ffc71e9398381a4d9` |
| `feature/curriculum-structured-lessons-blueprint-bite2` | `303e158b21763b6dd1d712cad0f83430173f2054` |
| `feature/curriculum-student-lesson-reading` | `87a273929a9d210553c4bef09eb8070dc8ddb4d8` |
| `feature/curriculum-teacher-planning-view` | `3788c012c8b09aa329db5477485116ca7eab8f6e` |
| `feature/curriculum-ux-adoption-review` | `eca538f975af21c6d2a12f13d767f5a767718913` |
| `feature/curriculum-ux-discussion-workflow` | `af41f87bb1396867bf4e594f8e6e6b98c652eb4e` |
| `feature/curriculum-ux-explicit-assignment` | `81260234f3b7ff43121672d70488f483afb1a25b` |
| `feature/curriculum-ux-lesson-navigation` | `b48f08426257da3d025ca318f0efbc86c125b14a` |
| `feature/curriculum-ux-publisher-release-readiness` | `24d74e158c84b744e2e280d289c954030097a21b` |
| `feature/curriculum-ux-school-next-actions` | `fcdca79b7899f69e5bd5aab8c77583b6aff311bc` |
| `feature/curriculum-ux-supplement-management` | `0869ef3319db7f661bca2473479d577e1b8f50b3` |
| `feature/full-year-publisher-lesson-saves` | `8ed1a07424d9289118e603f18e1f3c35ff48bd9a` |
| `feature/fullflow-completion-integrated-20261030` | `0d1692f60f93849f3b8cc3841b2bf4518b2d439d` |
| `feature/fullflow-product-completion-20261030` | `aa3d00f49e35f93ebf6d8ad7f7c1482745ae9c59` |
| `feature/journey-toolkit-safe-school-day` | `0147ae0429a306b2c5ff19e0c9bee89702682ce5` |
| `feature/launch-adopted-publisher-courses` | `029b023e744319ad6445f64b11aab5442bb09e0e` |
| `feature/oneroster-csv-validation-20261021` | `a05892e43d9187b5ad12598fae9f04bd4a133970` |
| `feature/oneroster-roster-exchange-20261021` | `7b1372ab13c90368859f320c634da48f9e685f98` |
| `feature/parallel-a-graduation-policy` | `2d7f58475bfbfcade8ba1c0683cbb5ae45655a33` |
| `feature/parallel-b-credential-release` | `03749ffc3c7a8fd8975a8af4a0948db907bd768f` |
| `feature/parallel-c-connected-acceptance` | `fab515237730913bdce722b4d0e41eff8ab7ffff` |
| `feature/parallel-d-algebra1-curriculum` | `c9bfcae61424cac018269d17074a0d175284e04e` |
| `feature/parallel-e-first-day` | `418905fe42bf7401a75735350c95aade855b13da` |
| `feature/parallel-f-one-hour-launch` | `684a7387782ff44cc1264c6470bd1da56aafa25a` |
| `feature/parallel-g-curriculum-adoption-year` | `8ce3f56bd4d60a68404be05538d44a482a968622` |
| `feature/parallel-h-finance` | `cfb5561d425d8affd2bb365eabbab0eb07c23970` |
| `feature/parallel-i-public-site-hosting` | `5c81101b0858438c7d42a2555fbd9033ab21d360` |
| `feature/parallel-j-oneroster` | `4fb4816be558aabde606f33d894f165a1ef0eb1c` |
| `feature/parallel-k-cartridge` | `ee85f093f6f662201c20f820d9f3d5dc3f780942` |
| `feature/parallel-l-church-evidence` | `5828871415d9eb66a84237b41a149c0d9ff08ef4` |
| `feature/pub-09-inquiry-follow-up` | `68eea2e8fa2b3733c8fc5c568b07f6f55f73bbb7` |
| `feature/pub-10-contact-history` | `4356ca96efe3b41b2fedb620830f05c5df4270c0` |
| `feature/publisher-pack-composer` | `491a070ff8cac02606d7f8e2a4d24d28cca6adb9` |
| `feature/publisher-structured-lesson-editor` | `b569a6e70eb582b4ecd98e6251895fde3dc136e0` |
| `feature/publisher-teacher-guide-authoring` | `5eae6e64a8b1c43454c87e43493752ab82291e1e` |
| `feature/teacher-assessment-rubric-authoring` | `06802614991ac80491aec0cbb77fa50c52de9976` |
| `feature/teacher-assessment-scored-rubrics` | `9c4aa3ac44f3e47ce2cc87dfd86a96e1af9cecfd` |
| `fix/fullflow-0046-migration-provenance` | `e66dae2517a491e284b687cddc965f26b7b26c9e` |
| `fix/fullflow-integration-baseline-20261031` | `117b289e62bdb416ea80d64c2ffe320d67ed453d` |
| `fix/gf3-org-wide-site-grant-bite1` | `2c205bef7d852f6194c521d3bcb2af1204cc09ae` |
| `fix/journey-c-on-site-attestation-denial` | `d5640cedf62f732686aaa1f2969adaeabf1c6c9d` |
| `fix/journey-c-use-fullflow-neon` | `9ab766c395840d4d1b1a8fff17396c91f7234d0e` |
| `fix/teaching-eligibility-consistency` | `403c98c14df1bf0018a6d2d560f655407ab82135` |
| `integration/a-graduation-connected-20261031` | `70f0487dedbe8015486710b2337c398e8191336c` |
| `integration/a-graduation-policy-core-20261031` | `5518b5e63523fabe18e332dfa8b4a5ca09300ced` |
| `integration/a-transcript-evidence-guards-20261031` | `d12efb3f11716fbf5bfff826fc902fac3aa25080` |
| `integration/ab-secure-credential-delivery-20261031` | `e64daa6ce4351a4ed12b032eb1fe4b3cf2161ffb` |
| `integration/agent-f-refactor` | `93746930d98198d2b020a130bbfa565018f3a3e8` |
| `integration/b-credential-release-policy-20261031` | `685aa39b6867daa8d83901d7084e68e003232a57` |
| `integration/efi-website-contract-20261031` | `b931081cdcdcb2a8323b02e0c25cdee1fcc327b1` |
| `integration/firstday-bounded-projection-20261031` | `c5d9b94c9aefb9a63915451ea7cc18e479d922d4` |
| `integration/fullflow-0057-0059-schema-20261101` | `5f126054b1107cb4f966f177109406e318889443` |
| `integration/fullflow-agent-retirement-pass1-20261101` | `87eeaeb288cc067aab512ab00187fac67cf23b36` |
| `integration/fullflow-algebra1-content-20261101` | `daa5338cdc31c35cd9db372c6ef96989e59d7a05` |
| `integration/fullflow-refactor-code-complete-20261031` | `b4cb186fc32f14b84a6d9238245e488115ffee44` |
| `integration/g-curriculum-policy-20261031` | `c319c23f58c092170ff67f8f1330986e559abe62` |
| `integration/h-finance-domain-20261031` | `402c6f9c5d87547577abe250d210b4dbcb982569` |
| `integration/j-oneroster-reconciliation-20261031` | `784c104c7079f03f3aecf9ce534d6347b19adb65` |
| `integration/k-cartridge-parser-hardening-20261031` | `c87a3d7bbabcc64107063f6ed8f960dbe52de6d7` |
| `integration/l-church-evidence-policy-20261031` | `0542a98baa5067d8113dfb99d82efb23c4912863` |
| `integration/oneroster-placement-provenance-20261031` | `344991eb87d074700851496b509bbdc188f184b0` |
| `main` | `e8ca4e51de231f563a23aa3bde260481b8866588` |
| `refactor/academics-learning` | `420a11fe58b3b9d207b4b13fad9a0da029c1d5d7` |
| `refactor/admissions-family` | `bb4dc438c975c59ff60f101f5a8e29b67962e5d3` |
| `refactor/admissions-family-pagination` | `0ac97c85b027aea764ea38b86dd5ae06691cfe79` |
| `refactor/launch-operations` | `5b771af5756f934c8918b63334c8f42bc85f8efc` |
| `refactor/platform-foundations` | `2f3648b09aac0c28eb1d3b031bf68203bc2a9a05` |
| `refactor/shared-components` | `c5d888f235875795e6e96da7e798da6206e212a0` |
| `refactor/shared-teaching-eligibility` | `250746e2b4f996e66b25ce5d39b535a03216ea01` |
| `test/algebra1-authenticated-browser-bite5` | `3690a67e267aec480e12f85499993cb8429eeb0e` |
| `test/valor-algebra1-bite4-acceptance` | `68d3b3bac9f13ccf217e5f54c10295c14cf46c13` |
| `work/c-school-day` | `221406b0b5442884101cef0dfe7b5e0f46f551fa` |
| `work/d-launch` | `8609183c1108649a7d3f105666dd95643e1ad81f` |
| `work/e-learning` | `1e64f81087c7f3f5b2f6933ca1aaabecbf7a6ddb` |

## Open PRs at inventory

| PR | Head | Base | Status |
|---|---|---|---|
| #214 | `feature/parallel-a-graduation-policy` | `FullFlow` | draft |
| #213 | `feature/parallel-b-credential-release` | `FullFlow` | draft |
| #211 | `feature/parallel-e-first-day` | `FullFlow` | draft |
| #210 | `feature/parallel-g-curriculum-adoption-year` | `FullFlow` | draft |
| #209 | `feature/parallel-j-oneroster` | `FullFlow` | draft |
| #208 | `feature/parallel-k-cartridge` | `FullFlow` | draft |
| #206 | `feature/parallel-i-public-site-hosting` | `FullFlow` | draft |
| #205 | `feature/parallel-h-finance` | `FullFlow` | draft |
| #204 | `feature/parallel-f-one-hour-launch` | `FullFlow` | draft |
| #203 | `feature/parallel-c-connected-acceptance` | `FullFlow` | draft |
| #175 | `refactor/shared-teaching-eligibility` | `FullFlow` | ready |
| #174 | `feature/pub-10-contact-history` | `feature/pub-09-inquiry-follow-up` | draft |
| #173 | `feature/pub-09-inquiry-follow-up` | `FullFlow` | draft |
| #172 | `FullFlow` | `main` | draft |

## Cleanup policy

Original agent PRs #203–214 represent prior agent-specific integration work. Their 125 changed-file entries were audited against FullFlow: 103 identical, 22 divergent, no missing paths. Semantic review determined FullFlow supersedes many divergent paths, but this does **not** prove byte-for-byte branch ancestry or complete product acceptance. Close original draft PRs as superseded, preserve their branch refs pending final review/deletion tooling. Keep PR #172 (FullFlow → main), #173 and #174 (stacked public inquiry work), and #175 (teaching eligibility) open until independently reconciled. No branch deletion without verified disposition. Do not delete Neon production, FullFlow E2E, or `test01` (ancestor of E2E) during initial cleanup. Other Neon branches are candidates only, subject to explicit destructive-action confirmation and restore/retention review.

## Neon branch inventory and proposed retention

Project `sweet-hall-62441909` (inventory only; **no Neon branches deleted**):

| Branch | Branch ID | State | Disposition |
|---|---|---|---|
| `fullflow-e2e-20261022` | `br-proud-pine-arfju8h2` | ready | KEEP: canonical nonproduction migration/acceptance |
| `production` | `br-restless-sea-ar9ooo55` | ready | KEEP: production |
| `test01` | `br-bitter-feather-ar0u63x7` | ready | KEEP pending ancestry and environment dependency review |
| `gf26-integrity-20261016` | `br-royal-mouse-arc11hc2` | archived | CANDIDATE: archived test checkpoint |
| `gf2-end-to-end-verify-20261016` | `br-spring-waterfall-ardxs4wa` | archived | CANDIDATE: archived test checkpoint |
| `fullflow-pre-0043-0045-20261024` | `br-patient-surf-ar8kreuo` | ready | CANDIDATE: historic FullFlow checkpoint |
| `fullflow-pre-0039-0040-20261023` | `br-long-tooth-arg8xm19` | ready | CANDIDATE: historic FullFlow checkpoint |
| `fullflow-pre-0032-0038-20261023` | `br-spring-heart-arjhajgf` | ready | CANDIDATE: historic FullFlow checkpoint |
| `production-pre-0026-2026-10-20T16-46-37-985Z` | `br-delicate-mode-art59p1b` | ready | CANDIDATE: historic production checkpoint; confirm restore requirements |
| `production-pre-reconcile-20261019` | `br-noisy-wind-ar1wkf98` | ready | CANDIDATE: historic production checkpoint; confirm restore requirements |

Deletion of Neon branches is destructive and requires separate explicit confirmation. Check whether CI, deployment env, backup policy or any restoration procedure refers to each candidate before deleting. The FullFlow E2E branch has migrations 0057–0059 and must remain available.

## First administrative retirement result

Closed superseded agent draft PRs #203, #204, #205, #206, #208, #209, #210, #211, #213 and #214; #207 and #212 had already been closed. Preserved all head branches and commit SHAs. Remaining open PRs #172, #173, #174 and #175 retained pending separate disposition. GitHub connector currently offers PR closure but no remote branch-delete action, so branch deletion has not been executed.
