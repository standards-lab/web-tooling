// The screenshot command's engine, which bin/screenshots.ts runs: the consumer's description
// module, the first argument, typed as Description, gives the pages, states, facets, and server,
// and the flags choose the profiles, pages, schemes, and output. Each capture is a fresh page,
// rendered and focused by real Tab presses; a full page is cut into tiles.
// See docs/internals.md

import { spawn, spawnSync, type StdioOptions } from "node:child_process";
import {
  accessSync,
  closeSync,
  constants,
  mkdirSync,
  mkdtempSync,
  openSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { constants as os, tmpdir } from "node:os";
import { basename, delimiter, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs, type ParseArgsOptionsConfig } from "node:util";

import { SETTLED, launch, type Browser, type Page } from "./browser.ts";
import { serve, type Server, type ServeOptions } from "./server.ts";

/** A viewport's size, in CSS px. */
export interface Viewport {
  width: number;
  height: number;
}

/**
 * A step the bin runs on a capture's page, resolving once the page is ready for the next: a
 * prepare step before the root's attributes are set, an open step after the page has rendered.
 */
export type Step = (page: Page) => Promise<void>;

/**
 * A facet of the profile: its flag, `--<flag> <name>`, the root attribute its name is set on, and
 * the name it takes when no flag names one.
 */
export interface Facet {
  /** The flag's name, without its dashes: lowercase letters and dashes, as `palette`. */
  flag: string;
  /** The root attribute set to the facet's name, as `data-palette`. */
  attribute: string;
  /** The facet's name when no flag names one. */
  default: string;
}

/** One capture of a page: its viewport, and whether it takes the whole page or the viewport. */
export interface DescribedState {
  /** The files' name, after their number; the page's name by default. */
  name?: string;
  /** The captions' text, before the profile and scheme; the page's caption by default. */
  caption?: string;
  /** The viewport the page lays out in; 1280×800 by default. */
  viewport?: Viewport;
  /**
   * True: the page's whole height, the viewport grown to it, cut into tiles of at most 1200 px.
   * False: the viewport alone, at its own size.
   */
  full: boolean;
  /** Brings the page to the state, once it has rendered and before focus is reached. */
  open?: Step;
}

/** A page the bin captures, chosen by `--page <name>`. */
export interface DescribedPage {
  /** The page's name: `--page`'s, and its files' unless a state names them. */
  name: string;
  /** The captions' text, before the profile and scheme, unless a state gives its own. */
  caption: string;
  /** The page's path under the server's origin, as `demo/tools.html`. */
  path: string;
  /** The page's captures, in order; one full-page capture by default. */
  states?: DescribedState[];
}

/**
 * A server the consumer starts itself, as a start function: it resolves to the server's origin,
 * which the pages' paths resolve against, and a stop(), or rejects naming why it didn't start.
 * The bin calls it once its arguments are checked, before any capture, and calls the stop exactly
 * once: as the run ends, however it ends, a failure, SIGINT, or SIGTERM included.
 */
export type Start = () => Promise<Server>;

/** A consumer's captures, the default export of the module the bin's first argument names. */
export interface Description {
  /** The pages, in the order they're captured and numbered. */
  pages: DescribedPage[];
  /** The profile's facets, in the order the files' names and captions give them. */
  facets?: Facet[];
  /** `--all`'s profiles, each the facets' names it sets over the defaults, by flag. */
  all?: Record<string, string>[];
  /**
   * Each facet's registered names on a loaded page, by flag, which a name `--<flag>` gives is
   * checked against before any capture; with none, the names given are not checked.
   */
  profiles?: (page: Page) => Promise<Record<string, readonly string[]>>;
  /** Runs on every page once it loads, before the root's attributes are set. */
  prepare?: Step;
  /**
   * The server the pages are served from: serve's options, the root resolved against the
   * description module's directory, which it is by default; or a start function, for an app
   * another server serves.
   */
  server?: Partial<ServeOptions> | Start;
}

const NAME = "web-screenshots";
const SCHEMES = ["light", "dark"];
const OUTPUTS = ["terminal", "directory", "browser"];
const ICAT_FLAGS = ["--transfer-mode=stream", "--align=left", "--fit=both"];
const DETECTION_TIMEOUT_S = 3;
const NVIM_REASON = "inside a Neovim :terminal (no pixel size, graphics not passed through)";
const RESERVED_FLAGS = ["all", "page", "scheme", "output", "dir", "keep", "help"];
const HELP_FLAGS = ["--help", "-h"];
const DEFAULT_VIEWPORT = { width: 1280, height: 800 };
const TILE_MAX_HEIGHT = 1200;

const SECTION_SLACK = TILE_MAX_HEIGHT / 4;
const STATE_SLACK = TILE_MAX_HEIGHT / 2;

interface Shot {
  path: string;
  caption: string;
}

interface Files {
  write(name: string, data: Buffer): string;
  remove(): void;
}

interface Output {
  show(shot: Shot): void | Promise<void>;
  end(): void | number | Promise<void | number>;
  close?(): void;
}

function files(dir: string | undefined): Files {
  let target: string | undefined;
  let topmostMade: string | undefined;
  const written: string[] = [];
  return {
    write(name, data) {
      if (target === undefined) {
        if (dir === undefined) target = topmostMade = mkdtempSync(join(tmpdir(), "screenshots."));
        else {
          target = resolve(dir);
          topmostMade = mkdirSync(target, { recursive: true });
        }
      }
      const path = join(target, name);
      writeFileSync(path, data);
      written.push(path);
      return path;
    },
    remove() {
      for (const path of written) rmSync(path, { force: true });
      if (target === undefined || topmostMade === undefined) return;
      for (let at = target; ; at = dirname(at)) {
        try {
          rmdirSync(at);
        } catch {
          return;
        }
        if (at === topmostMade) return;
      }
    },
  };
}

const print = ({ path, caption }: Shot) => console.log(`${caption}\n  ${path}`);

function onPath(name: string) {
  return (process.env.PATH ?? "").split(delimiter).some((dir) => {
    try {
      accessSync(join(dir || ".", name), constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

function whyUnshowable(icat: string[] | undefined) {
  if (!process.stdout.isTTY) return "stdout is not a terminal";
  try {
    closeSync(openSync("/dev/tty", "r+"));
  } catch {
    return "/dev/tty does not open";
  }
  if (!icat) return "kitten not found";
  const [command, ...args] = icat;
  const { status } = spawnSync(
    command,
    [...args, "--detect-support", `--detection-timeout=${DETECTION_TIMEOUT_S}`],
    { stdio: ["inherit", "inherit", "ignore"], timeout: (DETECTION_TIMEOUT_S + 2) * 1000 },
  );
  if (status !== 0) return "kitten icat detection failed";
}

function exec(
  command: string,
  args: string[],
  stdio: StdioOptions,
): Promise<number | null | undefined> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio });
    child.once("error", () => resolve(undefined));
    child.once("close", (code) => resolve(code));
  });
}

const ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => ENTITIES[char]);

function gallery(shots: Shot[]) {
  const figures = shots.map(
    ({ path, caption }) =>
      `<figure><figcaption>${escapeHtml(caption)}</figcaption>` +
      `<img src="${escapeHtml(encodeURIComponent(basename(path)))}" alt="${escapeHtml(caption)}"></figure>`,
  );
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${NAME}</title>
<style>
:root { color-scheme: light dark; font: 14px/1.4 system-ui, sans-serif; }
body { margin: 2rem; }
figure { margin: 0 0 2.5rem; }
figcaption { margin-bottom: 0.5rem; }
img { display: block; max-width: 100%; height: auto; outline: 1px solid GrayText; }
</style>
</head>
<body>
${figures.join("\n")}
</body>
</html>
`;
}

const outputs: Record<string, (files: Files, flags: { keep: boolean }) => Output> = {
  terminal: (files, { keep }) => {
    const icat = onPath("kitten")
      ? ["kitten", "icat"]
      : onPath("kitty")
        ? ["kitty", "+kitten", "icat"]
        : undefined;
    let showable: boolean | undefined;
    const decide = () => {
      const reason = whyUnshowable(icat);
      if (reason !== undefined) {
        console.error(
          `${NAME}: no images shown: ${process.env.NVIM ? NVIM_REASON : reason}; ` +
            "--output browser shows them in a browser",
        );
      }
      return reason === undefined;
    };
    let dir: string | undefined;
    const remove = () => {
      if (!keep) files.remove();
    };
    return {
      async show(shot) {
        dir = dirname(shot.path);
        showable ??= decide();
        print(shot);
        if (icat && showable) {
          const [command, ...args] = icat;
          await exec(command, [...args, ...ICAT_FLAGS, shot.path], "inherit");
        }
      },
      end() {
        if (keep && dir !== undefined) console.log(`kept in ${dir}`);
      },
      close: remove,
    };
  },
  directory: () => ({ show: print, end: () => {} }),
  browser: (files) => {
    const shots: Shot[] = [];
    return {
      show(shot) {
        shots.push(shot);
        print(shot);
      },
      async end() {
        const page = files.write("index.html", Buffer.from(gallery(shots)));
        console.log(`the gallery\n  ${page}`);
        const status = await exec("xdg-open", [pathToFileURL(page).href], "ignore");
        if (status === 0) return;
        console.error(`${NAME}: xdg-open could not open the gallery; open ${page}`);
        return 1;
      },
    };
  },
};

function usage(facets: Facet[]) {
  const flags = facets.map(({ flag }) => `[--${flag} <name>]`).join(" ");
  const profiles = flags ? `[--all | ${flags}]` : "[--all]";
  return (
    `usage: ${NAME} <description> ${profiles} [--page <name>]... [--scheme light|dark] ` +
    `[--output ${OUTPUTS.join("|")}] [--dir <path>] [--keep] [-h | --help]`
  );
}

function section(heading: string, rows: [string, string][]) {
  const width = Math.max(...rows.map(([term]) => term.length));
  return [heading, ...rows.map(([term, text]) => `  ${term.padEnd(width)}  ${text}`)].join("\n");
}

function help(description?: Awaited<ReturnType<typeof load>>) {
  const facets = description?.facets ?? [];
  const parts = [
    usage(facets),
    `Captures the pages the description module exports by default, in the browser ` +
      `BROWSER_EXECUTABLE names, in each profile the flags choose, in each scheme.`,
    section("flags:", [
      ["--<facet> <name>", "the facet's name, over its default; the facets are the description's"],
      ["--all", "every profile the description's all lists, each over the defaults; no facet flag"],
      ["--page <name>", "only the page named, repeatable; every page by default"],
      ["--scheme <name>", "only the scheme named, once; both by default"],
      ["--output <name>", `how the captures are shown; ${OUTPUTS[0]} by default`],
      ["--dir <path>", "the directory the files go to; a fresh one under TMPDIR by default"],
      ["--keep", "the terminal output keeps its files and prints their directory"],
      ["-h, --help", "this help, the description's pages and facets with it; other flags ignored"],
    ]),
  ];
  if (description) {
    parts.push(
      section(
        "pages:",
        description.pages.map(({ name, caption }) => [name, caption]),
      ),
    );
    if (facets.length > 0) {
      const names = (facet: Facet) => [
        ...new Set([
          facet.default,
          ...description.all.flatMap((profile) => profile[facet.flag] ?? []),
        ]),
      ];
      parts.push(
        section(
          "facets:",
          facets.map((facet) => [
            `--${facet.flag} <name>`,
            `sets ${facet.attribute}; default ${facet.default}; names: ${names(facet).join(", ")}`,
          ]),
        ) +
          "\n  A facet's names are its default and those the description's --all profiles give." +
          "\n  A run still checks each name it is given against each page's registered names.",
      );
    }
  } else {
    parts.push(`${NAME} <description> --help also lists the description's pages and facets.`);
  }
  parts.push(
    section(
      "schemes:",
      SCHEMES.map((scheme) => [
        scheme,
        `prefers-color-scheme ${scheme}, and data-scheme ${scheme} on the root`,
      ]),
    ),
    section("outputs:", [
      [
        "terminal",
        "the default: prints each caption and path, shows each image with kitten icat when the " +
          "terminal can, and removes the files unless --keep",
      ],
      ["directory", "writes the files, prints each caption and path, and keeps the files"],
      ["browser", "also writes an index.html gallery beside the files and opens it with xdg-open"],
    ]),
    section("exit codes:", [
      ["0", "every capture taken and shown, or the help printed"],
      ["1", "the browser output's gallery didn't open, or the run failed"],
      ["2", "a usage error, an unknown page, or a profile a page hasn't registered"],
      ["130", "SIGINT ended the run, once its server stopped"],
      ["143", "SIGTERM ended the run, once its server stopped"],
    ]),
  );
  return parts.join("\n\n");
}

async function load(
  path: string,
): Promise<
  Description & Required<Pick<Description, "facets" | "all">> & { server: ServeOptions | Start }
> {
  const file = resolve(path);
  const description: Description = (await import(pathToFileURL(file).href)).default;
  if (!Array.isArray(description?.pages) || description.pages.length === 0) {
    throw new Error(`${path} exports no description with pages`);
  }
  const facets = description.facets ?? [];
  for (const { flag } of facets) {
    if (!/^[a-z][a-z-]*$/.test(flag) || RESERVED_FLAGS.includes(flag)) {
      throw new Error(`${path}: a facet can't take the flag --${flag}`);
    }
  }
  const server = description.server ?? {};
  return {
    ...description,
    facets,
    all: description.all ?? [{}],
    server:
      typeof server === "function"
        ? server
        : { ...server, root: resolve(dirname(file), server.root ?? ".") },
  };
}

async function pressTab(page: Page) {
  const event = { key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 };
  await page.cdp("Input.dispatchKeyEvent", { type: "keyDown", ...event });
  await page.cdp("Input.dispatchKeyEvent", { type: "keyUp", ...event });
}

const RENDERED = `(async () => {
  const tags = [...new Set([...document.querySelectorAll("*")]
    .map((el) => el.localName).filter((name) => name.includes("-")))];
  await Promise.all(tags.map((tag) => customElements.whenDefined(tag)));
  await Promise.all([...document.querySelectorAll(tags.join(",") || "x-none")]
    .map((el) => el.updateComplete));
})()`;

const FOCUS_START = `(() => {
  const mark = document.querySelector("[data-focus-start]");
  if (!mark) return 0;
  mark.focus();
  return Number(mark.dataset.focusStart) || 1;
})()`;

const BOUNDARIES = `(() => {
  const top = (el) => Math.floor(el.getBoundingClientRect().top + window.scrollY);
  return {
    sections: [...document.querySelectorAll("main > section")].map(top),
    states: [...document.querySelectorAll("main > section figure.state")].map(top),
  };
})()`;

function tiles(
  height: number,
  { sections, states }: { sections: number[]; states: number[] },
): [number, number][] {
  const result: [number, number][] = [];
  for (let top = 0; top < height;) {
    let end = Math.min(top + TILE_MAX_HEIGHT, height);
    if (end < height) {
      const within = (slack: number) => (offset: number) => offset > end - slack && offset <= end;
      end =
        Math.max(...sections.filter(within(SECTION_SLACK)), 0) ||
        Math.max(...states.filter(within(STATE_SLACK)), 0) ||
        end;
    }
    result.push([top, end - top]);
    top = end;
  }
  return result;
}

function setRoot(page: Page, attributes: Record<string, string>) {
  return page.evaluate(`(() => {
    const root = document.documentElement;
    for (const [name, value] of Object.entries(${JSON.stringify(attributes)})) {
      root.setAttribute(name, value);
    }
  })()`);
}

function setViewport(page: Page, { width, height }: Viewport) {
  return page.cdp("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
}

/**
 * Runs the screenshot command over its arguments, the description module's path then the flags,
 * resolving to the exit code: 0, 1 when the browser output can't open its gallery, or 2 on a
 * usage error, an unknown page, or a profile a page hasn't registered. Any other failure rejects.
 * SIGINT or SIGTERM during the run stops its server and exits the process, 130 or 143.
 * --help, or -h, anywhere among them wins, resolving to 0 before the server or the browser starts.
 */
export async function main(argv: string[]): Promise<number> {
  const [path, ...args] = argv;
  if (argv.some((arg) => HELP_FLAGS.includes(arg))) {
    const described = path === undefined || path.startsWith("-") ? undefined : await load(path);
    console.log(help(described));
    return 0;
  }
  if (path === undefined || path.startsWith("-")) {
    console.error(usage([]));
    return 2;
  }
  const description = await load(path);
  const { facets } = description;

  const flags = {
    all: { type: "boolean" },
    page: { type: "string", multiple: true },
    scheme: { type: "string", multiple: true },
    output: { type: "string", default: OUTPUTS[0] },
    dir: { type: "string" },
    keep: { type: "boolean" },
  } satisfies ParseArgsOptionsConfig;
  const facetFlags: Record<string, { type: "string" }> = Object.fromEntries(
    facets.map(({ flag }) => [flag, { type: "string" }]),
  );
  const options = Object.assign({}, facetFlags, flags);
  let values;
  try {
    ({ values } = parseArgs({ args, options, strict: true, allowPositionals: false }));
  } catch (error) {
    console.error(`${NAME}: ${(error as Error).message}\n${usage(facets)}`);
    return 2;
  }
  const { scheme: schemes, output } = values;
  const named = new Map<string, string>();
  for (const { flag } of facets) {
    const name = values[flag];
    if (typeof name === "string") named.set(flag, name);
  }
  const misuse =
    (values.all && named.size > 0 && "--all takes no facet flag") ||
    (schemes &&
      (schemes.length > 1 || !SCHEMES.includes(schemes[0])) &&
      "--scheme takes light or dark, once") ||
    (!OUTPUTS.includes(output) && `--output takes ${OUTPUTS.join(", ")}`);
  if (misuse) {
    console.error(`${NAME}: ${misuse}\n${usage(facets)}`);
    return 2;
  }

  const chosen = values.page;
  const names = description.pages.map(({ name }) => name);
  const unknownPage = chosen?.find((name) => !names.includes(name));
  if (unknownPage !== undefined) {
    console.error(`${NAME}: unknown page ${unknownPage}; the pages: ${names.join(", ")}`);
    return 2;
  }

  const defaults: Record<string, string> = Object.fromEntries(
    facets.map((facet) => [facet.flag, facet.default]),
  );
  const profiles = values.all
    ? description.all.map((over) => ({ ...defaults, ...over }))
    : [{ ...defaults, ...Object.fromEntries(named) }];

  const captures: { page: DescribedPage; state: DescribedState; number: number }[] = [];
  let number = 0;
  for (const page of description.pages) {
    for (const state of page.states ?? [{ full: true }]) {
      number++;
      if (!chosen || chosen.includes(page.name)) captures.push({ page, state, number });
    }
  }
  const pages = description.pages.filter(({ name }) => !chosen || chosen.includes(name));

  const written = files(values.dir);
  const shown = outputs[output](written, { keep: values.keep === true });
  const described = description.server;
  let starting: Promise<Server> | undefined;
  let stopping: Promise<void> | undefined;
  const stop = () =>
    (stopping ??= (async () => {
      const server = await starting?.catch(() => undefined);
      await server?.stop();
    })());
  let interrupted = false;
  const interrupt = async (signal: NodeJS.Signals) => {
    const code = 128 + os.signals[signal];
    if (interrupted) process.exit(code);
    interrupted = true;
    try {
      await stop();
    } finally {
      shown.close?.();
      process.exit(code);
    }
  };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  let browser: Browser | undefined;
  try {
    starting = typeof described === "function" ? (async () => described())() : serve(described);
    let origin: string;
    try {
      ({ origin } = await starting);
    } catch (error) {
      if (typeof described !== "function") throw error;
      throw new Error(`the description's server didn't start: ${(error as Error).message}`, {
        cause: error,
      });
    }
    browser = await launch();
    const base = origin.endsWith("/") ? origin : `${origin}/`;
    const url = (page: DescribedPage) => new URL(page.path, base).href;

    if (named.size > 0 && description.profiles) {
      for (const page of pages) {
        const tab = await browser.open(url(page));
        try {
          await description.prepare?.(tab);
          await tab.evaluate(RENDERED);
          const registry = await description.profiles(tab);
          for (const [flag, name] of named) {
            const registered = registry[flag] ?? [];
            if (!registered.includes(name)) {
              console.error(
                `${NAME}: unknown ${flag} ${name}; the ${flag}s ${page.path} registers: ${registered.join(", ")}`,
              );
              return 2;
            }
          }
        } finally {
          await tab.close();
        }
      }
    }

    for (const { page, state, number } of captures) {
      const name = `${number}-${state.name ?? page.name}`;
      const caption = state.caption ?? page.caption;
      const viewport = state.viewport ?? DEFAULT_VIEWPORT;
      for (const profile of profiles) {
        const label = facets.map(({ flag }) => profile[flag]);
        for (const scheme of schemes ?? SCHEMES) {
          const tab = await browser.open(url(page));
          try {
            await setViewport(tab, viewport);
            await tab.cdp("Emulation.setEmulatedMedia", {
              features: [{ name: "prefers-color-scheme", value: scheme }],
            });
            await description.prepare?.(tab);
            await setRoot(tab, {
              ...Object.fromEntries(facets.map((f) => [f.attribute, profile[f.flag]])),
              "data-scheme": scheme,
            });
            await tab.evaluate(RENDERED);
            await state.open?.(tab);
            await tab.cdp("Emulation.setFocusEmulationEnabled", { enabled: true });
            const presses = await tab.evaluate(FOCUS_START);
            for (let press = 0; press < presses; press++) await pressTab(tab);
            await tab.evaluate(SETTLED);

            let cuts: [number, number][] | undefined;
            if (state.full) {
              const { cssContentSize } = await tab.cdp("Page.getLayoutMetrics");
              const height = Math.ceil(cssContentSize.height);
              cuts = tiles(height, await tab.evaluate(BOUNDARIES));
              await setViewport(tab, { ...viewport, height: Math.max(viewport.height, height) });
              await tab.evaluate(SETTLED);
            }
            const clips = cuts ?? [undefined];
            for (const [index, cut] of clips.entries()) {
              const { data } = await tab.cdp("Page.captureScreenshot", {
                format: "png",
                ...(cut && {
                  clip: { x: 0, y: cut[0], width: viewport.width, height: cut[1], scale: 1 },
                }),
              });
              const [suffix, count] =
                clips.length > 1
                  ? [`--${index + 1}of${clips.length}`, ` (${index + 1} of ${clips.length})`]
                  : ["", ""];
              const path = written.write(
                `${name}--${[...label, scheme].join("-")}${suffix}.png`,
                Buffer.from(data, "base64"),
              );
              await shown.show({
                path,
                caption: `${caption}: ${[...label, scheme].join(", ")}${count}`,
              });
            }
          } finally {
            await tab.close();
          }
        }
      }
    }
    return (await shown.end()) ?? 0;
  } finally {
    await browser?.close();
    await stop();
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
    shown.close?.();
  }
}
