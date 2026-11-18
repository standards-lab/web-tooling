# web-tooling context

web-tooling is the browser-test and screenshot tooling the web client repositories take by
tag, as a devDependency: it drives a headless chrome-headless-shell for a browser test tier, serves
a package and its dependencies to it, starts the processes a test needs, and captures screenshots
of a page set in light and dark. It has no runtime dependencies and needs no build step to install.

It is a package under the `@standards-lab` scope, starting at v0.1.0 and released by a plain
`vX.Y.Z` tag. Its goals live in the coordinator's roadmap (`standards-lab/context/roadmap.toml`,
v1.client.stack), and its strategy is `standards-lab/context/web-client.md`. It is seeded by copy
from spike-html-apps-tooling at d77877b, with the pinned-font-set helper from spike-html-go-wasm at f026de3, with a provenance line on every copied file; the spike is archived and never a
dependency. The JSON files, which can hold no comment, carry their provenance here: `package.json`
is adapted from spike-html-apps-tooling (d77877b): package.json, renamed `@standards-lab/web-tooling`
at 0.1.0, its pins at their latest, its bin named `web-screenshots`; `.prettierrc.json` is from
spike-html-apps-tooling (d77877b): .prettierrc.json. `pnpm-lock.yaml` is generated, not copied.

## Capability map

- **Browser**: launch a pinned headless browser in a fixed locale, time zone, and viewport, resolving only loopback hosts.
- **Server**: serve a root, its dependencies, and a shell on a free loopback port, never outside the root.
- **Process**: start a command in its own process group and wait until its ready URL answers.
- **Screenshots**: the `web-screenshots` bin, capturing a description's pages light and dark.
- **Fonts**: run a browser suite in a pinned DejaVu font set, for stable text rendering.
