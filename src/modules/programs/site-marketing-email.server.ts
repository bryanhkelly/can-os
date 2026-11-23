import { createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  accessAccounts, communicationThreads, domainEvents, siteArtifactReleaseAccess,
  siteArtifactReleases, siteMarketingPackageReleases, siteMarketingPackages, siteBrandAssets, sites,
} from "@/db/schema";
import { assertCapability } from "@/domain/command-context";
import type { AccessContext } from "@/domain/access-context";
import { DomainError } from "@/domain/errors";
import { EventTypes } from "@/domain/event-types";
import { marketingPackageClaimsRequireReview, marketingPackageContentSchema } from "@/domain/marketing-package-v61";
import {
  appendMarketingFooter, formatMarketingFooter, marketingEmailDeliverySummary,
  marketingEmailMetadataSchema, parseMarketingEmailRecipients,
  type MarketingEmailMetadata, type MarketingEmailRecipient,
  type queueMarketingEmailSchema,
} from "@/domain/site-marketing-email";
import { assertSiteSetupScope } from "@/domain/site-setup-scope";
import { isDemoTenantOrganization } from "@/modules/identity/demo-school-tenants.server";
import { isDemoAccountEmail } from "@/domain/local-demo-access";
import { sendNotificationEmailWithReceipt } from "@/modules/communication/notification-email.server";
import { emitEvent, writeAudit } from "@/platform/mutation";
import type { z } from "zod";

const KIND = "site_marketing_email_campaign";
type QueueInput = z.infer<typeof queueMarketingEmailSchema>;
type CampaignRow = typeof communicationThreads.$inferSelect;
const kindPredicate = sql.raw("communication_threads.metadata->>'kind' = 'site_marketing_email_campaign'");
function scopeFilter(siteId: string) {
  return and(eq(communicationThreads.contextType, "site"),
    eq(communicationThreads.contextId, siteId), kindPredicate);
}
function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function publicOrigin(): string {
  const setting = process.env.CAN_ACCESS_PUBLIC_ORIGIN;
  if (!setting) throw new DomainError("UNAVAILABLE", "Configure a public HTTPS unsubscribe origin before sending.");
  let url: URL;
  try { url = new URL(setting); }
  catch { throw new DomainError("UNAVAILABLE", "The public email unsubscribe origin is invalid."); }
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash ||
    url.username || url.password)
    throw new DomainError("UNAVAILABLE", "The unsubscribe origin must be an HTTPS site root.");
  return url.origin;
}
function assertMailConfigured() {
  if (!process.env.RESEND_API_KEY ||
    !(process.env.CAN_NOTIFICATIONS_FROM_EMAIL || process.env.CAN_ACCESS_FROM_EMAIL))
    throw new DomainError("UNAVAILABLE", "Email delivery is not configured in this environment.");
  publicOrigin();
}
function parseBatch(row: CampaignRow): MarketingEmailMetadata {
  const parsed = marketingEmailMetadataSchema.safeParse(row.metadata);
  if (!parsed.success) throw new DomainError("UNAVAILABLE", "Saved email campaign data is invalid.");
  return parsed.data;
}
/** Site-wide suppression persists across every campaign in existing communication records. */
async function optouts(siteId: string, reader: Pick<typeof db,"select"> = db): Promise<Set<string>> {
  const rows = await reader.select({metadata:communicationThreads.metadata})
    .from(communicationThreads).where(scopeFilter(siteId));
  const emails = new Set<string>();
  for (const row of rows) {
    const parsed = marketingEmailMetadataSchema.safeParse(row.metadata);
    if (!parsed.success) continue;
    for (const recipient of parsed.data.recipients) {
      if (recipient.optedOutAt) emails.add(recipient.email);
    }
  }
  return emails;
}

/** Sending is independently authorized, bounded and idempotent.
 * Content always comes from an immutable Package Release, not the editable draft.
 */
export async function queueSiteMarketingEmail(context: AccessContext, data: QueueInput) {
  assertCapability(context, "communication.send");
  assertMailConfigured();
  if (data.mode === "campaign" && !data.consentConfirmed)
    throw new DomainError("VALIDATION_FAILED", "Confirm explicit permission from every adult recipient.");
  return db.transaction(async tx => {
    const [site] = await tx.select({id:sites.id,organizationId:sites.organizationId})
      .from(sites).where(eq(sites.id,data.siteId)).limit(1);
    assertSiteSetupScope(context,site,"program.launch.start");
    if (data.mode === "campaign" && await isDemoTenantOrganization(site.organizationId,tx))
      throw new DomainError("FORBIDDEN","Synthetic demo Sites cannot send real campaigns. Send a test to a verified real account instead.");
    const [pkg] = await tx.select().from(siteMarketingPackages).where(and(
      eq(siteMarketingPackages.siteId,site.id),
      eq(siteMarketingPackages.id,data.packageId),
    )).for("update").limit(1);
    if (!pkg || pkg.status !== "draft")
      throw new DomainError("UNAVAILABLE","Open an active outreach plan before sending email.");
    const [release] = await tx.select().from(siteMarketingPackageReleases).where(and(
      eq(siteMarketingPackageReleases.siteId,site.id),
      eq(siteMarketingPackageReleases.packageId,pkg.id),
      eq(siteMarketingPackageReleases.id,data.releaseId),
    )).limit(1);
    if (!release || !release.formats.includes("email"))
      throw new DomainError("UNAVAILABLE","Create reviewed email materials before sending.");
    const {title: releaseTitle, ...frozenContent} = release.contentSnapshot;
    const snapshot = marketingPackageContentSchema.parse(frozenContent);
    if (marketingPackageClaimsRequireReview(typeof releaseTitle === "string" ? releaseTitle : pkg.title,snapshot))
      throw new DomainError("VALIDATION_FAILED","Review unsupported claims before sending.");
    const [artifact] = await tx.select().from(siteArtifactReleases).where(and(
      eq(siteArtifactReleases.siteId,site.id),
      eq(siteArtifactReleases.packageId,pkg.id),
      eq(siteArtifactReleases.packageReleaseId,release.id),
      eq(siteArtifactReleases.artifactKind,"email"),
    )).limit(1);
    if (!artifact || artifact.brandVersionId !== release.brandVersionId)
      throw new DomainError("UNAVAILABLE","The generated email release is incomplete.");
    const [access] = await tx.select().from(siteArtifactReleaseAccess)
      .where(eq(siteArtifactReleaseAccess.releaseId,artifact.id)).limit(1);
    if (access?.withdrawnAt)
      throw new DomainError("FORBIDDEN","This email version was withdrawn.");
    const subject = (snapshot.materialOverrides?.email?.headline || snapshot.headline).trim();
    if (subject.length < 3 || subject.length > 160 || /[\r\n<>]/.test(subject))
      throw new DomainError("VALIDATION_FAILED","Review the email subject.");

    let emails: string[];
    if (data.mode === "test") {
      const [account] = await tx.select({
        email:accessAccounts.emailNormalized,verifiedAt:accessAccounts.emailVerifiedAt,
        disabled:accessAccounts.disabled,
      }).from(accessAccounts).where(eq(accessAccounts.id,context.accountId)).limit(1);
      if (!account || account.disabled || !account.verifiedAt || isDemoAccountEmail(account.email))
        throw new DomainError("FORBIDDEN","A test requires a verified, non-demo sign-in email.");
      emails = [account.email];
    } else {
      try { emails = parseMarketingEmailRecipients(data.recipients); }
      catch (error) {
        throw new DomainError("VALIDATION_FAILED",
          error instanceof Error ? error.message : "Invalid recipient list.");
      }
    }
    const requestFingerprint = fingerprint({
      mode:data.mode,releaseId:release.id,emails,postalAddress:data.postalAddress,
    });
    // Holding the Package row lock serializes retries for this requestId.
    const existingRows = await tx.select().from(communicationThreads).where(scopeFilter(site.id));
    const prior = existingRows.find(row => {
      const parsed = marketingEmailMetadataSchema.safeParse(row.metadata);
      return parsed.success && parsed.data.requestId === data.requestId;
    });
    if (prior) {
      const old = parseBatch(prior);
      if (old.fingerprint !== requestFingerprint)
        throw new DomainError("CONFLICT","This request ID has already been used for another send.");
      return {id:prior.id,created:false,summary:marketingEmailDeliverySummary(old.recipients)};
    }

    
    const recent = existingRows.filter(row => row.createdAt.getTime() >
      Date.now() - 60*60*1000).flatMap(row => {
        const parsed = marketingEmailMetadataSchema.safeParse(row.metadata);
        return parsed.success ? [parsed.data] : [];
      });
    if (recent.filter(item => item.mode === data.mode).length >=
      (data.mode === "test" ? 10 : 5))
      throw new DomainError("UNAVAILABLE","This Site has reached its hourly email send limit.");
    const suppressed = await optouts(site.id,tx);
    const recipients: MarketingEmailRecipient[] = emails.map(email => ({
      key:crypto.randomUUID(),email,
      status:data.mode === "campaign" && suppressed.has(email) ? "suppressed" : "queued",
      attempts:0,
    }));
    if (!recipients.some(item => item.status === "queued"))
      throw new DomainError("VALIDATION_FAILED","Every recipient has opted out.");
    const metadata: MarketingEmailMetadata = {
      kind:KIND,version:1,requestId:data.requestId,fingerprint:requestFingerprint,
      packageId:pkg.id,releaseId:release.id,sourcePackageRevision:release.sourcePackageRevision,
      mode:data.mode,subject:data.mode === "test" ? ("[TEST] " + subject).slice(0,160) : subject,
      postalAddress:data.postalAddress,
      consentBasis:data.mode === "test" ? "verified_sender_account" :
        "operator_attested_explicit_opt_in",
      recipients,status:"queued",
    };
    const [created] = await tx.insert(communicationThreads).values({
      subject:metadata.subject,contextType:"site",contextId:site.id,
      createdByPersonId:context.actorPersonId!,
      metadata:metadata as unknown as Record<string,unknown>,
    }).returning({id:communicationThreads.id});
    if (!created) throw new DomainError("UNAVAILABLE","Unable to queue the email campaign.");
    await emitEvent(tx,{
      eventType:EventTypes.SiteMarketingEmailCampaignRequested,
      aggregateType:"communication_thread",aggregateId:created.id,
      actorPersonId:context.actorPersonId,organizationId:site.organizationId,siteId:site.id,
      payload:{packageId:pkg.id,releaseId:release.id,mode:data.mode,recipientCount:recipients.length},
    });
    await writeAudit(tx,context,{
      action:"site.marketing_email.queue",entityType:"communication_thread",
      entityId:created.id,scope:{organizationId:site.organizationId,siteId:site.id},
      after:{packageId:pkg.id,releaseId:release.id,mode:data.mode,
        recipientCount:recipients.length},
    });
    return {id:created.id,created:true,summary:marketingEmailDeliverySummary(recipients)};
  });
}

export async function listSiteMarketingEmailBatches(
  context: AccessContext,siteId:string,packageId:string,
) {
  const [site] = await db.select({id:sites.id,organizationId:sites.organizationId})
    .from(sites).where(eq(sites.id,siteId)).limit(1);
  assertSiteSetupScope(context,site,"program.read");
  const [pkg] = await db.select({id:siteMarketingPackages.id}).from(siteMarketingPackages)
    .where(and(eq(siteMarketingPackages.siteId,siteId),
      eq(siteMarketingPackages.id,packageId))).limit(1);
  if (!pkg) throw new DomainError("UNAVAILABLE","Outreach plan not found.");
  const rows = await db.select().from(communicationThreads)
    .where(scopeFilter(siteId)).orderBy(desc(communicationThreads.createdAt));
  return rows.flatMap(row => {
    const parsed = marketingEmailMetadataSchema.safeParse(row.metadata);
    return parsed.success && parsed.data.packageId === packageId ? [{
      id:row.id,mode:parsed.data.mode,subject:parsed.data.subject,status:parsed.data.status,
      createdAt:row.createdAt.toISOString(),
      summary:marketingEmailDeliverySummary(parsed.data.recipients),
    }] : [];
  }).slice(0,20);
}

/** Atomic status update; no accepted recipient can be re-sent on worker retry. */
async function persistRecipient(batchId:string,key:string,patch:Partial<MarketingEmailRecipient>) {
  await db.transaction(async tx => {
    const [row] = await tx.select().from(communicationThreads)
      .where(eq(communicationThreads.id,batchId)).for("update").limit(1);
    if (!row || row.contextType !== "site") throw new Error("Campaign unavailable.");
    const current = parseBatch(row);
    const prior = current.recipients.find(item => item.key === key);
    if (!prior || prior.status === "accepted" || prior.status === "suppressed" ||
      prior.optedOutAt) return;
    const recipients = current.recipients.map(item =>
      item.key === key ? {...item,...patch} : item);
    const metadata: MarketingEmailMetadata = {
      ...current,recipients,
      status:recipients.some(item => item.status === "failed") ? "needs_attention" :
        recipients.every(item => item.status !== "queued") ? "complete" : "queued",
    };
    await tx.update(communicationThreads).set({
      metadata:metadata as unknown as Record<string,unknown>,updatedAt:new Date(),
    }).where(eq(communicationThreads.id,batchId));
  });
}

/** The canonical domain-event outbox retries failed deliveries. Provider
 * acceptance is not proof of inbox delivery or that a recipient opened email.
 */
export async function handleSiteMarketingEmailCampaign(eventId:string) {
  const [event] = await db.select({
    aggregateId:domainEvents.aggregateId,aggregateType:domainEvents.aggregateType,
    eventType:domainEvents.eventType,
  }).from(domainEvents).where(eq(domainEvents.id,eventId)).limit(1);
  if (!event || event.aggregateType !== "communication_thread" ||
    event.eventType !== EventTypes.SiteMarketingEmailCampaignRequested) return;
  const [row] = await db.select().from(communicationThreads)
    .where(and(eq(communicationThreads.id,event.aggregateId),
      eq(communicationThreads.contextType,"site"))).limit(1);
  if (!row?.contextId) throw new Error("Marketing email campaign unavailable.");
  const batch = parseBatch(row);
  const [site] = await db.select({id:sites.id,organizationId:sites.organizationId})
    .from(sites).where(eq(sites.id,row.contextId)).limit(1);
  if (!site) throw new Error("Marketing Site unavailable.");
  const [release] = await db.select().from(siteMarketingPackageReleases).where(and(
    eq(siteMarketingPackageReleases.siteId,site.id),
    eq(siteMarketingPackageReleases.id,batch.releaseId),
    eq(siteMarketingPackageReleases.packageId,batch.packageId),
  )).limit(1);
  const [pkg] = await db.select({status:siteMarketingPackages.status})
    .from(siteMarketingPackages).where(and(
      eq(siteMarketingPackages.siteId,site.id),
      eq(siteMarketingPackages.id,batch.packageId),
    )).limit(1);
  const [artifact] = await db.select().from(siteArtifactReleases).where(and(
    eq(siteArtifactReleases.siteId,site.id),
    eq(siteArtifactReleases.packageId,batch.packageId),
    eq(siteArtifactReleases.packageReleaseId,batch.releaseId),
    eq(siteArtifactReleases.artifactKind,"email"),
  )).limit(1);
  const [access] = artifact ? await db.select().from(siteArtifactReleaseAccess)
    .where(eq(siteArtifactReleaseAccess.releaseId,artifact.id)).limit(1) : [];
  if (!release || !pkg || pkg.status !== "draft" || !artifact || access?.withdrawnAt ||
    artifact.brandVersionId !== release.brandVersionId ||
    (batch.mode === "campaign" && await isDemoTenantOrganization(site.organizationId))) {
    for (const recipient of batch.recipients.filter(item =>
      item.status === "queued" || item.status === "failed"))
      await persistRecipient(row.id,recipient.key,{status:"suppressed"});
    return;
  }
  const output = artifact.outputManifest as {body?:unknown;plainText?:unknown};
  if (typeof output.body !== "string" || !output.body.trim())
    throw new Error("Frozen email release has no HTML.");
  if (createHash("sha256").update(output.body).digest("hex") !== artifact.outputChecksum)
    throw new Error("Frozen email release failed its checksum verification.");
  const manifest = artifact.assetManifest as {logo?:{id:string}|null;hero?:{id:string}|null};
  for (const image of [manifest.logo,manifest.hero]) {
    if (!image?.id) continue;
    const [asset] = await db.select({revokedAt:siteBrandAssets.revokedAt})
      .from(siteBrandAssets).where(and(
        eq(siteBrandAssets.id,image.id),eq(siteBrandAssets.siteId,site.id),
      )).limit(1);
    if (!asset || asset.revokedAt) throw new Error("A released email image no longer has valid rights.");
  }
  const {title: releaseTitle, ...frozenContent} = release.contentSnapshot;
    const snapshot = marketingPackageContentSchema.parse(frozenContent);
  const text = typeof output.plainText === "string" ? output.plainText :
    (snapshot.materialOverrides?.email?.message || snapshot.message);
  const origin = publicOrigin();
  let failed = false;
  for (const candidate of batch.recipients) {
    const [latest] = await db.select().from(communicationThreads)
      .where(eq(communicationThreads.id,row.id)).limit(1);
    if (!latest) throw new Error("Campaign disappeared.");
    const recipient = parseBatch(latest).recipients.find(item => item.key === candidate.key);
    if (!recipient || recipient.status === "accepted" || recipient.status === "suppressed" ||
      recipient.optedOutAt) continue;
    if (batch.mode === "campaign" && (await optouts(site.id)).has(recipient.email)) {
      await persistRecipient(row.id,recipient.key,{status:"suppressed"});
      continue;
    }
    const url = origin + "/marketing/unsubscribe?batchId=" +
      encodeURIComponent(row.id) + "&key=" + encodeURIComponent(recipient.key);
    const footer = formatMarketingFooter(batch.postalAddress,url);
    const html = appendMarketingFooter(output.body,footer.html);
    const result = await sendNotificationEmailWithReceipt({
      to:recipient.email,subject:batch.subject,html,text:text + footer.text,
    },"site-marketing:" + row.id + ":" + recipient.key);
    await persistRecipient(row.id,recipient.key,{
      status:result.accepted ? "accepted" : "failed",attempts:recipient.attempts + 1,
      ...(result.providerMessageId ? {providerMessageId:result.providerMessageId} : {}),
    });
    if (!result.accepted) failed = true;
  }
  if (failed) throw new Error("Marketing campaign email provider did not accept all recipients.");
}

/** Public, high-entropy per-recipient opt-out. GET only displays confirmation. */
export async function readSiteMarketingUnsubscribe(batchId:string,key:string) {
  const [row] = await db.select().from(communicationThreads).where(and(
    eq(communicationThreads.id,batchId),
    eq(communicationThreads.contextType,"site"),
  )).limit(1);
  if (!row) return null;
  const parsed = marketingEmailMetadataSchema.safeParse(row.metadata);
  if (!parsed.success) return null;
  const recipient = parsed.data.recipients.find(item => item.key === key);
  return recipient ? {optedOut:Boolean(recipient.optedOutAt)} : null;
}
export async function unsubscribeSiteMarketingEmail(batchId:string,key:string) {
  return db.transaction(async tx => {
    const [row] = await tx.select().from(communicationThreads).where(and(
      eq(communicationThreads.id,batchId),
      eq(communicationThreads.contextType,"site"),
    )).for("update").limit(1);
    if (!row) return false;
    const parsed = marketingEmailMetadataSchema.safeParse(row.metadata);
    if (!parsed.success) return false;
    const target = parsed.data.recipients.find(item => item.key === key);
    if (!target) return false;
    if (target.optedOutAt) return true;
    const recipients = parsed.data.recipients.map(item => item.key === key ? {
      ...item,optedOutAt:new Date().toISOString(),
      status:item.status === "queued" || item.status === "failed"
        ? "suppressed" as const : item.status,
    } : item);
    await tx.update(communicationThreads).set({
      metadata:{...parsed.data,recipients} as unknown as Record<string,unknown>,
      updatedAt:new Date(),
    }).where(eq(communicationThreads.id,row.id));
    return true;
  });
}
