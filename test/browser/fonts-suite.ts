// The font set at the package's seam, imported by the package's own name as a consumer imports it:
// the faces a browser launched in the test file's set draws a page in. fonts.test.ts runs it in the
// machine's fonts and fonts-dejavu.test.ts in the pinned DejaVu set, which that file chooses
// before this suite's browser launches. In DejaVu, every face drawn is one of the six of
// fonts-dejavu-core, whatever the family, weight, or style asked for; every generic family draws
// in DejaVu; and local() finds the six faces alone, not the archive's others. In the machine's
// fonts, a family the machine's fontconfig lists outside DejaVu draws in that family.
// Adapted from spike-html-go-wasm (f026de3): test/browser/site-nav-layout-suite.ts, its drawnIn
// and its check that the page draws in the set the test file chose.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { after, before, describe, test } from "node:test";
import { launch } from "@standards-lab/web-tooling/browser.js";
import type { Browser, Page } from "@standards-lab/web-tooling/browser.js";
import { fonts } from "@standards-lab/web-tooling/fonts.js";

/** A face the platform draws text in, as CSS.getPlatformFontsForNode reports it. */
interface Drawn {
  familyName: string;
  postScriptName: string;
}

/** The six faces of fonts-dejavu-core, by their PostScript names. */
const CORE = [
  "DejaVuSans",
  "DejaVuSans-Bold",
  "DejaVuSansMono",
  "DejaVuSansMono-Bold",
  "DejaVuSerif",
  "DejaVuSerif-Bold",
];

/** The six faces' families. */
const FAMILIES = ["DejaVu Sans", "DejaVu Sans Mono", "DejaVu Serif"];

/** The generic families useDejaVu() names, each with the family it resolves to. */
const GENERICS = {
  "system-ui": "DejaVu Sans",
  "sans-serif": "DejaVu Sans",
  monospace: "DejaVu Sans Mono",
  serif: "DejaVu Serif",
};

/** The generic families it doesn't name, which resolve to one of the six's families all the
 * same. */
const OTHER_GENERICS = ["cursive", "fantasy", "math", "emoji", "ui-sans-serif", "ui-monospace"];

/** Families outside the six, a machine's or no font's at all. */
const ELSEWHERE = ["Arial", "Liberation Sans", "Noto Sans", "Times New Roman", "no such font"];

/** The six faces' full names, which local() finds in DejaVu. */
const CORE_NAMES = [
  "DejaVu Sans",
  "DejaVu Sans Bold",
  "DejaVu Sans Mono",
  "DejaVu Sans Mono Bold",
  "DejaVu Serif",
  "DejaVu Serif Bold",
];

/** Faces of the archive's ttf/ outside the six, by their full names, which local() never finds in
 * DejaVu. */
const ARCHIVE_NAMES = [
  "DejaVu Sans Oblique",
  "DejaVu Sans Bold Oblique",
  "DejaVu Sans ExtraLight",
  "DejaVu Sans Condensed",
  "DejaVu Sans Mono Oblique",
  "DejaVu Serif Italic",
  "DejaVu Serif Condensed",
  "DejaVu Math TeX Gyre",
];

/** The lines a fontconfig tool answers the query with, from the machine's fontconfig, not the
 * DejaVu set's, or none when the tool is missing. */
function fontconfig(tool: string, args: string[]): string[] | undefined {
  // useDejaVu() names its fontconfig in FONTCONFIG_FILE; the machine's is the default one.
  const env = { ...process.env };
  if (fonts().families) delete env.FONTCONFIG_FILE;
  try {
    return execFileSync(tool, args, { encoding: "utf8", env }).split("\n").filter(Boolean);
  } catch {
    return undefined;
  }
}

/** A family the machine's fontconfig lists, as its names, outside DejaVu, with outlines and
 * English's glyphs, which the machine's fontconfig matches to itself rather than aliasing it to
 * another; none when fc-list is missing or lists no such family. The first in sort order, so a
 * machine names the same one each run. */
function machineFamily(): string[] | undefined {
  const listed = fontconfig("fc-list", [
    ":lang=en:outline=true:style=Regular",
    "--format=%{family}\n",
  ]);
  return listed
    ?.sort()
    .map((row) => row.split(","))
    .filter((names) => !names.some((name) => name.startsWith("DejaVu")))
    .find((names) =>
      fontconfig("fc-match", [names[0], "--format=%{family}\n"])?.[0]
        ?.split(",")
        .includes(names[0]),
    );
}

/** The family list as a font-family value, each name quoted, but for a generic family. */
const family = (name: string) =>
  name in GENERICS || OTHER_GENERICS.includes(name) ? name : `"${name}"`;

/** A page of one paragraph per family, in the weight and style. */
const page = (families: string[], weight: number, style: string): string =>
  `data:text/html,${encodeURIComponent(
    families
      .map(
        (name, index) =>
          `<p id="p${index}" style='font: ${style} ${weight} 16px ${family(name)}'>Hello, fonts</p>`,
      )
      .join(""),
  )}`;

/** The faces the platform draws the paragraph's own text in. */
async function drawnIn(tab: Page, index: number): Promise<Drawn[]> {
  await tab.cdp("DOM.enable");
  await tab.cdp("CSS.enable");
  await tab.cdp("DOM.getDocument", { depth: -1 });
  const { result } = await tab.cdp("Runtime.evaluate", {
    expression: `document.getElementById("p${index}")`,
  });
  assert.ok(result.objectId, `p${index} gives an element`);
  const { nodeId } = await tab.cdp("DOM.requestNode", { objectId: result.objectId });
  const { fonts: drawn }: { fonts: Drawn[] } = await tab.cdp("CSS.getPlatformFontsForNode", {
    nodeId,
  });
  return drawn;
}

/** The faces each family draws in, in the weight and style, by family. */
async function drawn(families: string[], weight = 400, style = "normal"): Promise<Drawn[][]> {
  const tab = await browser.open(page(families, weight, style));
  try {
    const faces = [];
    for (const index of families.keys()) faces.push(await drawnIn(tab, index));
    return faces;
  } finally {
    await tab.close();
  }
}

/** Whether local() finds a face of the full name, by a FontFace's load. */
async function found(names: string[]): Promise<boolean[]> {
  const tab = await browser.open("about:blank");
  try {
    return await tab.evaluate(`Promise.all(${JSON.stringify(names)}.map((name, index) =>
      new FontFace("local-" + index, "local('" + name + "')").load().then(() => true, () => false)))`);
  } finally {
    await tab.close();
  }
}

let browser: Browser;
before(async () => {
  browser = await launch();
});
after(async () => {
  await browser?.close();
});

const { families } = fonts();
if (families) {
  describe(`the font set, ${fonts().name}`, () => {
    test(`the set's families are ${families.sans} and ${families.mono}`, () => {
      assert.deepEqual(families, { sans: "DejaVu Sans", mono: "DejaVu Sans Mono" });
    });

    test("every generic family draws in its DejaVu family", async () => {
      const named = Object.keys(GENERICS);
      const faces = await drawn([...named, ...OTHER_GENERICS]);
      for (const [index, generic] of named.entries()) {
        assert.deepEqual(
          faces[index].map(({ familyName }) => familyName),
          [GENERICS[generic as keyof typeof GENERICS]],
          generic,
        );
      }
      for (const [index, generic] of OTHER_GENERICS.entries()) {
        const drawnFamilies = faces[named.length + index].map(({ familyName }) => familyName);
        assert.ok(
          drawnFamilies.length > 0 && drawnFamilies.every((name) => FAMILIES.includes(name)),
          `${generic} draws in ${drawnFamilies.join(", ")}`,
        );
      }
    });

    test("every face drawn is one of the six, in each weight and style, for any family", async () => {
      const machine = machineFamily();
      const asked = [
        ...Object.keys(GENERICS),
        ...OTHER_GENERICS,
        ...FAMILIES,
        ...ELSEWHERE,
        ...(machine ? [machine[0]] : []),
      ];
      for (const weight of [400, 700]) {
        for (const style of ["normal", "italic"]) {
          const faces = await drawn(asked, weight, style);
          for (const [index, name] of asked.entries()) {
            const names = faces[index].map(({ postScriptName }) => postScriptName);
            assert.ok(
              names.length > 0 && names.every((face) => CORE.includes(face)),
              `${name} at ${weight} ${style} draws in ${names.join(", ")}`,
            );
          }
        }
      }
    });

    test("local() finds the six faces and none of the archive's others", async () => {
      assert.deepEqual(
        await found(CORE_NAMES),
        CORE_NAMES.map(() => true),
      );
      assert.deepEqual(
        await found(ARCHIVE_NAMES),
        ARCHIVE_NAMES.map(() => false),
      );
    });
  });
} else {
  describe(`the font set, ${fonts().name}`, () => {
    test("names no families for the page to draw in", () => {
      assert.equal(fonts().families, undefined);
    });

    const machine = machineFamily();
    test(
      "a family the machine's fontconfig lists outside DejaVu draws in that family",
      { skip: machine ? false : "fc-list lists no family outside DejaVu, or is missing" },
      async () => {
        const [faces] = await drawn([machine![0]]);
        const drawnFamilies = faces.map(({ familyName }) => familyName);
        assert.ok(
          drawnFamilies.length > 0 && drawnFamilies.every((name) => machine!.includes(name)),
          `${machine![0]} draws in ${drawnFamilies.join(", ")}`,
        );
      },
    );
  });
}
