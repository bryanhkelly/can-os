/**
 * Server-only transactional email boundary.
 * Resend delivers mail; it never decides who the user is or what they can access.
 * Call from server code only; never import this module into a client component.
 */
export type OneTimeAccessMessage = {to: string; accessUrl: string};
export type AccessEmailSender = (message: OneTimeAccessMessage) => Promise<void>;

async function writeTestAccessMail(message:OneTimeAccessMessage):Promise<boolean>{
 const directory=process.env.CAN_ACCESS_MAIL_OUTBOX_DIR;
 if(!directory || process.env.NODE_ENV!=="test" || process.env.APP_ENV!=="test")return false;
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

export const sendAccessLinkViaResend: AccessEmailSender = async ({to,accessUrl}) => {
 const url=new URL(accessUrl);
 if(url.protocol!=="https:" || !url.hostname) throw new Error("Access link must use HTTPS");
 const allowedOrigin=process.env.CAN_ACCESS_PUBLIC_ORIGIN;
 if(!allowedOrigin || url.origin!==new URL(allowedOrigin).origin) throw new Error("Invalid access link origin");
 if(await writeTestAccessMail({to,accessUrl}))return;
 const apiKey=process.env.RESEND_API_KEY;
 const from=process.env.CAN_ACCESS_FROM_EMAIL;
 if(!apiKey || !from) throw new Error("Resend access mail is not configured");
 const response=await fetch("https://api.resend.com/emails",{
  method:"POST",
  headers:{"Authorization":`Bearer ${apiKey}`,"Content-Type":"application/json"},
  body:JSON.stringify({
   from,to:[to],subject:"Your CAN OS sign-in link",
   text:`Use this one-time link to sign in to CAN OS. It expires in 10 minutes. If you did not request it, you can ignore this message.\n\n${accessUrl}`
  }),
 });
 if(!response.ok) throw new Error("Unable to deliver access email");
};
