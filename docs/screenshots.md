### Screenshots

The bin `web-screenshots` captures a consumer's pages in the browser `BROWSER_EXECUTABLE` names:

```
web-screenshots <description> [--all | --<facet> <name>...] [--page <name>]...
  [--scheme light|dark] [--output terminal|directory|browser] [--dir <path>] [--keep] [-h | --help]
```

`<description>` is the path of a module whose default export is a `Description`, whose shape
[`src/screenshots.ts`](../src/screenshots.ts) gives. It lists the pages, each with a name, a caption, a
path, and its states, and each state captures either the full page or one viewport. It also gives
the profile's facets, each with its flag, the root attribute it sets, and its default; the profiles
`--all` captures; how to read the profiles a page registers; and the server the pages are served
from. A consumer under `checkJs` types the export; the package's types import `node:http`, so a
consumer that checks them needs `@types/node`, or `skipLibCheck`:

```js
/** @type {import("@standards-lab/web-tooling/screenshots.js").Description} */
export default { pages: [{ name: "tools", caption: "Tools", path: "demo/tools.html" }] };
```

A description may be a `.ts` module, which Node runs by stripping its types, so it uses erasable
syntax only: type annotations, `import type`, and `satisfies`, but no `enum`, `namespace`, or
parameter properties. It must not live under `node_modules`, and the consumer type-checks it with
its own `noEmit` project:

```ts
import type { Description } from "@standards-lab/web-tooling/screenshots.js";

const description: Description = {
  pages: [{ name: "tools", caption: "Tools", path: "demo/tools.html" }],
};
export default description;
```

The description's `server` takes one of two forms:

- The static server's options, those `serve` takes, each optional: the root is the module's
  directory by default. The bin serves them on a free port for the run.
- A start function, `() => Promise<{ origin: string; stop(): Promise<void> }>`, for an app any
  other server serves: an emulator, Vite, bun, `ng serve`, or a `mise run dev`. The bin calls it
  once its arguments are checked, after `--help`, the usage errors, and an unknown page, which
  start nothing, and before the first capture. Each page's path resolves against the origin, as
  a directory, so an origin with a base path, as `http://127.0.0.1:5173/app`, keeps it. The bin
  calls `stop()` exactly once: as the run ends, when it fails, and on SIGINT or SIGTERM, after
  which it exits 130 or 143. A start that rejects fails the run, naming its error. The process
  helper makes one:

```ts
import { freePort, start } from "@standards-lab/web-tooling/process.js";
import type { Description } from "@standards-lab/web-tooling/screenshots.js";

const description: Description = {
  pages: [{ name: "home", caption: "Home", path: "index.html" }],
  server: async () => {
    const port = await freePort();
    const app = await start("mise", ["run", "dev"], {
      ready: `http://127.0.0.1:${port}/`,
      env: { PORT: String(port) },
    });
    return {
      origin: `http://127.0.0.1:${port}`,
      stop: async () => {
        await app.stop();
      },
    };
  },
};
export default description;
```

With no flags, the bin captures every page in light and dark at each facet's default. A facet's
flag sets that facet's profile, `--all` captures every profile the description lists, `--page`
limits the run to the pages named, and `--scheme` limits it to one scheme. A usage error, an
unknown page, or a profile a page hasn't registered exits 2 before any capture.

`--help`, or `-h`, prints the usage, each flag's meaning, the schemes, the outputs, and the exit
codes, and exits 0 before any server or browser starts, so it needs no `BROWSER_EXECUTABLE`. It
wins over every other flag, which it ignores. After a description,
`web-screenshots <description> --help` also lists the description's pages, each with
its caption, and its facets, each with its flag, root attribute, default, and names: the default
and each name the description's `all` profiles give the facet's flag, in the order first given. A
run still checks a name it is given against each page's registered names. With no description,
the help leaves out the pages and facets. No facet may take the flag `help`, as none may take the
bin's other flags.

Each capture opens the page in a new tab and sets the scheme and the profile's attributes on the
root. It waits until every custom element is defined and has updated, runs the state's `open`
step, and, when the page has an element marked `data-focus-start`, focuses it and presses Tab as
many times as the attribute's value, once by default. It then waits for `SETTLED`. A full-page
state is cut into tiles of at most 1200 px, each cut moved up to the top of a `main > section`,
or of a `figure.state` inside one, when one is near. The files are named
`<number>-<name>--<profile>-<scheme>.png`, where `<number>` is the state's place among all the
description's states and `<profile>` is the facets' names joined by dashes; a tile adds
`--<k>of<m>` before `.png`.

`--output` chooses how the captures are shown:

- `terminal`, the default, prints each caption and path and shows each image with kitty's
  `kitten icat`. When stdout is not a terminal, `/dev/tty` does not open, or icat detects no
  support, it prints one stderr line giving the reason and naming `--output browser`. Inside a
  Neovim `:terminal`, the reason it gives is that the terminal reports no pixel size and does not
  pass graphics through. The run removes its files as it ends unless `--keep` is given.
- `directory` writes the files, prints each caption and path, and keeps the files.
- `browser` also writes `index.html`, a gallery of every capture under its caption, and opens it
  with `xdg-open`. When the open fails, it prints the gallery's path and exits 1.

The files go to a new directory under `$TMPDIR`, or `/tmp`, unless `--dir <path>` names one. The
terminal output removes only the files it wrote, and the directory only if the run created it.
