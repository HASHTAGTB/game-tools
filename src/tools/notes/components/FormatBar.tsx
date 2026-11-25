import { useState, type MouseEvent } from "react";
import {
  Bold, Code, Heading, Heading1, Heading2, Heading3, Heading4, Heading5, Heading6, Highlighter, Italic, Link,
  List, ListOrdered, ListTodo, Strikethrough, TextQuote, type LucideIcon,
} from "lucide-react";
import type { EditorView } from "@codemirror/view";
import { cn } from "@/shared/lib/utils";
import { IconButton } from "@/shared/ui/icon-button";
import { MenuItem, MenuRule } from "@/shared/ui/menu";
import { Popover } from "@/shared/ui/popover";
import { setHeading, toggleInline, toggleList, toggleQuote, useFormat, type InlineStyle, type ListStyle } from "../lib/format";

/** The style toggles in the path bar. They act on the editor's selection, or the word under the cursor, and light
 *  up for what's already on there. */

const run = (cmd: (v: EditorView) => boolean) => {
  const v = useFormat.getState().view;
  if (!v) return;
  cmd(v);
  v.focus();
};
/** Keep the editor focused (and its selection showing) while a button is pressed. */
const keepFocus = (e: MouseEvent) => e.preventDefault();

const on = "bg-ink-3 text-caramel";

const INLINE: { style: InlineStyle; icon: LucideIcon; label: string; kbd?: string }[] = [
  { style: "bold", icon: Bold, label: "Bold", kbd: "Ctrl+B" },
  { style: "italic", icon: Italic, label: "Italic", kbd: "Ctrl+I" },
  { style: "strike", icon: Strikethrough, label: "Strikethrough" },
  { style: "highlight", icon: Highlighter, label: "Highlight" },
  { style: "code", icon: Code, label: "Inline code" },
];
const LISTS: { style: ListStyle; icon: LucideIcon; label: string }[] = [
  { style: "bullet", icon: List, label: "Bullet list" },
  { style: "ordered", icon: ListOrdered, label: "Numbered list" },
  { style: "task", icon: ListTodo, label: "Task list" },
];
const HEADINGS = [Heading, Heading1, Heading2, Heading3, Heading4, Heading5, Heading6];

export function FormatBar() {
  const active = useFormat(s => s.active);
  const ready = useFormat(s => s.view !== null);
  const btn = (key: string, icon: LucideIcon, label: string, isOn: boolean, cmd: (v: EditorView) => boolean, kbd?: string) => (
    <IconButton key={key} icon={icon} label={label} kbd={kbd} size="sm" tooltipSide="bottom" disabled={!ready}
      aria-pressed={isOn} className={cn(isOn && on)} onMouseDown={keepFocus} onClick={() => run(cmd)} />
  );

  return (
    <div role="toolbar" aria-label="Text style" className="flex shrink-0 items-center gap-0.5">
      {INLINE.map(i => btn(i.style, i.icon, i.label, active.inline.includes(i.style), toggleInline(i.style), i.kbd))}
      {btn("wikilink", Link, "Link to a note [[ ]]", active.inline.includes("wikilink"), toggleInline("wikilink"))}
      <Divider />
      <HeadingMenu level={active.heading} disabled={!ready} />
      {LISTS.map(l => btn(l.style, l.icon, l.label, active.list === l.style, toggleList(l.style)))}
      {btn("quote", TextQuote, "Quote", active.quote, toggleQuote)}
    </div>
  );
}

const Divider = () => <span aria-hidden className="mx-1.5 h-4 w-px bg-ink-line" />;

function HeadingMenu({ level, disabled }: { level: number; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const pick = (n: number) => {
    setOpen(false);
    const v = useFormat.getState().view;
    if (v) setHeading(n)(v);
  };
  return (
    <Popover open={open} onOpenChange={setOpen} align="start" className="w-48 px-3 py-2.5"
      finalFocus={() => useFormat.getState().view?.contentDOM ?? true}
      trigger={
        <IconButton icon={HEADINGS[level]} label={level ? `Heading ${level}` : "Heading"} size="sm" tooltipSide="bottom"
          disabled={disabled} className={cn((level > 0 || open) && on)} onMouseDown={keepFocus} />
      }>
      <MenuRule>
        {HEADINGS.map((_, n) => (
          <MenuItem key={n} size="base" active={n === level} layoutId="heading-marker"
            label={n ? `Heading ${n}` : "Text"} onClick={() => pick(n)} />
        ))}
      </MenuRule>
    </Popover>
  );
}
