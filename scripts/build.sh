#!/usr/bin/env bash
# From spike-html-apps-tooling (d77877b): scripts/build.sh.
# Adapted from spike-html-apps-foundation (9c15b8d): scripts/build.sh, with no copied files and the bin's mode.
# The build: src/ into a fresh dist/, tsc's emit, the bin made executable.
# See docs/development.md
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf dist
tsc -p .
chmod +x dist/bin/screenshots.js
