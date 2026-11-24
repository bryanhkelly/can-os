import { randomBytes, randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { expect, test } from "@playwright/test";
import { DATABASE_URL, baseURL } from "./env";
import { createAccessSession, withAuthenticatedPages } from "./helpers/authenticated-persona";
import { createOrganization, createSite, insertFixtureId } from "./helpers/canonical-fixture";

// The shared Playwright config attests a disposable Neon branch before these
// fixtures can write. Never run against the production database.
test("public Go lifecycle and anonymous rendering", async ({ page, request }) => {
  if (!DATABASE_URL) throw new Error("Guarded test database required");
  const sql=neon(DATABASE_URL);
  const suffix=randomUUID().slice(0,8);
  const org=await createOrganization(sql,{type:"christian_school",name:"Go QA "+suffix,slug:"go-qa-"+suffix});
  const site=await createSite(sql,{organizationId:org,name:"Go QA "+suffix,slug:"go-qa-"+suffix});
  const person=await insertFixtureId(sql,"INSERT INTO people(legal_first_name,legal_last_name,metadata) VALUES('Go','QA','{}') RETURNING id",[]);
  const code=randomBytes(9).toString("base64url");
  const definition=await insertFixtureId(sql,"INSERT INTO engagement_definitions(owner_kind,organization_id,site_id,created_by_person_id) VALUES('site',$1,$2,$3) RETURNING id",[org,site,person]);
  const headline="Public QA invitation "+suffix;
  const content={domain:"outreach",subject:{kind:"initiative",id:null,label:"QA invitation"},audience:["public"],interaction:"discover",expectedOutcome:"viewed",presentation:{headline,summary:"A synthetic invitation for browser acceptance only."},execution:{mode:"page",template:"invitation",action:{kind:"information",journeyId:"start-a-school"},actionLabel:"Explore"}};
  const version=await insertFixtureId(sql,"INSERT INTO engagement_definition_versions(engagement_id,version,content,created_by_person_id) VALUES($1,1,$2::jsonb,$3) RETURNING id",[definition,JSON.stringify(content),person]);
  const link=await insertFixtureId(sql,"INSERT INTO site_go_links(code,organization_id,site_id,created_by_person_id,engagement_version_id) VALUES($1,$2,$3,$4,$5) RETURNING id",[code,org,site,person,version]);
  const url="/go/"+code;
  const response=await page.goto(url);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading",{name:headline})).toBeVisible();
  expect(response?.headers()["cache-control"]).toContain("no-store");
  expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
  expect(response?.headers()["x-frame-options"]).toBe("DENY");
  expect(response?.headers()["x-robots-tag"]).toContain("noindex");
  expect((await request.get(url+"?page=%2F&page=%2F")).status()).toBe(404);
  const unknown=await request.get("/go/"+randomBytes(9).toString("base64url"),{maxRedirects:0});
  expect(unknown.status()).toBe(404);
  expect(await unknown.text()).not.toContain(headline);
  await sql.query("UPDATE site_go_links SET status='paused' WHERE id=$1",[link]);
  expect((await request.get(url)).status()).toBe(404);
  await sql.query("UPDATE site_go_links SET status='active',expires_at=now()-interval '1 minute' WHERE id=$1",[link]);
  expect((await request.get(url)).status()).toBe(404);
  await sql.query("UPDATE site_go_links SET expires_at=NULL,status='active' WHERE id=$1",[link]);
  await sql.query("UPDATE engagement_definitions SET status='retired' WHERE id=$1",[definition]);
  expect((await request.get(url)).status()).toBe(404);
  await sql.query("UPDATE site_go_links SET status='revoked' WHERE id=$1",[link]);
  expect((await request.get(url)).status()).toBe(404);
});

test("owner delegation, stale writes, and two-tenant isolation", async ({browser})=>{
  if(!DATABASE_URL)throw new Error("Guarded test database required");
  const sql=neon(DATABASE_URL);
  const suffix=randomUUID().slice(0,8);
  async function tenant(label:string){
    const org=await createOrganization(sql,{type:"christian_school",name:label+" "+suffix,slug:label.toLowerCase()+"-"+suffix});
    const site=await createSite(sql,{organizationId:org,name:label+" "+suffix,slug:label.toLowerCase()+"-"+suffix});
    return {org,site};
  }
  const a=await tenant("TenantA"),b=await tenant("TenantB");
  async function persona(role:string,label:string,scope:{org:string;site:string}|null){
    const email=label.toLowerCase()+"-"+suffix+"@example.test";
    const person=await insertFixtureId(sql,"INSERT INTO people(legal_first_name,legal_last_name,metadata) VALUES($1,'Acceptance','{}') RETURNING id",[label]);
    const account=await insertFixtureId(sql,"INSERT INTO access_accounts(email_normalized,email_verified_at,person_id) VALUES($1,now(),$2) RETURNING id",[email,person]);
    const grant=await insertFixtureId(sql,"INSERT INTO account_person_grants(account_id,person_id,role,organization_id,site_id,active) VALUES($1,$2,$3,$4,$5,true) RETURNING id",[account,person,role,scope?.org??null,scope?.site??null]);
    const secret=await createAccessSession(sql,{accountId:account,activeGrantId:grant,expiresAt:new Date(Date.now()+3600000)});
    return {account,person,grant,email,secret};
  }
  const owner=await persona("platform_owner","Owner",null);
  const target=await persona("site_admin","Target",a);
  const other=await persona("site_admin","Other",b);
  const malformed=await persona("site_admin","Malformed",{org:a.org,site:b.site});
  await withAuthenticatedPages(browser,{owner:owner.secret,target:target.secret,other:other.secret,malformed:malformed.secret},async pages=>{
    const current=async(p:typeof pages.owner.page)=>{const r=await p.request.get("/access/session");expect(r.status()).toBe(200);return r.json();};
    expect((await current(pages.target.page)).activeContext.siteIds).toEqual([a.site]);
    expect((await current(pages.other.page)).activeContext.siteIds).toEqual([b.site]);
    expect((await pages.malformed.page.request.get("/access/session")).status()).toBe(401);
    const op=pages.owner.page;
    await op.goto("/platform");
    await expect(op.getByRole("heading",{name:"Platform administration",exact:true})).toBeVisible();
    await op.getByLabel("Find an existing account",{exact:true}).fill(target.email);
    await op.getByRole("button",{name:"Find users"}).click();
    await op.getByRole("radio",{name:new RegExp(target.email.replace(".","\\."))}).check();
    await op.getByLabel("Business reason or pilot ticket").fill("Isolated browser acceptance for tenant scope");
    await op.getByRole("button",{name:"Start View as"}).click();
    await expect(op.getByText("Platform Owner delegation · VIEW ONLY",{exact:true})).toBeVisible();
    const view=await current(op);
    expect(view.role).toBe("site_admin");
    expect(view.activeContext.siteIds).toEqual([a.site]);
    expect(view.grants.map((g:{id:string})=>g.id)).toEqual([target.grant]);
    const switchGrant=()=>op.request.post("/access/session",{headers:{origin:new URL(baseURL).origin},data:{grantId:other.grant}});
    expect([401,403]).toContain((await switchGrant()).status());
    await op.getByRole("button",{name:"Return to Platform Owner"}).click();
    await expect(op.getByRole("heading",{name:"Platform administration",exact:true})).toBeVisible();
    expect((await current(op)).role).toBe("platform_owner");
    // Expired delegation is read-only until explicit return; it must never
    // reinterpret a stale tenant mutation as an owner mutation.
    await sql.query("UPDATE access_sessions SET delegated_grant_id=$1,delegated_mode='act',delegated_until=now()-interval '1 minute',delegated_reason='Expired acceptance fixture' WHERE account_id=$2",[target.grant,owner.account]);
    expect([401,403]).toContain((await switchGrant()).status());
    await op.reload();
    await expect(op.getByText("Platform Owner delegation · EXPIRED · RETURN REQUIRED",{exact:true})).toBeVisible();
    await op.getByRole("button",{name:"Return to Platform Owner"}).click();
    await expect(op.getByRole("heading",{name:"Platform administration",exact:true})).toBeVisible();
    expect((await current(op)).ownerDelegation).toBeUndefined();
    // A normal Site Admin cannot open another Site's authenticated preview.
    const denied=await pages.target.page.request.get("/launch/site-preview?siteId="+b.site,{maxRedirects:0});
    expect(denied.status()).not.toBe(200);
  });
});
