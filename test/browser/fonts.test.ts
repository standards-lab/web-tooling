// Adapted from spike-html-go-wasm (f026de3): test/browser/site-nav-layout.test.ts, running fonts-suite.ts, with useDejaVu's refusal of no DEJAVU_FONTS.

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { fonts, useDejaVu } from "@standards-lab/web-tooling/fonts.js";

describe("useDejaVu", () => {
  test("an unset DEJAVU_FONTS throws, saying so, and leaves the machine's fonts", () => {
    const saved = process.env.DEJAVU_FONTS;
    const config = process.env.FONTCONFIG_FILE;
    delete process.env.DEJAVU_FONTS;
    try {
      assert.throws(() => useDejaVu(), /DEJAVU_FONTS names no DejaVu fonts/);
      assert.equal(fonts().name, "the machine's fonts");
      assert.equal(fonts().families, undefined);
      assert.equal(process.env.FONTCONFIG_FILE, config);
    } finally {
      if (saved !== undefined) process.env.DEJAVU_FONTS = saved;
    }
  });
});

await import("./fonts-suite.ts");
