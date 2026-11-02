import { beforeEach, describe, expect, it, vi } from "vitest";

const state=vi.hoisted(()=>({
  rows:[] as unknown[][],
  writes:[] as Record<string,unknown>[],
  organizationId:null as string|null,
  emailRecipients:vi.fn(),email:vi.fn(),sms:vi.fn(),preferences:vi.fn(),
}));
vi.mock("@/db/client",()=>{
  const tx={
    select:()=>{
      const rows=state.rows.shift()??[];
      return {
        from(){return this;},where(){return this;},orderBy(){return this;},limit(){return this;},
        for:async()=>rows.map(row=> typeof row==="object"&&row!==null&&"status" in row
          ? {...row,leaseUntil:state.writes.findLast(write=>write.status==="processing")?.leaseUntil}
          : row),
        then(resolve:(rows:unknown[])=>unknown,reject:(error:unknown)=>unknown){
          return Promise.resolve(rows).then(resolve,reject);
        },
      };
    },
    update:()=>({
      set(values:Record<string,unknown>){state.writes.push(values);return this;},
      where(){return this;},
      returning:async()=>[{id:"delivery"}],
      then(resolve:(value:undefined)=>unknown,reject:(error:unknown)=>unknown){
        return Promise.resolve(undefined).then(resolve,reject);
      },
    }),
  };
  return {db:{...tx,transaction:async(callback:(value:typeof tx)=>unknown)=>callback(tx)}};
});
vi.mock("@/platform/subscriptions/policy",()=>({
  getSubscriptionPolicy:()=>({
    load:async()=>({organizationId:state.organizationId}),
    organizationId:(context:{organizationId:string|null})=>context.organizationId,
    authorize:async()=>true,conditionHolds:async()=>true,
    content:()=>({title:"Reminder"}),
  }),
}));
vi.mock("@/modules/communication/notification-email.server",()=>({
  emailNotificationRecipients:state.emailRecipients,sendNotificationEmail:state.email,
}));
vi.mock("@/platform/subscriptions/preferences",()=>({
  getNotificationPreferences:state.preferences,nextAllowedDelivery:()=>null,sendOptedInSms:state.sms,
}));
import { processQueuedSubscriptionDeliveries } from "@/platform/subscriptions/delivery-worker";

function arrange(channel:string,organizationId:string|null){
  state.organizationId=organizationId;
  state.rows=[
    [{id:"delivery"}],
    [{id:"delivery",status:"processing",subscriptionId:"watch",domainEventId:"event",channel,attempts:0}],
    [{id:"watch",status:"active",subscriberPersonId:"person",sourceConversationId:null}],
    [{id:"event",eventType:"AssignmentBecameMissing",payload:{organizationId:"forged-other-tenant"}}],
  ];
}
beforeEach(()=>{
  vi.clearAllMocks();state.writes=[];
  state.preferences.mockResolvedValue(null);
  state.emailRecipients.mockResolvedValue(new Map([["person","person@example.org"]]));
  state.email.mockResolvedValue(true);
});
describe("subscription canonical tenant transport safety",()=>{
  it.each(["email","sms"])("suppresses Valor %s without consulting transports or consent",async channel=>{
    arrange(channel,"f1000000-0000-4000-8000-000000000002");
    expect(await processQueuedSubscriptionDeliveries()).toBe(0);
    expect(state.writes).toContainEqual(expect.objectContaining({
      status:"suppressed",lastError:"external_delivery_tenant_blocked",leaseUntil:null,
    }));
    expect(state.preferences).not.toHaveBeenCalled();
    expect(state.emailRecipients).not.toHaveBeenCalled();
    expect(state.email).not.toHaveBeenCalled();
    expect(state.sms).not.toHaveBeenCalled();
  });
  it("suppresses external delivery when the aggregate has no canonical tenant",async()=>{
    arrange("email",null);
    expect(await processQueuedSubscriptionDeliveries()).toBe(0);
    expect(state.email).not.toHaveBeenCalled();
    expect(state.writes).toContainEqual(expect.objectContaining({status:"suppressed"}));
  });
  it("preserves real-tenant email delivery with canonical source scope",async()=>{
    arrange("email","school");
    expect(await processQueuedSubscriptionDeliveries()).toBe(1);
    expect(state.emailRecipients).toHaveBeenCalledWith(["person"],"school");
    expect(state.email).toHaveBeenCalledOnce();
    expect(state.writes).toContainEqual(expect.objectContaining({status:"delivered",attempts:1}));
  });
});
