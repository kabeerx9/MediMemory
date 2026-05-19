import { Toaster } from "@health-conversation/ui/components/sonner";
import { TooltipProvider } from "@health-conversation/ui/components/tooltip";
import { HeadContent, Outlet, createRootRouteWithContext, useRouterState } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import Header from "@/components/header";
import { ThemeProvider } from "@/components/theme-provider";

import "../index.css";

export interface RouterAppContext {}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  head: () => ({
    meta: [
      {
        title: "MediMemory",
      },
      {
        name: "description",
        content: "MediMemory keeps temporary health chats separate from curated medical memory",
      },
    ],
    links: [
      { rel: "icon", href: "/favicon.ico" },
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap",
      },
    ],
  }),
});

function RootComponent() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAuthPage = pathname === "/login";

  return (
    <>
      <HeadContent />
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        disableTransitionOnChange
        storageKey="vite-ui-theme"
      >
        <TooltipProvider>
          <div
            className={
              isAuthPage
                ? "h-svh bg-background"
                : "grid h-svh grid-rows-[auto_1fr] bg-background [&>*:last-child]:min-h-0"
            }
          >
            {isAuthPage ? null : <Header />}
            <Outlet />
          </div>
          <Toaster richColors />
        </TooltipProvider>
      </ThemeProvider>
      <TanStackRouterDevtools position="bottom-left" />
    </>
  );
}
