# web-tooling context

web-tooling is the browser-test and screenshot tooling the web client repositories take by
tag, as a devDependency: it drives a headless chrome-headless-shell for a browser test tier, serves
a package and its dependencies to it, starts the processes a test needs, and captures screenshots
of a page set in light and dark. It has no runtime dependencies and needs no build step to install.

It is the package `@standards-lab/web-tooling`, starting at v0.1.0. Its goals live in the
coordinator's roadmap (`standards-lab/roadmap/index.toml`, v1.client.stack), and its strategy is
`standards-lab/context/web-client.md`.

## Release

A person cuts each release by hand: an annotated `vX.Y.Z` tag on a pack commit, whose tree is the
pack and whose one parent is main's merge commit. `release.yml`, dispatched by hand with the pushed
tag (a tag push reads its workflows from the tagged tree, which holds only the pack), verifies the
tag, runs the check, holds the tag's tree to a fresh pack, and publishes the GitHub release.
[docs/release.md](../docs/release.md) gives the commands.

## Provenance

The package is seeded by copy from spike-html-apps-tooling at d77877b, with the font set from
spike-html-go-wasm at f026de3. Both spikes are archived and never a dependency. Each copied file
that takes comments names its source in a provenance line. The JSON files take no comment, so their
provenance is here:

- `package.json` is adapted from spike-html-apps-tooling (d77877b): package.json. It is renamed
  `@standards-lab/web-tooling` at 0.1.0, its pins are at their latest, and its bin is named
  `web-screenshots`.
- `.prettierrc.json` is from spike-html-apps-tooling (d77877b): .prettierrc.json.
- `pnpm-lock.yaml` is generated, not copied.

## Capability map

- **Browser** (built): [src/browser.ts](../src/browser.ts).
- **Server** (built): [src/server.ts](../src/server.ts).
- **Process** (built): [src/process.ts](../src/process.ts).
- **Screenshots** (built): [src/screenshots.ts](../src/screenshots.ts) and
  [docs/screenshots.md](../docs/screenshots.md).
- **Fonts** (built): [src/fonts.ts](../src/fonts.ts).
