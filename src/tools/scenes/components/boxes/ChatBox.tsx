import { CalendarDays, MessageSquareText } from "lucide-react";
import { useRef, type CSSProperties } from "react";
import { m, spring } from "@/shared/ui/motion";
import { useMorph } from "@/shared/ui/use-morph";
import { useWash } from "@/shared/ui/use-wash";
import type { Box } from "../../lib/blocks";
import { look } from "../../lib/look";
import { setChatHead } from "../../lib/ops";
import { chatCode, dateWords, groupOf, membersOf } from "../../lib/phone";
import { idAt } from "../../lib/ui";
import { follow, problemsOf, useBox, type ListLayout } from "./context";
import { Acts, List, Problems } from "./List";
import { openPhoneMenu } from "./PhoneParts";

type Chat = Extract<Box, { kind: "chat" }>;

/** A chat on the phone (`chat sakari:`, `chat log rin & satoru yesterday:`): a frame as wide as the dialogue boxes,
 *  its head says which chat, whether it's written live or arrived earlier (and from which day), its messages are
 *  bubbles (the POV character's on the right) with their names in the margin like dialogue. */
export function ChatBox({ box: b, prev, next }: { box: Chat; prev: Box | null; next: Box | null; layout: ListLayout }) {
  const c = useBox();
  const h = b.head;
  const id = idAt(c.view, b.from);
  const members = membersOf(c.manifest, h.target) ?? [];
  const title = "group" in h.target ? groupOf(c.manifest, h.target.group)?.title ?? h.target.group : h.target.dm.map(x => look(c.manifest, x).name).join(" & ");
  // another chat: the head's colour washes over, the name rolls in; live ↔ earlier (the day chip comes or goes):
  // the phone morphs
  const head = useRef<HTMLDivElement>(null);
  const name = useRef<HTMLSpanElement>(null);
  useWash(chatCode(h.target), head, name);
  const phone = useRef<HTMLDivElement>(null);
  useMorph(phone, h.log);
  const setLog = (log: boolean) => { if (log !== h.log) setChatHead(c.view, b.from, { ...h, log, date: log ? h.date : null }); };

  return (
    <div className="bx-box bx-chat" data-line={b.from} data-from={b.from} data-to={b.to}>
      <div ref={phone} className="bx-phone">
        <div ref={head} className="bx-phone-head">
          <MessageSquareText className="bx-phone-ico" strokeWidth={2.25} />
          <button type="button" className="bx-target" title="Which chat. Click: another one" onFocus={() => follow(c.view, b.from)}
            onClick={e => openPhoneMenu({ kind: "chat", anchor: e.currentTarget, line: b.from })}>
            <span className="bx-dots">{members.map(x => <i key={x} style={{ "--c": look(c.manifest, x).legible } as CSSProperties} />)}</span>
            <span ref={name} className="bx-target-name">{title}</span>
          </button>
          <div className="bx-mode" role="group" aria-label="When the messages arrive">
            {([[false, "Live", "Written while the player watches: typing, pop-in, a click for each message (chat)"],
              [true, "Earlier", "Already on the phone when it opens: happened off-screen, nothing waits (chat log)"]] as const).map(([log, label, tip]) => (
              <button key={label} type="button" aria-pressed={h.log === log} title={tip} onClick={() => setLog(log)}>
                {h.log === log && <m.span layoutId={`chat-mode-${id}`} className="bx-mode-thumb" transition={spring.bouncy} />}
                <span>{label}</span>
              </button>
            ))}
          </div>
          {h.log && (
            <button type="button" className="bx-date" title="The day these messages are from"
              onClick={e => openPhoneMenu({ kind: "date", anchor: e.currentTarget, line: b.from })}>
              <CalendarDays strokeWidth={2.25} />{dateWords(h.date)}
            </button>
          )}
        </div>
        <div className="bx-phone-body">
          <List boxes={b.items} start={b.body} layout={b.body} empty="Add the first message" />
        </div>
      </div>
      <Problems list={problemsOf(c, b)} />
      <Acts box={b} prev={prev} next={next} />
    </div>
  );
}
