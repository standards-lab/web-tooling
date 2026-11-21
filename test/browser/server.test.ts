// Adapted from spike-html-apps-tooling (d77877b): test/browser/server.test.ts, the package by its new name.

import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { launch, until } from "@standards-lab/web-tooling/browser.js";
import type { Browser } from "@standards-lab/web-tooling/browser.js";
import { serve } from "@standards-lab/web-tooling/server.js";
import type { Server } from "@standards-lab/web-tooling/server.js";
import { tree } from "../support/tree.ts";

const fixture = tree();
let server: Server;
let browser: Browser;
before(async () => {
  server = await serve({ root: fixture.root, deps: ["alpha"] });
  browser = await launch();
});
after(async () => {
  await browser.close();
  await server.stop();
  fixture.remove();
});

test("a page's stylesheet applies and its module scripts run, a dep and its siblings imported", async () => {
  const page = await browser.open(`${server.origin}/index.html`);
  try {
    assert.equal(await until(page, "window.app", 5000), "alpha beta gamma");
    assert.equal(await page.evaluate("getComputedStyle(document.body).marginTop"), "7px");
    const types: Record<string, string> = await page.evaluate(
      `Object.fromEntries(performance.getEntriesByType("resource").map((entry) => [new URL(entry.name).pathname, entry.contentType]))`,
    );
    assert.deepEqual(types, {
      "/style.css": "text/css",
      "/app.js": "text/javascript",
      "/deps/alpha/index.js": "text/javascript",
      "/deps/beta/index.js": "text/javascript",
      "/deps/@scope/gamma/index.js": "text/javascript",
    });
  } finally {
    await page.close();
  }
});
