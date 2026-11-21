# Internals

This page gives the reasoning behind web-tooling's modules, for a reader changing them. Each
module's header, its exports' doc comments, and the [README](../README.md#use) state what it
promises its consumers.

## browser.ts: the driver

- **Launch flags.** `--no-sandbox`: Ubuntu's AppArmor refuses the user namespaces a downloaded
  Chrome's sandbox needs, and the browser loads only the repository's pages, from the loopback
  address. `--host-resolver-rules` fails every name but the loopback address and localhost, so no
  background request leaves the machine.
- **The pipe.** Chromium reads commands on its fd 3 and writes replies and events on its fd 4, each
  message one JSON object ended by a NUL. A page is attached with `flatten`, so its commands carry
  its session id on the one pipe.
- **The page.** A page `Target.createTarget` opens headless has no size until one is emulated.
  Headless hides scrollbars; a page shows them as a user's browser does, so a scrolling region's
  measures and captures match what a user sees.
- **The process group.** The browser is spawned detached, the leader of a process group of its
  own, which its renderers and services join, so its ending ends them all: one that outlives the
  browser writes the profile again after the profile's removal. A parent killed by a signal still
  ends the group, whose browser exits as its pipe closes. The group's id is the browser's pid; a
  spawn that failed has none, and nothing to end.
- **Closing.** The browser's processes outlive it briefly and write its profile while they do, so
  `close()` ends the group and waits for it before removing the profile.
- **The exit listener.** A run that ends without closing the browser still ends it and every
  process it started, and removes its profile once they are gone, synchronously, as an exit
  listener must: a process SIGKILL has not yet ended writes the profile again after the removal.
  It sends SIGKILL, since a browser shutting down on SIGTERM writes its profile again too. The
  process is exiting, so a profile it cannot remove is left, not thrown.

## group.ts: a process group's ending

- **Liveness.** A `/proc/<pid>/stat` line's fields after the command's closing parenthesis are the
  state, the parent's pid, and the group. A process that ends while `/proc` is read is skipped.
- **Ending.** `kill` ignores the error a group already gone raises (ESRCH).

## process.ts: the process helper

- **The process group.** The command is spawned detached, the leader of a process group of its
  own, which every process it starts joins unless it makes its own, so ending the group ends a
  server a task runner starts as a grandchild. The group's ending follows browser.ts's launch: a
  detached child, its liveness from group.ts, and SIGKILL from an exit listener if never stopped.
- **The caller's ending.** While any group is live, the helper listens for the caller's exit and
  for SIGINT, SIGTERM, and SIGHUP, the signals that end the caller when it has no listener of its
  own. An exit listener must be synchronous, so it sends every live group SIGKILL. A signal no
  other listener takes would end the caller without its exit event, so the helper ends every live
  group, removes its listeners, and raises the signal again, which ends the caller as it would
  have. When the caller listens for the signal itself, its listener decides; an exit it makes still
  ends the groups. The listeners go once no group is live.
- **Readiness.** Each ask of the ready URL uses no agent: it is its own connection, closed after,
  so none holds the caller open.
- **Stopping.** The command, the group's leader, is gone once the group is; its exit is reported
  once node reaps it, so `stop()` awaits the exit after the group's ending.

## server.ts: the static server

- **Store siblings.** pnpm installs a package at `.pnpm/<id>/node_modules/<name>`, its own
  dependencies linked beside it rather than into the root's `node_modules`, so the server serves a
  named package's store siblings under `/deps/` by their names, a named package's own directory
  taking precedence. A package outside a store has none, so a flat `node_modules`, or a package
  linked from elsewhere on disk, lends it no others. A sibling is a directory, or a link to one; a
  stray file in the store directory is none.
- **Paths.** A request's path is percent-decoded, then normalized: `normalize()` of an absolute
  path never climbs above its root, so no request leaves the root and none under `/deps/` leaves
  its package. An encoded `..`'s `%2e%2e` and `%2f` are decoded first, so it climbs no further
  than a plain one.
- **Failures.** A handler that throws or rejects, or a body the client stops sending, destroys the
  response.
- **Stopping.** A connection held open, by keep-alive or a request never answered, would hold
  `close()`, so `stop()` closes every connection too.

## screenshots.ts: the screenshot engine

- **Arguments.** `--help` and `-h` are found by a scan before `parseArgs`, which takes a value that
  starts with a dash only joined to its option, as `--dir=-h`, a token the scan passes over, so
  the scan never mistakes a value for the help. The options are built with `Object.assign`, whose
  type is the intersection, so the bin's own flags keep their value types beside the facets'
  index. An unknown `--page` lists the pages before the server or the browser starts.
- **Numbering.** Each state is numbered by its place among every page's states, so a file's name
  is the same whichever pages a run chooses.
- **Files.** The run writes into the directory `--dir` names or a fresh one under TMPDIR, made at
  the first write, so a run that captures nothing leaves nothing behind. It tracks what it wrote
  and the topmost directory it made, and its removal takes away each directory from the target up
  to that one only once it is empty, so a file another hand put there keeps its directory.
- **Outputs.** Each output is given the run's files, so one that cleans up takes away only what
  the run wrote. `--keep` is the terminal output's; the others keep their files whatever it says.
  The terminal output removes its files as the run ends, however it ends, SIGINT and SIGTERM
  included, unless `--keep`. The browser output's gallery loads nothing beyond its images: the
  styles are inline.
- **The terminal's images.** Whether the terminal can show the images is decided at the first
  shot, so a run that ends before any, as a usage error does, says nothing of it. Detection runs
  icat with the run's stdin and stdout, in its process group, so it reaches the terminal and isn't
  stopped for touching `/dev/tty`; its stderr, where it names the transfer mode, is dropped, and
  only its exit status counts. icat waits `DETECTION_TIMEOUT_S` for the terminal to answer and is
  killed a little after, so a terminal that never answers can't hang the run. Inside a Neovim
  `:terminal` the pty reports no pixel size and libvterm drops the graphics escape codes, so
  detection fails there whatever check failed, and the fallback names Neovim. Each image is sent
  with `--transfer-mode=stream`, the data in the escape codes, so it reaches a terminal at the far
  end of a pty; left-aligned, and scaled to fit the screen's width and height.
- **The server.** A start function is called once the arguments and the pages are checked, so the
  help and every usage error start nothing; one that throws or rejects fails the run, naming why.
  The server stops once, whatever asks first: the run's end, its failure, or a signal; a start
  that rejected started nothing to stop. The origin is taken as a directory, so a page's path
  resolves under any base path a start's origin has.
- **Signals.** SIGINT or SIGTERM exits 128 plus the signal's number once the server has stopped and
  the output has closed; a second signal exits at once. The browser ends with the process, by its
  exit listener.
- **Profiles.** Each named profile is checked against every run page's registry, read once the page
  loads, so the profiles its modules register count, and before any capture.
- **A capture.** `RENDERED` waits until every custom element on the page is defined and its
  `updateComplete`, which a Lit element has, has resolved. The page's `data-focus-start` mark takes
  focus only by script; the bin focuses it, then presses Tab as many times as the mark's value, 1
  by default, so the browser moves focus and marks it focus-visible. A headless page never has the
  window's focus, which `:focus-visible` otherwise needs, so focus is emulated.
- **Tiles.** A full page is cut into tiles of at most `TILE_MAX_HEIGHT` px, meeting edge to edge.
  Each tile ends at the lowest top-level section's top within its last quarter (`SECTION_SLACK`),
  else at the lowest state figure's top within its last half (`STATE_SLACK`), else at its full
  height, so a tile seldom splits a state mid-way; a state can be taller than a quarter tile, and
  a narrower window would leave some tiles no state boundary to cut at. Before the capture the
  viewport grows as tall as the page, so every tile lies inside it: Chromium paints a scrolling
  region's scrollbars only inside the viewport, and a capture beyond it would drop them below the
  first screen. The width stays, so the layout doesn't change.

## The screenshot tests' fixture

- **Reports.** A page's `window.report(kind)` posts by a synchronous request, so each line is in
  the log before the step that made it ends.
- **A failing run.** `SCREENSHOTS_FAIL=open` makes the narrow page's open step throw, so a test can
  run the bin to an error.
