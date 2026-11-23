import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { SETTLED, launch, until } from "@standards-lab/web-tooling/browser.js";
import type { Browser, Page } from "@standards-lab/web-tooling/browser.js";

const page = (html: string): string => `data:text/html,${encodeURIComponent(html)}`;

async function withEnv(
  name: string,
  value: string | undefined,
  body: () => Promise<void>,
): Promise<void> {
  const saved = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    await body();
  } finally {
    if (saved === undefined) delete process.env[name];
    else process.env[name] = saved;
  }
}

describe("launch", () => {
  test("an unset BROWSER_EXECUTABLE rejects, saying so", async () => {
    await withEnv("BROWSER_EXECUTABLE", undefined, async () => {
      await assert.rejects(launch(), /BROWSER_EXECUTABLE names no browser/);
    });
  });

  test("the browser's profile is a temporary directory, removed on close", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "browser-test."));
    try {
      await withEnv("TMPDIR", scratch, async () => {
        const browser = await launch();
        const profiles = readdirSync(scratch);
        await browser.close();
        assert.equal(profiles.length, 1);
        assert.match(profiles[0], /^browser-pipe\./);
        assert.deepEqual(readdirSync(scratch), []);
      });
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  test("a process that exits without close ends the browser and removes its profile", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "browser-test."));
    try {
      const script = `
        import { readFileSync } from "node:fs";
        import { launch } from "@standards-lab/web-tooling/browser.js";
        await launch();
        const children = readFileSync(\`/proc/\${process.pid}/task/\${process.pid}/children\`, "utf8");
        console.log(children.trim());
        process.exit(0);
      `;
      const child = spawn(process.execPath, ["--input-type=module", "-e", script], {
        cwd: import.meta.dirname,
        env: { ...process.env, TMPDIR: scratch },
        stdio: ["ignore", "pipe", "inherit"],
      });
      let stdout = "";
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => (stdout += chunk));
      const [code] = await once(child, "exit");
      assert.equal(code, 0);
      const pid = Number(stdout.trim());
      assert.ok(Number.isInteger(pid) && pid > 0, `no browser pid in ${JSON.stringify(stdout)}`);

      const gone = () => {
        try {
          process.kill(pid, 0);
          return false;
        } catch (error) {
          return (error as NodeJS.ErrnoException).code === "ESRCH";
        }
      };
      const deadline = performance.now() + 5000;
      while (!gone() && performance.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      assert.ok(gone(), `the browser, pid ${pid}, outlived the process`);
      assert.deepEqual(readdirSync(scratch), [], "the profile outlived the process");
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  test("resolves only the loopback names, so another name fails with no network", async () => {
    const server = createServer((_request, response) =>
      response.writeHead(200, { "content-type": "text/html" }).end("<title>loopback</title>"),
    );
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const { port } = server.address() as AddressInfo;
    const browser = await launch();
    try {
      const tab = await browser.open(`http://localhost:${port}/`);
      try {
        assert.equal(await tab.evaluate("document.title"), "loopback");
        const started = performance.now();
        await assert.rejects(tab.goto("http://example.com/"), /ERR_NAME_NOT_RESOLVED/);
        assert.ok(performance.now() - started < 1000, "the failure took a lookup's time");
        await assert.rejects(tab.goto(`http://page.localhost:${port}/`), /ERR_NAME_NOT_RESOLVED/);
      } finally {
        await tab.close();
      }
    } finally {
      await browser.close();
      server.close();
    }
  });
});

describe("a page", () => {
  let browser: Browser;
  before(async () => {
    browser = await launch();
  });
  after(() => browser.close());

  test("runs en-US, in UTC, at 1280×720", async () => {
    const tab = await browser.open(page("<p>settings</p>"));
    try {
      assert.deepEqual(
        await tab.evaluate(
          "({ language: navigator.language, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, width: innerWidth, height: innerHeight })",
        ),
        { language: "en-US", timeZone: "UTC", width: 1280, height: 720 },
      );
    } finally {
      await tab.close();
    }
  });

  test("goes to a URL, evaluates, sends protocol commands, hears events, and closes", async () => {
    const tab = await browser.open(page("<title>first</title>"));
    assert.equal(await tab.evaluate("document.title"), "first");

    await tab.goto(page("<title>second</title>"));
    assert.equal(await tab.evaluate("document.title"), "second");
    assert.equal(await tab.evaluate("Promise.resolve(6 * 7)"), 42);
    await assert.rejects(tab.evaluate("missing.name"), /ReferenceError: missing is not defined/);

    const { result }: { result: { value: unknown } } = await tab.cdp("Runtime.evaluate", {
      expression: "document.title.length",
      returnByValue: true,
    });
    assert.equal(result.value, 6);

    await tab.cdp("Runtime.enable");
    const logged = new Promise((resolve) =>
      tab.on("Runtime.consoleAPICalled", ({ args }: { args: { value: unknown }[] }) =>
        resolve(args[0].value),
      ),
    );
    await tab.evaluate("console.log('heard')");
    assert.equal(await logged, "heard");

    const other = await browser.open(page("<title>other</title>"));
    try {
      const titles = async (): Promise<string[]> => {
        const { targetInfos }: { targetInfos: { type: string; title: string }[] } =
          await other.cdp("Target.getTargets");
        return targetInfos.filter(({ type }) => type === "page").map(({ title }) => title);
      };
      assert.ok((await titles()).includes("second"));
      await tab.close();
      const deadline = performance.now() + 5000;
      while ((await titles()).includes("second") && performance.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      assert.ok(!(await titles()).includes("second"), "the closed page is still open");
    } finally {
      await other.close();
    }
  });

  test("shows a scroll region's scrollbar, which takes width from its content", async () => {
    const region = page(
      "<div id=region style='width: 200px; height: 100px; overflow: auto'><div style='height: 1000px'></div></div>",
    );
    const gutter =
      "(() => { const el = document.getElementById('region'); return el.offsetWidth - el.clientWidth; })()";
    const tab = await browser.open(region);
    try {
      assert.ok((await tab.evaluate(gutter)) > 0, "the scrollbar takes no width");
      await tab.cdp("Emulation.setScrollbarsHidden", { hidden: true });
      await tab.goto(region);
      assert.equal(await tab.evaluate(gutter), 0);
    } finally {
      await tab.close();
    }
  });
});

describe("until", () => {
  let browser: Browser;
  let tab: Page;
  before(async () => {
    browser = await launch();
    tab = await browser.open(page("<p>until</p>"));
  });
  after(() => browser.close());

  test("resolves to the expression's value once it is truthy", async () => {
    await tab.evaluate("setTimeout(() => (window.later = { answer: 42 }), 200)");
    assert.equal(await tab.evaluate("window.later"), undefined);
    assert.deepEqual(await until(tab, "window.later"), { answer: 42 });
  });

  test("rejects after its timeout, naming the expression and the timeout", async () => {
    const started = performance.now();
    await assert.rejects(until(tab, "window.never", 150), /not within 150 ms: window\.never/);
    assert.ok(performance.now() - started >= 150, "rejected before the timeout");
  });

  test("rejects with the error the expression throws", async () => {
    await tab.evaluate("setTimeout(() => (window.broken = true), 100)");
    await assert.rejects(
      until(tab, "window.broken && window.missing.name", 2000),
      /TypeError: Cannot read properties of undefined/,
    );
  });
});

describe("SETTLED", () => {
  test("resolves once the fonts are ready and two frames have painted", async () => {
    const browser = await launch();
    try {
      const tab = await browser.open(
        page(`<script>
          window.painted = 0;
          const tick = () => { window.painted++; requestAnimationFrame(tick); };
          requestAnimationFrame(tick);
          const ready = Object.getOwnPropertyDescriptor(FontFaceSet.prototype, "ready").get;
          Object.defineProperty(document.fonts, "ready", {
            get: () => new Promise((resolve) => setTimeout(() => {
              window.paintedAtReady = window.painted;
              resolve(ready.call(document.fonts));
            }, 200)),
          });
        </script>`),
      );
      const reading: { ready: boolean; frames: number } =
        await tab.evaluate(`(${SETTLED}).then(() => ({
        ready: window.paintedAtReady !== undefined,
        frames: window.painted - window.paintedAtReady,
      }))`);
      assert.equal(reading.ready, true, "settled before the fonts were ready");
      assert.ok(reading.frames >= 2, `settled ${reading.frames} frames after the fonts were ready`);
    } finally {
      await browser.close();
    }
  });
});
