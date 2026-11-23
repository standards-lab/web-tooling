#!/usr/bin/env bash
# The build: src/ into a fresh dist/, tsc's emit, the bin made executable.
# See docs/development.md
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf dist
tsc -p .
chmod +x dist/bin/screenshots.js
