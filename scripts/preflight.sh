#!/usr/bin/env bash
# Adapted from spike-html-apps-tooling (d77877b): scripts/preflight.sh, with the DejaVu checks.
# Adapted from spike-html-go-wasm (f026de3): scripts/preflight.sh, its DejaVu checks.
# From spike-html-apps-foundation (9c15b8d): scripts/preflight.sh.
# Fails naming mise run install when a tool a task needs is missing: the node_modules tooling, and
# with `browser`, the pinned chrome-headless-shell and the pinned DejaVu fonts, each at its pin.
# See docs/development.md
set -euo pipefail

fail() {
  echo "preflight: $1 isn't installed; run mise run install" >&2
  exit 1
}

require_node_modules() {
  local bin
  for bin in eslint prettier; do
    [[ -x node_modules/.bin/$bin ]] || fail "$bin (devDependencies)"
  done
}

require_browser_at_pin() {
  local shell pin version
  shell=$(mise which chrome-headless-shell 2>/dev/null) || fail "chrome-headless-shell"
  pin=$(mise current http:chrome-headless-shell) || return
  version=$("$shell" --version) || return
  if [[ $version != *" $pin" ]]; then
    echo "preflight: $shell isn't chrome-headless-shell $pin; give the pin its own sha256" >&2
    exit 1
  fi
}

require_dejavu_at_pin() {
  local fonts pin
  fonts=$(mise where http:dejavu-fonts 2>/dev/null) || fail "the DejaVu fonts (http:dejavu-fonts)"
  [[ -f $fonts/ttf/DejaVuSans.ttf ]] || fail "the DejaVu fonts (http:dejavu-fonts)"
  pin=$(mise current http:dejavu-fonts) || return
  if ! grep -qF "DejaVu fonts $pin (c)" "$fonts/README.md"; then
    echo "preflight: $fonts isn't DejaVu fonts $pin; give the pin its own sha256" >&2
    exit 1
  fi
}

require_node_modules
case "${1:-}" in
  browser)
    require_browser_at_pin
    require_dejavu_at_pin
    ;;
esac
