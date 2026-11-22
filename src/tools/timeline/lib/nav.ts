import { useTimeline } from "../state";
import { laneDefs, lanesOf } from "./layout";
import { allEvents, castOf, findEvent, matches, threadsOf } from "./model";

/** Scrolling the board from elsewhere (sidebar, inspector, checks). The board fills these in while it's mounted. */
export const nav = {
  toChapter: (_id: string) => {},
  toEvent: (_id: string) => {},
};

/** Selects an event and scrolls to it. Unfolds its chapter, and drops the focus if that hides the event. */
export function reveal(id: string) {
  const st = useTimeline.getState();
  const f = findEvent(st.doc.chapters, id);
  if (!f) return;
  st.select({ kind: "event", id });
  if (st.folded.has(f.chapter.id)) st.toggleFolded(f.chapter.id);
  const { filter, doc } = st;
  const lanes = laneDefs(filter, castOf(doc.roster, doc.chapters), threadsOf(doc.threads, doc.chapters), allEvents(doc.chapters).map(x => x.event));
  const onBoard = lanesOf(f.event, filter, lanes).length > 0 && (!filter.hideOthers || matches(f.event, filter));
  if (!onBoard) {
    st.setFilter({ chars: [], threads: [], hideOthers: false }, null);
    st.setNotice("Showing everything: the focus hid that event.");
  }
  setTimeout(() => nav.toEvent(id), 60);
}
