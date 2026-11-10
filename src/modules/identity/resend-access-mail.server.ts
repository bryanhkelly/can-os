/**
 * Server-only transactional email boundary.
 * Resend delivers mail; it never decides who the user is or what they can access.
 * Call from server code only; never import this module into a client component.
 */
export type OneTimeAccessMessage = {
 to: string;
 accessUrl: string;
 /** Optional authorized outreach copy; the sender address remains server-configured. */
 subject?: string;
 introduction?: string;
 siteId?: string;
 /** Stable across retries of the same logical recipient. */
 idempotencyKey?: string;
};
export type AccessEmailSender = (message: OneTimeAccessMessage) => Promise<void>;

/**
 * True only in the isolated synthetic sandbox: the test runtime whose access
 * mail is delivered to a local file outbox instead of an external provider.
 * writeTestAccessMail additionally enforces `.test` recipients there. This is
 * never true in development or production, where demo-tenant public
 * applications remain fully suppressed.
 */
export function isSyntheticSandboxMailRuntime(
 env:{NODE_ENV?:string;APP_ENV?:string;CAN_ACCESS_MAIL_OUTBOX_DIR?:string}=process.env,
):boolean{
 return env.NODE_ENV==="test" && env.APP_ENV==="test" &&
  Boolean(env.CAN_ACCESS_MAIL_OUTBOX_DIR);
}

async function writeTestAccessMail(message:OneTimeAccessMessage):Promise<boolean>{
 const directory=process.env.CAN_ACCESS_MAIL_OUTBOX_DIR;
 if(!directory || !isSyntheticSandboxMailRuntime())return false;
 // Browser acceptance uses real account/challenge/session issuance without an
 // external mail provider. Never enable file delivery outside the test runtime,
 // and never write access links for real-looking recipient domains.
 if(!message.to.endsWith(".test"))throw new Error("Test access mail requires a .test recipient");
 const [{mkdir,writeFile},{join},{randomUUID}]=await Promise.all([
  import("node:fs/promises"),import("node:path"),import("node:crypto"),
 ]);
 await mkdir(directory,{recursive:true});
 await writeFile(join(directory,randomUUID()+".json"),JSON.stringify(message),{
  encoding:"utf8",flag:"wx",mode:0o600,
 });
 return true;
}

export const sendAccessLinkViaResend: AccessEmailSender = async message => {
 const {to,accessUrl}=message;
 const url=new URL(accessUrl);
 if(url.protocol!=="https:" || !url.hostname) throw new Error("Access link must use HTTPS");
 const allowedOrigin=process.env.CAN_ACCESS_PUBLIC_ORIGIN;
 if(!allowedOrigin || url.origin!==new URL(allowedOrigin).origin) throw new Error("Invalid access link origin");
 if(await writeTestAccessMail(message))return;
 const apiKey=process.env.RESEND_API_KEY;
 const from=process.env.CAN_ACCESS_FROM_EMAIL;
 if(!apiKey || !from) throw new Error("Resend access mail is not configured");
 const brand=message.siteId
  ? await import("@/modules/sites/school-brand.server")
    .then(module=>module.readSchoolBrand(message.siteId!))
    .catch(()=>{console.warn("[access-email] School branding unavailable; using CAN branding");return null;}) : null;
 const name=brand?.name??"CAN OS";
 const instructions=`Use this one-time link to continue to ${name}. It expires in 10 minutes. If you did not request it, you can ignore this message.\n\n${accessUrl}`;
 const text=message.introduction?`${message.introduction}\n\n${instructions}`:instructions;
 const {renderSchoolEmail,schoolEmailLogoAttachment}=await import("@/domain/school-email");
 const logoAttachment=schoolEmailLogoAttachment(brand);
 const response=await fetch("https://api.resend.com/emails",{
  method:"POST",
  headers:{
   "Authorization":`Bearer ${apiKey}`,"Content-Type":"application/json",
   ...(message.idempotencyKey?{"Idempotency-Key":message.idempotencyKey}:{}),
  },
  body:JSON.stringify({
  from,to:[to],subject:message.subject??`Your ${name} sign-in link`,
  text,html:renderSchoolEmail({brand,text,actionUrl:accessUrl,actionLabel:"Continue"}),
  ...(logoAttachment?{attachments:[logoAttachment]}:{}),
  }),
 });
 if(!response.ok) throw new Error("Unable to deliver access email");
};
