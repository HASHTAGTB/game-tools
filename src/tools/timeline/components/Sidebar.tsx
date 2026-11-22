import { Eye, EyeOff, Plus } from "lucide-react";
import { useState } from "react";
import { TOOLS } from "@/app/tools";
import { cn } from "@/shared/lib/utils";
import { IconButton } from "@/shared/ui/icon-button";
import { ToolNav } from "@/shared/ui/tool-nav";
import { WorkspaceLocation } from "@/shared/ui/workspace-location";
import { visible } from "../lib/colors";
import { formatSpan } from "../lib/duration";
import { laneChars } from "../lib/layout";
import { useTimeline } from "../state";
import { newCharId } from "./Inspector";
import { factId } from "../lib/knowledge";

/** Lanes (characters) and arcs, like the game's menu: a vertical rule with text links. */
export function Sidebar({ onPickArc }: { onPickArc: (id: string) => void }) {
  const { doc, res, loc, hidden, selection, toggleHidden, select, edit, reload } = useTimeline();
  const [name, setName] = useState("");
  const [factName, setFactName] = useState("");
  const addFact = () => {
    const n = factName.trim();
    if (!n) return;
    const id = factId(n, doc.facts.map(f => f.id));
    edit(d => { d.facts.push({ id, name: n }); });
    select({ kind: "fact", id });
    setFactName("");
  };
  const chars = laneChars(doc.roster, doc.arcs);
  const arcs = [...doc.arcs].sort((a, b) => (res.arcs.get(a.id)?.start ?? 0) - (res.arcs.get(b.id)?.start ?? 0));
  const addChar = () => {
    const n = name.trim();
    if (!n) return;
    const id = newCharId(n, doc.roster, chars.map(c => c.id));
    edit(d => { d.roster.push({ id, name: n, color: "#c4956a" }); });
    select({ kind: "char", id });
    setName("");
  };

  return (
    <aside className="flex min-h-0 flex-col border-r border-ink-line/60">
      <ToolNav current={TOOLS.timeline} />
      <nav className="min-h-0 flex-1 space-y-7 overflow-y-auto px-6 pb-4">
        <div>
          <p className="mb-2 font-sans text-[13px] uppercase tracking-wider text-taupe">Lanes</p>
          <ul className="border-l-2 border-bone/40">
            {chars.map(c => {
              const off = hidden.has(c.id);
              const on = selection?.kind === "char" && selection.id === c.id;
              return (
                <li key={c.id} className="group/char relative flex items-center">
                  <span aria-hidden className="absolute left-[-3px] top-1.5 h-[calc(100%-12px)] w-1 rounded-full" style={{ background: off ? "transparent" : visible(c.color) }} />
                  <button onClick={() => select({ kind: "char", id: c.id })}
                    className={cn("block min-w-0 flex-1 truncate py-1 pl-4 text-left font-sans text-[17px] underline-offset-[6px] decoration-2 transition-colors",
                      on ? "text-paper" : off ? "text-taupe/60 line-through" : "text-bone/80 hover:text-paper hover:underline")}>{c.name}</button>
                  <IconButton icon={off ? EyeOff : Eye} size="sm" tooltipSide="right" label={off ? "Show lane" : "Hide lane (only for you)"} onClick={() => toggleHidden(c.id)}
                    className={cn("opacity-0 focus-visible:opacity-100 group-hover/char:opacity-100 [@media(hover:none)]:opacity-100", off && "opacity-100")} />
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex items-center gap-1 border-b-2 border-ink-line focus-within:border-caramel">
            <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && addChar()}
              placeholder="New character" aria-label="New character name"
              className="h-8 min-w-0 flex-1 bg-transparent font-talk text-[14px] text-paper placeholder:text-taupe focus:outline-hidden" />
            <IconButton icon={Plus} size="sm" label="Add character" kbd="Enter" onClick={addChar} disabled={!name.trim()} />
          </div>
        </div>

        <div>
          <p className="mb-2 font-sans text-[13px] uppercase tracking-wider text-taupe">Arcs</p>
          <ul className="space-y-0.5">
            {arcs.map(a => {
              const s = res.arcs.get(a.id);
              const on = selection?.kind === "arc" && selection.id === a.id;
              return (
                <li key={a.id}>
                  <button onClick={() => { select({ kind: "arc", id: a.id }); onPickArc(a.id); }}
                    className={cn("block w-full rounded-sm py-0.5 text-left", on ? "text-paper" : "text-bone/80 hover:text-paper")}>
                    <span className="block truncate font-sans text-[15px]">{a.name}</span>
                    {s && <span className="block truncate font-talk text-[11px] text-taupe">{formatSpan(s.start, s.end, s.precision)}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <div>
          <p className="mb-2 font-sans text-[13px] uppercase tracking-wider text-taupe">Facts</p>
          <ul className="space-y-0.5">
            {doc.facts.map(f => (
              <li key={f.id}>
                <button onClick={() => select({ kind: "fact", id: f.id })}
                  className={cn("block w-full truncate py-0.5 text-left font-talk text-[14px]", selection?.kind === "fact" && selection.id === f.id ? "text-paper" : "text-bone/80 hover:text-paper")}>{f.name}</button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center gap-1 border-b-2 border-ink-line focus-within:border-caramel">
            <input value={factName} onChange={e => setFactName(e.target.value)} onKeyDown={e => e.key === "Enter" && addFact()}
              placeholder="New fact (a secret, news…)" aria-label="New fact"
              className="h-8 min-w-0 flex-1 bg-transparent font-talk text-[14px] text-paper placeholder:text-taupe focus:outline-hidden" />
            <IconButton icon={Plus} size="sm" label="Add fact" kbd="Enter" onClick={addFact} disabled={!factName.trim()} />
          </div>
        </div>
      </nav>
      <WorkspaceLocation loc={loc} onChanged={reload} onReload={() => reload(loc?.kind === "browser" ? "Reloaded" : "Reloaded from disk")} />
    </aside>
  );
}
