<!-- Adapted from spike-html-apps-tooling (d77877b): STANDARDS.md, for @standards-lab/web-tooling
and its hand-cut releases. -->

# web-tooling standards

The judgement calls the standards-reviewer applies to web-tooling, beyond what `mise run check`
enforces: each one line, with a pointer to the architecture page that applies where one does. The
`standard` task points them at the Web Elemental standard once it is founded
(`standards-lab/context/web-client.md`, "Toward Web Elemental").

The architecture pages that apply, in the architecture repository:

- `architecture/principles/minimal-footprint.md`: no runtime dependency, and each devDependency
  deliberate; a consumer installs the tag with no build step.
- `architecture/principles/rolling-currency.md`: every tool, package, and action pin explicit and
  at its latest.
- `architecture/principles/independent-releases.md`: the package releases on its own tags.
- `architecture/principles/comments.md`: every comment is one of the five kinds (package
  documentation, a suppression's reason, a pin hold's reason, provenance, a reference) in
  TypeScript, JavaScript, shell, CSS, HTML, tests, and every configuration file (TOML, YAML,
  JSONC, `.gitignore`, `.prettierignore`).
- `architecture/principles/validation-first.md`: the bin checks its arguments against the
  description before it starts a server or a browser, and a facet's names before any capture.

## Package

- The package is `@standards-lab/web-tooling`, the browser-test and screenshot tooling the web
  client repositories take as a devDependency; its code and tests name no consumer.
- `dist/` lives only in a release tag's tree, the pack, never on a branch.
- Releases are plain `vX.Y.Z` annotated tags on a pack commit parented on main's merge commit, cut
  by hand on a green check from `package.json`'s version, each with its `CHANGELOG.md` section,
  and never changed or re-cut; `release.yml`, dispatched by hand with the pushed tag, only
  verifies and publishes it (`standards-lab/context/web-client.md`, "Packaging and release").

## Code

- Code meets the bar of spike-html-conventions' `layers/` code at a88828a: a 2–4 line header and a
  one-line doc comment per export.
- A module's or a script's header documents the public contract, what it provides and promises,
  with no reasoning, and each export carries a one-line doc comment. A doc comment on a
  non-exported symbol, an in-body comment, and a test's comment are none of the five kinds: their
  reasoning goes into names, exported docs, or a `docs/` page behind a one-line `See` reference,
  and a script's sections become named functions. A configuration file's header is at most a short
  description plus `See` lines. A lint directive carries its reason as its `--` description.
- A copied file names each source repository and commit in one provenance line per source, which
  reads `From|Adapted from <repo> (<commit>): <path>`, plus at most a short clause naming what
  changed, never why, and a third-party source's licence after a semicolon. The lines its immediate
  source carried for earlier sources stay beside that source's own. A JSON file, which takes no
  comment, has its line in `context/README.md`.
- Sources use `.ts` relative specifiers, which tsc rewrites.
- Tests are TypeScript run under Node's type stripping, erasable syntax only, type-checked by
  `tsconfig.test.json`; browser-served fixtures, and the stub a test runs from a PATH, stay `.js`.
- The tests test `dist/`: a test imports the package by its own name, or runs its bin, as a
  consumer does.
- A mise task runs one script or one command, and `check` is a depends list.
