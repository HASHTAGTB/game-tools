import { Trash2 } from "lucide-react";
import { memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { cn } from "@/shared/lib/utils";
import { openAnchoredMenu } from "@/shared/ui/anchored-menu";
import type { Box } from "../../lib/blocks";
import { pastedLines } from "../../lib/cast";
import { insertAt, joinSays, redoBox, removeBox, setRaw, setSayRaw, setSpeaker, splitSay, undoBox } from "../../lib/ops";
import { atEdge, caretCount, chip, fromDOM, insertAtCaret, isEmpty, markBeforeCaret, marksAt, onSpeedLabel, padMarks, pauseOf, plainCount, setCaret, splitAtCaret, stepOutOfWrap, stepToText, toDOM, zwAtCaret } from "../../lib/richtext";
import { focusLine, useSceneUi } from "../../lib/ui";
import { follow, problemsOf, speaker, stageBefore, useBox, useHot, type ListLayout } from "./context";
import { Acts, addAfter, addInstead, Problems, useMoves } from "./List";
import { BraceMenu, braceAtCaret, braceMatches, bracePick, braceUpdate, nudgeMark, openMark, sameMarks, type Brace, type BraceItem } from "./TextTools";

type Say = Extract<Box, { kind: "say" }>;

/** A line someone says (a tinted box, their name in the margin) or narration (an outlined box). In a chat: a bubble. */
export const SayBox = memo(function SayBox({ box: b, prev, next, layout }: { box: Say; prev: Box | null; next: Box | null; layout: ListLayout }) {
  const c = useBox();
  const { view, manifest } = c;
  const ref = useRef<HTMLDivElement>(null);
  const moves = useMoves(b, prev, next);
  const { hot, bind } = useHot();
  const [brace, setBrace] = useState<Brace | null>(null);
  const braceNow = useRef(brace);
  braceNow.current = brace;
  const commitNow = useRef<() => void>(() => {});

  // the top bar's text tools act on this box while you type in it (and light up for what the caret is in); the
  // `{` menu follows the caret
  useEffect(() => {
    if (!hot) return;
    const el = ref.current!;
    const commit = () => commitNow.current();
    const leave = () => { const u = useSceneUi.getState(); if (u.typing?.el === el && !u.speedOpen) useSceneUi.setState({ typing: null }); };
    const on = () => {
      if (document.activeElement === el && el.contains(getSelection()?.anchorNode ?? null)) {
        const m = marksAt(el), t = useSceneUi.getState().typing;
        if (t?.el !== el || !sameMarks(t.marks, m)) useSceneUi.setState({ typing: { el, marks: m, commit } });
      } else leave();
      if (braceNow.current) setBrace(braceUpdate(braceNow.current));
    };
    on();
    document.addEventListener("selectionchange", on);
    return () => { document.removeEventListener("selectionchange", on); leave(); };
  }, [hot]);
  const stage = stageBefore(c, b.from);
  const chat = layout.chat;
  const w = b.who ? speaker(c, b.who) : null;
  const pov = stage.pov ? speaker(c, stage.pov) : null;
  const cont = prev?.kind === "say" && prev.who === b.who;
  const mine = chat && !!b.who && b.who === stage.pov;
  const look = w ?? (chat ? null : pov);
  const style = { "--who": w?.color ?? "transparent", "--whoL": look?.legible } as CSSProperties;

  // Ctrl+scroll on a pause's or a speed's number: 0.05 steps (up: longer / faster). Not React's onWheel: that one is
  // passive, and Ctrl+scroll would zoom the page too.
  useEffect(() => {
    const el = ref.current!;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey || !e.deltaY) return;
      const t = e.target as HTMLElement;
      const chipEl = t.closest<HTMLElement>(".bx-pause");
      const sp = chipEl ? null : t.closest<HTMLElement>("[data-f]");
      const hit = chipEl && el.contains(chipEl) ? nudgeMark("pause", chipEl, e.deltaY < 0 ? 1 : -1)
        : sp && el.contains(sp) && onSpeedLabel(sp, e.clientX, e.clientY) ? nudgeMark("speed", sp, e.deltaY < 0 ? 1 : -1) : false;
      if (!hit) return;
      e.preventDefault();
      commitNow.current();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // the box shows the file's text; while you type, it already does
  useLayoutEffect(() => {
    const el = ref.current!;
    if (fromDOM(el) !== b.raw) toDOM(el, b.raw);
  }, [b.raw]);

  const commit = () => {
    const el = ref.current!;
    if (isEmpty(el) && el.innerHTML) el.innerHTML = "";
    else padMarks(el);
    setSayRaw(view, b.from, fromDOM(el));
  };
  commitNow.current = commit;
  const castHere = chat ? c.cast : [null, ...c.cast];
  const speakerMenu = (anchor: Element) => useSceneUi.setState({ menu: { kind: "speaker", anchor, line: b.from, chat } });

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = ref.current!;
    const k = e.key, mod = e.ctrlKey || e.metaKey;
    if (brace) {
      const items = braceMatches(brace.q);
      if (k === "ArrowDown" || k === "ArrowUp") { e.preventDefault(); setBrace({ ...brace, i: (brace.i + (k === "ArrowDown" ? 1 : -1) + items.length) % items.length }); return; }
      if (k === "Enter" || k === "Tab") { e.preventDefault(); pick(items[brace.i]); return; }
      if (k === "Escape") { e.preventDefault(); setBrace(null); return; }
    }
    if (mod && k.toLowerCase() === "z") { e.preventDefault(); (e.shiftKey ? redoBox : undoBox)(view); return; }
    if (mod && k.toLowerCase() === "y") { e.preventDefault(); redoBox(view); return; }
    if (k === "Enter" && mod) { e.preventDefault(); addAfter(el, b, layout); return; }
    if (k === "Enter" && e.shiftKey) { e.preventDefault(); insertAtCaret(el, chip("\\n")); commit(); return; }
    if ((k === "Enter" || k === "/") && isEmpty(el)) { e.preventDefault(); addInstead(el, b, layout); return; }
    if (k === "Enter") {
      e.preventDefault();
      const [before, after] = splitAtCaret(el);
      focusLine(splitSay(view, b, before, after, layout.tight), "start");
      return;
    }
    if (k === "Tab") {
      e.preventDefault();
      const i = castHere.indexOf(b.who);
      const at = caretCount(el);
      setSpeaker(view, b.from, castHere[(i + (e.shiftKey ? -1 : 1) + castHere.length) % castHere.length] ?? null);
      setCaret(el, at);
      return;
    }
    // the invisible character behind a mark: Backspace takes the mark itself, arrows step over both at once
    if (k === "Backspace" && !mod) {
      const m = markBeforeCaret(el);
      if (m) { e.preventDefault(); m.remove(); commit(); return; }
    }
    if ((k === "ArrowLeft" || k === "ArrowRight") && !e.shiftKey && !mod) {
      const dir = k === "ArrowLeft" ? "backward" : "forward";
      if (stepOutOfWrap(el, dir)) { e.preventDefault(); return; }
      if (zwAtCaret(dir)) getSelection()!.modify("move", dir, "character");
    }
    if (k === "Backspace" && atEdge(el, "start")) {
      e.preventDefault();
      if (isEmpty(el)) {
        const n = removeBox(view, b);
        focusLine(prev?.kind === "say" || prev?.kind === "note" ? prev.from : n, "end");
      } else if (prev?.kind === "say") {
        const gap = joinSays(view, prev, b);
        // another speaker, or Ren'Py after the text: no join, just step into the line above
        focusLine(prev.from, gap === null ? "end" : plainCount(prev.raw) + (gap ? 1 : 0));
      }
      return;
    }
    if (k === "Delete" && atEdge(el, "end")) {
      e.preventDefault();
      if (next?.kind === "say") {
        const at = plainCount(b.raw);
        const gap = joinSays(view, b, next);
        focusLine(gap === null ? next.from : b.from, gap === null ? "start" : at + (gap ? 1 : 0));
      }
      return;
    }
    if (e.altKey && (k === "ArrowUp" || k === "ArrowDown")) {
      e.preventDefault();
      (k === "ArrowUp" ? moves.up : moves.down)?.();
      return;
    }
    if ((k === "ArrowUp" && atEdge(el, "start")) || (k === "ArrowDown" && atEdge(el, "end"))) {
      if (stepToText(el, k === "ArrowUp" ? "up" : "down")) e.preventDefault();
      return;
    }
    if (k === "Escape") el.blur();
  };

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n");
    if (!text) return;
    if (!text.trim().includes("\n")) { document.execCommand("insertText", false, text.trim()); return; }
    const lines = pastedLines(text, 0, manifest, c.cast).filter((l, i, a) => l || (i > 0 && a[i - 1]));
    if (isEmpty(ref.current!)) {
      setRaw(view, b.from, b.to, b.indent, lines.join("\n"));
      focusLine(b.from + lines.length - 1);
    } else {
      const n = insertAt(view, { ...layout, after: b.to }, lines);
      focusLine(n + lines.length - 1);
    }
  };

  // a click on a mark: a pause opens its slider, a speed's number its speed slider; {nw} only goes
  const onClick = (e: React.MouseEvent) => {
    const el = ref.current!, target = e.target as HTMLElement;
    const mark = target.closest<HTMLElement>(".bx-pause");
    if (mark && pauseOf(mark.dataset.raw!)) { openMark({ kind: "pause", mark, box: el, commit }); return; }
    if (mark) {
      openAnchoredMenu(mark, [{ icon: Trash2, label: "Remove", danger: true, run: () => { mark.remove(); commit(); el.focus(); } }]);
      return;
    }
    const sp = target.closest<HTMLElement>("[data-f]");
    if (sp && el.contains(sp) && onSpeedLabel(sp, e.clientX, e.clientY)) openMark({ kind: "speed", mark: sp, box: el, commit });
  };

  const pick = (it: BraceItem | undefined) => {
    if (!it || !brace) return;
    setBrace(null);
    bracePick(ref.current!, brace, it);
    commit();
  };
  const onInput = (e: React.FormEvent<HTMLDivElement>) => {
    commit();
    const ev = e.nativeEvent as InputEvent;
    if (ev.inputType === "insertText" && ev.data === "{" && !brace) setBrace(braceAtCaret());
  };
  const known = !b.who || !manifest || w?.known;

  return (
    <div className={cn("bx-box bx-say", b.who ? "bx-dlg" : "bx-narr", cont && "bx-cont", chat && (mine ? "bx-mine" : "bx-theirs"))}
      style={style} data-line={b.from} data-from={b.from} data-to={b.to} {...bind}>
      {(b.who || !chat) && (
        <button type="button" className={cn("bx-who", !b.who && "bx-narr-who", !known && "bx-unknown")} tabIndex={-1}
          title={b.who === "extend" ? "Goes on from the line before" : b.who ? `${w!.name} · click to change who says it (Tab)` : `${pov ? pov.name + "'s narration" : "Narration"} · click to give it a speaker (Tab)`}
          onMouseDown={e => e.preventDefault()} onClick={e => speakerMenu(e.currentTarget)}>
          {!b.who && <span className="bx-dot" />}
          {b.who ? w!.name : "Narration"}
        </button>
      )}
      <div ref={ref} className="bx-text" contentEditable suppressContentEditableWarning spellCheck data-text
        data-ph={b.who ? (chat ? "Message…" : `${w!.name} says…`) : "Narration…  ( / to add something else)"}
        onInput={onInput} onKeyDown={onKey} onPaste={onPaste} onClick={onClick}
        onFocus={() => follow(view, b.from)} onBlur={() => setBrace(null)} />
      {brace && <BraceMenu brace={brace} onPick={pick} />}
      {b.tail && !b.tail.startsWith("#") && <span className="bx-tail" title="Ren'Py options for this line (edit them in the source view, Ctrl+E)">{b.tail}</span>}
      <Problems list={problemsOf(c, b)} />
      <Acts box={b} prev={prev} next={next} />
    </div>
  );
});
