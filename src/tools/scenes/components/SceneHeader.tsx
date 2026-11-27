import { Wand2 } from "lucide-react";
import { useState } from "react";
import { useShallow } from "zustand/shallow";
import { cn } from "@/shared/lib/utils";
import { Field } from "@/shared/ui/field";
import { IconButton } from "@/shared/ui/icon-button";
import { Select } from "@/shared/ui/select";
import { readInfo, RENPY_HINT, RENPY_LEVELS, setInfo, STATUS_HINT, STATUSES, type InfoKey } from "../lib/header";
import { setLabel } from "../lib/ops";
import { labelOf } from "../lib/labels";
import { suggestLabel } from "../lib/script";
import { useSceneUi } from "../lib/ui";
import { useChapters, useScenes } from "../state";

/** The scene's info above the script: its chapter (a timeline chapter), status and Ren'Py level (the file's `##`
 *  header) and its label (in the script). Each field writes through the editor, so Ctrl+Z undoes it too. */
export function SceneHeader({ title }: { title: string }) {
  const info = useScenes(useShallow(s => readInfo(s.text)));
  const label = useSceneUi(s => (s.script ? labelOf(s.script) : null));
  const suggested = suggestLabel(title);
  const chapters = useChapters(c => c.list) ?? [];
  const chapterName = (id: string) => chapters.find(c => c.id === id)?.name ?? id;

  const write = (key: InfoKey, value: string) => {
    const v = useSceneUi.getState().view;
    const c = v && setInfo(v.state.doc.toString(), key, value);
    if (c) v.dispatch({ changes: c, userEvent: "input.info" });
  };
  const rename = (name: string) => { const v = useSceneUi.getState().view; if (v) setLabel(v, name); };

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 border-b border-ink-line/60 px-6 py-2">
      <Pick label="Chapter" value={info.chapter} options={["", ...chapters.map(c => c.id)]} show={v => (v ? chapterName(v) : "none")}
        hints={{ "": "Not in the timeline (yet)" }} placeholder="none" onPick={v => write("chapter", v)} />
      <Pick label="Status" value={info.status} options={STATUSES} hints={STATUS_HINT} onPick={v => write("status", v)} />
      <Pick label="Ren'Py" value={info.renpy} options={RENPY_LEVELS} hints={RENPY_HINT} onPick={v => write("renpy", v)} />
      <Field inline label="Label" className="ml-auto gap-1">
        {label
          ? <LabelInput key={label} value={label} onCommit={rename} />
          : <span className="font-talk text-sm text-coral">none</span>}
        {label && label !== suggested && (
          <IconButton icon={Wand2} size="sm" label={`Use ${suggested} (from the title)`} onClick={() => rename(suggested)} />
        )}
      </Field>
    </div>
  );
}

/** One of the header's pickers: `options` with their hints, each shown as `show` says. */
function Pick({ label, value, options, hints, show = v => v, onPick, placeholder }: {
  label: string; value: string; options: readonly string[]; hints: Record<string, string>; show?: (v: string) => string; onPick: (v: string) => void; placeholder?: string;
}) {
  return (
    <Field inline label={label}>
      <Select label={label} value={value} placeholder={placeholder} onChange={onPick} options={options.map(o => ({ value: o, label: show(o), hint: hints[o] }))} />
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
