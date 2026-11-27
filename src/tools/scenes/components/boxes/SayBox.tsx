import { memo, useRef, type CSSProperties } from "react";
import { cn } from "@/shared/lib/utils";
import { useMorph } from "@/shared/ui/use-morph";
import { useWash } from "@/shared/ui/use-wash";
import type { Box } from "../../lib/blocks";
import { look } from "../../lib/look";
import { membersOf, parseArgs } from "../../lib/phone";
import { useSceneUi } from "../../lib/ui";
import { follow, phoneLook, stageBefore, useBox, type ListLayout } from "./context";
import { problemsOf } from "./kinds";
import { Acts, Problems } from "./List";
import { MessageActs, MessageTop, Pills } from "./PhoneParts";
import { BraceMenu } from "./TextTools";
import { useSayEditor } from "./useSayEditor";

type Say = Extract<Box, { kind: "say" }>;

/** A line someone says (a tinted box, their name in the margin) or narration (an outlined box). In a chat, a message
 *  is a bubble (the POV character's on the right), its name still in the margin, with what the phone shows of it: the
 *  message it replies to, its photos, "typing…" first, the reactions it gets. Both are one component, so a line that
 *  becomes a message (Tab) keeps its text and caret, and the new speaker's colour washes over it. Typing in it:
 *  ./useSayEditor.ts. */
export const SayBox = memo(function SayBox({ box: b, prev, next, layout }: { box: Say; prev: Box | null; next: Box | null; layout: ListLayout }) {
  const c = useBox();
  const { view, manifest } = c;
  const stage = stageBefore(c, b.from);
  const chat = layout.chat;
  const ext = b.who === "extend";
  // `extend` goes on in the voice of the line before: their colours (or narration's), "…" for a name
  const said = ext ? stage.speaker : b.who;
  const w = said ? look(manifest, said) : null;
  const pov = stage.pov ? look(manifest, stage.pov) : null;
  const cont = prev?.kind === "say" && (ext || prev.who === b.who);
  // a message on the phone (not narration in a chat)
  const msg = chat && !!b.who && !ext;
  const args = msg ? parseArgs(b.tail) : null;
  const phone = msg ? phoneLook(c, b.from, args!.reply) : null;
  const live = !phone?.block.head.log;
  const tint = w ?? (chat ? null : pov);
  const style = { "--who": w?.color ?? "transparent", "--whoL": tint?.legible } as CSSProperties;
  // who Tab steps through: in a chat its members, else narration and the scene's cast
  const castHere = chat ? (phone && membersOf(manifest, phone.block.head.target)) || c.cast : [null, ...c.cast];
  // someone else says it now: their colour washes over the box, their name rolls in
  const boxRef = useRef<HTMLDivElement>(null);
  const bubRef = useRef<HTMLDivElement>(null);
  const whoRef = useRef<HTMLButtonElement>(null);
  useWash(said, msg ? bubRef : boxRef, whoRef);
  // a quote, photos or "typing…" comes or goes: the bubble morphs to its new size
  useMorph(bubRef, msg ? JSON.stringify([args!.reply, phone?.target?.line, args!.photos, args!.typing]) : null);
  // after the wash and the morph, as it always was: they measure the box before its new text is put in
  const ed = useSayEditor(b, prev, next, layout, castHere);

  const known = !b.who || !manifest || w?.known;
  const problems = problemsOf(c, b);
  const name = (
    <button ref={whoRef} type="button" className={cn("bx-who", !said && "bx-narr-who", !known && "bx-unknown")} tabIndex={-1}
      title={ext ? `Goes on from the line before${w ? ` (${w.name})` : ""}` : b.who ? `${w!.name} · click to change who ${msg ? "writes" : "says"} it (Tab)` : `${pov ? pov.name + "'s narration" : "Narration"} · click to give it a speaker (Tab)`}
      onMouseDown={e => e.preventDefault()} onClick={e => useSceneUi.setState({ menu: { kind: "speaker", anchor: e.currentTarget, line: b.from, chat } })}>
      {!b.who && <span className="bx-dot" />}
      {ext ? "…" : b.who ? w!.name : "Narration"}
    </button>
  );
  const text = (
    <>
      <div ref={ed.ref} className="bx-text" contentEditable suppressContentEditableWarning spellCheck data-text
        data-ph={ext ? "Goes on…" : b.who ? (chat ? (args?.photos?.length ? "Caption (optional)" : "Message…") : `${w!.name} says…`) : "Narration…  ( / to add something else)"}
        {...ed.handlers} onFocus={() => follow(view, b.from)} />
      {ed.brace && <BraceMenu brace={ed.brace} onPick={ed.pick} />}
    </>
  );

  if (msg) {
    const mine = b.who === stage.pov;
    const more = next?.kind === "say" && next.who === b.who;
    return (
      <div ref={boxRef} className={cn("bx-box bx-msg", mine ? "bx-mine" : "bx-theirs", cont && "bx-cont", more && "bx-more")}
        style={style} data-line={b.from} data-from={b.from} data-to={b.to} {...ed.bind}>
        {name}
        <div ref={bubRef} className={cn("bx-bub", !!args!.photos?.length && "bx-has-ph", problems.some(p => p.severity === "error") && "bx-bad")}>
          <MessageTop line={b.from} args={args!} target={phone?.target ?? null} live={live} />
          {text}
        </div>
        <Pills reacts={phone?.reacts ?? []} />
        <Problems list={problems} />
        <Acts box={b} prev={prev} next={next}><MessageActs line={b.from} args={args!} live={live} /></Acts>
      </div>
    );
  }

  return (
    <div ref={boxRef} className={cn("bx-box bx-say", said ? "bx-dlg" : "bx-narr", cont && "bx-cont")}
      style={style} data-line={b.from} data-from={b.from} data-to={b.to} {...ed.bind}>
      {name}
      {text}
      {b.tail && !b.tail.startsWith("#") && <span className="bx-tail" title="Ren'Py options for this line (edit them in the source view, Ctrl+E)">{b.tail}</span>}
      <Problems list={problems} />
      <Acts box={b} prev={prev} next={next} />
    </div>
  );
});
