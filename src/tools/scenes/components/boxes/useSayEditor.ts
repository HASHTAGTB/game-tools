import { Trash2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { unixLines } from "@/shared/lib/utils";
import { openAnchoredMenu } from "@/shared/ui/anchored-menu";
import type { Box } from "../../lib/blocks";
import { pastedLines } from "../../lib/cast";
import { fileHistoryKey } from "../../lib/codeEditor";
import { insertAt, joinSays, removeBox, setRaw, setSayRaw, setSpeaker, splitSay } from "../../lib/ops";
import {
  atEdge, caretCount, chip, fromDOM, insertAtCaret, isEmpty, markBeforeCaret, marksAt, onEdgeLine, onSpeedLabel, padMarks, pauseOf, plainCount,
  setCaret, splitAtCaret, stepOutOfWrap, stepToText, toDOM, zwAtCaret,
} from "../../lib/richtext";
import { focusLine, idAt, useSceneUi } from "../../lib/ui";
import { useBox, useHot, type ListLayout } from "./context";
import { addAfter, addInstead, useMoves } from "./List";
import { braceAtCaret, braceMatches, bracePick, braceUpdate, nudgeMark, openMark, sameMarks, type Brace, type BraceItem } from "./TextTools";

type Say = Extract<Box, { kind: "say" }>;

/** Typing in a say box (a line, narration or a message): its text shown and written back as you go, the keys (Enter
 *  splits, Backspace joins, Tab changes who says it, …), paste, the text marks (click, Ctrl+scroll, Backspace) and
 *  the `{` menu, and the top bar's text tools acting on it while you're in it. `castHere`: who Tab steps through.
 *  Put `ref` and `handlers` on the editable element, `bind` on the box. */
export function useSayEditor(b: Say, prev: Box | null, next: Box | null, layout: ListLayout, castHere: (string | null)[]) {
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

  const pick = (it: BraceItem | undefined) => {
    if (!it || !brace) return;
    setBrace(null);
    bracePick(ref.current!, brace, it);
    commit();
  };

  /** The `{` menu while it's open: it takes the arrows, Enter, Tab and Escape. */
  const braceKey = (e: KeyboardEvent<HTMLDivElement>, open: Brace) => {
    const k = e.key, items = braceMatches(open.q);
    if (k === "ArrowDown" || k === "ArrowUp") setBrace({ ...open, i: (open.i + (k === "ArrowDown" ? 1 : -1) + items.length) % items.length });
    else if (k === "Enter" || k === "Tab") pick(items[open.i]);
    else if (k === "Escape") setBrace(null);
    else return false;
    e.preventDefault();
    return true;
  };

  /** Backspace at the start: an empty box goes, else it joins the line above (Delete at the end: the line below). */
  const joinKey = (e: KeyboardEvent<HTMLDivElement>, el: HTMLDivElement) => {
    if (e.key === "Backspace" && atEdge(el, "start")) {
      e.preventDefault();
      if (isEmpty(el)) {
        const n = removeBox(view, b);
        focusLine(prev?.kind === "say" || prev?.kind === "note" ? prev.from : n, "end");
      } else if (prev?.kind === "say") {
        const gap = joinSays(view, prev, b);
        // another or Ren'Py after the text: no join, just step into the line above
        focusLine(prev.from, gap === null ? "end" : plainCount(prev.raw) + (gap ? 1 : 0));
      }
      return true;
    }
    if (e.key === "Delete" && atEdge(el, "end")) {
      e.preventDefault();
      if (next?.kind === "say") {
        const at = plainCount(b.raw);
        const gap = joinSays(view, b, next);
        focusLine(gap === null ? next.from : b.from, gap === null ? "start" : at + (gap ? 1 : 0));
      }
      return true;
    }
    return false;
  };

  /** The caret around marks and the box's edges. */
  const caretKey = (e: KeyboardEvent<HTMLDivElement>, el: HTMLDivElement) => {
    const k = e.key, mod = e.ctrlKey || e.metaKey;
    // the invisible character behind a mark: Backspace takes the mark itself, arrows step over both at once
    if (k === "Backspace" && !mod) {
      const m = markBeforeCaret(el);
      if (m) { e.preventDefault(); m.remove(); commit(); return true; }
    }
    if ((k === "ArrowLeft" || k === "ArrowRight") && !e.shiftKey && !mod) {
      const dir = k === "ArrowLeft" ? "backward" : "forward";
      if (stepOutOfWrap(el, dir)) { e.preventDefault(); return true; }
      // Left at the start (Right at the end): round to the other end of the same box
      if (atEdge(el, dir === "backward" ? "start" : "end")) { e.preventDefault(); setCaret(el, dir === "backward" ? "end" : "start"); return true; }
      if (zwAtCaret(dir)) getSelection()!.modify("move", dir, "character");
    }
    return false;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = ref.current!;
    const k = e.key, mod = e.ctrlKey || e.metaKey;
    if (brace && braceKey(e, brace)) return;
    if (fileHistoryKey(e, view)) return;
    if (k === "Enter" && mod) { e.preventDefault(); addAfter(el, b, layout); return; }
    if (k === "Enter" && e.shiftKey) { e.preventDefault(); insertAtCaret(el, chip("\\n")); commit(); return; }
    if ((k === "Enter" || k === "/") && isEmpty(el)) { e.preventDefault(); addInstead(el, b, layout); return; }
    if (k === "Enter") {
      e.preventDefault();
      const [before, after] = splitAtCaret(el);
      // the new box peels out of this one
      const at = splitSay(view, b, before, after, layout.tight);
      useSceneUi.setState({ entering: idAt(view, at) });
      focusLine(at, "start");
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
    if (caretKey(e, el) || joinKey(e, el)) return;
    if (e.altKey && (k === "ArrowUp" || k === "ArrowDown")) {
      e.preventDefault();
      (k === "ArrowUp" ? moves.up : moves.down)?.();
      return;
    }
    // Up on the first line (Down on the last): straight to the end of the box above (below)
    if ((k === "ArrowUp" || k === "ArrowDown") && !e.shiftKey && !mod && onEdgeLine(el, k === "ArrowUp" ? "first" : "last")) {
      if (stepToText(el, k === "ArrowUp" ? "up" : "down")) e.preventDefault();
      return;
    }
    if (k === "Escape") el.blur();
  };

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = unixLines(e.clipboardData.getData("text/plain"));
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

  const onInput = (e: React.FormEvent<HTMLDivElement>) => {
    commit();
    const ev = e.nativeEvent as InputEvent;
    if (ev.inputType === "insertText" && ev.data === "{" && !brace) setBrace(braceAtCaret());
  };

  return {
    ref, bind, brace, pick,
    handlers: { onInput, onKeyDown, onPaste, onClick, onBlur: () => setBrace(null) },
  };
}
