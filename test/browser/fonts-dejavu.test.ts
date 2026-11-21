// Adapted from spike-html-go-wasm (f026de3): test/browser/site-nav-layout-dejavu.test.ts, running fonts-suite.ts, with useDejaVu from the package.

import { after } from "node:test";

import { useDejaVu } from "@standards-lab/web-tooling/fonts.js";

const remove = useDejaVu();
await import("./fonts-suite.ts");
after(remove);
