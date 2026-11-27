import { EditorView } from "@codemirror/view";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useGame } from "@/shared/lib/game";
import { EmptyState } from "@/shared/ui/tool-page";
import { cascade, spotlight, unfold } from "@/shared/ui/flair";
import { allBoxes, buildTree, type Box, type Tree } from "../../lib/blocks";
import { sceneCast } from "../../lib/cast";
import type { Problem } from "../../lib/checks";
import { lineIds } from "../../lib/editorState";
import { readInfo } from "../../lib/header";
import { labelOf, labelsIn } from "../../lib/labels";
import { setCaret } from "../../lib/richtext";
import { playScript } from "../../lib/stage";
import { idAt, useSceneUi } from "../../lib/ui";
import { boxFor, type Swap } from "../../lib/viewSwap";
import { useChapters, useScenes } from "../../state";
import { baseName } from "@/shared/vault/store";
import { FixButton } from "../problems";
import { BoxMenus } from "./BoxMenus";
import { BoxContext, type BoxCtx } from "./context";
import { BoxItem, List } from "./List";
import { CARD_MIN, CARD_OUT, firstLine, TitleCard } from "./TitleCard";
import "./boxes.css";

/** The script as boxes: what people say, narration, notes, stage changes, choices and chats, with a slot between
 *  every two of them where new things are added. There's nowhere else to type, so the Ren'Py stays valid. The file
 *  lives in the (hidden) CodeMirror `view`; every box edits its own lines there. */
export function BoxView({ view, swap }: { view: EditorView; swap: Swap | null }) {
  const script = useSceneUi(s => s.script);
  const problems = useSceneUi(s => s.problems);
  const focus = useSceneUi(s => s.focus);
  const reveal = useSceneUi(s => s.reveal);
  const tabs = useSceneUi(s => s.tabs);
  const rawIds = useSceneUi(s => s.rawIds);
  const opened = useSceneUi(s => s.opened);
  const loaded = useSceneUi(s => s.loaded);
  const manifest = useGame(s => s.manifest);
  const info = useScenes(s => { const i = readInfo(s.text); return `${i.title}\n${i.chapter}`; });
  const fileName = useScenes(s => (s.path ? baseName(s.path) : ""));
  const chapterName = useChapters(c => { const id = info.split("\n")[1]; return id ? c.list?.find(x => x.id === id)?.name ?? id : ""; });
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
    const cast = sceneCast(view.state);
    const prev = shared.current;
    const key = cast.join() + (manifest ? "+m" + (manifest.characters.length) : "");
    const epoch = (prev?.epoch ?? 0) + (key !== epochKey.current || prev?.manifest !== manifest ? 1 : 0);
    epochKey.current = key;
    const next: BoxCtx = {
      view, manifest, stages: playScript(script), cast, problems: byLine,
      base: label.replace(/^(sc|scene)_/, ""), labels: labelsIn(script), epoch, ids: view.state.field(lineIds),
      structure: tree ? structureOf(tree, view.state.field(lineIds)) : "",
    };
    shared.current = prev ? Object.assign(prev, next) : next;
    return shared.current;
  }, [view, script, manifest, problems, tree]);

  /* A scene opens: first only its title card is drawn (and shown), then all its boxes in one go, which keeps the page
     busy for a moment while the card goes on playing (see ./TitleCard.tsx). Once the card has been up long enough it
     goes, the page starts at its bottom (where you go on writing) and what's on screen falls into place. */
  // Coming from the source view (`swap`, same editor) the scene isn't opening: no card, the boxes are there at once,
  // the line you were on is put where it was on screen and they unfold from it.
  // kept from mount: the tree may only come later, when the prop has already been cleared
  const swapped = useRef(swap && swap.loaded === loaded ? swap : null);
  const [built, setBuilt] = useState<unknown>(() => (swapped.current ? opened : undefined));
  // a caret or problem was pointed at since the boxes were built: the opening then doesn't take the page to the bottom
  const pointed = useRef(false);
  const [card, setCard] = useState<{ for: unknown; out: boolean } | null>(null);
  const building = !!tree && built !== opened;
  const cardAt = useRef(0);
  useLayoutEffect(() => {
    if (!building) return;
    cardAt.current = performance.now();
    setCard({ for: opened, out: false });
    // two frames: the card is on screen (and playing) before the boxes are built
    let f = requestAnimationFrame(() => { f = requestAnimationFrame(() => setBuilt(opened)); });
    return () => cancelAnimationFrame(f);
  }, [building, opened]);
  const handed = useRef<unknown>(undefined);
  useLayoutEffect(() => {
    const el = page.current;
    if (building || !el || !tree || handed.current === built) return;
    handed.current = built;
    pointed.current = false;
    const swap = swapped.current;
    if (swap) {
      swapped.current = null;
      const box = boxFor(el, swap.line);
      if (box) el.scrollTop += box.getBoundingClientRect().top - swap.y;
      unfold(el.querySelectorAll(OPENING), swap.y);
      return;
    }
    el.dataset.opening = "1";
    el.scrollTop = el.scrollHeight;
    const go = window.setTimeout(() => {
      delete el.dataset.opening;
      if (!pointed.current) el.scrollTop = el.scrollHeight;
      setCard(c => c && { ...c, out: true });
      cascade([...el.querySelectorAll<HTMLElement>(OPENING)].reverse());
      gone = window.setTimeout(() => setCard(c => (c?.for === built ? null : c)), CARD_OUT);
    }, Math.max(0, CARD_MIN - (performance.now() - cardAt.current)));
    let gone = 0;
    // only another scene opening (or the view going) calls it off: the script is parsed again meanwhile (a reload
    // does, more than once), which mustn't
    return () => { window.clearTimeout(go); window.clearTimeout(gone); delete el.dataset.opening; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [building, built]);

  // after an edit that moved lines: the caret goes where the edit said
  useLayoutEffect(() => {
    // while the title card is up there are no boxes yet: the request waits for them
    if (!focus || !page.current || building) return;
    pointed.current = true;
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
  }, [focus, script, building]);

  // a problem clicked in the checks list: open the tab it's in, scroll there, point at it
  useEffect(() => {
    if (!reveal || !tree || !page.current || building) return;
    const path = tabsTo(tree, reveal.line).map(([menu, i]) => [idAt(view, menu), i] as const);
    const need = path.filter(([menu, i]) => (tabs[menu] ?? 0) !== i);
    if (need.length) { useSceneUi.setState(s => ({ tabs: { ...s.tabs, ...Object.fromEntries(need) } })); return; }
    const hit = [...page.current.querySelectorAll<HTMLElement>("[data-from]")]
      .filter(el => +el.dataset.from! <= reveal.line && reveal.line <= +el.dataset.to!)
      .sort((a, b) => (+a.dataset.to! - +a.dataset.from!) - (+b.dataset.to! - +b.dataset.from!))[0];
    if (hit) {
      pointed.current = true;
      const target = hit.classList.contains("bx-box") ? hit : hit.querySelector<HTMLElement>(".bx-box") ?? hit;
      target.scrollIntoView({ block: "center", behavior: "smooth" });
      spotlight(target, page.current, ".bx-box");
      hit.querySelector<HTMLElement>("[data-text]")?.focus({ preventScroll: true });
    }
    useSceneUi.setState({ reveal: null });
  }, [reveal, tree, tabs, building]);

  if (!script || !tree || !ctx) return null;
  const fix = (p: Problem | undefined) => p && <FixButton view={view} problem={p} variant="primary" className="mt-4" />;

  return (
    <BoxContext.Provider value={ctx}>
      <div className="relative h-full">
      <div ref={page} className="bx-page h-full overflow-y-auto">
        <div className="bx-col">
          {building ? null : !tree.scene ? (
            <EmptyState className="flex-none py-24" title="The script has no label yet, so nothing can jump to it.">{fix(problems.find(p => p.fix?.at === "after" || p.fix?.at === "start"))}</EmptyState>
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
            </>
          )}
        </div>
      </div>
      {card && <TitleCard out={card.out} title={info.split("\n")[0] || fileName} chapter={chapterName}
        first={tree.scene ? firstLine(tree.scene.boxes) : ""} />}
      </div>
      <BoxMenus />
    </BoxContext.Provider>
  );
}

/** What falls into place when the scene opens: everything at the top of the page and in its lists. */
const OPENING = ".bx-col > :not(.bx-list), .bx-col > .bx-list > *, .bx-col > section > :not(.bx-list), .bx-col > section > .bx-list > *";

/** Every box of the scene, nested ones included, by its first line's name. */
function structureOf(tree: Tree, ids: number[]) {
  const lists = [tree.pre, ...(tree.scene ? [tree.scene.boxes] : []), ...tree.extra.map(s => s.boxes)];
  return lists.map(l => [...allBoxes(l)].map(b => ids[b.from - 1]).join()).join("|");
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
