/** Dedicated urgent school-to-family delivery tick (one minute).
 * The general five-minute scheduled job remains a fallback. Both paths
 * use the same row-leased canonical outbound queue, so concurrent ticks
 * cannot claim the same pending deliveries.
 */
export default async()=>{
 const base=process.env.URL;
 const secret=process.env.CAN_JOB_SECRET;
 if(!base||!secret){
  console.error("school-family-deliveries: URL or CAN_JOB_SECRET missing");
  return;
 }
 const response=await fetch(new URL("/api/school-family-deliveries",base),{
  method:"POST",
  headers:{"x-can-job-secret":secret},
 });
 if(!response.ok)throw new Error("school-family-deliveries: delivery endpoint returned "+response.status);
 console.log("school-family-deliveries:",await response.text());
};
export const config={schedule:"* * * * *"};
