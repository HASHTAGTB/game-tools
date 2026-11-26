import { ChevronDown, Wand2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import { IconButton } from "@/shared/ui/icon-button";
import { MenuItem, MenuRule } from "@/shared/ui/menu";
import { Popover } from "@/shared/ui/popover";
import { readInfo, RENPY_HINT, RENPY_LEVELS, setInfo, STATUS_HINT, STATUSES, type SceneInfo } from "../lib/frontmatter";
import { setLabel } from "../lib/ops";
import { labelOf } from "../lib/labels";
import { suggestLabel } from "../lib/script";
import { useSceneUi } from "../lib/ui";

/** The scene's info above the script: its status and Ren'Py level (frontmatter, as Obsidian's Dashboard reads them)
 *  and its label (in the script). Each field writes through the editor, so Ctrl+Z undoes it too. */
export function SceneHeader({ text, fileName }: { text: string; fileName: string }) {
  const info = readInfo(text);
  const label = useSceneUi(s => (s.script ? labelOf(s.script) : null));
  const suggested = suggestLabel(fileName);

  const write = (key: keyof SceneInfo, value: string) => {
    const v = useSceneUi.getState().view;
    const c = v && setInfo(v.state.doc.toString(), key, value);
    if (c) v.dispatch({ changes: c, userEvent: "input.info" });
  };
  const rename = (name: string) => { const v = useSceneUi.getState().view; if (v) setLabel(v, name); };

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 border-b border-ink-line/60 px-6 py-2">
      <Pick label="Status" value={info?.status ?? ""} options={STATUSES} hints={STATUS_HINT} onPick={v => write("status", v)} />
      <Pick label="Ren'Py" value={info?.renpy ?? ""} options={RENPY_LEVELS} hints={RENPY_HINT} onPick={v => write("renpy", v)} />
      <span className="ml-auto flex items-center gap-1">
        <span className="font-sans text-sm text-taupe">Label</span>
        {label
          ? <LabelInput key={label} value={label} onCommit={rename} />
          : <span className="font-talk text-sm text-coral">none</span>}
        {label && label !== suggested && (
          <IconButton icon={Wand2} size="sm" label={`Use ${suggested} (from the file name)`} onClick={() => rename(suggested)} />
        )}
      </span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <span className="flex items-center gap-1.5"><span className="font-sans text-sm text-taupe">{label}</span>{children}</span>;
}

function Pick({ label, value, options, hints, onPick }: {
  label: string; value: string; options: readonly string[]; hints: Record<string, string>; onPick: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Field label={label}>
      <Popover open={open} onOpenChange={setOpen} align="start" className="w-64 px-3 py-2.5"
        trigger={
          <button className={cn("flex h-7 items-center gap-1 rounded-md px-1.5 font-talk text-base transition-colors hover:bg-ink-2", value ? "text-paper" : "text-taupe", open && "bg-ink-2")}>
            {value || "not set"}
            <ChevronDown className="h-3.5 w-3.5 text-taupe" strokeWidth={2.5} />
          </button>
        }>
        <MenuRule className="max-h-80 overflow-y-auto">
          {options.map(o => (
            <MenuItem key={o} size="base" active={o === value} layoutId={`${label}-marker`} label={o} sub={hints[o]}
              onClick={() => { setOpen(false); onPick(o); }} />
          ))}
        </MenuRule>
      </Popover>
    </Field>
  );
}

/** Keyed by the label in the file, so a change from elsewhere (undo, the source view) starts it over. */
function LabelInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  const ok = /^\w+$/.test(v);
  return (
    <input value={v} onChange={e => setV(e.target.value.replace(/\s/g, "_"))} spellCheck={false}
      onBlur={() => (ok ? onCommit(v) : setV(value))} onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setV(value); (e.target as HTMLInputElement).blur(); } }}
      title="The name other scenes jump to"
      className={cn("h-7 rounded-md bg-transparent px-1 font-mono text-sm text-bone hover:bg-ink-2 focus:bg-ink-2 focus:outline-hidden", !ok && "text-coral")}
      style={{ width: `${Math.max(8, v.length + 1)}ch` }} />
  );
}
