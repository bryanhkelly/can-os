-- Canonical classification only. Do not alter account credentials or grants.
-- Teacher factory provenance and legacy placeholder address identify these
-- records independently of membership in a demonstration organization.
UPDATE public.people SET domain='teaching.can.demo'
WHERE metadata->>'sourceSystem'='can-demo-teacher-marketplace-factory'
 AND metadata->>'synthetic'='true'
 AND metadata->>'demoFixtureKey' ~ '^CAN-DEMO-TEACHER-[0-9]{2}$'
 AND (domain IS NULL OR domain='example.invalid')
 AND email ~ '^can[.]demo[.]teacher[0-9]{2}@example[.]invalid$';
--> statement-breakpoint
-- Exact fixture Person IDs corroborated against the GF25 test generator and
-- the six known fixture school slugs. Do not infer domains for ordinary People.
UPDATE public.people p SET domain=v.domain
FROM (VALUES
 ('0b244eb5-f9b2-4bb5-954a-2514815e0f31'::uuid,'school.f098f921.gf25.demo'),
 ('0ccbe7c5-dd82-4534-a62f-400227eed373'::uuid,'school.2fdea6ca.gf25.demo'),
 ('0f35c12a-7709-4195-90ef-60df210d8819'::uuid,'school.9409c4f2.gf25.demo'),
 ('338b9b28-059c-47ca-9145-da61d9ee60c0'::uuid,'school.66975f5e.gf25.demo'),
 ('431361c6-1637-4a9a-ae37-fd462713309c'::uuid,'school.9409c4f2.gf25.demo'),
 ('4cf14f58-ab67-436f-9eaa-c33d04ea89f7'::uuid,'school.f098f921.gf25.demo'),
 ('562d8d95-f876-4a4c-b595-04af49b7df9e'::uuid,'school.ff759d54.gf25.demo'),
 ('586c834e-84c6-410c-8861-0499567e4e41'::uuid,'school.2fdea6ca.gf25.demo'),
 ('66787f11-7177-4a5a-94c4-a473bcaf2bd6'::uuid,'school.f098f921.gf25.demo'),
 ('6ba7f3db-940f-4a9d-ab1d-8679cfb9f833'::uuid,'school.66975f5e.gf25.demo'),
 ('6c450d36-049d-4ec9-90f4-0634d8b08ddc'::uuid,'school.e9b7b5db.gf25.demo'),
 ('6e865609-06b6-4a6f-b58c-cf7aa7a3ab3c'::uuid,'school.2fdea6ca.gf25.demo'),
 ('70904972-7cef-4db0-8c64-2cd3eb414758'::uuid,'school.66975f5e.gf25.demo'),
 ('73e3a9f9-ba70-4a0c-bfd7-464e251be81d'::uuid,'school.f098f921.gf25.demo'),
 ('7976a968-54f2-4817-98f9-ca646fc54d4c'::uuid,'school.66975f5e.gf25.demo'),
 ('8a595b66-e383-4dd9-b17d-668ca9185723'::uuid,'school.e9b7b5db.gf25.demo'),
 ('92574871-081a-4ee4-b319-155da38baca1'::uuid,'school.ff759d54.gf25.demo'),
 ('97f629c9-d238-4268-b2ee-f3be7ba23b73'::uuid,'school.e9b7b5db.gf25.demo'),
 ('a534f513-8752-4fa4-8f03-02b16fb9a0f7'::uuid,'school.e9b7b5db.gf25.demo'),
 ('a539a5c9-0668-4a83-ae95-e2f3c3b1fada'::uuid,'school.66975f5e.gf25.demo'),
 ('aa98c992-b237-487a-994a-486c65b1cdc5'::uuid,'school.ff759d54.gf25.demo'),
 ('ab5c67e3-356e-41a0-9ba1-eeacfe9f3abd'::uuid,'school.9409c4f2.gf25.demo'),
 ('b0875446-e577-4605-8833-d8b7834a5b48'::uuid,'school.e9b7b5db.gf25.demo'),
 ('b46a0c02-6b49-40f8-833a-928e00e35846'::uuid,'school.ff759d54.gf25.demo'),
 ('be53b9c7-3c56-460b-9a14-bda0d415cbc8'::uuid,'school.f098f921.gf25.demo'),
 ('c1ead690-9d92-4e0e-828c-157ffd043e16'::uuid,'school.2fdea6ca.gf25.demo'),
 ('c2c538c0-3857-470b-985d-a41bfef15740'::uuid,'school.ff759d54.gf25.demo'),
 ('c3921683-108b-4223-8cca-18808caa9a64'::uuid,'school.f098f921.gf25.demo'),
 ('c972d2c0-417a-47d4-9ace-4c476d32bee9'::uuid,'school.2fdea6ca.gf25.demo'),
 ('cabdee89-22d7-4810-9e09-af5aef3ec85a'::uuid,'school.66975f5e.gf25.demo'),
 ('d2c8bada-24d5-470f-9c63-43548103409d'::uuid,'school.e9b7b5db.gf25.demo'),
 ('db64fc7a-2147-40e8-ba00-22568521282a'::uuid,'school.2fdea6ca.gf25.demo'),
 ('dbcd9bdd-10bb-4f85-b8ab-99a31e290b8c'::uuid,'school.9409c4f2.gf25.demo'),
 ('dd505f93-6357-4ffa-a1f7-13ff8cf8ad91'::uuid,'school.ff759d54.gf25.demo'),
 ('e7ad7452-05a2-4c39-86a7-12eb74916e90'::uuid,'school.9409c4f2.gf25.demo'),
 ('f0be3785-d606-48dd-bc05-9fa968aae0b8'::uuid,'school.9409c4f2.gf25.demo')
) AS v(id,domain) WHERE p.id=v.id AND p.email IS NULL
 AND (p.domain IS NULL OR p.domain='example.test');
