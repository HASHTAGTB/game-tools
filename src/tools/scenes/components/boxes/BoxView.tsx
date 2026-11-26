import { EditorView } from "@codemirror/view";
import { Wrench } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useGame } from "@/shared/lib/game";
import { Button } from "@/shared/ui/button";
import { allBoxes, buildTree, labelsIn, type Box, type Tree } from "../../lib/blocks";
import { castOf } from "../../lib/cast";
import type { Problem } from "../../lib/checks";
import { labelOf } from "../../lib/script";
import { playScript } from "../../lib/stage";
import { setCaret } from "../../lib/richtext";
import { lineIds } from "../../lib/scriptView";
import { idAt, useSceneUi } from "../../lib/ui";
import { applyFix } from "../Editor";
import { BoxMenus } from "./BoxMenus";
import { BoxContext, type BoxCtx } from "./context";
import { BoxItem, List } from "./List";
import "./boxes.css";

/** The script as boxes: what people say, narration, notes, stage changes, choices and chats, with a slot between
 *  every two of them where new things are added. There's nowhere else to type, so the Ren'Py stays valid. The file
 *  lives in the (hidden) CodeMirror `view`; every box edits its own lines there. */
export function BoxView({ view }: { view: EditorView }) {
  const script = useSceneUi(s => s.script);
  const problems = useSceneUi(s => s.problems);
  const focus = useSceneUi(s => s.focus);
  const reveal = useSceneUi(s => s.reveal);
  const tabs = useSceneUi(s => s.tabs);
  const rawIds = useSceneUi(s => s.rawIds);
  const manifest = useGame(s => s.manifest);
  const page = useRef<HTMLDivElement>(null);

  const tree = useMemo(() => {
    if (!script) return null;
    const ids = view.state.field(lineIds);
    const raw = new Set<number>();
    if (rawIds.size) ids.forEach((id, i) => { if (rawIds.has(id)) raw.add(i + 1); });
    return buildTree(script, raw);
  }, [script, rawIds, view]);
  const shared = useRef<BoxCtx | null>(null);
  const epochKey = useRef("");
  const ctx = useMemo<BoxCtx | null>(() => {
    if (!script) return null;
    const byLine = new Map<number, Problem[]>();
    for (const p of problems) byLine.set(p.line, [...(byLine.get(p.line) ?? []), p]);
    const label = labelOf(script) ?? "scene";
    const cast = castOf(view.state);
    const prev = shared.current;
    const key = cast.join() + (manifest ? "+m" + (manifest.characters.length) : "");
    const epoch = (prev?.epoch ?? 0) + (key !== epochKey.current || prev?.manifest !== manifest ? 1 : 0);
    epochKey.current = key;
    const next: BoxCtx = {
      view, manifest, stages: playScript(script), cast, problems: byLine,
      base: label.replace(/^(sc|scene)_/, ""), labels: labelsIn(script), epoch, ids: view.state.field(lineIds),
    };
    shared.current = prev ? Object.assign(prev, next) : next;
    return shared.current;
  }, [view, script, manifest, problems]);

  // after an edit that moved lines: the caret goes where the edit said
  useLayoutEffect(() => {
    if (!focus || !page.current) return;
    const box = page.current.querySelector(`[data-line="${focus.line}"]`);
    const el = box?.querySelector<HTMLElement>("[data-text]");
    if (el) {
      if (el instanceof HTMLTextAreaElement) { el.focus({ preventScroll: true }); el.setSelectionRange(el.value.length, el.value.length); }
      else if (el.classList.contains("cm-content")) {
        // a Ren'Py box's editor
        const cm = EditorView.findFromDOM(el);
        if (cm) { cm.focus(); const end = cm.state.doc.length; cm.dispatch({ selection: { anchor: typeof focus.caret === "number" ? Math.min(focus.caret, end) : focus.caret === "start" ? 0 : end } }); }
      }
      else setCaret(el, focus.caret);
      el.scrollIntoView({ block: "nearest" });
    } else if (box) {
      box.querySelector<HTMLElement>("[data-card]")?.focus({ preventScroll: true });
      box.scrollIntoView({ block: "nearest" });
    }
    useSceneUi.setState({ focus: null });
  }, [focus, script]);

  // a problem clicked in the checks list: open the tab it's in, scroll there, point at it
  useEffect(() => {
    if (!reveal || !tree || !page.current) return;
    const path = tabsTo(tree, reveal.line).map(([menu, i]) => [idAt(view, menu), i] as const);
    const need = path.filter(([menu, i]) => (tabs[menu] ?? 0) !== i);
    if (need.length) { useSceneUi.setState(s => ({ tabs: { ...s.tabs, ...Object.fromEntries(need) } })); return; }
    const hit = [...page.current.querySelectorAll<HTMLElement>("[data-from]")]
      .filter(el => +el.dataset.from! <= reveal.line && reveal.line <= +el.dataset.to!)
      .sort((a, b) => (+a.dataset.to! - +a.dataset.from!) - (+b.dataset.to! - +b.dataset.from!))[0];
    if (hit) {
      const target = hit.classList.contains("bx-box") ? hit : hit.querySelector<HTMLElement>(".bx-box") ?? hit;
      target.scrollIntoView({ block: "center", behavior: "smooth" });
      target.removeAttribute("data-ping");
      void target.offsetWidth;
      target.setAttribute("data-ping", "");
      hit.querySelector<HTMLElement>("[data-text]")?.focus({ preventScroll: true });
    }
    useSceneUi.setState({ reveal: null });
  }, [reveal, tree, tabs]);

  if (!script || !tree || !ctx) return null;
  const fix = (p: Problem | undefined) => p?.fix && (
    <Button variant="primary" size="sm" className="mt-4" onClick={() => applyFix(view, p)}><Wrench className="h-3.5 w-3.5" />{p.fix.label}</Button>
  );
  const after = script.layout.code?.close ? script.lines.slice(script.layout.code.close).filter(l => l.trim()).length : 0;

  return (
    <BoxContext.Provider value={ctx}>
      <div ref={page} className="bx-page h-full overflow-y-auto">
        <div className="bx-col">
          {!script.layout.code ? (
            <Empty text="This scene has no Ren'Py yet.">{fix(problems.find(p => p.fix?.at === "end"))}</Empty>
          ) : !tree.scene ? (
            <Empty text="The script has no label yet, so nothing can jump to it.">{fix(problems.find(p => p.fix?.at === "after"))}</Empty>
          ) : (
            <>
              {tree.pre.length > 0 && (
                <div className="mb-4 space-y-1.5 opacity-80">
                  {tree.pre.map(b => <BoxItem key={b.from} box={b} prev={null} next={null}
                    layout={{ indent: 0, tight: true, level: false, chat: false }} />)}
                </div>
              )}
              <List boxes={tree.scene.boxes} start={tree.scene.place} layout={{ ...tree.scene.place, tight: false }} />
              {tree.extra.map(sec => (
                <section key={sec.line}>
                  <p className="bx-section">Label <code>{sec.name}</code>{!sec.reached && <span className="font-talk text-xs">(nothing in this scene jumps here)</span>}</p>
                  <List boxes={sec.boxes} start={sec.place} layout={{ ...sec.place, tight: false }} />
                </section>
              ))}
              {after > 0 && (
                <p className="mt-10 font-talk text-sm text-taupe">
                  Below the script, this file has {after} more line{after === 1 ? "" : "s"} of notes. They're in the source view (Ctrl+E).
                </p>
              )}
            </>
          )}
        </div>
      </div>
      <BoxMenus />
    </BoxContext.Provider>
  );
}

function Empty({ text, children }: { text: string; children?: React.ReactNode }) {
  return (
    <div className="grid place-items-center py-24 text-center">
      <p className="font-sans text-xl font-light text-bone">{text}</p>
      {children}
    </div>
  );
}

/** The choice tabs to open to show line `n`: [choice line, option] pairs, outermost first. */
function tabsTo(tree: Tree, n: number): [number, number][] {
  const walk = (list: Box[]): [number, number][] | null => {
    for (const b of list) {
      if (b.kind === "menu") {
        for (let i = 0; i < b.options.length; i++) {
          const o = b.options[i];
          const inside = [...allBoxes(o.boxes)].some(x => x.from <= n && n <= x.to) || o.line === n;
          if (inside) return [[b.from, i], ...(walk(o.boxes) ?? [])];
        }
      }
    }
    return null;
  };
  return (tree.scene && walk(tree.scene.boxes)) ?? tree.extra.map(s => walk(s.boxes)).find(Boolean) ?? [];
}
