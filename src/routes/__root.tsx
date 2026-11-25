import { WorkspaceNavigation } from "@/components/shell/WorkspaceNavigation";
import { ProtectedRouteAuthGate } from "@/components/shell/ProtectedRouteAuthGate";
import { isPublicCanPath } from "@/domain/auth-route-policy";
import { accessReturnToFromLocation } from "@/domain/access-navigation";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { WorkspaceSessionProvider, workspaceSessionQueryOptions } from "@/components/shell/WorkspaceSession";
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  redirect,
  HeadContent,
  Outlet,
  Scripts,
  useLocation,
} from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
} from "@/lib/site-config";
import appCss from "../styles.css?url";
import { AccessReturnRecovery } from "@/lib/access-return-recovery";
import { isLaunchStudioPath } from "@/domain/launch-studio";
import { LaunchStudioChrome } from "@/components/launch-studio/LaunchStudioShell";
import { EngagementChrome } from "@/components/engagement/EngagementChrome";
import { isEngagementPath } from "@/domain/engagement-context";
import favicon from "../assets/can-os-favicon.svg?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: async ({ context, location }) => {
    const result=await context.queryClient.fetchQuery(workspaceSessionQueryOptions());
    if (!isPublicCanPath(location.pathname) && !result.error && !result.session?.authenticated) {
      throw redirect({ to: "/access", search: {
        returnTo: accessReturnToFromLocation(location),
      }, replace: true });
    }
    return result;
  },
  staleTime: Infinity,
  headers: () => ({ "Cache-Control": "private, no-store" }),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: SITE_TITLE },
      { name: "description", content: SITE_DESCRIPTION },
      { name: "theme-color", content: "#101d39" },
      { property: "og:site_name", content: SITE_NAME },
      { property: "og:title", content: SITE_TITLE },
      { property: "og:description", content: SITE_DESCRIPTION },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: favicon },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&display=swap",
      },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Toaster richColors />
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const session = Route.useLoaderData();
  const pathname = useLocation({ select: location => location.pathname });
  const standalone = isLaunchStudioPath(pathname);
  const publicSiteSignup = pathname === "/site/new";
  const siteLaunch = pathname === "/launch/site" || /^\/o\/[^/]+\/[^/]+\/(?:launch|website)\/?$/.test(pathname);
  const engagement = isEngagementPath(pathname);

  return (
    <QueryClientProvider client={queryClient}>
      <WorkspaceSessionProvider initial={session}>
        <ProtectedRouteAuthGate>
        {engagement
          ? <EngagementChrome><Outlet /></EngagementChrome>
          : publicSiteSignup || siteLaunch
            ? <AccessReturnRecovery><Outlet /></AccessReturnRecovery>
          : standalone
            ? <LaunchStudioChrome><AccessReturnRecovery><Outlet /></AccessReturnRecovery></LaunchStudioChrome>
            : <><WorkspaceNavigation><AccessReturnRecovery><Outlet /></AccessReturnRecovery></WorkspaceNavigation><CommandPalette /></>}
        </ProtectedRouteAuthGate>
      </WorkspaceSessionProvider>
    </QueryClientProvider>
  );
}
