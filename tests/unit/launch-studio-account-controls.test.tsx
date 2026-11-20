import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { WorkspaceAccountTrigger } from "@/components/shell/WorkspaceAccountMenu";

const read=(path:string)=>readFileSync(path,"utf8");

describe("shared CAN OS account access in Launch Studio V6.1",()=>{
  it("renders the same accessible top-right account trigger as the workspace shell",()=>{
    const html=renderToStaticMarkup(
      <WorkspaceAccountTrigger
        member={{firstName:"Barton",lastName:"Admin"}}
        accountOpen={false} onOpenAccount={()=>{}} />,
    );
    expect(html).toContain('aria-label="Account menu"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('title="Barton Admin"');
  });
  it("connects the Site Launch Studio and independent Launch journeys to the same account control",()=>{
    const site=read("src/components/launch-studio/LaunchSiteFrameV61.tsx");
    const other=read("src/components/launch-studio/LaunchStudioShell.tsx");
    expect(site).toContain("<LaunchAccountControls />");
    expect(site).toContain('aria-label="Launch Studio top bar"');
    expect(site).toContain("Preview Website");
    expect(other).toContain("<LaunchAccountControls />");
    expect(other).not.toContain("window.location.assign");
    expect(site).not.toContain("window.location.assign");
  });
  it("reuses the same Account drawer and server-revoking signout in both shells",()=>{
    const account=read("src/components/shell/WorkspaceAccountMenu.tsx");
    const standalone=read("src/components/shell/LaunchAccountControls.tsx");
    const workspace=read("src/components/shell/WorkspaceNavigation.tsx");
    const panels=read("src/components/shell/WorkspaceNavigationPanels.tsx");
    const topbar=read("src/components/shell/WorkspaceTopBar.tsx");
    const signout=read("src/components/shell/workspace-sign-out.ts");
    expect(account).toContain('<ContextTray title="Account"');
    for(const label of ["My CAN account","My profile","Account sessions","Sign out"])
      expect(account).toContain(label);
    expect(standalone).toContain("<WorkspaceAccountTrigger");
    expect(standalone).toContain("<WorkspaceAccountMenu");
    expect(panels).toContain("<WorkspaceAccountMenu");
    expect(topbar).toContain("<WorkspaceAccountTrigger");
    expect(workspace).toContain("changeSession(signOutOfWorkspace)");
    expect(standalone).toContain("await signOutOfWorkspace()");
    expect(signout).toContain('fetch("/access/logout"');
    expect(signout).toContain("clearLearnerBrowserState()");
    expect(signout).toContain('window.location.assign("/access")');
  });
  it("does not render an authenticated account trigger for signed-out users",()=>{
    const launch=read("src/components/shell/LaunchAccountControls.tsx");
    expect(launch).toContain("if(!authenticated)return null");
    expect(launch).toContain("session.grants.find");
  });
});
