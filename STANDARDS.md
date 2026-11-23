# web-tooling standards

The judgement calls the standards-reviewer applies to web-tooling, beyond what `mise run check`
enforces: each one line, with a pointer to the architecture page that applies where one does.
web-tooling is a Web Elemental member (`architecture/standards/web-elemental/README.md`).

The architecture pages that apply, in the architecture repository:

- `architecture/principles/minimal-footprint.md`: no runtime dependency, and each devDependency
  deliberate; a consumer installs the tag with no build step.
- `architecture/principles/rolling-currency.md`: every tool, package, and action pin explicit and
  at its latest.
- `architecture/principles/independent-releases.md`: the package releases on its own tags.
- `architecture/principles/comments.md`: the five kinds of comment.
- `architecture/principles/validation-first.md`: the bin checks its arguments against the
  description before it starts a server or a browser, and a facet's names before any capture.

## Package

- The package is `@standards-lab/web-tooling`, the browser-test and screenshot tooling the web
  client repositories take as a devDependency; its code and tests name no consumer.
- Its releases, `dist/`, and pins follow
  `architecture/standards/web-elemental/principles/packages-and-releases.md`.

## Code

- A module's or a script's header documents the public contract, what it provides and promises,
  with no reasoning. A script's sections become named functions. A lint directive carries its
  reason as its `--` description.
- Sources use `.ts` relative specifiers, which tsc rewrites.
- Tests are TypeScript run under Node's type stripping, erasable syntax only, type-checked by
  `tsconfig.test.json`; browser-served fixtures, and the stub a test runs from a PATH, stay `.js`.
- The tests test `dist/`: a test imports the package by its own name, or runs its bin, as a
  consumer does.
- A mise task runs one script or one command, and `check` is a depends list.
