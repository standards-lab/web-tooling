# web-tooling context

web-tooling is the browser-test and screenshot tooling the web client repositories take by
tag, as a devDependency: it drives a headless chrome-headless-shell for a browser test tier, serves
a package and its dependencies to it, starts the processes a test needs, and captures screenshots
of a page set in light and dark. It has no runtime dependencies and needs no build step to install.

It is the package `@standards-lab/web-tooling`. Its goals live in the coordinator's roadmap
(`standards-lab/roadmap/index.toml`, v1.client.stack), and its strategy is
`standards-lab/context/web-client.md`.

## Release

A person cuts each release by hand as an annotated `vX.Y.Z` tag on a pack commit.
[docs/release.md](../docs/release.md) gives the commands and what `release.yml` checks before it
publishes.

## Provenance

The package's lineage is in the workspace's [references catalog](https://github.com/standards-lab/org/blob/main/references.md).

## Capability map

- **Browser** (built): [src/browser.ts](../src/browser.ts).
- **Server** (built): [src/server.ts](../src/server.ts).
- **Process** (built): [src/process.ts](../src/process.ts).
- **Screenshots** (built): [src/screenshots.ts](../src/screenshots.ts) and
  [docs/screenshots.md](../docs/screenshots.md).
- **Fonts** (built): [src/fonts.ts](../src/fonts.ts).
