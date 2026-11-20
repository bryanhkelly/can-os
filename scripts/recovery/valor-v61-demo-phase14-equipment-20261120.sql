-- Valor V6.1: fictional inventory, student reservation and a prior
-- fictional check-out/return. The asset codes are not genuine serial numbers.
-- Distinguish physical custody from merely reserving an item.
DO $fixture$
DECLARE
 vsite constant uuid:='f1000000-0000-4000-8000-000000000003';
 vorg constant uuid:='f1000000-0000-4000-8000-000000000002';
 j constant uuid:='f1000000-0000-4000-8000-000000000005';
 alex constant uuid:='f7000000-0000-4000-8000-000000000001';
 cat constant uuid:=md5('valor-v61:catalog:fake-chromebook')::uuid;
 a1 constant uuid:=md5('valor-v61:asset:chromebook-a')::uuid;
 a2 constant uuid:=md5('valor-v61:asset:loaner-b')::uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.sites WHERE id=vsite AND organization_id=vorg
   AND metadata @> '{"synthetic":true}'::jsonb)
 OR (SELECT count(*) FROM public.people WHERE id IN(j,alex)
   AND metadata @> '{"synthetic":true}'::jsonb)<>2
 THEN RAISE EXCEPTION 'Valor synthetic equipment guard failed'; END IF;
 INSERT INTO public.equipment_catalog (id,manufacturer,model,category,specifications)
 VALUES(cat,'SIMULATED CAN OS','DEMO Chromebook','laptop',
  '{"synthetic":true,"fixture":"valor-v61-extended-scenarios","notRealEquipment":true,"serialNumber":null}'::jsonb)
 ON CONFLICT(id) DO NOTHING;
 INSERT INTO public.equipment_assets(id,asset_code,catalog_id,inventory_organization_id,state)
 VALUES(a1,'VALOR-DEMO-NOT-REAL-CHROME-A',cat,vorg,'in_stock'),
       (a2,'VALOR-DEMO-NOT-REAL-LOANER-B',cat,vorg,'in_stock')
 ON CONFLICT(id) DO NOTHING;
 UPDATE public.site_device_registrations s SET asset_id=a1
 WHERE s.site_id=vsite AND s.label='SIMULATED Valor Chromebook A'
 AND s.asset_id IS NULL;
 UPDATE public.site_device_registrations s SET asset_id=a2
 WHERE s.site_id=vsite AND s.label='SIMULATED Loaner Laptop'
 AND s.asset_id IS NULL;
 INSERT INTO public.equipment_assignments
 (id,asset_id,participant_person_id,assigned_from,assigned_through,status,authorized_by_person_id)
 VALUES
 (md5('valor-v61:equipment:jordan-reservation')::uuid,a1,j,
  '2026-12-02T16:00:00Z','2026-12-12T16:00:00Z','reserved',alex),
 (md5('valor-v61:equipment:completed-historical')::uuid,a2,j,
  '2026-11-05T16:00:00Z','2026-11-06T20:00:00Z','completed',alex)
 ON CONFLICT(id) DO NOTHING;
 -- Append-only provenance: fictional check-out and return, NOT a real
 -- custody transaction. Stable events and monotonic order ensure replay.
 PERFORM pg_advisory_xact_lock(hashtext('valor-v61-demo-equipment-events'));
 IF NOT EXISTS(SELECT 1 FROM public.equipment_custody_events
    WHERE id=md5('valor-v61:equipment:checkout-demo')::uuid)
 THEN
   INSERT INTO public.equipment_custody_events
     (id,asset_id,from_site_id,to_organization_id,occurred_at,actor_person_id,event_kind)
   VALUES(md5('valor-v61:equipment:checkout-demo')::uuid,a2,vsite,vorg,
     '2026-11-05T16:00:00Z',alex,'checked_out');
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.equipment_custody_events
    WHERE id=md5('valor-v61:equipment:return-demo')::uuid)
 THEN
   INSERT INTO public.equipment_custody_events
     (id,asset_id,from_organization_id,to_site_id,occurred_at,actor_person_id,event_kind)
   VALUES(md5('valor-v61:equipment:return-demo')::uuid,a2,vorg,vsite,
     '2026-11-06T20:00:00Z',alex,'returned');
 END IF;
 IF (SELECT count(*) FROM public.equipment_assignments WHERE id IN (
     md5('valor-v61:equipment:jordan-reservation')::uuid,
     md5('valor-v61:equipment:completed-historical')::uuid))<>2
 THEN RAISE EXCEPTION 'Synthetic equipment scenario incomplete'; END IF;
END $fixture$;
