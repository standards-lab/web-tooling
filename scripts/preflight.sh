#!/usr/bin/env bash
# From spike-html-apps-tooling (d77877b): scripts/preflight.sh.
# Adapted from spike-html-go-wasm (f026de3): scripts/preflight.sh, its DejaVu checks.
# Fails naming mise run install when a tool a task needs is missing: the node_modules tooling, and
# with `browser`, the pinned chrome-headless-shell and the pinned DejaVu fonts, the font set a
# browser test file can choose.
# From spike-html-apps-foundation (9c15b8d): scripts/preflight.sh.
set -euo pipefail

fail() {
  echo "preflight: $1 isn't installed; run mise run install" >&2
  exit 1
}

for bin in eslint prettier; do
  [[ -x node_modules/.bin/$bin ]] || fail "$bin (devDependencies)"
done

[[ "${1:-}" == browser ]] || exit 0
shell=$(mise which chrome-headless-shell 2>/dev/null) || fail "chrome-headless-shell"
# mise caches downloads by checksum: a version bumped without its sha256 installs the old build.
pin=$(mise current http:chrome-headless-shell)
if [[ "$("$shell" --version)" != *" $pin" ]]; then
  echo "preflight: $shell isn't chrome-headless-shell $pin; give the pin its own sha256" >&2
  exit 1
fi
# A browser test file's DejaVu set draws from the archive's ttf/ (src/fonts.ts).
fonts=$(mise where http:dejavu-fonts 2>/dev/null) || fail "the DejaVu fonts (http:dejavu-fonts)"
[[ -f $fonts/ttf/DejaVuSans.ttf ]] || fail "the DejaVu fonts (http:dejavu-fonts)"
# As with the browser, a version bumped without its sha256 installs the old release; the archive's
# README.md names its version.
pin=$(mise current http:dejavu-fonts)
if ! grep -qF "DejaVu fonts $pin (c)" "$fonts/README.md"; then
  echo "preflight: $fonts isn't DejaVu fonts $pin; give the pin its own sha256" >&2
  exit 1
fi
