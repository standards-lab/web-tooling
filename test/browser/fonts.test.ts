// Adapted from spike-html-go-wasm (f026de3): test/browser/site-nav-layout.test.ts, running
// fonts-suite.ts, with useDejaVu's refusal of an unset DEJAVU_FONTS.
// The font set in the machine's fonts, the default when the test file chooses none: fonts-suite.ts's
// tests, as that suite says. fonts-dejavu.test.ts runs the same suite in the pinned DejaVu set.
// useDejaVu() with no DEJAVU_FONTS throws before it changes anything, so the machine's fonts stay
// this file's set.

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
      assert.equal(process.env.FONTCONFIG_FILE, config);
    } finally {
      if (saved !== undefined) process.env.DEJAVU_FONTS = saved;
    }
  });
});

await import("./fonts-suite.ts");
