import { create } from "zustand";
import type { FileCompare, Version } from "@/shared/lib/diff/files";

/** The Changes view: one full-page popup that every comparison in the app uses (what you'll save to GitHub, changes
 *  since the checkpoint, files someone else changed, conflicts). A session says what to compare, what the two sides
 *  are called and what applying the picks does. */

export type SideInfo = { label: string; color: string; /** "Before" says a change is gone, "Theirs" that it's another's. */ hint?: string };

/** What a file comes to with the picks made: its text (null: no file), and whether it differs from side b. */
export type Outcome = { path: string; text: Version; changed: boolean; whole: "a" | "b" | "mixed"; binary: boolean };

export type DiffSession = {
  title: string;
  /** A line under the title, saying what's compared. */
  intro?: string;
  a: SideInfo;
  b: SideInfo;
  files: FileCompare[];
  /** A merge: every clash must be picked before applying, and applying settles every file (not just changed ones). */
  merge?: boolean;
  /** The file shown first. */
  focus?: string;
  /** The apply button ("Undo 2 changes" is made from `verb` and the count) and what it does. Returns a message to
   *  show, if any. Left out: nothing to apply (just looking). */
  apply?: { verb: string; run: (outcomes: Outcome[]) => Promise<string | void> };
};

export const useDiff = create<{ session: DiffSession | null }>()(() => ({ session: null }));
export const openDiff = (session: DiffSession) => useDiff.setState({ session });
export const closeDiff = () => useDiff.setState({ session: null });

// ---------------------------------------------------------------- changed elsewhere

/** Files someone else changed that a tool just took over, for the "See what changed" link on its notice. */
export type Outside = { id: number; text: string; files: FileCompare[] };

let nextId = 1;
let timer: ReturnType<typeof setTimeout> | undefined;
export const useOutside = create<{ last: Outside | null }>()(() => ({ last: null }));

/** Say that files changed elsewhere were reloaded (instead of the tool's own notice), with a link to see how. */
export function noteOutside(text: string, files: FileCompare[]) {
  clearTimeout(timer);
  useOutside.setState({ last: { id: nextId++, text, files } });
  timer = setTimeout(() => useOutside.setState({ last: null }), 10_000);
}
export const dismissOutside = () => { clearTimeout(timer); useOutside.setState({ last: null }); };

/** The sides' names and colours, so every Changes view says the same. */
export const SIDES = {
  before: { label: "Before", color: "var(--color-coral)", hint: "Going back to this undoes the change." },
  checkpoint: { label: "At the checkpoint", color: "var(--color-coral)", hint: "Going back to this undoes the change." },
  github: { label: "On GitHub", color: "var(--color-coral)", hint: "Going back to this drops your change." },
  now: { label: "Now", color: "var(--color-caramel)" },
  mine: { label: "Yours", color: "var(--color-caramel)" },
  theirs: { label: "Theirs", color: "var(--color-periwinkle)" },
} satisfies Record<string, SideInfo>;
