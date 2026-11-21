#!/usr/bin/env node
// Adapted from spike-html-apps-tooling (d77877b): src/bin/screenshots.ts, the bin named web-screenshots.
// The screenshot bin, web-screenshots: runs the command screenshots.ts carries over its arguments,
// the description module's path then the flags, and exits with its code.

import { main } from "../screenshots.ts";

process.exitCode = await main(process.argv.slice(2));
