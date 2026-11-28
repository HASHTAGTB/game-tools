import { serialQueue, whileVisible } from "./toolState";
import { locationVersion, readFile, removeFile, statFile, writeText, type FileData } from "./workspace";

/** Keeps a tool's data and its files in the data folder in step, for tools whose data is a set of JSON files (the
 *  Timeline's chapters, the Prompt Builder's characters). The tool says what its data is as files (`files`) and how one
 *  file goes into it (`applyFile`); this writes the files that changed, deletes the ones that went, and every few
 *  seconds picks up files changed somewhere else (git pull, another tab, GitHub). A file changed on both sides becomes
 *  a conflict for the user to settle.
 *
 *  For each file it remembers the text as this tab last read or wrote it and the file's change time: the text to skip
 *  writes that change nothing, the time to notice someone else's change. The text is the tool's own way of writing the
 *  data it read, so a file that is only formatted differently isn't rewritten until it's really edited. */

/** Someone else changed (or deleted: `theirs` null) a file while this tab had unsaved edits to it. */
export type FileConflict = { path: string; label: string; theirs: string | null; mtime: number | null };

/** A file someone else changed that was taken over (null: it didn't exist / was deleted). */
export type OutsideChange = { path: string; before: string | null; after: string | null };

/** How a conflict is settled: their file, mine over it, or a text put together from both (null: no file). */
export type Resolution = "mine" | "theirs" | { text: string | null };

export type FileSyncConfig<D> = {
  /** The data before any file is read into it. */
  empty: D;
  get: () => D;
  set: (data: D) => void;
  /** The data as files: path → text. */
  files: (data: D) => Map<string, string>;
  /** `data` with one file's text put in (null: the file was deleted). Null if the file isn't something this tool can
   *  use (left alone); throws if it doesn't parse (half-written? tried again next time). */
  applyFile: (data: D, path: string, text: string | null) => D | null;
  /** The data's files in the data folder (files others add show up through this). */
  list: () => Promise<string[]>;
  /** What a file that doesn't exist yet stands for (an empty list): it's only written once it holds something else. */
  blank?: (path: string) => string | undefined;
  /** What a file is called in messages ("Chapter "Prolog""). */
  label: (path: string) => string;
  conflicts: () => FileConflict[];
  setConflicts: (c: FileConflict[]) => void;
  onError: (e: unknown) => void;
  /** Files changed elsewhere were taken over: their labels, and each file before and after. */
  onReloaded: (labels: string[], changes: OutsideChange[]) => void;
};

/** Write `text` to `path` unless the file changed since this tab knew it at `mtime` (null: it didn't exist). Returns
 *  the new change time, or the file as it is now (null: deleted) when someone else changed it. */
export async function writeIfUnchanged(path: string, text: string, mtime: number | null): Promise<{ mtime: number } | { theirs: FileData | null }> {
  if ((await statFile(path)) !== mtime) return { theirs: await readFile(path) };
  return { mtime: await writeText(path, text) };
}

export function createFileSync<D>(c: FileSyncConfig<D>) {
  const serial = serialQueue();
  let known = new Map<string, FileData>();
  /** The location the files were last read from (`locationVersion`). */
  let loadedFor = -1;

  const files = () => c.files(c.get());
  /** The text a file holds as far as this tab knows. */
  const base = (path: string) => known.get(path)?.text ?? c.blank?.(path) ?? null;
  /** After reading `f` into the data: remember it as the tool writes it. */
  const remember = (path: string, f: FileData | null) => {
    if (!f) return void known.delete(path);
    known.set(path, { text: files().get(path) ?? f.text, mtime: f.mtime });
  };
  const addConflict = (path: string, f: FileData | null) => {
    if (c.conflicts().some(x => x.path === path)) return;
    c.setConflicts([...c.conflicts(), { path, label: c.label(path), theirs: f?.text ?? null, mtime: f?.mtime ?? null }]);
  };
  /** `start` with these files put in, and the paths that could be used. */
  const applyAll = (start: D, list: [string, string | null][]) => {
    let data = start;
    const used: string[] = [];
    for (const [path, text] of list) {
      try {
        const next = c.applyFile(data, path, text);
        if (next !== null) { data = next; used.push(path); }
      } catch { /* doesn't parse: left alone */ }
    }
    c.set(data);
    return new Set(used);
  };

  async function flushNow() {
    const now = files();
    const blocked = new Set(c.conflicts().map(x => x.path));
    for (const [path, text] of now) {
      if (blocked.has(path) || text === base(path)) continue;
      const r = await writeIfUnchanged(path, text, known.get(path)?.mtime ?? null);
      if ("theirs" in r) addConflict(path, r.theirs);
      else known.set(path, { text, mtime: r.mtime });
    }
    // files whose data was deleted here
    for (const [path, k] of [...known]) {
      if (now.has(path) || blocked.has(path)) continue;
      const mtime = await statFile(path);
      if (mtime !== null && mtime !== k.mtime) { addConflict(path, await readFile(path)); continue; }
      await removeFile(path);
      known.delete(path);
    }
  }

  async function pollNow() {
    const mine = files();
    const paths = [...new Set([...await c.list(), ...mine.keys(), ...known.keys()])];
    const times = await Promise.all(paths.map(statFile));
    const changed = paths.flatMap((p, i) => (times[i] === (known.get(p)?.mtime ?? null) ? [] : [{ path: p, mtime: times[i] }]));
    const read = await Promise.all(changed.map(x => (x.mtime === null ? null : readFile(x.path))));
    const incoming: [string, FileData | null][] = [];
    changed.forEach(({ path }, i) => {
      const f = read[i], here = mine.get(path) ?? null;
      if ((f?.text ?? null) === here) remember(path, f);
      else if (here !== base(path)) addConflict(path, f);   // edited here too
      else incoming.push([path, f]);
    });
    if (!incoming.length) return;
    const before = new Map(incoming.map(([p]) => [p, known.get(p)?.text ?? null]));
    const used = applyAll(c.get(), incoming.map(([p, f]) => [p, f?.text ?? null]));
    for (const [p, f] of incoming) if (used.has(p)) remember(p, f);
    if (used.size) c.onReloaded([...used].map(c.label), incoming.filter(([p]) => used.has(p)).map(([path, f]) => ({ path, before: before.get(path)!, after: f?.text ?? null })));
  }

  return {
    /** Read every file into `empty`. Returns the files that couldn't be used. */
    load: async (): Promise<string[]> => {
      const version = locationVersion();
      const paths = await c.list();
      const texts = await Promise.all(paths.map(p => readFile(p)));
      const read = paths.flatMap((p, i): [string, FileData][] => (texts[i] ? [[p, texts[i]!]] : []));
      const used = applyAll(c.empty, read.map(([p, f]) => [p, f.text]));
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
    /** A conflict's three versions: where this tab started (`o`), its own (`a`) and theirs (`b`). */
    versions: (path: string) => {
      const x = c.conflicts().find(y => y.path === path);
      return x ? { path, o: base(path), a: files().get(path) ?? null, b: x.theirs } : null;
    },
    /** "theirs": take their file; "mine": count theirs as seen, so the next flush overwrites it; `{ text }`: put
     *  that in (a merge of both) and write it over theirs. */
    resolve: (path: string, keep: Resolution) => {
      const x = c.conflicts().find(y => y.path === path);
      if (!x) return;
      c.setConflicts(c.conflicts().filter(y => y.path !== path));
      const theirs = x.theirs === null ? null : { text: x.theirs, mtime: x.mtime! };
      if (keep === "theirs" || (typeof keep === "object" && keep.text === x.theirs)) {
        applyAll(c.get(), [[path, x.theirs]]);
        remember(path, theirs);
        return;
      }
      if (typeof keep === "object") applyAll(c.get(), [[path, keep.text]]);
      if (theirs) known.set(path, theirs); else known.delete(path);
      void serial(() => flushNow().catch(c.onError));
    },
  };
}
