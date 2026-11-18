import {afterEach,describe,expect,it,vi} from "vitest";
import {
  accessClientInstance,clearLearnerBrowserState,isSharedDeviceMode,setSharedDeviceMode,
} from "@/domain/session-client";

function memoryStorage():Storage {
  const data=new Map<string,string>();
  return {
    get length(){return data.size;},
    clear(){data.clear();},
    getItem(key:string){return data.get(key)??null;},
    key(index:number){return [...data.keys()][index]??null;},
    removeItem(key:string){data.delete(key);},
    setItem(key:string,value:string){data.set(key,String(value));},
  } as Storage;
}

afterEach(()=>vi.unstubAllGlobals());

describe("browser account handoff clears only CAN-owned data",()=>{
  it("removes account-specific session, attendance and learning evidence but not unrelated tab data",()=>{
    const sessionStorage=memoryStorage();
    const localStorage=memoryStorage();
    sessionStorage.setItem("can-access-client-instance","old-client");
    sessionStorage.setItem("can-os:attendance:pending:v3:prior-account","private-mark");
    sessionStorage.setItem("can-learning-outbox:prior-account","private-events");
    sessionStorage.setItem("unrelated-app:unsaved-form","preserve");
    localStorage.setItem("can-os:sidebar","collapsed");
    localStorage.setItem("can-shared-device-mode","1");
    localStorage.setItem("unrelated-app:setting","preserve");
    vi.stubGlobal("window",{sessionStorage,localStorage});

    clearLearnerBrowserState(false);

    expect(sessionStorage.getItem("can-access-client-instance")).toBeNull();
    expect(sessionStorage.getItem("can-os:attendance:pending:v3:prior-account")).toBeNull();
    expect(sessionStorage.getItem("can-learning-outbox:prior-account")).toBeNull();
    expect(sessionStorage.getItem("unrelated-app:unsaved-form")).toBe("preserve");
    expect(localStorage.getItem("can-os:sidebar")).toBeNull();
    expect(localStorage.getItem("unrelated-app:setting")).toBe("preserve");
    expect(isSharedDeviceMode()).toBe(true);
    expect(localStorage.getItem("can-session-revocation")).toBeNull();
  });

  it("keeps the deliberate shared-device preference and broadcasts a fresh cross-tab handoff",()=>{
    const sessionStorage=memoryStorage();
    const localStorage=memoryStorage();
    vi.stubGlobal("window",{sessionStorage,localStorage});
    setSharedDeviceMode(true);
    const before=accessClientInstance();
    clearLearnerBrowserState();
    const after=accessClientInstance();
    expect(after).not.toBe(before);
    expect(localStorage.getItem("can-shared-device-mode")).toBe("1");
    expect(localStorage.getItem("can-session-revocation")).toMatch(/^\d+:[0-9a-f-]{36}$/i);
    setSharedDeviceMode(false);
    expect(isSharedDeviceMode()).toBe(false);
  });
});
