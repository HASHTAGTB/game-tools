import { crumpleAll } from "@/shared/ui/flair";
import { cardsOf } from "../components/BoardCard";
import { chapterIdFor, useTimeline } from "../state";
import { deleteEvent, findEvent, orderBetween } from "./model";
import { nav } from "./nav";

/** What the toolbar, the sidebar, the Inspector and the keyboard all do the same way. */

/** A new chapter after the selected one (or the selected event's), else at the end. */
export function newChapter() {
  const { doc, selection: sel, edit, select } = useTimeline.getState();
  const after = sel?.kind === "chapter" ? sel.id : sel?.kind === "event" ? findEvent(doc.chapters, sel.id)?.chapter.id : undefined;
  const i = after ? doc.chapters.findIndex(c => c.id === after) : doc.chapters.length - 1;
  const order = orderBetween(doc.chapters[i]?.order, doc.chapters[i + 1]?.order);
  const id = chapterIdFor(doc.chapters, "new-chapter");
  edit(d => { d.chapters.push({ version: 2, id, name: "New chapter", order, columns: ["", "", ""], events: [] }); });
  select({ kind: "chapter", id });
  setTimeout(() => nav.toChapter(id), 50);
}

/** Delete an event (and the arrows to and from it). No "are you sure?": Ctrl+Z brings it back, and the notice says so. */
export function removeEvent(id: string) {
  const { select, edit, setNotice } = useTimeline.getState();
  select(null);
  crumpleAll(cardsOf(id), () => {
    edit(d => deleteEvent(d.chapters, id));
    setNotice("Deleted the event. Ctrl+Z brings it back.");
  });
}
