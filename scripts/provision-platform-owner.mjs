#!/usr/bin/env node
/**
 * Deliberate one-time bootstrap for the FIRST Platform Owner.
 * Never part of login, deployment, migration, fixture or a web endpoint.
 *
 * PLATFORM_OWNER_EMAIL=... PLATFORM_OWNER_APPROVER_EMAIL=... \
 * PLATFORM_OWNER_TICKET=... DATABASE_URL=... \
 * node scripts/provision-platform-owner.mjs              # read-only preflight
 * node scripts/provision-platform-owner.mjs --execute    # audited production write
 *
 * The named approver's verified account is required, but the external ticket
 * is the authority for the attestation. This script CANNOT prove the external
 * approver consented. Human operator must check it before invoking --execute.
 */
import { Pool } from "@neondatabase/serverless";

const email=(process.env.PLATFORM_OWNER_EMAIL??"").trim().toLowerCase();
const approverEmail=(process.env.PLATFORM_OWNER_APPROVER_EMAIL??"").trim().toLowerCase();
const ticket=(process.env.PLATFORM_OWNER_TICKET??"").trim();
const execute=process.argv.includes("--execute");
const productionProject="sweet-hall-62441909";
const productionBranch="br-restless-sea-ar9ooo55";
// Fixture verification timestamps are not evidence of mailbox ownership.
const valid=email=>{
  const parts=email.split("@");
  if(parts.length!==2||!parts[0]||/\s/.test(email))return false;
  const domain=parts[1];
  if(domain.length>253||!domain.includes(".")||!domain.split(".").every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)))return false;
  return !["demo","test","invalid","localhost","example"].includes(domain.split(".").at(-1))
    && !["example.com","example.net","example.org"].some(base=>domain===base||domain.endsWith("."+base));
};
if(!process.env.DATABASE_URL)throw Error("DATABASE_URL is required");
if(!valid(email)||!valid(approverEmail)||email===approverEmail)
  throw Error("Two distinct, verified CAN accounts with deliverable non-fixture addresses are required.");
if(ticket.length<16||ticket.length>240)
  throw Error("External authorization ticket (16-240 characters) is required.");
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1});
let client;
try{
  client=await pool.connect();
  await client.query(execute?"BEGIN":"BEGIN READ ONLY");
  const [env]= (await client.query(`
    SELECT current_setting('neon.project_id',true) AS project_id,
      current_setting('neon.branch_id',true) AS branch_id,
      current_database() AS database_name
  `)).rows;
  if(env?.project_id!==productionProject||env?.branch_id!==productionBranch||
      env?.database_name!=="neondb")
    throw Error("BLOCKED: Platform Owner bootstrap targets CAN OS production Neon main only.");
  if(execute)
    await client.query("SELECT pg_advisory_xact_lock(hashtext('platform-owner-bootstrap:global'))");
  const accounts=(await client.query(`
    SELECT a.id,a.person_id,a.email_normalized,a.disabled,a.email_verified_at,a.private_access_code_hash IS NOT NULL AS private_credential,
           p.active AS person_active
    FROM public.access_accounts a
    JOIN public.people p ON p.id=a.person_id
    WHERE a.email_normalized=ANY($1::text[])
    ORDER BY a.email_normalized ${execute?"FOR UPDATE OF a":""}
  `,[[email,approverEmail]])).rows;
  const owner=accounts.find(row=>row.email_normalized===email);
  const approver=accounts.find(row=>row.email_normalized===approverEmail);
  if(!owner||!approver||!owner.person_active||!approver.person_active||
     owner.disabled||approver.disabled||owner.private_credential||approver.private_credential||!owner.email_verified_at||
     !approver.email_verified_at||owner.person_id===approver.person_id)
    throw Error("Both distinct Persons must already have current verified, active CAN accounts.");
  for(const account of [owner,approver]){
    const bad=(await client.query(`
      SELECT count(*)::int AS count FROM public.account_person_grants
      WHERE account_id=$1 AND active AND person_id<>$2
    `,[account.id,account.person_id])).rows[0];
    if(Number(bad.count)>0)throw Error("Account has cross-Person grants. Reconcile before bootstrap.");
  }
  const existing=(await client.query(`
    SELECT id,account_id,person_id,organization_id,site_id
    FROM public.account_person_grants WHERE role='platform_owner' AND active
  `)).rows;
  if(existing.length>1||existing.some(g=>
       g.account_id!==owner.id||g.person_id!==owner.person_id||
       g.organization_id!==null||g.site_id!==null))
    throw Error("An existing Platform Owner needs separate governed secondary-owner provisioning.");
  if(!execute){
    await client.query("ROLLBACK");
    console.log("PREFLIGHT PASS: owner, independent approver, and production branch verified; no writes.");
    console.log(existing.length?"Owner already provisioned.":"Run --execute only after independent ticket confirmation.");
  }else if(existing.length){
    await client.query("ROLLBACK");
    console.log("NO CHANGE: matching verified Platform Owner already exists.");
  }else{
    const row=(await client.query(`
      INSERT INTO public.account_person_grants
       (account_id,person_id,role,organization_id,site_id,active)
      VALUES ($1,$2,'platform_owner',NULL,NULL,true) RETURNING id
    `,[owner.id,owner.person_id])).rows[0];
    await client.query(`
      INSERT INTO public.audit_events
       (actor_person_id,action,resource_type,resource_id,scope,context)
      VALUES ($1,'platform.owner.bootstrap','account_person_grant',$2,'{}'::jsonb,
        jsonb_build_object('ownerAccountId',$3::uuid,'approverAccountId',$4::uuid,
          'ticket',$5::text,'method','operator-run','authority','external-attestation'))
    `,[approver.person_id,row.id,owner.id,approver.id,ticket]);
    await client.query("COMMIT");
    console.log("COMMITTED: one audited account-wide Platform Owner grant. No site/reviewer privileges forged.");
  }
}catch(error){
  if(client)await client.query("ROLLBACK").catch(()=>{});
  throw error;
}finally{client?.release();await pool.end();}
