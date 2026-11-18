// Adapted from spike-html-go-wasm (f026de3): test/browser/fonts.ts, as a package export that names
// the archive's install by DEJAVU_FONTS for any consumer, not the spike's browser task alone.
// The browser tier's font sets, which a test file chooses before it launches the browser: the
// machine's, the browser's own fontconfig, by default; or, by useDejaVu(), a pinned DejaVu set, the
// six faces of Ubuntu's fonts-dejavu-core, so every machine, local or CI, also proves a page in one
// known font set.
//
// DejaVu is the release archive of dejavu-fonts-ttf at a pinned sha256, which the consumer
// installs (as http:dejavu-fonts in its mise.toml) and names in DEJAVU_FONTS, the archive's
// install directory, as BROWSER_EXECUTABLE names the browser. The fontconfig useDejaVu() writes is
// test-only, in a scratch directory under TMPDIR, and lets the browser see nothing but Ubuntu's
// fonts-dejavu-core set, Sans, Sans Mono, and Serif, each regular and bold, from the archive's
// ttf/, with every generic family a font stack ends on (system-ui, sans-serif, monospace, serif)
// resolving to its DejaVu face, as Ubuntu's own configuration resolves them. launch() spawns the
// browser in the test process's environment, so FONTCONFIG_FILE, set here before the launch, is
// the browser's.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** A font set: its name, for test titles and diagnostics, and, for a set the test sets up, the
 * families the page must draw in: its sans for the text, its mono for the code. */
export interface Fonts {
  name: string;
  families?: { sans: string; mono: string };
}

/** The machine's fonts, the browser's own fontconfig. */
const MACHINE: Fonts = { name: "the machine's fonts" };

/** DejaVu, as useDejaVu() sets it up. */
const DEJAVU: Fonts = {
  name: "DejaVu",
  families: { sans: "DejaVu Sans", mono: "DejaVu Sans Mono" },
};

/** The six faces of Ubuntu's fonts-dejavu-core, as files in the archive's ttf/. */
const CORE = [
  "DejaVuSans.ttf",
  "DejaVuSans-Bold.ttf",
  "DejaVuSansMono.ttf",
  "DejaVuSansMono-Bold.ttf",
  "DejaVuSerif.ttf",
  "DejaVuSerif-Bold.ttf",
];

/** Each generic family a font stack ends on, and the DejaVu family it resolves to. */
const GENERICS = {
  "system-ui": "DejaVu Sans",
  "sans-serif": "DejaVu Sans",
  monospace: "DejaVu Sans Mono",
  serif: "DejaVu Serif",
};

let active = MACHINE;

/** The font set this test process draws in. */
export const fonts = (): Fonts => active;

/** XML's escape of a path or a name in the fontconfig. */
const xml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Sets this test process up to draw in DejaVu: writes the test-only fontconfig into a scratch
 * directory, with its cache beside it, and names it in FONTCONFIG_FILE, so a browser launched after
 * this call sees DejaVu's core set alone. Throws when DEJAVU_FONTS is unset; it names the
 * directory of a dejavu-fonts-ttf archive, whose ttf/ holds the faces. Answers the removal of the scratch directory, for after the browser
 * closes.
 */
export function useDejaVu(): () => void {
  const installed = process.env.DEJAVU_FONTS;
  if (!installed) {
    throw new Error(
      "DEJAVU_FONTS names no DejaVu fonts; set it to the directory of a dejavu-fonts-ttf archive",
    );
  }
  const ttf = join(installed, "ttf");
  const dir = mkdtempSync(join(tmpdir(), "dejavu-fonts-"));
  const file = join(dir, "fonts.conf");
  const accepted = CORE.map((font) => `      <glob>${xml(join(ttf, font))}</glob>`).join("\n");
  const aliases = Object.entries(GENERICS)
    .map(
      ([generic, family]) =>
        `  <alias binding="same">\n    <family>${generic}</family>\n` +
        `    <prefer><family>${xml(family)}</family></prefer>\n  </alias>`,
    )
    .join("\n");
  writeFileSync(
    file,
    `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <dir>${xml(ttf)}</dir>
  <cachedir>${xml(join(dir, "cache"))}</cachedir>
  <selectfont>
    <acceptfont>
${accepted}
    </acceptfont>
    <rejectfont>
      <glob>${xml(join(ttf, "*"))}</glob>
    </rejectfont>
  </selectfont>
${aliases}
</fontconfig>
`,
  );
  process.env.FONTCONFIG_FILE = file;
  active = DEJAVU;
  return () => rmSync(dir, { recursive: true, force: true });
}
