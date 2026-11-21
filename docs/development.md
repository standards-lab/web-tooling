# Development

This page gives the reasoning behind web-tooling's pins, tasks, scripts, and workflows, for a
reader changing them. The [README](../README.md#development) lists the tasks to run.

## Pins

- **Installs.** No task installs a missing tool (`task.run_auto_install = false`): `mise run
  install` is the one task that reads the network, installing every pin `mise.toml` names, the
  DejaVu fonts included, and `node_modules`. CI runs it before the check. The preflight task fails
  naming it when a tool a task needs is missing.
- **chrome-headless-shell.** Chrome for Testing publishes no checksums, so the sha256 and size are
  taken from the download by hand at each bump. mise caches downloads by checksum: a version
  bumped without its sha256 installs the old build, so preflight holds the installed browser's
  `--version` to the pin.
- **dejavu-fonts.** The pinned DejaVu font set a browser test file can choose
  ([`src/fonts.ts`](../src/fonts.ts)): a test-only fontconfig that shows the browser only the six
  faces of Ubuntu's fonts-dejavu-core, so a local run never proves a page in the machine's fonts
  alone. A consumer pins the same tool and names its install in `DEJAVU_FONTS`, as the browser
  task does. DejaVu publishes no checksums either, so the sha256 and size are taken by hand at each
  bump, and preflight holds the archive's README, which names its version, to the pin. The
  archive's LICENSE holds its license: Bitstream Vera's, with DejaVu's changes in the public
  domain.
- **pnpm's release age.** `minimumReleaseAge: 0` in `pnpm-workspace.yaml` turns off pnpm's default
  wait of a day before it installs a release. The currency task moves each pin to its latest
  release, and that release's notes are read before the bump lands, a review that stands in for
  the age gate; with the wait on, a frozen install of a lockfile that pins a release under a day
  old fails.

## Currency

`scripts/currency.sh` reports each pin behind its latest:

- **mise tools** through `mise outdated`, at the error log level, since mise warns on every run
  that a GitHub release has no assets.
- **DejaVu** by its releases' `dejavu-fonts-ttf-X.Y.tar.bz2` asset names, the archive the pin
  downloads, sorted by version, not through `mise outdated`: mise keeps its version list in the
  GitHub API's newest-first order, unsorted, so its latest is whichever release the API lists
  last.
- **typescript** against the newest version typescript-eslint's peer range accepts, every other
  package against its latest.
- **Actions** each against its repository's latest release, when the repository has a workflow.

## Tasks and their configuration

- **The build.** tsc emits each module's `.js` and `.d.ts`, rewriting the sources' `.ts` specifiers
  to `.js`, and keeps the bin's shebang but writes no file executable. pnpm pack sets a bin's mode
  in the tarball, but the browser tier runs `dist/`'s bin as it is, so the build sets it.
- **Prettier** formats the code and the JSON only: its default run would also rewrite the Markdown,
  the YAML, and `pnpm-lock.yaml`. `.prettierignore` ignores every file, then lets every directory
  and the code and JSON files back in; Prettier also skips what `.gitignore` lists.
- **The suite's types.** `tsconfig.test.json` checks the tests and their helpers, which node runs
  under its type stripping, against `dist/` as a consumer's code is: a test imports the package by
  its name, which resolves to the build's declarations. `checkJs` types the two files that stay
  JavaScript, the fixture stub, run from a PATH, and the lint's config.
- **Process fixture.** `test/unit/fixtures/process/mise.toml`'s dev task runs the fixture server as
  mise's own child, so the server is a grandchild of the process helper's caller; its tools are the
  repository's, from the `mise.toml` mise reads in the directories above.

## Workflows

- **Release.** `release.yml` checks out every branch and tag, so the pack commit's parent and main
  are both at hand. The parent must be main's merge commit, so it has two parents of its own. The
  tag's tree must be the tarball's `package/`, file for file. The release action releases the tag
  its ref names, not the dispatching ref, main: it runs `gh release create` on that tag with no
  target, so the release is for the tag fetched and checked above.
