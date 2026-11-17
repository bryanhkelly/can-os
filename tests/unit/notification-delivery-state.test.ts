import {describe,expect,it} from "vitest";
import {waitlistDeliveryView,type WaitlistDeliverySnapshot} from "@/domain/notification-delivery-state";
const now=new Date("2026-11-17T16:00:00.000Z");
const expiry=new Date("2026-11-19T16:00:00.000Z");
const base:WaitlistDeliverySnapshot={
 status:"failed",invitationStatus:"invited",invitationExpiresAt:expiry,
 currentInvitationExpiresAt:expiry,acceptedAt:null,nextAttemptAt:null,attempts:5,
};
describe("source-owned delivery recovery state",()=>{
 it("only allows explicit retry of unaccepted current failed receipt",()=>{
  expect(waitlistDeliveryView(base,now).retryable).toBe(true);
  expect(waitlistDeliveryView({...base,status:"accepted",acceptedAt:now},now)).toEqual({
   state:"provider_accepted",label:"Provider accepted (delivery unconfirmed)",retryable:false,
  });
  expect(waitlistDeliveryView({...base,invitationStatus:"accepted"},now).retryable).toBe(false);
  expect(waitlistDeliveryView({...base,currentInvitationExpiresAt:new Date("2026-11-20")},now).retryable).toBe(false);
  expect(waitlistDeliveryView({...base,invitationExpiresAt:new Date("2026-11-16")},now).state).toBe("expired");
 });
 it("distinguishes provider delivery, bounce and complaint",()=>{
  expect(waitlistDeliveryView({...base,status:"accepted",acceptedAt:now,
    providerDeliveredAt:now},now)).toEqual({
    state:"provider_delivered",label:"Delivered to mail server",retryable:false,
  });
  expect(waitlistDeliveryView({...base,providerFailedAt:now,
    providerFailureKind:"email.bounced"},now)).toEqual({
    state:"provider_failed",label:"Provider reported delivery failure",retryable:false,
  });
  expect(waitlistDeliveryView({...base,providerFailedAt:now,
    providerFailureKind:"email.complained"},now)).toEqual({
    state:"complained",label:"Recipient reported spam",retryable:false,
  });
  expect(waitlistDeliveryView({...base,providerFailedAt:now},now).retryable).toBe(false);
 });
 it("distinguishes queued, in flight, scheduled retry and suppressed",()=>{
  expect(waitlistDeliveryView({...base,status:"pending"},now).state).toBe("pending");
  expect(waitlistDeliveryView({...base,status:"processing"},now).retryable).toBe(false);
  expect(waitlistDeliveryView({...base,nextAttemptAt:new Date("2026-11-18")},now).state).toBe("retry_scheduled");
  expect(waitlistDeliveryView({...base,status:"suppressed"},now).state).toBe("suppressed");
 });
});
