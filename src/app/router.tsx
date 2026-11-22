import {
  createHashHistory, createRootRoute, createRoute, createRouter, lazyRouteComponent, Link, Outlet, redirect,
  type RouteComponent,
} from "@tanstack/react-router";
import { STATIC } from "@/shared/lib/env";
import { DEFAULT_TOOL, TOOLS, type ToolInfo } from "./tools";

const rootRoute = createRootRoute({
  component: Outlet,
  notFoundComponent: NotFound,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => { throw redirect({ to: DEFAULT_TOOL.path }); },
});

/** A tool's route. Its code is a separate chunk, downloaded the first time the tool is opened. */
function toolRoute<P extends ToolInfo["path"]>(tool: ToolInfo & { path: P }, load: () => Promise<{ default: RouteComponent }>) {
  return createRoute({
    getParentRoute: () => rootRoute,
    path: tool.path,
    component: STATIC && tool.needsServer ? () => <NeedsServer tool={tool} /> : lazyRouteComponent(load),
  });
}

const routeTree = rootRoute.addChildren([
  indexRoute,
  toolRoute(TOOLS.promptBuilder, () => import("@/tools/prompt-builder/PromptBuilder")),
]);

export const router = createRouter({
  routeTree,
  // Hash URLs (/#/prompt-builder) work on GitHub Pages, which can't route other paths to index.html.
  history: createHashHistory(),
  defaultPendingMs: 300,
});

declare module "@tanstack/react-router" {
  interface Register { router: typeof router }
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid h-screen place-items-center bg-ink px-8 text-center">
      <div className="max-w-md space-y-3">
        <h1 className="font-sans text-3xl font-light text-paper">{title}</h1>
        <div className="font-talk text-[15px] text-bone">{children}</div>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <Notice title="Nothing here">
      <Link to={DEFAULT_TOOL.path} className="text-caramel underline underline-offset-4">Open {DEFAULT_TOOL.name}</Link>
    </Notice>
  );
}

function NeedsServer({ tool }: { tool: ToolInfo }) {
  return (
    <Notice title={tool.name}>
      This tool works with files and programs on your computer, so it needs the local version of the app
      (<code>pnpm dev</code>). The online version can't reach them.
    </Notice>
  );
}
