// Adapted from spike-html-go-wasm (f026de3): test/browser/site-nav-layout-dejavu.test.ts, running
// fonts-suite.ts, with useDejaVu from the package.
// The font set in the pinned DejaVu set: fonts-suite.ts's tests, as that suite says, under the
// test-only fontconfig that the package's useDejaVu() writes, set up before the suite's browser
// launches, and removed after it closes. fonts.test.ts runs the same suite in the machine's fonts.

import { after } from "node:test";

import { useDejaVu } from "@standards-lab/web-tooling/fonts.js";

// The suite's own after, which closes its browser, is registered first, so it runs first.
const remove = useDejaVu();
await import("./fonts-suite.ts");
after(remove);
