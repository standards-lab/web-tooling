// The browser tier's font sets, which a test file chooses before it launches the browser: the
// machine's, the browser's own fontconfig, by default; or, by useDejaVu(), the six faces of
// Ubuntu's fonts-dejavu-core from the dejavu-fonts-ttf archive the consumer pins and names in
// DEJAVU_FONTS, one known font set on every machine, local or CI.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** A font set: its name, for test titles and diagnostics, and, for a set the test sets up, the
 * families the page must draw in: its sans for the text, its mono for the code. */
export interface Fonts {
  name: string;
  families?: { sans: string; mono: string };
}

const MACHINE: Fonts = { name: "the machine's fonts" };

const DEJAVU: Fonts = {
  name: "DejaVu",
  families: { sans: "DejaVu Sans", mono: "DejaVu Sans Mono" },
};

const DEJAVU_CORE = [
  "DejaVuSans.ttf",
  "DejaVuSans-Bold.ttf",
  "DejaVuSansMono.ttf",
  "DejaVuSansMono-Bold.ttf",
  "DejaVuSerif.ttf",
  "DejaVuSerif-Bold.ttf",
];

const DEJAVU_FOR_GENERIC = {
  "system-ui": "DejaVu Sans",
  "sans-serif": "DejaVu Sans",
  monospace: "DejaVu Sans Mono",
  serif: "DejaVu Serif",
};

let active = MACHINE;

/** The font set this test process draws in. */
export const fonts = (): Fonts => active;

const escapeXml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Sets this test process up to draw in DejaVu: writes the test-only fontconfig into a scratch
 * directory, with its cache beside it, and names it in FONTCONFIG_FILE, so a browser launched after
 * this call sees DejaVu's core set alone, every generic family resolving to its DejaVu face, as
 * Ubuntu's own configuration resolves them. Throws when DEJAVU_FONTS is unset; it names the
 * directory of a dejavu-fonts-ttf archive, whose ttf/ holds the faces. Answers the removal of the
 * scratch directory, for after the browser closes.
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
  const accepted = DEJAVU_CORE.map(
    (font) => `      <glob>${escapeXml(join(ttf, font))}</glob>`,
  ).join("\n");
  const aliases = Object.entries(DEJAVU_FOR_GENERIC)
    .map(
      ([generic, family]) =>
        `  <alias binding="same">\n    <family>${generic}</family>\n` +
        `    <prefer><family>${escapeXml(family)}</family></prefer>\n  </alias>`,
    )
    .join("\n");
  writeFileSync(
    file,
    `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig>
  <dir>${escapeXml(ttf)}</dir>
  <cachedir>${escapeXml(join(dir, "cache"))}</cachedir>
  <selectfont>
    <acceptfont>
${accepted}
    </acceptfont>
    <rejectfont>
      <glob>${escapeXml(join(ttf, "*"))}</glob>
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
