/** Rapid school-family notification dispatch, independent of slower learning
 * maintenance jobs. Every send is permission-checked by the application.
 */
export default async()=>{
 const base=process.env.URL;
 const secret=process.env.CAN_JOB_SECRET;
 if(!base||!secret){
   throw new Error("school-family-alerts: URL and CAN_JOB_SECRET are required; urgent family dispatch was NOT executed");
 }
 const response=await fetch(new URL("/api/family-alert-delivery",base),{
   method:"POST",
   headers:{"x-can-job-secret":secret},
 });
 if(!response.ok)throw new Error("school-family-alerts: dispatch failed ("+response.status+")");
 console.info("school-family-alerts: completed",new Date().toISOString(),await response.text());
};

export const config={schedule:"* * * * *"};
