#!/usr/bin/env bash
# Adapted from spike-html-apps-tooling (d77877b): scripts/build.sh, with no bin to make executable.
# The build: src/ into a fresh dist/. tsc emits each module's .js and .d.ts.
# Adapted from spike-html-apps-foundation (9c15b8d): scripts/build.sh, with no copied files.
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf dist
tsc -p .
