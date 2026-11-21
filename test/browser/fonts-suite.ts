// Adapted from spike-html-go-wasm (f026de3): test/browser/site-nav-layout-suite.ts, its drawnIn and its check of the chosen set.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { after, before, describe, test } from "node:test";

import { launch } from "@standards-lab/web-tooling/browser.js";
import type { Browser, Page } from "@standards-lab/web-tooling/browser.js";
import { fonts } from "@standards-lab/web-tooling/fonts.js";

interface Drawn {
  familyName: string;
  postScriptName: string;
}

const CORE = [
  "DejaVuSans",
  "DejaVuSans-Bold",
  "DejaVuSansMono",
  "DejaVuSansMono-Bold",
  "DejaVuSerif",
  "DejaVuSerif-Bold",
];

const FAMILIES = ["DejaVu Sans", "DejaVu Sans Mono", "DejaVu Serif"];

const GENERICS = {
  "system-ui": "DejaVu Sans",
  "sans-serif": "DejaVu Sans",
  monospace: "DejaVu Sans Mono",
  serif: "DejaVu Serif",
};

const OTHER_GENERICS = ["cursive", "fantasy", "math", "emoji", "ui-sans-serif", "ui-monospace"];

const ELSEWHERE = ["Arial", "Liberation Sans", "Noto Sans", "Times New Roman", "no such font"];

const CORE_NAMES = [
  "DejaVu Sans",
  "DejaVu Sans Bold",
  "DejaVu Sans Mono",
  "DejaVu Sans Mono Bold",
  "DejaVu Serif",
  "DejaVu Serif Bold",
];

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

function fontconfig(tool: string, args: string[]): string[] | undefined {
  const env = { ...process.env };
  if (fonts().families) delete env.FONTCONFIG_FILE;
  try {
    return execFileSync(tool, args, { encoding: "utf8", env }).split("\n").filter(Boolean);
  } catch {
    return undefined;
  }
}

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

const family = (name: string) =>
  name in GENERICS || OTHER_GENERICS.includes(name) ? name : `"${name}"`;

const page = (families: string[], weight: number, style: string): string =>
  `data:text/html,${encodeURIComponent(
    families
      .map(
        (name, index) =>
          `<p id="p${index}" style='font: ${style} ${weight} 16px ${family(name)}'>Hello, fonts</p>`,
      )
      .join(""),
  )}`;

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
    test(`the page draws its text in ${families.sans} and its code in ${families.mono}`, async () => {
      const [sans, mono] = await drawn(["sans-serif", "monospace"]);
      assert.deepEqual(
        sans.map(({ familyName }) => familyName),
        [families.sans],
      );
      assert.deepEqual(
        mono.map(({ familyName }) => familyName),
        [families.mono],
      );
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
