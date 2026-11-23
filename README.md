# web-tooling

The browser-test and screenshot tooling the standards-lab web client repositories share: a driver
for Chrome over the DevTools Protocol, a page wait, a pinned DejaVu font set, a static server, a
process helper that starts any other server, and a screenshot command. It is Node ES modules,
written in TypeScript and shipped built, with type declarations and no runtime dependency, and is
released by git tag.

## Install

Each release is a tag, `v<version>`, of
[standards-lab/web-tooling](https://github.com/standards-lab/web-tooling), whose tree is the
package as `pnpm pack` builds it: `package.json`, this README, the LICENSE, and `dist/`, the build.
The build lives only in the tag's tree, so the tag installs with no build step, and its manifest
has no scripts. Install it by the tag, as a devDependency:

```
pnpm add -D github:standards-lab/web-tooling#v0.1.0
bun add -d github:standards-lab/web-tooling#v0.1.0
npm install -D --allow-git=root github:standards-lab/web-tooling#v0.1.0
```

npm 12 refuses git dependencies unless `--allow-git` allows them; `root` allows the ones the
project itself declares. Each GitHub release also carries the tarball.

## Use

The package is `@standards-lab/web-tooling`. Its modules are imported by their `.js` subpaths,
each typed by the `.d.ts` tsc emits beside it in `dist/`.

`./browser.js` drives the browser over the DevTools Protocol on a pipe:

```ts
launch(): Promise<Browser>
until(page: Page, expression: string, timeout?: number): Promise<any>
SETTLED: string
```

- `launch()` starts the browser that `BROWSER_EXECUTABLE` names, headless, with no sandbox, in
  en-US and UTC, and rejects when the variable is unset. The browser resolves only `127.0.0.1`
  and `localhost`. Its temporary profile is removed on `close()`, or when the process exits
  without closing it, once the browser's processes are gone, waiting at most 2 s for them.
- `Browser` has `open(url)`, which resolves to a `Page` once the page's load event fires, and
  `close()`. A `Page` is 1280×720 with its scrollbars shown, and has `goto(url)`,
  `cdp(method, params?)`, `on(method, listener)`, `evaluate(expression)`, and `close()`.
- `until` polls the expression inside the page and resolves to its value once it is truthy. It
  rejects, naming the expression and the timeout, when the timeout passes; the timeout is 10 s
  by default.
- `SETTLED` is an expression for `evaluate` that resolves once the page's fonts are ready and two
  frames have painted.

`./server.js` serves a directory over http on the loopback address:

```ts
serve(options: ServeOptions): Promise<Server>
```

- `root` is the directory served. Its `.html`, `.js`, and `.css` files are sent as they are on
  disk, with `cache-control: no-store`; any other path is a 404, and no request reaches a file
  outside the root.
- `deps` names packages to serve under `/deps/<name>/`, each found in the nearest `node_modules`
  that holds it, as node resolves an import. A package pnpm installed brings its store siblings,
  its own dependencies, under `/deps/` too.
- `shell` is the page, under the root, sent for any path with no extension.
- `handler(request, response)` is offered every request first. It claims the request by
  returning true, or a promise of true, and then owns the response.
- The `Server` it resolves to has `origin`, `http://127.0.0.1:<port>` on a free port, and
  `stop()`.

`./process.js` starts a command that serves an app, such as a dev server or a task runner that
starts one, and finds it a port:

```ts
start(command: string, args: string[], options: StartOptions): Promise<Started>
freePort(): Promise<number>
```

- `start` runs the command with its args in a process group of its own, in `options.cwd`, with
  `options.env` set over the caller's environment; a variable set to `undefined` is removed. It
  resolves once `options.ready`, a URL, answers 2xx over HTTP; readiness is that poll alone. It
  rejects when the command exits first, or when `options.timeout` passes, 30 s by default, which
  also ends the group; both rejections' messages end with what the command wrote.
- The `Started` it resolves to has `pid`, the command's pid and its group's id; `output()`, the
  last 64 KiB of its stdout and stderr, interleaved; and `stop()`. `stop()` sends the whole group
  SIGTERM, then SIGKILL once `options.drain` passes, 5 s by default, and resolves, once no process
  of the group is left, to the command's exit code, or 128 plus the signal's number when a signal
  ended it.
- A server the command starts as a grandchild, as `mise run dev` or `ng serve` does, joins the
  group, so `stop()` ends it too. A group the caller never stops is sent SIGKILL when the caller
  exits, or when a signal the caller has no listener for ends it.
- `freePort()` resolves to a loopback port no one listens on, for the command's server to take.

```ts
const port = await freePort();
const app = await start("mise", ["run", "dev"], {
  ready: `http://127.0.0.1:${port}/`,
  env: { PORT: String(port) },
});
// ...
await app.stop();
```

`./fonts.js` chooses the font set a test file's browser draws in, before the file launches it:

```ts
useDejaVu(): () => void
fonts(): Fonts
```

- By default a browser draws in the machine's fonts, its own fontconfig. `useDejaVu()` chooses a
  pinned DejaVu set instead: it writes a test-only fontconfig into a scratch directory under
  `$TMPDIR` and names it in `FONTCONFIG_FILE`, so a browser launched after it sees only the six
  faces of Ubuntu's fonts-dejavu-core (DejaVu Sans, Sans Mono, and Serif, each regular and bold),
  and every generic family resolves to DejaVu: `system-ui` and `sans-serif` to DejaVu Sans,
  `monospace` to DejaVu Sans Mono, and `serif` to DejaVu Serif. It returns the scratch directory's
  removal, for after the browser closes.
- The faces come from the directory `DEJAVU_FONTS` names, an unpacked `dejavu-fonts-ttf` release
  archive, whose `ttf/` holds them; `useDejaVu()` throws when the variable is unset. The package
  ships no fonts: the consumer pins the archive and names its install, as it names the browser in
  `BROWSER_EXECUTABLE`. With mise, the consumer takes this repository's `http:dejavu-fonts` pin
  from `mise.toml`, the release at its sha256, and its browser task passes
  `DEJAVU_FONTS=$(mise where http:dejavu-fonts)`, as this repository's does.
- `fonts()` is the set the process draws in: its `name`, and for DejaVu its `families`, `sans`
  and `mono`, which a test can check a page draws in.

A test file runs a suite in DejaVu by choosing the set before the suite's browser launches, and
removing it after the browser closes:

```ts
import { after } from "node:test";
import { useDejaVu } from "@standards-lab/web-tooling/fonts.js";

// The suite's own after, which closes its browser, is registered first, so it runs first.
const remove = useDejaVu();
await import("./layout-suite.ts");
after(remove);
```

`./screenshots.js` holds the screenshot command, `main(argv: string[]): Promise<number>`, which
the bin runs, and the `Description` type a consumer's description module exports.

## Screenshots

[docs/screenshots.md](https://github.com/standards-lab/web-tooling/blob/main/docs/screenshots.md)
gives the `web-screenshots` bin's usage, its description's shape and server forms, its flags and
help, how it captures and names each file, and its outputs.

## Development

Tasks run through [mise](https://mise.jdx.dev):

```
mise run install   # the pinned tools and node_modules; reads the network
mise run build     # src/ into dist/ with tsc
mise run check     # lint, lint-context, lint-references, types, the build, and both tiers; reads no network
mise run currency  # report every tool, package, and action pin behind its latest
```

The check lints with ESLint, Prettier, shellcheck, actionlint, and marathon's lint-context and
lint-references, type-checks the TypeScript sources and the TypeScript tests with tsc, and builds
`dist/`. The unit tier tests the server and the process helper, the latter through a fixture
`mise run` task whose server is a grandchild, and packs the build to check the pack's shape: the
build and nothing else beside the manifest, README, and LICENSE, each export's files and the bin
packed, the bin executable, and no scripts or runtime dependency in the manifest. The browser tier runs the driver, the server, the font sets, and the
bin from `dist/` in the pinned chrome-headless-shell. CI runs `mise run install` and the check on
each pull request to main and each push to it.

[docs/development.md](https://github.com/standards-lab/web-tooling/blob/main/docs/development.md)
gives the reasoning behind the pins, tasks, scripts, and workflows, and
[docs/internals.md](https://github.com/standards-lab/web-tooling/blob/main/docs/internals.md)
gives the reasoning behind the modules.

## Release

[docs/release.md](https://github.com/standards-lab/web-tooling/blob/main/docs/release.md)
gives the commands that cut a release tag and what the release workflow checks before it
publishes.

## Provenance

The package's lineage is in the workspace's [references catalog](https://github.com/standards-lab/org/blob/main/references.md).

## License

[Apache License 2.0](LICENSE).
