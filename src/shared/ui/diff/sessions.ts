import { ago, currentTexts, readCheckpoint } from "@/shared/lib/checkpoint";
import type { FileCompare, Version } from "@/shared/lib/diff/files";
import { conflictVersions, discard, keepMine, pendingVersions, settle } from "@/shared/lib/github";
import { plural } from "@/shared/lib/utils";
import { removeFile, writeText } from "@/shared/lib/workspace";
import type { ToolData } from "../tool-page";
import { openDiff, SIDES, type Outcome } from "./store";

/** The comparisons the app opens in the Changes view. Each writes the tool's edits out first, so "now" is now, and
 *  reloads the tool after applying, so it shows what was put back. */

type Data = Pick<ToolData, "flush" | "reload">;

/** Write each outcome's text (null: delete the file). */
async function writeOut(outcomes: Outcome[]) {
  for (const o of outcomes) {
    if (o.text === null) await removeFile(o.path);
    else await writeText(o.path, o.text);
  }
}

const undone = (n: number) => `Undid changes in ${plural(n, "file")}`;

/** GitHub: every unsaved change, against the repo's version it started from. Going back drops that change. */
export async function reviewGitHub(data: Data, focus?: string) {
  await data.flush();
  const files = await pendingVersions();
  openDiff({
    title: "What you'll save to GitHub",
    intro: "Your edits since the last save. Click a side to use it: going back to “On GitHub” drops that edit.",
    a: SIDES.github, b: SIDES.now, files, focus,
    apply: {
      verb: "Drop",
      run: async outcomes => {
        const whole = outcomes.filter(o => o.whole === "a" || o.binary);
        await discard(whole.map(o => o.path));
        await writeOut(outcomes.filter(o => !whole.includes(o)));
        await data.reload(`Dropped edits in ${plural(outcomes.length, "file")}`);
      },
    },
  });
}

/** Elsewhere: the files that differ from the checkpoint. Going back puts that part back as it was. */
export async function reviewCheckpoint(data: Data) {
  await data.flush();
  const [snap, now] = await Promise.all([readCheckpoint(), currentTexts()]);
  if (!snap) return;
  const before = new Map(Object.entries(snap.files));
  const files: FileCompare[] = [...new Set([...before.keys(), ...now.keys()])].sort()
    .flatMap(path => {
      const a = before.get(path) ?? null, b = now.get(path) ?? null;
      return a === b ? [] : [{ path, a, b }];
    });
  openDiff({
    title: "Changes since the checkpoint",
    intro: `Everything changed since the checkpoint (${ago(snap.at)}). Click a side to use it: going back to the checkpoint undoes that change.`,
    a: SIDES.checkpoint, b: SIDES.now, files,
    apply: { verb: "Undo", run: async outcomes => { await writeOut(outcomes); await data.reload(undone(outcomes.length)); } },
  });
}

/** Files someone else changed that a tool took over: how they were, how they are. Going back undoes their change here. */
export function reviewOutside(data: Data, files: FileCompare[]) {
  openDiff({
    title: "Changed somewhere else",
    intro: "Someone (another tab, Obsidian, a git pull, GitHub) changed these files and the tool loaded them. Going back to “Before” undoes that change here.",
    a: SIDES.before, b: { ...SIDES.now, label: "Their change" }, files,
    apply: { verb: "Undo", run: async outcomes => { await data.flush(); await writeOut(outcomes); await data.reload(undone(outcomes.length)); } },
  });
}

/** How one conflicted file was settled: its text (null: no file), or a whole side. */
export type Settle = (path: string, how: { text: Version; whole: Outcome["whole"]; binary: boolean }) => void | Promise<void>;

/** Files changed here and somewhere else: what only one side changed is merged already; clashes are picked. */
export function openMerge(files: FileCompare[], settleOne: Settle, after?: () => Promise<void>, intro?: string) {
  openDiff({
    title: files.length === 1 ? "Changed here and somewhere else" : `${files.length} files changed here and somewhere else`,
    intro: intro ?? "Someone else changed the same file while you were editing it. What only one of you changed is merged already; where you both changed the same thing, pick a side.",
    a: SIDES.mine, b: SIDES.theirs, files, merge: true,
    apply: {
      verb: "Use this merge",
      run: async outcomes => {
        for (const o of outcomes) await settleOne(o.path, o);
        await after?.();
      },
    },
  });
}

/** GitHub: the files a save stopped at, because someone pushed them meanwhile. Settled files are pending changes on
 *  top of their version; then `save` tries again. */
export async function mergeGitHub(data: Data, paths: string[], save: () => Promise<void>) {
  const files = await conflictVersions(paths);
  openMerge(files, async (path, how) => {
    if (how.binary) return how.whole === "b" ? discard([path]) : keepMine([path]);
    await settle(path, how.text);
  }, async () => {
    await data.reload("Merged with the changes on GitHub");
    await save();
  }, "Someone saved these files to GitHub since you started editing them. What only one of you changed is merged already; where you both changed the same thing, pick a side. Then it's saved.");
}
