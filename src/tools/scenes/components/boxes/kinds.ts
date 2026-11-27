import type { Box } from "../../lib/blocks";
import type { Problem } from "../../lib/checks";
import { parseArgs } from "../../lib/phone";
import type { Stmt } from "../../lib/statements";
import { phoneKey, stageBefore, type BoxCtx } from "./context";

/** What the box view knows about each kind of box besides how it's drawn (that's `BoxItem` in ./List.tsx): what it's
 *  called, which lines' problems it shows, and what else it shows (for its memo key). One entry per kind, so a new kind
 *  or a new thing a box shows is added here and nowhere else. */

type Kind<B extends Box> = {
  /** "Show as a card" */
  noun: string;
  /** the lines whose problems the box shows itself (nested boxes show their own) */
  problemLines: (b: B) => number[];
  /** what it shows of other lines (the stage, the message it replies to…), as a string for its memo key; null: it always
   *  draws again (its own lists then skip what didn't change) */
  shows: ((c: BoxCtx, b: B) => string) | null;
};

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const ownLines = (b: Box) => range(b.from, b.to);

const KINDS: { [K in Box["kind"]]: Kind<Extract<Box, { kind: K }>> } = {
  say: {
    noun: "a line",
    problemLines: ownLines,
    // whose voice and colours it has; in a chat, the message it replies to and the reactions on it
    shows: (c, b) => {
      const st = stageBefore(c, b.from);
      return `${st.pov}:${b.who === "extend" ? st.speaker : ""}:${b.who ? phoneKey(c, b.from, parseArgs(b.tail).reply) : ""}`;
    },
  },
  stmt: {
    noun: "a card",
    problemLines: ownLines,
    // what's on stage before it; a reaction, the message it's on
    shows: (c, b) => JSON.stringify(stageBefore(c, b.from)) + (isReact(b) ? phoneKey(c, b.from, b.stmt.ref) : ""),
  },
  note: { noun: "a note", problemLines: ownLines, shows: () => "" },
  raw: { noun: "Ren'Py", problemLines: ownLines, shows: () => "" },
  menu: { noun: "a choice", problemLines: b => [b.from, ...b.options.map(o => o.line)], shows: null },
  chat: { noun: "a chat", problemLines: b => [b.from], shows: null },
};

const kindOf = (b: Box) => KINDS[b.kind] as unknown as Kind<Box>;

/** What a box of this kind is called ("a card"). */
export const nounOf = (kind: Box["kind"]) => KINDS[kind].noun;

/** The problems a box shows (for nested boxes: only the lines the box itself draws). */
export const problemsOf = (c: BoxCtx, b: Box): Problem[] => kindOf(b).problemLines(b).flatMap(n => c.problems.get(n) ?? []);

/** What a box shows of other lines, for its memo key; null if it always draws again. */
export const showsOf = (c: BoxCtx, b: Box) => kindOf(b).shows?.(c, b) ?? null;

/** A reaction (`react rin_luck "👌"`): in a chat it's a row of its own (ReactRow), elsewhere a card. */
export type ReactBox = Extract<Box, { kind: "stmt" }> & { stmt: Extract<Stmt, { kind: "react" }> };
export const isReact = (b: Box): b is ReactBox => b.kind === "stmt" && b.stmt.kind === "react";
