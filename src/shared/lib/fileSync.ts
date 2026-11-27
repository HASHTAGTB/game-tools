import { serialQueue, whileVisible } from "./toolState";
import { locationVersion, readFile, removeFile, statFile, writeText, type FileData } from "./workspace";

/** Keeps a tool's data and its files in the data folder in step, for tools whose data is a set of JSON files (the
 *  Timeline's chapters, the Prompt Builder's characters). The tool says what its data is as files (`files`); this
 *  writes the ones that changed, deletes the ones that went, and every few seconds picks up files changed somewhere
 *  else (git pull, another tab, GitHub). A file changed on both sides becomes a conflict for the user to settle.
 *
 *  For each file it remembers the text as this tab last read or wrote it and the file's change time: the text to skip
 *  writes that change nothing, the time to notice someone else's change. The text is the tool's own way of writing the
 *  data it read, so a file that is only formatted differently isn't rewritten until it's really edited. */

/** Someone else changed (or deleted: `theirs` null) a file while this tab had unsaved edits to it. */
export type FileConflict = { path: string; label: string; theirs: string | null; mtime: number | null };

export type FileSyncConfig = {
  /** The data as files right now: path → text. */
  files: () => Map<string, string>;
  /** The data's files in the data folder (files others add show up through this). */
  list: () => Promise<string[]>;
  /** What a file that doesn't exist yet stands for (an empty list): it's only written once it holds something else. */
  blank?: (path: string) => string | undefined;
  /** Replace the data with what was read. Returns the paths it could use (a file that doesn't parse is left alone). */
  load: (files: [string, string][]) => string[];
  /** Put files read from disk into the data (text null: deleted). Returns the paths it could use; one that doesn't
   *  parse (half-written?) is tried again next time. */
  apply: (files: [string, string | null][]) => string[];
  /** What a file is called in messages ("Chapter "Prolog""). */
  label: (path: string) => string;
  conflicts: () => FileConflict[];
  setConflicts: (c: FileConflict[]) => void;
  onError: (e: unknown) => void;
  /** Files changed elsewhere were taken over (their labels). */
  onReloaded: (labels: string[]) => void;
};

export function createFileSync(c: FileSyncConfig) {
  const serial = serialQueue();
  let known = new Map<string, FileData>();
  /** The location the files were last read from (`locationVersion`). */
  let loadedFor = -1;

  /** The text a file holds as far as this tab knows. */
  const base = (path: string) => known.get(path)?.text ?? c.blank?.(path) ?? null;
  /** After reading `f` into the data: remember it as the tool writes it. */
  const remember = (path: string, f: FileData | null) => {
    if (!f) return void known.delete(path);
    known.set(path, { text: c.files().get(path) ?? f.text, mtime: f.mtime });
  };
  const addConflict = (path: string, f: FileData | null) => {
    if (c.conflicts().some(x => x.path === path)) return;
    c.setConflicts([...c.conflicts(), { path, label: c.label(path), theirs: f?.text ?? null, mtime: f?.mtime ?? null }]);
  };

  async function flushNow() {
    const files = c.files();
    const blocked = new Set(c.conflicts().map(x => x.path));
    for (const [path, text] of files) {
      if (blocked.has(path) || text === base(path)) continue;
      const now = await statFile(path);
      if (now !== (known.get(path)?.mtime ?? null)) { addConflict(path, await readFile(path)); continue; }
      known.set(path, { text, mtime: await writeText(path, text) });
    }
    // files whose data was deleted here
    for (const [path, k] of [...known]) {
      if (files.has(path) || blocked.has(path)) continue;
      const now = await statFile(path);
      if (now !== null && now !== k.mtime) { addConflict(path, await readFile(path)); continue; }
      await removeFile(path);
      known.delete(path);
    }
  }

  async function pollNow() {
    const files = c.files();
    const paths = new Set([...await c.list(), ...files.keys(), ...known.keys()]);
    const incoming: [string, FileData | null][] = [];
    // the change times a few at a time (on GitHub each is a request), then the few files that changed one by one
    const list = [...paths], times = new Map<string, number | null>();
    for (let i = 0; i < list.length; i += 8) {
      const batch = list.slice(i, i + 8);
      (await Promise.all(batch.map(statFile))).forEach((t, j) => times.set(batch[j], t));
    }
    for (const path of paths) {
      const now = times.get(path) ?? null;
      if (now === (known.get(path)?.mtime ?? null)) continue;
      const f = now === null ? null : await readFile(path);
      const mine = files.get(path) ?? null;
      if ((f?.text ?? null) === mine) { remember(path, f); continue; }
      if (mine !== base(path)) { addConflict(path, f); continue; }   // edited here too
      incoming.push([path, f]);
    }
    if (!incoming.length) return;
    const used = new Set(c.apply(incoming.map(([p, f]) => [p, f?.text ?? null])));
    for (const [p, f] of incoming) if (used.has(p)) remember(p, f);
    if (used.size) c.onReloaded([...used].map(c.label));
  }

  return {
    /** Read every file and hand them to `load`. Returns the files that couldn't be used. */
    load: async (): Promise<string[]> => {
      const version = locationVersion();
      const paths = await c.list();
      const read: [string, FileData][] = [];
      // a few at a time: on GitHub each file is a request
      for (let i = 0; i < paths.length; i += 8) {
        const batch = paths.slice(i, i + 8);
        const fs = await Promise.all(batch.map(p => readFile(p)));
        batch.forEach((p, j) => { const f = fs[j]; if (f) read.push([p, f]); });
      }
      const used = new Set(c.load(read.map(([p, f]) => [p, f.text])));
      known = new Map();
      for (const [p, f] of read) if (used.has(p)) remember(p, f);
      c.setConflicts([]);
      loadedFor = version;
      return read.filter(([p]) => !used.has(p)).map(([p]) => p);
    },
    /** Forget everything (no data folder to use). */
    reset: () => { known = new Map(); loadedFor = -1; c.setConflicts([]); },
    /** The data was read from the location in use (another tool was open meanwhile: no need to read it all again). */
    current: () => loadedFor === locationVersion(),
    /** Look for changes made elsewhere now, instead of at the next poll. */
    check: () => serial(() => pollNow().catch(() => {})),
    /** Write what changed. */
    flush: () => serial(() => flushNow().catch(c.onError)),
    /** Run `fn` when no write is running (dropping unsaved edits, then loading again). */
    run: (fn: () => Promise<void>) => serial(fn),
    /** Look for changes made elsewhere every few seconds while `ready()`. Returns the stop function. */
    watch: (ready: () => boolean) => whileVisible(() => {
      if (ready()) serial(() => pollNow().catch(() => { /* offline, permission gone: the next load shows it */ }));
    }),
    /** "theirs": take their file; "mine": count theirs as seen, so the next flush overwrites it. */
    resolve: (path: string, keep: "mine" | "theirs") => {
      const x = c.conflicts().find(y => y.path === path);
      if (!x) return;
      c.setConflicts(c.conflicts().filter(y => y.path !== path));
      const theirs = x.theirs === null ? null : { text: x.theirs, mtime: x.mtime! };
      if (keep === "theirs") {
        c.apply([[path, x.theirs]]);
        remember(path, theirs);
      } else {
        if (theirs) known.set(path, theirs); else known.delete(path);
        void serial(() => flushNow().catch(c.onError));
      }
    },
  };
}
