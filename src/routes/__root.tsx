import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { Analytics } from "@vercel/analytics/react";
import appCss from "../styles.css?url";

const APP_NAME = "Agentic Outreach Reference Implementation";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      {
        name: "description",
        content:
          "Human-controlled AI-assisted outbound workflow. Reference implementation with fictional data. No real emails are sent.",
      },
      { name: "theme-color", content: "#0C0C0A" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  component: () => (
    <html lang="en" className="dark antialiased">
      <head><HeadContent /></head>
      <body className="bg-bg text-fg">
        <Outlet />
        <Scripts />
        <Analytics />
      </body>
    </html>
  ),
});
