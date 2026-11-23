import { after } from "node:test";

import { useDejaVu } from "@standards-lab/web-tooling/fonts.js";

const remove = useDejaVu();
await import("./fonts-suite.ts");
after(remove);
