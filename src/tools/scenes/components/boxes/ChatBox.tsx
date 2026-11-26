import { MessageSquareText } from "lucide-react";
import type { Box } from "../../lib/blocks";
import { setRaw } from "../../lib/ops";
import { formatChatHead } from "../../lib/script";
import { follow, problemsOf, useBox, useDraft, type ListLayout } from "./context";
import { Acts, List, Problems } from "./List";

type Chat = Extract<Box, { kind: "chat" }>;

/** A chat on the phone (`chat sakari:`): messages as bubbles, the POV character's on the right. "Arrived earlier"
 *  is a `chat log` (already there when the phone opens), "written live" appears message by message. */
export function ChatBox({ box: b, prev, next }: { box: Chat; prev: Box | null; next: Box | null; layout: ListLayout }) {
  const c = useBox();
  const name = useDraft(b.thread);
  const write = (thread: string, log: boolean) => { if (thread.trim()) setRaw(c.view, b.from, b.from, b.indent, formatChatHead(thread.trim(), log)); };
  return (
    <div className="bx-box bx-chat" data-line={b.from} data-from={b.from} data-to={b.to}>
      <div className="bx-phone">
        <div className="bx-phone-head">
          <MessageSquareText strokeWidth={2.25} />
          <input value={name.value} aria-label="Chat name" spellCheck={false}
            onFocus={() => { name.onFocus(); follow(c.view, b.from); }} onBlur={name.onBlur}
            onChange={e => { name.onChange(e.target.value); write(e.target.value, b.log); }} />
          <button type="button" className="bx-log" onClick={() => write(b.thread, !b.log)}
            title={b.log ? "Already in the chat when the phone opens (chat log). Click: written live instead" : "Appears message by message. Click: arrived earlier instead"}>
            {b.log ? "arrived earlier" : "written live"}
          </button>
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
