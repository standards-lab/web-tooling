import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { pathToFileURL } from "node:url";
import { after, before, describe, test } from "node:test";

const root = join(import.meta.dirname, "../..");
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const bin = join(root, manifest.bin["web-screenshots"]);
const description = join(import.meta.dirname, "fixtures/screenshots/description.ts");
const stub = join(import.meta.dirname, "fixtures/screenshots/stub.js");

const scratches: string[] = [];
after(() => {
  for (const scratch of scratches) rmSync(scratch, { recursive: true, force: true });
});

function scratchDir(): string {
  const scratch = mkdtempSync(join(tmpdir(), "screenshots-test."));
  scratches.push(scratch);
  return scratch;
}

interface Report {
  kind: string;
  page: string;
  id: string;
  focusVisible: boolean;
  attributes: Record<string, string>;
  dark: boolean;
  updated: boolean;
}

interface Run {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  reports: Report[];
}

function run(
  args: string[],
  {
    env = {},
    describe = true,
    interrupt = false,
  }: { env?: Record<string, string | undefined>; describe?: boolean; interrupt?: boolean } = {},
): Promise<Run> {
  const log = join(scratchDir(), "log.jsonl");
  const childEnv: Record<string, string | undefined> = {
    ...process.env,
    NVIM: undefined,
    SCREENSHOTS_LOG: log,
    ...env,
  };
  for (const [name, value] of Object.entries(childEnv)) {
    if (value === undefined) delete childEnv[name];
  }
  const child = spawn(bin, describe ? [description, ...args] : args, {
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => {
    stdout += chunk;
    if (interrupt) child.kill("SIGINT");
  });
  child.stderr.setEncoding("utf8").on("data", (chunk) => (stderr += chunk));
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      const lines = existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : [];
      const reports: Report[] = lines.filter(Boolean).map((l) => JSON.parse(l));
      resolve({ code, signal, stdout, stderr, reports });
    });
  });
}

function png(path: string): { width: number; height: number } {
  const bytes = readFileSync(path);
  assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(bytes.toString("latin1", 12, 16), "IHDR", path);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

const printed = (dir: string, shots: [string, string][]): string =>
  shots.map(([name, caption]) => `${caption}\n  ${join(dir, name)}\n`).join("");

const DIRECTORY = ["--output", "directory"];

const DEFAULT = "dawn-wide-plain";
const DEFAULT_CAPTION = "dawn, wide, plain";

describe("every page, by default, to a directory", () => {
  let dir: string;
  let result: Run;
  before(async () => {
    dir = join(scratchDir(), "made", "here");
    result = await run([...DIRECTORY, "--dir", dir]);
  });

  const shots = ["light", "dark"]
    .flatMap((scheme) =>
      [1, 2, 3, 4].map((k): [string, string] => [
        `1-long--${DEFAULT}-${scheme}--${k}of4.png`,
        `the long page: ${DEFAULT_CAPTION}, ${scheme} (${k} of 4)`,
      ]),
    )
    .concat(
      ["light", "dark"].map((scheme): [string, string] => [
        `2-focus--${DEFAULT}-${scheme}.png`,
        `the focus page: ${DEFAULT_CAPTION}, ${scheme}`,
      ]),
      ["light", "dark"].map((scheme): [string, string] => [
        `3-narrow-open--${DEFAULT}-${scheme}.png`,
        `the narrow page, opened: ${DEFAULT_CAPTION}, ${scheme}`,
      ]),
    );

  test("captures every page, both schemes, at the default profile, printing each", () => {
    assert.equal(result.stderr, "");
    assert.equal(result.code, 0);
    assert.equal(result.stdout, printed(dir, shots));
    assert.deepEqual(readdirSync(dir).sort(), shots.map(([name]) => name).sort());
  });

  test("a full page is 1280 wide, its tiles cut at a section's top, then a state's", () => {
    for (const scheme of ["light", "dark"]) {
      const heights = [1, 2, 3, 4].map((k) => {
        const size = png(join(dir, `1-long--${DEFAULT}-${scheme}--${k}of4.png`));
        assert.equal(size.width, 1280);
        return size.height;
      });
      assert.deepEqual(heights, [1000, 800, 1200, 400]);
    }
    assert.deepEqual(png(join(dir, `2-focus--${DEFAULT}-light.png`)), { width: 1280, height: 800 });
  });

  test("a viewport state is captured at its own size", () => {
    for (const scheme of ["light", "dark"]) {
      assert.deepEqual(png(join(dir, `3-narrow-open--${DEFAULT}-${scheme}.png`)), {
        width: 390,
        height: 300,
      });
    }
  });

  test("focus is reached by real Tab presses from the focus-start mark", () => {
    const focus = result.reports.filter(({ kind }) => kind === "focus");
    assert.deepEqual(
      focus.map(({ page, id, focusVisible }) => [page, id, id === "start" || focusVisible]),
      ["light", "dark"].flatMap(() => [
        ["/focus.html", "start", true],
        ["/focus.html", "b1", true],
        ["/focus.html", "b2", true],
      ]),
    );
    assert.ok(focus.every(({ updated }) => updated));
  });

  test("prepare runs before the root's attributes are set, open after", () => {
    const prepared = result.reports.filter(({ kind }) => kind === "prepare");
    assert.equal(prepared.length, 6);
    assert.ok(prepared.every(({ attributes }) => !("data-scheme" in attributes)));
    const opened = result.reports.filter(({ kind }) => kind === "open");
    assert.deepEqual(
      opened.map(({ page, attributes, dark }) => [page, attributes, dark]),
      ["light", "dark"].map((scheme) => [
        "/narrow.html",
        {
          "data-palette": "dawn",
          "data-space": "wide",
          "data-type": "plain",
          "data-scheme": scheme,
        },
        scheme === "dark",
      ]),
    );
  });
});

describe("the flags", () => {
  test("a facet flag sets that facet over the defaults", async () => {
    const dir = scratchDir();
    const result = await run([
      ...DIRECTORY,
      "--type",
      "fancy",
      "--page",
      "focus",
      "--scheme",
      "dark",
      "--dir",
      dir,
    ]);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(
      result.stdout,
      printed(dir, [
        ["2-focus--dawn-wide-fancy-dark.png", "the focus page: dawn, wide, fancy, dark"],
      ]),
    );
    assert.deepEqual(readdirSync(dir), ["2-focus--dawn-wide-fancy-dark.png"]);
    const [focus] = result.reports.filter(({ kind }) => kind === "focus");
    assert.deepEqual(focus.attributes, {
      "data-palette": "dawn",
      "data-space": "wide",
      "data-type": "fancy",
      "data-scheme": "dark",
    });
    assert.equal(focus.dark, true);
  });

  test("the facet flags combine", async () => {
    const dir = scratchDir();
    const args = ["--palette", "dusk", "--space", "tight", "--type", "fancy"];
    const result = await run([
      ...DIRECTORY,
      ...args,
      "--page",
      "focus",
      "--scheme",
      "light",
      "--dir",
      dir,
    ]);
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(readdirSync(dir), ["2-focus--dusk-tight-fancy-light.png"]);
    assert.match(result.stdout, /^the focus page: dusk, tight, fancy, light\n/);
    const [focus] = result.reports.filter(({ kind }) => kind === "focus");
    assert.deepEqual(focus.attributes, {
      "data-palette": "dusk",
      "data-space": "tight",
      "data-type": "fancy",
      "data-scheme": "light",
    });
    assert.equal(focus.dark, false);
  });

  test("--all captures the description's matrix, each over the defaults", async () => {
    const dir = scratchDir();
    const result = await run([
      ...DIRECTORY,
      "--all",
      "--page",
      "focus",
      "--scheme",
      "light",
      "--dir",
      dir,
    ]);
    assert.equal(result.code, 0, result.stderr);
    const profiles = ["dawn-wide-plain", "dusk-wide-plain", "dawn-tight-plain", "dawn-wide-fancy"];
    assert.equal(
      result.stdout,
      printed(
        dir,
        profiles.map((profile): [string, string] => [
          `2-focus--${profile}-light.png`,
          `the focus page: ${profile.split("-").join(", ")}, light`,
        ]),
      ),
    );
  });

  test("--page, repeated, captures the pages named in the description's order, one scheme", async () => {
    const dir = scratchDir();
    const result = await run([
      ...DIRECTORY,
      "--page",
      "narrow",
      "--page",
      "focus",
      "--scheme",
      "dark",
      "--dir",
      dir,
    ]);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(
      result.stdout,
      printed(dir, [
        [`2-focus--${DEFAULT}-dark.png`, `the focus page: ${DEFAULT_CAPTION}, dark`],
        [`3-narrow-open--${DEFAULT}-dark.png`, `the narrow page, opened: ${DEFAULT_CAPTION}, dark`],
      ]),
    );
    assert.deepEqual(readdirSync(dir).sort(), [
      `2-focus--${DEFAULT}-dark.png`,
      `3-narrow-open--${DEFAULT}-dark.png`,
    ]);
  });

  test("with no --dir, the files go to a fresh screenshots.XXXXXX under TMPDIR, kept", async () => {
    const temp = scratchDir();
    const result = await run([...DIRECTORY, "--page", "focus", "--scheme", "light"], {
      env: { TMPDIR: temp },
    });
    assert.equal(result.code, 0, result.stderr);
    const made = readdirSync(temp);
    assert.equal(made.length, 1);
    assert.match(made[0], /^screenshots\.[A-Za-z0-9]{6}$/);
    const dir = join(temp, made[0]);
    assert.deepEqual(readdirSync(dir), [`2-focus--${DEFAULT}-light.png`]);
    assert.equal(
      result.stdout,
      printed(dir, [
        [`2-focus--${DEFAULT}-light.png`, `the focus page: ${DEFAULT_CAPTION}, light`],
      ]),
    );
  });

  test("a profile registered once the page has rendered is accepted", async () => {
    const dir = scratchDir();
    const result = await run([
      ...DIRECTORY,
      "--palette",
      "extra",
      "--page",
      "focus",
      "--scheme",
      "light",
      "--dir",
      dir,
    ]);
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(readdirSync(dir), ["2-focus--extra-wide-plain-light.png"]);
  });
});

describe("exit 2", () => {
  const unlaunched = { env: { BROWSER_EXECUTABLE: undefined } };
  const usage =
    "usage: web-screenshots <description> [--all | [--palette <name>] [--space <name>] [--type <name>]] [--page <name>]... [--scheme light|dark] [--output terminal|directory|browser] [--dir <path>] [--keep] [-h | --help]\n";

  test("a usage error prints the usage", async () => {
    for (const args of [
      ["--bogus"],
      ["--palette"],
      ["extra-positional"],
      ["--scheme", "blue"],
      ["--scheme", "light", "--scheme", "dark"],
      ["--output", "printer"],
    ]) {
      const result = await run(args, unlaunched);
      assert.equal(result.code, 2, args.join(" "));
      assert.ok(result.stderr.endsWith(usage), `${args.join(" ")}: ${result.stderr}`);
      assert.equal(result.stdout, "");
    }
    const bare = await run([], { ...unlaunched, describe: false });
    assert.equal(bare.code, 2);
    assert.match(
      bare.stderr,
      /^usage: web-screenshots <description> \[--all\] .* \[-h \| --help\]\n$/,
    );
  });

  test("--all with a facet flag", async () => {
    const result = await run(["--all", "--space", "tight"], unlaunched);
    assert.equal(result.code, 2);
    assert.equal(result.stderr, `web-screenshots: --all takes no facet flag\n${usage}`);
  });

  test("an unknown page lists the pages, before launch", async () => {
    const dir = join(scratchDir(), "out");
    const result = await run(["--page", "focus", "--page", "nope", "--dir", dir], unlaunched);
    assert.equal(result.code, 2);
    assert.equal(
      result.stderr,
      "web-screenshots: unknown page nope; the pages: long, focus, narrow\n",
    );
    assert.equal(existsSync(dir), false);
  });

  test("an unregistered profile names the facet's registered names, after load, before any capture", async () => {
    const dir = join(scratchDir(), "out");
    const args = ["--palette", "extra", "--page", "focus", "--page", "narrow", "--dir", dir];
    const result = await run(args);
    assert.equal(result.code, 2);
    assert.equal(
      result.stderr,
      "web-screenshots: unknown palette extra; the palettes narrow.html registers: dawn, dusk\n",
    );
    assert.equal(result.stdout, "");
    assert.equal(existsSync(dir), false);
    const unlaunchedResult = await run(args, unlaunched);
    assert.equal(unlaunchedResult.code, 1);
    assert.match(unlaunchedResult.stderr, /BROWSER_EXECUTABLE names no browser/);
  });
});

describe("--help", () => {
  const unlaunched = (temp: string) => ({ env: { BROWSER_EXECUTABLE: undefined, TMPDIR: temp } });
  const usage =
    "usage: web-screenshots <description> [--all | [--palette <name>] [--space <name>] [--type <name>]] [--page <name>]... [--scheme light|dark] [--output terminal|directory|browser] [--dir <path>] [--keep] [-h | --help]\n";
  const sections = (stdout: string): Record<string, string[]> =>
    Object.fromEntries(
      stdout
        .replace(/\n$/, "")
        .split("\n\n")
        .map((part) => part.split("\n"))
        .filter(([heading]) => heading.endsWith(":"))
        .map(([heading, ...lines]) => [heading, lines]),
    );
  const FLAGS = [
    "--<facet>",
    "--all",
    "--page",
    "--scheme",
    "--output",
    "--dir",
    "--keep",
    "-h, --help",
  ];
  const assertCommon = (found: Record<string, string[]>): void => {
    assert.deepEqual(
      found["flags:"].map((line) => FLAGS.find((flag) => line.startsWith(`  ${flag}`))),
      FLAGS,
    );
    assert.deepEqual(
      found["schemes:"].map((line) => line.trim().split(" ")[0]),
      ["light", "dark"],
    );
    assert.deepEqual(
      found["outputs:"].map((line) => line.trim().split(" ")[0]),
      ["terminal", "directory", "browser"],
    );
    assert.match(found["outputs:"][0], /^ {2}terminal {3}the default: /);
    assert.deepEqual(
      found["exit codes:"].map((line) => line.trim().split(" ")[0]),
      ["0", "1", "2", "130", "143"],
    );
  };

  test("over the description: the usage, the flags, its pages and facets, before launch", async () => {
    const temp = scratchDir();
    const result = await run(["--help"], unlaunched(temp));
    assert.equal(result.stderr, "");
    assert.equal(result.code, 0);
    assert.ok(result.stdout.startsWith(usage), result.stdout);
    const found = sections(result.stdout);
    assert.deepEqual(found["pages:"], [
      "  long    the long page",
      "  focus   the focus page",
      "  narrow  the narrow page",
    ]);
    assert.deepEqual(found["facets:"], [
      "  --palette <name>  sets data-palette; default dawn; names: dawn, dusk",
      "  --space <name>    sets data-space; default wide; names: wide, tight",
      "  --type <name>     sets data-type; default plain; names: plain, fancy",
      "  A facet's names are its default and those the description's --all profiles give.",
      "  A run still checks each name it is given against each page's registered names.",
    ]);
    assertCommon(found);
    assert.deepEqual(readdirSync(temp), []);
  });

  test("wins over the other flags, -h as well, a bad one included", async () => {
    const temp = scratchDir();
    const dir = join(temp, "out");
    const help = await run(["--help"], unlaunched(temp));
    for (const args of [
      ["--page", "focus", "--dir", dir, "--help"],
      ["--bogus", "--page", "nope", "--dir", dir, "-h"],
      ["--all", "--palette", "dusk", "--help"],
    ]) {
      const result = await run(args, unlaunched(temp));
      assert.equal(result.code, 0, args.join(" "));
      assert.equal(result.stderr, "", args.join(" "));
      assert.equal(result.stdout, help.stdout, args.join(" "));
    }
    assert.deepEqual(readdirSync(temp), []);
  });

  test("with no description: the general usage and flags, no pages or facets", async () => {
    const temp = scratchDir();
    for (const args of [["--help"], ["-h", "--page", "focus"]]) {
      const result = await run(args, { ...unlaunched(temp), describe: false });
      assert.equal(result.code, 0, args.join(" "));
      assert.equal(result.stderr, "");
      assert.match(
        result.stdout,
        /^usage: web-screenshots <description> \[--all\] \[--page <name>\]/,
      );
      const found = sections(result.stdout);
      assert.equal(found["pages:"], undefined);
      assert.equal(found["facets:"], undefined);
      assert.match(
        result.stdout,
        /\nweb-screenshots <description> --help also lists the description's pages and facets\.\n/,
      );
      assertCommon(found);
    }
    assert.deepEqual(readdirSync(temp), []);
  });

  test("a facet can't take the flag --help, with --help or without", async () => {
    const scratch = scratchDir();
    const module = (flag: string): string => {
      const path = join(scratch, `${flag}.js`);
      writeFileSync(
        path,
        `export default { pages: [{ name: "a", caption: "the a page", path: "a.html" }], ` +
          `facets: [{ flag: ${JSON.stringify(flag)}, attribute: "data-x", default: "x" }] };\n`,
      );
      return path;
    };
    const refused = module("help");
    for (const args of [[refused], [refused, "--help"]]) {
      const result = await run(args, { ...unlaunched(scratchDir()), describe: false });
      assert.equal(result.code, 1, args.join(" "));
      assert.match(result.stderr, /help\.js: a facet can't take the flag --help/);
      assert.equal(result.stdout, "");
    }
    const taken = await run([module("helper"), "--help"], {
      ...unlaunched(scratchDir()),
      describe: false,
    });
    assert.equal(taken.code, 0, taken.stderr);
    assert.match(taken.stdout, /\n {2}--helper <name> {2}sets data-x; default x; names: x\n/);
  });

  test("a .ts description, its types erasable, loads", async () => {
    const path = join(scratchDir(), "description.ts");
    writeFileSync(
      path,
      `import type { Description } from "@standards-lab/web-tooling/screenshots.js";\n` +
        `const description: Description = {\n` +
        `  pages: [{ name: "typed", caption: "the typed page", path: "typed.html" }],\n` +
        `};\n` +
        `export default description;\n`,
    );
    const result = await run([path, "--help"], {
      ...unlaunched(scratchDir()),
      describe: false,
    });
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(sections(result.stdout)["pages:"], ["  typed  the typed page"]);
  });
});

interface Call {
  name: string;
  args: string[];
  terminal: boolean;
  tty: boolean;
}

function stubbed(
  names: string[],
  statuses: Record<string, number> = {},
): { env: Record<string, string>; calls: () => Call[] } {
  const dir = scratchDir();
  for (const name of names) symlinkSync(stub, join(dir, name));
  symlinkSync(process.execPath, join(dir, "node"));
  const log = join(dir, "calls.jsonl");
  return {
    env: {
      PATH: dir,
      STUB_LOG: log,
      STUB_EXIT: JSON.stringify(statuses),
    },
    calls: () =>
      existsSync(log)
        ? readFileSync(log, "utf8")
            .trim()
            .split("\n")
            .map((line): Call => JSON.parse(line))
        : [],
  };
}

function which(name: string): string {
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (existsSync(join(dir, name))) return join(dir, name);
  }
  throw new Error(`${name} is not on PATH`);
}

const quote = (word: string): string => `'${word.replaceAll("'", `'\\''`)}'`;

function runInPty(
  args: string[],
  { env, setsid = false }: { env: Record<string, string>; setsid?: boolean },
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const stderrFile = join(scratchDir(), "stderr");
  const command = [
    ...Object.entries(env).map(([name, value]) => `${name}=${quote(value)}`),
    "exec",
    ...(setsid ? [quote(which("setsid")), "-w"] : []),
    ...[bin, description, ...args].map(quote),
    `2>${quote(stderrFile)}`,
  ].join(" ");
  const childEnv = { ...process.env };
  delete childEnv.NVIM;
  const child = spawn("script", ["-qec", command, "/dev/null"], {
    env: childEnv,
    stdio: ["ignore", "pipe", "inherit"],
  });
  let stdout = "";
  child.stdout.setEncoding("utf8").on("data", (chunk) => (stdout += chunk));
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) =>
      resolve({
        code,
        stdout: stdout.replaceAll("\r\n", "\n"),
        stderr: readFileSync(stderrFile, "utf8"),
      }),
    );
  });
}

const TWO_PAGES: [string, string][] = [
  [`2-focus--${DEFAULT}-light.png`, `the focus page: ${DEFAULT_CAPTION}, light`],
  [`2-focus--${DEFAULT}-dark.png`, `the focus page: ${DEFAULT_CAPTION}, dark`],
  [`3-narrow-open--${DEFAULT}-light.png`, `the narrow page, opened: ${DEFAULT_CAPTION}, light`],
  [`3-narrow-open--${DEFAULT}-dark.png`, `the narrow page, opened: ${DEFAULT_CAPTION}, dark`],
];
const TWO_PAGE_ARGS = ["--page", "focus", "--page", "narrow"];

const fallback = (reason: string): string =>
  `web-screenshots: no images shown: ${reason}; --output browser shows them in a browser\n`;

const ICAT = ["--transfer-mode=stream", "--align=left", "--fit=both"];

describe("--output terminal", () => {
  test("is the default; with stdout not a terminal, it prints, says why, calls no icat, and removes its files", async () => {
    const dir = join(scratchDir(), "made");
    const stubs = stubbed(["kitten", "kitty", "xdg-open"]);
    const result = await run([...TWO_PAGE_ARGS, "--dir", dir], { env: stubs.env });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, printed(dir, TWO_PAGES));
    assert.equal(result.stderr, fallback("stdout is not a terminal"));
    assert.deepEqual(stubs.calls(), []);
    assert.equal(existsSync(dir), false);
  });

  test("--keep keeps the files and prints their directory", async () => {
    const dir = join(scratchDir(), "made");
    const stubs = stubbed(["kitten"]);
    const result = await run(["--output", "terminal", ...TWO_PAGE_ARGS, "--dir", dir, "--keep"], {
      env: stubs.env,
    });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, `${printed(dir, TWO_PAGES)}kept in ${dir}\n`);
    assert.deepEqual(readdirSync(dir).sort(), TWO_PAGES.map(([name]) => name).sort());
  });

  test("inside a Neovim terminal, the reason names it", async () => {
    const stubs = stubbed(["kitten"]);
    const env = { ...stubs.env, NVIM: "/run/user/1000/nvim.1.0" };
    const result = await run(["--page", "focus", "--scheme", "light"], { env });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(
      result.stderr,
      fallback("inside a Neovim :terminal (no pixel size, graphics not passed through)"),
    );
    assert.deepEqual(stubs.calls(), []);
  });

  test("in a terminal icat supports, each image is shown by kitten icat, in order, after its caption", async () => {
    const dir = join(scratchDir(), "made");
    const stubs = stubbed(["kitten", "kitty"]);
    const result = await runInPty([...TWO_PAGE_ARGS, "--dir", dir], { env: stubs.env });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout, printed(dir, TWO_PAGES));
    assert.deepEqual(stubs.calls(), [
      {
        name: "kitten",
        args: ["icat", "--detect-support", "--detection-timeout=3"],
        terminal: true,
        tty: true,
      },
      ...TWO_PAGES.map(([name]) => ({
        name: "kitten",
        args: ["icat", ...ICAT, join(dir, name)],
        terminal: true,
        tty: true,
      })),
    ]);
    assert.equal(existsSync(dir), false);
  });

  test("with no kitten, kitty +kitten icat shows them", async () => {
    const dir = join(scratchDir(), "made");
    const stubs = stubbed(["kitty"]);
    const result = await runInPty(["--page", "focus", "--dir", dir], { env: stubs.env });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stderr, "");
    assert.deepEqual(
      stubs.calls().map(({ name, args }) => [name, ...args]),
      [
        ["kitty", "+kitten", "icat", "--detect-support", "--detection-timeout=3"],
        ...TWO_PAGES.slice(0, 2).map(([name]) => [
          "kitty",
          "+kitten",
          "icat",
          ...ICAT,
          join(dir, name),
        ]),
      ],
    );
  });

  test("when icat's detection fails, it falls back", async () => {
    const dir = join(scratchDir(), "made");
    const stubs = stubbed(["kitten"], { detect: 1 });
    const result = await runInPty(["--page", "focus", "--dir", dir], { env: stubs.env });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stderr, fallback("kitten icat detection failed"));
    assert.equal(result.stdout, printed(dir, TWO_PAGES.slice(0, 2)));
    assert.deepEqual(
      stubs.calls().map(({ args }) => args),
      [["icat", "--detect-support", "--detection-timeout=3"]],
    );
    assert.equal(existsSync(dir), false);
  });

  test("with neither kitten nor kitty, it falls back", async () => {
    const stubs = stubbed(["xdg-open"]);
    const result = await runInPty(["--page", "focus", "--scheme", "light"], { env: stubs.env });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stderr, fallback("kitten not found"));
    assert.deepEqual(stubs.calls(), []);
  });

  test("with no controlling terminal, it falls back", async () => {
    const stubs = stubbed(["kitten"]);
    const result = await runInPty(["--page", "focus", "--scheme", "light"], {
      env: stubs.env,
      setsid: true,
    });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stderr, fallback("/dev/tty does not open"));
    assert.deepEqual(stubs.calls(), []);
  });

  test("--dir: it removes only what the run made, levels and files", async () => {
    const stubs = stubbed(["kitten"]);
    const there = scratchDir();
    writeFileSync(join(there, "other.txt"), "not the run's");
    const empty = join(scratchDir(), "empty");
    mkdirSync(empty);
    for (const dir of [join(there, "a", "b"), there, empty]) {
      const result = await run(["--page", "focus", "--dir", dir], { env: stubs.env });
      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stdout, new RegExp(`\n  ${dir}/2-focus--`));
    }
    assert.deepEqual(readdirSync(there), ["other.txt"]);
    assert.deepEqual(readdirSync(empty), []);
  });

  test("an error exit removes the files written before it", async () => {
    const dir = join(scratchDir(), "made");
    const stubs = stubbed(["kitten"]);
    const result = await run([...TWO_PAGE_ARGS, "--scheme", "light", "--dir", dir], {
      env: { ...stubs.env, SCREENSHOTS_FAIL: "open" },
    });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /the open step fails/);
    assert.equal(result.stdout, printed(dir, TWO_PAGES.slice(0, 1)));
    assert.equal(existsSync(dir), false);
  });

  test("SIGINT removes the files written before it", async () => {
    const dir = join(scratchDir(), "made");
    const stubs = stubbed(["kitten"]);
    const result = await run(["--page", "long", "--dir", dir], {
      env: stubs.env,
      interrupt: true,
    });
    assert.equal(result.code, 130);
    assert.match(result.stdout, /^the long page: /);
    assert.equal(existsSync(dir), false);
  });
});

describe("--output browser", () => {
  const loads = (html: string): string[] =>
    [...html.matchAll(/\b(src|href|srcset|poster|data)=["']?([^"' >]*)/g)].map(([, , url]) => url);

  test("writes index.html beside the files, every tile in order under its caption, and opens it", async () => {
    const dir = join(scratchDir(), "made");
    const stubs = stubbed(["xdg-open", "kitten"]);
    const result = await run(["--output", "browser", ...TWO_PAGE_ARGS, "--dir", dir], {
      env: stubs.env,
    });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stderr, "");
    const page = join(dir, "index.html");
    assert.equal(result.stdout, `${printed(dir, TWO_PAGES)}the gallery\n  ${page}\n`);
    assert.deepEqual(
      stubs.calls().map(({ name, args }) => [name, ...args]),
      [["xdg-open", pathToFileURL(page).href]],
    );
    assert.deepEqual(
      readdirSync(dir).sort(),
      ["index.html", ...TWO_PAGES.map(([name]) => name)].sort(),
    );
    const html = readFileSync(page, "utf8");
    assert.deepEqual(
      loads(html),
      TWO_PAGES.map(([name]) => name),
    );
    assert.deepEqual(
      [...html.matchAll(/<figcaption>([^<]*)<\/figcaption>/g)].map(([, caption]) => caption),
      TWO_PAGES.map(([, caption]) => caption),
    );
    assert.doesNotMatch(html, /<script|<link|@import|url\(/);
  });

  test("a failed open prints the gallery's path and exits 1, the files kept", async () => {
    for (const stubs of [stubbed(["xdg-open"], { "xdg-open": 4 }), stubbed([])]) {
      const dir = join(scratchDir(), "made");
      const result = await run(["--output", "browser", "--page", "focus", "--dir", dir], {
        env: stubs.env,
      });
      assert.equal(result.code, 1);
      const page = join(dir, "index.html");
      assert.equal(
        result.stderr,
        `web-screenshots: xdg-open could not open the gallery; open ${page}\n`,
      );
      assert.equal(readdirSync(dir).length, 3);
    }
  });
});
