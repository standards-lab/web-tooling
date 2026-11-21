// From spike-html-apps-tooling (d77877b): test/support/processes.ts.
// What a test reads of the system's processes, from Linux's /proc: whether a pid is running, a
// zombie counting as gone, as it is dead and only waits to be reaped; its parent; and the running
// members of a process group.

import { readFileSync, readdirSync } from "node:fs";

function stat(pid: number): { state: string; parent: number; group: number } | undefined {
  let text: string;
  try {
    text = readFileSync(`/proc/${pid}/stat`, "utf8");
  } catch {
    return undefined;
  }
  const afterCommand = text.slice(text.lastIndexOf(")") + 2);
  const [state, parent, group] = afterCommand.split(" ");
  return { state, parent: Number(parent), group: Number(group) };
}

/** Whether the process is running: it exists and is no zombie. */
export function running(pid: number): boolean {
  const found = stat(pid);
  return found !== undefined && found.state !== "Z" && found.state !== "X";
}

/** The process's parent's pid; undefined once it is gone. */
export function parent(pid: number): number | undefined {
  return stat(pid)?.parent;
}

/** The running processes of the group, by pid. */
export function members(group: number): number[] {
  return readdirSync("/proc")
    .filter((entry) => /^\d+$/.test(entry))
    .map(Number)
    .filter((pid) => stat(pid)?.group === group && running(pid));
}
