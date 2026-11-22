import { useEffect, useMemo, useRef } from "react";
import { Minus, Plus, Redo2, SquarePlus, Undo2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { IconButton } from "@/shared/ui/icon-button";
import { Toasts } from "@/shared/ui/toasts";
import { runChecks, type Check } from "./lib/checks";
import { allConnections, deleteEvent } from "./lib/edit";
import type { Arc } from "./lib/types";
import { useTimeline } from "./state";
import { ChecksButton } from "./components/Checks";
import { Inspector } from "./components/Inspector";
import { Sidebar } from "./components/Sidebar";
import { TimelineCanvas, type CanvasApi } from "./components/TimelineCanvas";

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export default function Timeline() {
  const s = useTimeline();
  const { loc, loaded, doc, res, scenes, error, notice, conflicts, pxPerHour, canUndo, canRedo } = s;
  const canvas = useRef<CanvasApi | null>(null);

  useEffect(() => useTimeline.getState().init(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useTimeline.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z" && !typing(e.target)) { e.preventDefault(); if (e.shiftKey) st.redo(); else st.undo(); return; }
      if (mod && e.key.toLowerCase() === "y" && !typing(e.target)) { e.preventDefault(); st.redo(); return; }
      if (typing(e.target)) { if (e.key === "Escape") (e.target as HTMLElement).blur(); return; }
      if (e.key === "Escape") st.select(null);
      if ((e.key === "Delete" || e.key === "Backspace") && st.selection) {
        const sel = st.selection;
        if (sel.kind === "event") st.edit((d, r) => { deleteEvent(d.arcs, sel.id, r); });
        else if (sel.kind === "connection") st.edit(d => { for (const a of d.arcs) a.connections = a.connections.filter(c => c.id !== sel.id); });
        else return;   // arcs and characters only from their panel, with a confirm
        st.select(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const newArc = () => {
    const last = [...doc.arcs].sort((a, b) => (res.arcs.get(b.id)?.end ?? 0) - (res.arcs.get(a.id)?.end ?? 0))[0];
    const taken = new Set(doc.arcs.map(a => a.id));
    let id = "new-arc";
    for (let i = 2; taken.has(id); i++) id = `new-arc-${i}`;
    const arc: Arc = { version: 1, id, name: "New arc", start: last ? { after: { arc: last.id }, gap: "1d" } : { at: "2025-04-07" }, events: [], connections: [] };
    s.edit(d => { d.arcs.push(arc); });
    s.select({ kind: "arc", id });
    setTimeout(() => { const sp = useTimeline.getState().res.arcs.get(id); if (sp) canvas.current?.scrollToHours(sp.start); }, 50);
  };

  const checks = useMemo(() => runChecks(doc.arcs, doc.roster, doc.facts, res, loc?.kind === "browser" ? null : scenes), [doc, res, scenes, loc]);
  /** Worst problem per event, for the dots on cards. */
  const flagged = useMemo(() => {
    const m = new Map<string, Check["level"]>();
    for (const c of checks) if (c.target?.kind === "event" && c.level !== "info" && !m.has(c.target.id)) m.set(c.target.id, c.level);
    return m;
  }, [checks]);
  const goTo = (c: Check) => {
    const t = c.target;
    if (!t) return;
    const h = t.kind === "event" ? res.events.get(t.id)?.start : t.kind === "arc" ? res.arcs.get(t.id)?.start
      : t.kind === "connection" ? res.events.get(allConnections(doc.arcs).find(x => x.conn.id === t.id)?.conn.from ?? "")?.start : undefined;
    if (h !== undefined) canvas.current?.scrollToHours(h);
  };
  const events = doc.arcs.reduce((n, a) => n + a.events.length, 0);

  return (
    <div className="grid h-screen grid-cols-[210px_minmax(0,1fr)_300px] bg-ink text-paper xl:grid-cols-[230px_minmax(0,1fr)_340px]">
      <Sidebar onPickArc={id => { const sp = res.arcs.get(id); if (sp) canvas.current?.scrollToHours(sp.start); }} />

      <main className="relative flex min-h-0 flex-col">
        <Toasts className="bottom-6" items={[
          ...(error ? [{ id: "error", kind: "error" as const, text: error, onDismiss: () => s.setError(null) }] : []),
          ...(notice ? [{ id: "notice", kind: "notice" as const, text: notice, onDismiss: () => s.setNotice(null) }] : []),
        ]} />

        <div className="flex h-12 shrink-0 items-center gap-1 border-b border-ink-line/60 px-4">
          <IconButton icon={Undo2} label="Undo" kbd="Ctrl+Z" onClick={s.undo} disabled={!canUndo} />
          <IconButton icon={Redo2} label="Redo" kbd="Ctrl+Shift+Z" onClick={s.redo} disabled={!canRedo} />
          <span className="mx-2 h-5 w-px bg-ink-line" />
          <IconButton icon={Minus} label="Zoom out" kbd="Ctrl+scroll" onClick={() => s.setZoom(pxPerHour / 1.5)} />
          <IconButton icon={Plus} label="Zoom in" kbd="Ctrl+scroll" onClick={() => s.setZoom(pxPerHour * 1.5)} />
          <span className="mx-2 h-5 w-px bg-ink-line" />
          <Button size="sm" onClick={newArc} disabled={!loaded}><SquarePlus className="h-4 w-4" />New arc</Button>
          <span className="flex-1" />
          {loaded && <ChecksButton checks={checks} onGo={goTo} />}
          <span className="ml-3 font-talk text-[12px] text-taupe">{doc.arcs.length} arcs · {events} events · {allConnections(doc.arcs).length} links</span>
        </div>

        {conflicts.length > 0 && (
          <div className="shrink-0 space-y-2 border-b-2 border-coral bg-coral/10 px-4 py-2.5">
            {conflicts.map(c => (
              <div key={c.path} className="flex flex-wrap items-center gap-x-4 gap-y-1 font-talk text-[14px]">
                <span className="min-w-0 flex-1 text-paper">
                  {c.label} was {c.theirs === null ? "deleted" : "changed"} by someone else (git pull?) while you had unsaved changes in it.
                </span>
                <Button size="sm" onClick={() => s.resolveConflict(c.path, "theirs")}>Load theirs</Button>
                <Button size="sm" variant="danger" onClick={() => s.resolveConflict(c.path, "mine")}>Keep mine (overwrite)</Button>
              </div>
            ))}
          </div>
        )}

        {loaded ? (
          doc.arcs.length ? <TimelineCanvas apiRef={canvas} flagged={flagged} /> : (
            <div className="grid flex-1 place-items-center px-8 text-center">
              <div className="max-w-md space-y-3">
                <p className="font-sans text-2xl font-light text-bone">No arcs yet.</p>
                <p className="font-talk text-sm text-taupe">Start with <b>New arc</b>, or import the old timeline.md files once (see the README).</p>
              </div>
            </div>
          )
        ) : (
          <div className="grid flex-1 place-items-center font-sans text-xl font-light text-bone">
            {loc && !loc.ready ? "Pick the story folder at the bottom left." : "Loading…"}
          </div>
        )}
      </main>

      <Inspector />
    </div>
  );
}

