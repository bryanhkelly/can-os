/**
 * Server-only transactional email boundary.
 * Resend delivers mail; it never decides who the user is or what they can access.
 * Call from server code only; never import this module into a client component.
 */
export type OneTimeAccessMessage = {to: string; accessUrl: string};
export type AccessEmailSender = (message: OneTimeAccessMessage) => Promise<void>;

export const sendAccessLinkViaResend: AccessEmailSender = async ({to,accessUrl}) => {
 const apiKey=process.env.RESEND_API_KEY;
 const from=process.env.CAN_ACCESS_FROM_EMAIL;
 if(!apiKey || !from) throw new Error("Resend access mail is not configured");
 const url=new URL(accessUrl);
 if(url.protocol!=="https:" || !url.hostname) throw new Error("Access link must use HTTPS");
 const allowedOrigin=process.env.CAN_ACCESS_PUBLIC_ORIGIN;
 if(!allowedOrigin || url.origin!==new URL(allowedOrigin).origin) throw new Error("Invalid access link origin");
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
