/** Timeline data, in the data folder's `.game-tools/timeline/`:
 *
 *    chapters/<id>.json   one chapter (a stretch of story time) with its events. One file each, so authors editing
 *                         different chapters never touch the same file.
 *    threads.json         storylines that run across chapters ("Love", "Kaishis Zerfall")
 *    views.json           saved views (a filter + grouping), shared by everyone
 *
 *  Time is order, not maths: chapters are ordered blocks, and each chapter is a row of columns. Events in the same
 *  column happen at the same time; an event can span several columns. Dates are only labels. */

export type Chapter = {
  version: 2;
  id: string;
  name: string;
  /** Sort key along the axis (any number; moving a chapter only renumbers that one). */
  order: number;
  /** When it happens, as free text: "2012 – 2020", "07. – 11.04.2025". */
  when?: string;
  notes?: string;
  /** One label per column ("" for none). Its length is the number of columns. */
  columns: string[];
  events: StoryEvent[];
};

export type StoryEvent = {
  id: string;
  title: string;
  note?: string;
  /** Characters who do something important here; the event shows on each of their lanes. */
  chars: string[];
  /** Thread ids. */
  threads: string[];
  /** Column within its chapter (0-based). */
  col: number;
  /** How many columns it covers. Missing: 1. */
  span?: number;
  /** Arrows to other events (any chapter). They belong to the event they start at. */
  links?: Link[];
};

export type Link = { to: string; label?: string };

export type Thread = { id: string; name: string; color: string; notes?: string };

export type GroupBy = "chars" | "threads" | "none";

/** What the board shows. A saved view is this plus a name; the current one is kept per browser. */
export type Filter = {
  groupBy: GroupBy;
  /** Only these characters (empty: all). */
  chars: string[];
  /** Only these threads (empty: all). */
  threads: string[];
  /** Hide what doesn't match instead of dimming it; empty columns and chapters fold away. */
  hideOthers: boolean;
};

export type View = Filter & { id: string; name: string };

export const NO_FILTER: Filter = { groupBy: "chars", chars: [], threads: [], hideOthers: false };
