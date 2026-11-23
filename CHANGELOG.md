# Changelog

All notable changes to `@standards-lab/web-tooling` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the package adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-11-18

### Added

- The tooling package, seeded by copy from spike-html-apps-tooling v0.3.0 (d77877b), with its
  font set from spike-html-go-wasm (f026de3). It has no runtime dependency; its sources are
  TypeScript, which tsc builds into `dist/`, each module's `.js` with its `.d.ts`.
- `./browser.js`: `launch()` starts the browser `BROWSER_EXECUTABLE` names over the DevTools
  Protocol on a pipe, headless, with no sandbox, in en-US and UTC, resolving only `127.0.0.1` and
  `localhost`. Its temporary profile is removed on `close()`, or when the process exits without
  it, once the browser's processes are gone. Each page is 1280×720 with its scrollbars shown and
  offers `goto`, `cdp`, `on`, `evaluate`, and `close`. `until(page, expression, timeout)` polls
  inside the page until the expression is truthy, 10 s by default, and `SETTLED` resolves once
  the page's fonts are ready and two frames have painted.
- `./server.js`: `serve(options)` serves a `root` directory's `.html`, `.js`, and `.css` files on
  a free loopback port with `cache-control: no-store`, never a file outside the root. `deps`
  serves named packages, with their pnpm store siblings, under `/deps/<name>/`, `shell` names the
  page sent for any extensionless path, and `handler` is offered every request first.
- `./process.js`: `start(command, args, options)` runs a command in a process group of its own and
  resolves once `options.ready` answers 2xx over HTTP; its `stop()` ends the whole group, a server
  a task runner starts as a grandchild included. `freePort()` resolves to a free loopback port.
- `./screenshots.js` and the bin `web-screenshots <description> [flags]`: it captures the pages a
  description module exports, typed as `Description`, in each profile the flags choose, in light
  and dark, from a static server or a start function for any other server. Each capture reaches
  its focus state with real Tab presses, and a full-page capture is cut into tiles of at most
  1200 px. It shows the captures in the terminal with kitty's `kitten icat`, writes them to a
  directory, or opens a gallery in the browser, and `--help` lists the description's pages and
  facets.
- `./fonts.js`: `useDejaVu()` chooses a pinned DejaVu font set for a test file's browser, a
  test-only fontconfig showing only the six faces of Ubuntu's fonts-dejavu-core, with every
  generic family resolved to DejaVu. The faces come from the `dejavu-fonts-ttf` 2.37 archive
  `DEJAVU_FONTS` names, which a consumer pins as this repository's `http:dejavu-fonts` does.
  `fonts()` names the set the process draws in.
- Releases by tag: each `v<version>` tag marks a pack commit on main's merge commit, whose tree is
  the pack, the build included, and its GitHub release carries the tarball.

[0.1.0]: https://github.com/standards-lab/web-tooling/releases/tag/v0.1.0
