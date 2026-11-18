import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  invalidateNativeClassAvailability, nativeClassAvailabilityQueryKeys as keys,
} from "@/lib/native-class-availability-cache";
import { createMutationRunner, type MutationFeedbackState } from "@/lib/mutation-feedback";

function createCachedReaders() {
  const client = new QueryClient({defaultOptions:{queries:{retry:false}}});
  const managerKey = [...keys.managerPages,"site-a",null,""] as const;
  const rolloutKey = [...keys.rolloutPages,"offering-a","site-a",["course-a"]] as const;
  const launchKey = [...keys.launchPage,"site-a"] as const;
  const unrelatedKey = ["learner-private-records","person-a"] as const;
  const managerValue = {pages:[{items:[{courseVersionId:"course-a"}],nextCursor:null}],pageParams:[0]};
  const launchValue = {items:[{courseVersionId:"course-a"}],nextCursor:null};
  client.setQueryData(managerKey,managerValue);
  client.setQueryData(rolloutKey,{pages:[],pageParams:[]});
  client.setQueryData(launchKey,launchValue);
  client.setQueryData(unrelatedKey,{items:["private"]});
  return {client,managerKey,rolloutKey,launchKey,unrelatedKey,managerValue,launchValue};
}

describe("Class Course publication → adoption → Class discovery",()=>{
  it("invalidates the three dependent read models, without mixing paginated shapes",async()=>{
    const {client,managerKey,rolloutKey,launchKey,unrelatedKey,managerValue,launchValue}=
      createCachedReaders();
    expect(client.getQueryData(managerKey)).toEqual(managerValue);
    expect(client.getQueryData(launchKey)).toEqual(launchValue);
    expect(managerKey).not.toEqual(launchKey);
    await invalidateNativeClassAvailability(client);
    for(const key of [managerKey,rolloutKey,launchKey])
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    expect(client.getQueryState(unrelatedKey)?.isInvalidated).toBe(false);
    expect(client.getQueryData(managerKey)).toEqual(managerValue);
    expect(client.getQueryData(launchKey)).toEqual(launchValue);
    client.clear();
  });

  it("does not repeat an approved mutation when Class discovery refresh fails",async()=>{
    const {client,launchKey}=createCachedReaders();
    const state:MutationFeedbackState[]=[];
    let commands=0;
    let failRefresh=true;
    const mutation=createMutationRunner({
      update:s=>state.push(s),
      refresh:async()=>{
        if(failRefresh)throw Error("Temporary Class discovery outage");
        await invalidateNativeClassAvailability(client);
      },
    });
    const command=async()=>{commands++;return {approvalStatus:"approved" as const};};
    const messages={
      successMessage:"Adoption approved. Class remains independently gated.",
      commandErrorMessage:"Approval was rejected.",
      refreshErrorMessage:"Approval saved, but Class discovery could not refresh.",
    };
    const first=await mutation(command,messages);
    expect(first.status).toBe("refresh-failed");
    expect(commands).toBe(1);
    expect(state.at(-1)).toMatchObject({refreshFailed:true,
      notice:messages.successMessage,error:messages.refreshErrorMessage});
    expect((await mutation(command,messages)).status).toBe("refresh-required");
    expect(commands).toBe(1);
    failRefresh=false;
    expect((await mutation.retryRefresh()).status).toBe("refreshed");
    expect(commands).toBe(1);
    expect(state.at(-1)).toMatchObject({refreshFailed:false,
      notice:messages.successMessage,error:""});
    expect(client.getQueryState(launchKey)?.isInvalidated).toBe(true);
    client.clear();
  });
});
