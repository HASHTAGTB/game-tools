/** Timeline data. Each arc is one file, `.game-tools/timeline/arcs/<id>.json`, so several authors editing different arcs
 *  never touch the same file. Event and arc ids are unique across all arcs; connections may cross arcs.
 *
 *  Time is "story time". A `When` is either a fixed in-world date or relative to another event or arc, so a plan can
 *  start vague ("2 days after X") and get pinned to real dates later without changing anything that depends on it. */

/** Duration text: "4h", "2d", "1d6h", "0.5d", "-1d1.5h" (negative only makes sense for offsets). */
export type Duration = string;

/** Something a relative time points at: an event, or a whole arc. */
export type Ref = { event: string } | { arc: string };

export type When =
  /** A fixed in-world date. The format sets the precision: "2025", "2025-04", "2025-04-07" or "2025-04-07T10:00". */
  | { at: string }
  /** `gap` after the end of `ref`. */
  | { after: Ref; gap?: Duration }
  /** `offset` from the start of `ref` (parallel to it; negative is earlier). */
  | { from: Ref; offset?: Duration };

export type StoryEvent = {
  id: string;
  /** Characters the event belongs to; it shows on each of their lanes. */
  chars: string[];
  text: string;
  when: When;
  /** How long the event lasts. Missing: DEFAULT_LENGTH. */
  length?: Duration;
  /** Vault path of the scene file that tells this event, e.g. "CANON/03_Story/02_Scenes/Woche 1/07.04.2025 Mo.md". */
  scene?: string;
  /** Facts (ids) the event's characters find out here. `who` narrows it to some of them. */
  learns?: { fact: string; who?: string[] }[];
  /** Facts the event's characters act on, so they must know them already. */
  needs?: string[];
};

/** Something characters can know or not know yet: a secret, a feeling, news. `.game-tools/timeline/facts.json`. */
export type Fact = { id: string; name: string; notes?: string };

export type Connection = {
  id: string;
  from: string;
  to: string;
  label?: string;
};

export type Arc = {
  version: 1;
  id: string;
  name: string;
  /** Where the arc starts. Its end is its last event's end, or `end` if that is later. A fixed `end` date counts
   *  inclusively: "2025-04-11" means the end of that day. */
  start: When;
  end?: When;
  color?: string;
  /** Vault folder holding this arc's scene files. */
  folder?: string;
  notes?: string;
  events: StoryEvent[];
  /** Connections whose `from` event is in this arc. */
  connections: Connection[];
};

export const DEFAULT_LENGTH: Duration = "12h";
