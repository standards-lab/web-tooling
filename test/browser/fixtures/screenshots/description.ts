// The fixture description the screenshot tests run the bin over: a long page cut into tiles, a
// page with a focus-start mark and a late custom element, and a viewport state at its own size,
// served from this directory, with a /log route that appends each page's report to the file
// SCREENSHOTS_LOG names. Its prepare step gives each page window.report(kind), which posts what the
// page shows, its focused element, its root's attributes, and its scheme; every focus reports
// itself. With SCREENSHOTS_FAIL=open, the narrow page's open step throws.
// See docs/internals.md

import { appendFileSync } from "node:fs";
import type { Description, Step } from "@standards-lab/web-tooling/screenshots.js";

const REPORTER = `(() => {
  if (window.report) return;
  window.report = (kind) => {
    const active = document.activeElement;
    const request = new XMLHttpRequest();
    request.open("POST", "/log", false);
    request.send(JSON.stringify({
      kind,
      page: location.pathname,
      id: active?.id ?? "",
      focusVisible: active?.matches(":focus-visible") ?? false,
      attributes: Object.fromEntries(
        [...document.documentElement.attributes].map(({ name, value }) => [name, value]),
      ),
      dark: matchMedia("(prefers-color-scheme: dark)").matches,
      updated: document.querySelector("x-late")?.dataset.updated === "yes",
    }));
  };
  document.addEventListener("focusin", () => window.report("focus"));
})()`;

const report =
  (kind: string): Step =>
  async (page) => {
    await page.evaluate(`${REPORTER}, window.report(${JSON.stringify(kind)})`);
  };

const description: Description = {
  pages: [
    { name: "long", caption: "the long page", path: "long.html" },
    { name: "focus", caption: "the focus page", path: "focus.html" },
    {
      name: "narrow",
      caption: "the narrow page",
      path: "narrow.html",
      states: [
        {
          name: "narrow-open",
          caption: "the narrow page, opened",
          viewport: { width: 390, height: 300 },
          full: false,
          open: async (page) => {
            if (process.env.SCREENSHOTS_FAIL === "open") throw new Error("the open step fails");
            await report("open")(page);
          },
        },
      ],
    },
  ],
  facets: [
    { flag: "palette", attribute: "data-palette", default: "dawn" },
    { flag: "space", attribute: "data-space", default: "wide" },
    { flag: "type", attribute: "data-type", default: "plain" },
  ],
  all: [{ palette: "dawn" }, { palette: "dusk" }, { space: "tight" }, { type: "fancy" }],
  profiles: (page) => page.evaluate("window.registry"),
  prepare: report("prepare"),
  server: {
    handler: async (request, response) => {
      if (request.url !== "/log") return false;
      let body = "";
      for await (const chunk of request) body += chunk;
      if (process.env.SCREENSHOTS_LOG) appendFileSync(process.env.SCREENSHOTS_LOG, `${body}\n`);
      response.writeHead(204).end();
      return true;
    },
  },
};

export default description;
