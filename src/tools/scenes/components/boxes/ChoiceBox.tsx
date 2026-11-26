import { CornerRightDown, Plus, Split, Trash2 } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { useEffect, useState } from "react";
import { Confirm } from "@/shared/ui/confirm";
import { fieldCls } from "@/shared/ui/field";
import { IconButton } from "@/shared/ui/icon-button";
import { cn } from "@/shared/lib/utils";
import type { Box } from "../../lib/blocks";
import { addOption, removeOption, routeOption, setOptionText } from "../../lib/ops";
import { unescapeText } from "../../lib/script";
import { idAt, useSceneUi } from "../../lib/ui";
import { follow, problemsOf, useBox, type ListLayout } from "./context";
import { Acts, BoxItem, List, Problems } from "./List";

type Menu = Extract<Box, { kind: "menu" }>;

/** A choice: one tab per option, each holding what happens when the player picks it (its route). */
export function ChoiceBox({ box: b, prev, next }: { box: Menu; prev: Box | null; next: Box | null; layout: ListLayout }) {
  const c = useBox();
  const id = idAt(c.view, b.from);
  const tab = Math.min(useSceneUi(s => s.tabs[id] ?? 0), Math.max(0, b.options.length - 1));
  const setTab = (i: number) => useSceneUi.setState(s => ({ tabs: { ...s.tabs, [id]: i } }));
  const o = b.options[tab];
  const add = () => { addOption(c.view, b, c.base, new Set(c.labels)); setTab(b.options.length); };

  return (
    <div className="bx-box bx-choice" data-line={b.from} data-from={b.from} data-to={b.to}>
      {b.caption.length > 0 && (
        <div className="px-3 pt-3">
          {b.caption.map((x, i) => (
            <BoxItem key={`${x.kind}:${x.from}`} box={x} prev={b.caption[i - 1] ?? null} next={b.caption[i + 1] ?? null}
              layout={{ indent: b.indent + 4, tight: true, level: false, chat: false }} />
          ))}
        </div>
      )}
      <div className="bx-choice-head" role="tablist" aria-label="Options">
        <span className="bx-choice-name"><Split className="h-4 w-4" strokeWidth={2.25} />The player picks</span>
        {b.options.map((x, i) => (
          <button key={x.line} type="button" role="tab" className="bx-tab" aria-selected={i === tab} onClick={() => setTab(i)}
            onFocus={() => follow(c.view, x.line)} title={unescapeText(x.raw)}>
            {unescapeText(x.raw) || `Option ${i + 1}`}
          </button>
        ))}
        <IconButton icon={Plus} size="sm" label="Add an option" className="mb-0.5" onClick={add} />
      </div>
      <div className="bx-choice-body" role="tabpanel">
        {o ? <Option key={o.line} menu={b} index={tab} onRemoved={() => setTab(Math.max(0, tab - 1))} /> : <p className="py-2 text-center font-talk text-sm text-taupe">No options yet.</p>}
        {b.cont && <p className="bx-choice-foot">Then every option goes on below</p>}
      </div>
      <Problems list={problemsOf(c, b)} />
      <Acts box={b} prev={prev} next={next} />
    </div>
  );
}

function Option({ menu, index, onRemoved }: { menu: Menu; index: number; onRemoved: () => void }) {
  const c = useBox();
  const o = menu.options[index];
  const text = unescapeText(o.raw);
  // typed here, written to the file as you go (the field keeps its own value so the caret doesn't jump)
  const [v, setV] = useState(text);
  useEffect(() => { if (document.activeElement?.id !== `opt-${o.line}`) setV(text); }, [text, o.line]);
  // jumps right to where the routes meet
  const only = o.boxes.length === 1 ? o.boxes[0] : null;
  const contName = menu.cont ? c.view.state.doc.line(menu.cont).text.match(/label\s+(\w+)/)?.[1] : null;
  const straight = !o.route && only?.kind === "stmt" && only.stmt.kind === "jump" && only.stmt.target === contName;
  const filled = o.boxes.length > 0 && !straight;
  const remove = () => { removeOption(c.view, menu, index); onRemoved(); };
  return (
    <>
      <div className="mb-2 flex items-center gap-2.5">
        <label htmlFor={`opt-${o.line}`} className="shrink-0 font-sans text-sm text-taupe">Button text</label>
        <input id={`opt-${o.line}`} value={v} className={cn(fieldCls, "h-8 text-butter")}
          onChange={e => { setV(e.target.value); setOptionText(c.view, o.line, e.target.value); }}
          onFocus={() => follow(c.view, o.line)} />
        {o.cond && <span className="bx-cond shrink-0" title="Only shown when this is true (edit it in the source view)">{o.cond}</span>}
        {menu.options.length > 1 && (filled
          ? <Confirm message={`Remove "${text}" and everything in it?`} label="Remove" onConfirm={remove}>
              <IconButton icon={Trash2} size="sm" tone="danger" label="Remove this option" />
            </Confirm>
          : <IconButton icon={Trash2} size="sm" tone="danger" label="Remove this option" onClick={remove} />)}
      </div>
      {straight ? (
        <div className="flex flex-col items-center gap-1 py-2 font-talk text-sm text-taupe">
          <span className="flex items-center gap-1.5"><CornerRightDown className="h-4 w-4" />Goes straight on below, nothing extra happens.</span>
          <Button size="sm" variant="ghost" onClick={() => routeOption(c.view, menu, index, c.base, new Set(c.labels))}>Add lines for this option</Button>
        </div>
      ) : (
        <List boxes={o.boxes} start={o.start} layout={{ ...o.start, tight: o.tight }} empty="What happens when the player picks this?" />
      )}
    </>
  );
}
