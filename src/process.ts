// The process helper: a command that serves an app, started in a process group of its own, ready
// once a URL answers 2xx over HTTP, and stopped by ending the whole group, so a server it starts
// as a grandchild ends with it; and freePort.
// See docs/internals.md

import { spawn } from "node:child_process";
import { get as httpGet } from "node:http";
import { get as httpsGet } from "node:https";
import { createServer, type AddressInfo } from "node:net";
import { constants } from "node:os";

import { ended, kill } from "./group.ts";

/** How the command is started, and when it is ready. */
export interface StartOptions {
  /** The URL that answers 2xx over HTTP once the command's app is ready. */
  ready: string;
  /** The command's working directory; the caller's by default. */
  cwd?: string;
  /** Variables set over the caller's environment; one set to undefined is removed. */
  env?: Record<string, string | undefined>;
  /** How long, in ms, the command has to be ready, 30 s by default; past it, the group ends. */
  timeout?: number;
  /** How long, in ms, stop waits after SIGTERM before it sends SIGKILL, 5 s by default. */
  drain?: number;
}

/** A command start() started, once it is ready, until it is stopped. */
export interface Started {
  /** The command's pid, which is its process group's id. */
  pid: number;
  /** What the command has written to stdout and stderr, interleaved, its last 64 KiB. */
  output(): string;
  /**
   * Ends the whole group: SIGTERM, then SIGKILL once the drain passes, resolving once no process
   * of it is left, to the command's exit code, 128 plus the signal's number when a signal ended
   * it. A second call resolves as the first.
   */
  stop(): Promise<number>;
}

const KEPT_OUTPUT_CHARS = 64 * 1024;
const READY_POLL_MS = 100;
const READY_ASK_MS = 1000;

const liveGroups = new Set<number>();

const killLiveGroups = () => {
  for (const group of liveGroups) kill(group);
};

const ENDING_SIGNALS: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];

const reraiseAfterEnding = (signal: NodeJS.Signals) => {
  if (process.listenerCount(signal) > 1) return;
  killLiveGroups();
  releaseCaller();
  process.kill(process.pid, signal);
};

function endGroupsWithCaller(): void {
  if (liveGroups.size > 0) return;
  process.on("exit", killLiveGroups);
  for (const signal of ENDING_SIGNALS) process.on(signal, reraiseAfterEnding);
}

function releaseCaller(): void {
  process.off("exit", killLiveGroups);
  for (const signal of ENDING_SIGNALS) process.off(signal, reraiseAfterEnding);
}

function answers(url: string): Promise<boolean> {
  const get = url.startsWith("https:") ? httpsGet : httpGet;
  return new Promise((resolve) => {
    const request = get(url, { agent: false, timeout: READY_ASK_MS }, (response) => {
      response.resume();
      const status = response.statusCode ?? 0;
      resolve(status >= 200 && status < 300);
    });
    request.once("timeout", () => request.destroy());
    request.once("error", () => resolve(false));
  });
}

/**
 * Starts the command with its args in a process group of its own, resolving once the options'
 * ready URL answers 2xx over HTTP, to the Started handle. It rejects, its message carrying the
 * command's output, when the command exits first, or when the timeout passes, which ends the
 * group; and when the command cannot start. A group the caller never stops is sent SIGKILL as
 * the caller exits, or as a signal it doesn't listen for ends it.
 */
export async function start(
  command: string,
  args: string[],
  { ready, cwd, env = {}, timeout = 30_000, drain = 5_000 }: StartOptions,
): Promise<Started> {
  const childEnv: Record<string, string | undefined> = { ...process.env, ...env };
  for (const [name, value] of Object.entries(childEnv)) {
    if (value === undefined) delete childEnv[name];
  }
  const child = spawn(command, args, {
    cwd,
    env: childEnv,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const name = [command, ...args].join(" ");

  let log = "";
  const record = (chunk: string) => (log = (log + chunk).slice(-KEPT_OUTPUT_CHARS));
  child.stdout.setEncoding("utf8").on("data", record);
  child.stderr.setEncoding("utf8").on("data", record);
  const output = () => log;
  const outputTail = () =>
    log.trim() === "" ? "; it wrote no output" : `; its output:\n${log.trimEnd()}`;

  const exited = new Promise<number>((resolve) =>
    child.once("exit", (code, signal) =>
      resolve(code ?? 128 + (signal ? constants.signals[signal] : 0)),
    ),
  );
  let done: number | undefined;
  exited.then((code) => (done = code));

  const started = await new Promise<number | Error>((resolve) => {
    child.once("spawn", () => resolve(child.pid as number));
    child.once("error", (error) => resolve(error));
  });
  if (started instanceof Error) throw new Error(`${name} didn't start: ${started.message}`);
  const group = started;
  endGroupsWithCaller();
  liveGroups.add(group);

  let stopping: Promise<number> | undefined;
  const stop = () =>
    (stopping ??= (async () => {
      kill(group, "SIGTERM");
      if (!(await ended(group, drain))) {
        kill(group);
        await ended(group, drain);
      }
      const code = await exited;
      liveGroups.delete(group);
      if (liveGroups.size === 0) releaseCaller();
      return code;
    })());

  const deadline = performance.now() + timeout;
  for (;;) {
    if (await answers(ready)) return { pid: group, output, stop };
    if (done !== undefined) {
      await stop();
      throw new Error(`${name} exited with code ${done} before ${ready} answered${outputTail()}`);
    }
    if (performance.now() >= deadline) {
      await stop();
      throw new Error(`${name} wasn't ready at ${ready} within ${timeout} ms${outputTail()}`);
    }
    await Promise.race([new Promise((resolve) => setTimeout(resolve, READY_POLL_MS)), exited]);
  }
}

/** Resolves to a loopback port that no one listens on, as the system gives a listen on port 0. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      server.close(() => resolve(port));
    });
  });
}
