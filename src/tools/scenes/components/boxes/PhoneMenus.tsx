import { CalendarDays, Check, Search, Trash2, Undo2, X } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/shared/lib/utils";
import { IconButton } from "@/shared/ui/icon-button";
import { look } from "../../lib/look";
import { insertAt, insertReact, setChatHead, setMsgArgs, setStmt } from "../../lib/ops";
import {
  blockAt, chatCode, chatKey, chatTitle, dateWords, membersOf, msgAt, newId, parseArgs, priorAt, refFor, resolveRef, snippet,
  type ChatHead, type ChatMsg, type ChatTarget, type DmTarget,
} from "../../lib/phone";
import { parseLine } from "../../lib/script";
import { formatStmt } from "../../lib/statements";
import { closeMenu, type PhoneMenu } from "../../lib/ui";
import { stageBefore, useBox, type BoxCtx } from "./context";
import { Photo } from "./PhoneParts";
import { Choices, Foot } from "./TextTools";

/** The popups of a chat (opened from ./ChatBox.tsx, ./PhoneParts.tsx and a message in ./SayBox.tsx; shown by
 *  BoxMenus). Every pick is written to the file right away. */
export function PhoneMenus({ menu }: { menu: PhoneMenu }) {
  switch (menu.kind) {
    case "pick": return <MessagePicker menu={menu} />;
    case "emoji": return <EmojiMenu menu={menu} />;
    case "photos": return <PhotosMenu line={menu.line} />;
    case "typing": return <TypingMenu line={menu.line} />;
    case "chat": return <ChatMenu line={menu.line} />;
    case "date": return <DateMenu line={menu.line} />;
  }
}
/** How wide each popup is. */
export const phoneMenuCls = (m: PhoneMenu) => (m.kind === "pick" ? "w-[25rem] p-3" : m.kind === "photos" ? "w-[23rem] p-3" : m.kind === "typing" ? "p-2.5" : "w-[18rem] p-3");

const Title = ({ children }: { children: React.ReactNode }) => <p className="mb-2 px-1 font-sans text-sm text-taupe">{children}</p>;
const Group = ({ children }: { children: React.ReactNode }) => <p className="mb-1 mt-2.5 px-1 font-sans text-xs uppercase tracking-[.12em] text-taupe first:mt-0">{children}</p>;
const rowCls = "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-talk text-base text-paper transition-colors hover:bg-paper/8 focus-visible:bg-paper/8 focus-visible:outline-hidden";

const stmtAt = (c: BoxCtx, line: number) => { const p = parseLine(c.view.state.doc.line(line).text); return p.kind === "stmt" ? p.stmt : null; };
const tailAt = (c: BoxCtx, line: number) => { const p = parseLine(c.view.state.doc.line(line).text); return p.kind === "say" ? p.tail : ""; };

/** How to point at `target` from where `prior` ends: its id, or a piece of its text; a message of this scene with
 *  neither (a photo without caption) gets an id written on it. Null: a message of another scene with neither. */
function pointAt(c: BoxCtx, target: ChatMsg, prior: ChatMsg[]) {
  const r = refFor(target, prior);
  if (r || target.scene) return r;
  const id = newId(target, new Set([...c.phone.history, ...c.phone.msgs].map(m => m.id).filter((x): x is string => !!x)));
  setMsgArgs(c.view, target.line, () => ({ id }));
  return { ref: id, byText: false };
}

// ---------------------------------------------------------------- the earlier message a reply or reaction is about

/** Everything said in the chat before this point, from earlier scenes too, grouped by where it was said; newest at the
 *  bottom (scrolled there). Search by text or sender. */
function MessagePicker({ menu }: { menu: Extract<PhoneMenu, { kind: "pick" }> }) {
  const c = useBox();
  const at = menu.for === "new" ? menu.place!.after + 1 : menu.line;
  const block = blockAt(c.phone, menu.for === "new" ? menu.place!.after : menu.line);
  const prior = useMemo(() => (block ? priorAt(c.phone, block.key, at) : []), [c.phone, block, at]);
  const current = useMemo(() => {
    if (menu.for === "reply") { const r = parseArgs(tailAt(c, menu.line)).reply; return r !== null ? resolveRef(r, prior) : null; }
    if (menu.for === "react") { const x = stmtAt(c, menu.line); return x?.kind === "react" ? resolveRef(x.ref, prior) : null; }
    return null;
  }, [c, menu, prior]);
  const [q, setQ] = useState("");
  const list = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight; }, []);
  if (!block) return null;
  const query = q.trim().toLowerCase();
  const shown = prior.filter(m => !query || m.text.toLowerCase().includes(query) || look(c.manifest, m.who).name.toLowerCase().includes(query));
  const where = (m: ChatMsg) => (m.scene ? m.scene.title : m.line > block.from ? "This chat, above" : "Earlier in this scene");

  const pick = (m: ChatMsg) => {
    const r = pointAt(c, m, prior);
    if (!r) return;
    closeMenu();
    if (menu.for === "reply") setMsgArgs(c.view, menu.line, () => ({ reply: r.ref }));
    else if (menu.for === "react") { const x = stmtAt(c, menu.line); if (x?.kind === "react") setStmt(c.view, menu.line, { ...x, ...r }); }
    else insertAt(c.view, menu.place!, [formatStmt({ kind: "react", ...r, emoji: "👍", by: null })]);
  };
  let group = "";
  return (
    <div>
      <Title>{menu.for === "reply" ? "Reply to" : "React to"}</Title>
      <label className="mb-2 flex items-center gap-2 border-b-2 border-ink-line px-1 pb-2 transition-colors focus-within:border-caramel">
        <Search className="h-4 w-4 shrink-0 text-taupe" strokeWidth={2.25} />
        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search the chat…" aria-label="Search the chat"
          className="min-w-0 flex-1 bg-transparent font-talk text-base text-paper placeholder:text-taupe focus:outline-hidden"
          onKeyDown={e => { if (e.key === "Enter" && shown.length) { e.preventDefault(); pick(shown[shown.length - 1]); } }} />
      </label>
      <div ref={list} className="max-h-[19rem] overflow-y-auto">
        {!shown.length && <p className="px-1 py-1 font-talk text-sm text-taupe">{prior.length ? "No message says that." : "Nothing was written in this chat before here."}</p>}
        {shown.map(m => {
          const w = look(c.manifest, m.who);
          const g = where(m);
          const head = g !== group ? (group = g) : null;
          const stuck = !!m.scene && !refFor(m, prior);
          return (
            <div key={`${m.scene?.path ?? ""}:${m.line}`}>
              {head && <Group>{head}</Group>}
              <button type="button" disabled={stuck} onClick={() => pick(m)} data-bloom
                title={stuck ? `This photo has no caption or id to point at. Give it an id in ${m.scene!.title} first.` : undefined}
                className={cn(rowCls, "items-baseline py-1 disabled:cursor-default disabled:opacity-35", m === current && "bg-caramel/15")}>
                <span className="w-16 shrink-0 truncate font-sans text-sm font-semibold" style={{ color: w.legible }}>{w.name}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-bone">{snippet(m)}</span>
                {m.time && <span className="shrink-0 font-sans text-xs tabular-nums text-taupe">{m.time}</span>}
              </button>
            </div>
          );
        })}
      </div>
      <Foot>
        <p className="font-talk text-xs leading-snug text-taupe">Points at it by a piece of its text (or its id, if it has one). Nothing to name.</p>
        {menu.for === "reply" && current !== undefined && parseArgs(tailAt(c, menu.line)).reply !== null && (
          <IconButton icon={X} size="sm" tone="danger" label="Remove the reply" className="ml-auto" onClick={() => { closeMenu(); setMsgArgs(c.view, menu.line, () => ({ reply: null })); }} />
        )}
      </Foot>
    </div>
  );
}

// ---------------------------------------------------------------- reactions

const EMOJI = ["👍", "👌", "❤️", "😂", "😮", "😢", "🙏", "🔥"];

/** A reaction's emoji, and who reacts (none: the phone's owner); or, `new`, the emoji of a new reaction to the
 *  message at `line` (written right after it). */
function EmojiMenu({ menu }: { menu: Extract<PhoneMenu, { kind: "emoji" }> }) {
  const c = useBox();
  const x = menu.new ? null : stmtAt(c, menu.line);
  const react = x?.kind === "react" ? x : null;
  const block = blockAt(c.phone, menu.line);
  const used = [...new Set(c.phone.reacts.map(r => r.emoji).filter(Boolean))];
  const emojis = [...EMOJI, ...used.filter(e => !EMOJI.includes(e))];
  const [other, setOther] = useState("");
  const pov = stageBefore(c, menu.line).pov;

  const write = (emoji: string) => {
    closeMenu();
    if (react) return setStmt(c.view, menu.line, { ...react, emoji });
    const msg = msgAt(c.phone, menu.line);
    if (!msg || !block) return;
    const r = pointAt(c, msg, priorAt(c.phone, block.key, menu.line + 1));
    if (r) insertReact(c.view, menu.line, { kind: "react", ...r, emoji, by: null });
  };
  const members = block ? membersOf(c.manifest, block.head.target) ?? c.cast : c.cast;
  return (
    <div>
      <Title>{react ? "Reaction" : "React with"}</Title>
      <div className="grid grid-cols-4 gap-1">
        {emojis.map(e => (
          <button key={e} type="button" onClick={() => write(e)} aria-pressed={react?.emoji === e}
            className={cn("grid h-10 place-items-center rounded-md text-xl transition-colors hover:bg-paper/8", react?.emoji === e && "bg-caramel/20")}>{e}</button>
        ))}
      </div>
      <input value={other} onChange={e => setOther(e.target.value)} placeholder="Another emoji…" aria-label="Another emoji"
        onKeyDown={e => { if (e.key === "Enter" && other.trim()) { e.preventDefault(); write(other.trim()); } }}
        className="mt-2 w-full border-b-2 border-ink-line bg-transparent px-1 pb-1.5 font-talk text-base text-paper placeholder:text-taupe focus:border-caramel focus:outline-hidden" />
      {react && <>
        <Group>From</Group>
        <div className="flex flex-wrap gap-1.5 px-0.5">
          {members.map(id => {
            const w = look(c.manifest, id);
            const on = (react.by ?? pov) === id;
            return (
              <button key={id} type="button" onClick={() => { closeMenu(); setStmt(c.view, menu.line, { ...react, by: id === pov ? null : id }); }}
                style={{ "--oc": w.legible } as CSSProperties}
                className={cn("flex h-7 items-center gap-1.5 rounded-full border px-2.5 font-sans text-sm transition-colors",
                  on ? "border-(--oc) bg-paper/8 text-paper" : "border-ink-line text-bone hover:border-taupe")}>
                <span className="h-2 w-2 rounded-full" style={{ background: "var(--oc)" }} />{w.name}
              </button>
            );
          })}
        </div>
        <Foot>
          <button type="button" className={cn(rowCls, "text-sm")} onClick={() => write("")}><Undo2 className="h-4 w-4 text-taupe" />Take the reaction back</button>
        </Foot>
      </>}
    </div>
  );
}

// ---------------------------------------------------------------- photos, typing

/** The phone's photos (assets/features/photos), each toggled on or off for the message. */
function PhotosMenu({ line }: { line: number }) {
  const c = useBox();
  const a = parseArgs(tailAt(c, line));
  const [name, setName] = useState("");
  if (a.photos === null) return <p className="px-1 font-talk text-sm text-bone">These photos are written as code ({a.photosRaw}). Change them as Ren'Py.</p>;
  const have = a.photos;
  const all = [...new Set([...Object.keys(c.manifest?.photos ?? {}).sort(), ...have])];
  const toggle = (p: string) => setMsgArgs(c.view, line, x => ({ photos: (x.photos ?? []).includes(p) ? (x.photos ?? []).filter(y => y !== p) : [...(x.photos ?? []), p] }));
  return (
    <div>
      <Title>Photos</Title>
      {all.length > 0 && (
        <div className="grid max-h-[18rem] grid-cols-3 gap-1.5 overflow-y-auto p-0.5">
          {all.map(p => (
            <button key={p} type="button" onClick={() => toggle(p)} aria-pressed={have.includes(p)} title={p}
              className={cn("relative aspect-square overflow-hidden rounded-md transition-shadow", have.includes(p) ? "shadow-[0_0_0_2px_var(--color-caramel)]" : "hover:shadow-[0_0_0_1px_var(--color-taupe)]")}>
              <Photo name={p} className="bx-fill" />
              {have.includes(p) && <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-caramel text-ink"><Check className="h-3 w-3" strokeWidth={3} /></span>}
            </button>
          ))}
        </div>
      )}
      <input value={name} onChange={e => setName(e.target.value)} placeholder="A photo by its name…" aria-label="A photo by its name"
        onKeyDown={e => { if (e.key === "Enter" && name.trim()) { e.preventDefault(); toggle(name.trim()); setName(""); } }}
        className="mt-2 w-full border-b-2 border-ink-line bg-transparent px-1 pb-1.5 font-talk text-base text-paper placeholder:text-taupe focus:border-caramel focus:outline-hidden" />
      <p className="mt-2 px-1 font-talk text-xs leading-snug text-taupe">Everyone in the chat gets them in their gallery.</p>
    </div>
  );
}

const TYPING = [0.5, 1, 1.5, 2, 3, 5] as const;

function TypingMenu({ line }: { line: number }) {
  const c = useBox();
  const secs = parseArgs(tailAt(c, line)).typing;
  const set = (typing: number | null) => { closeMenu(); setMsgArgs(c.view, line, () => ({ typing })); };
  return <>
    <Choices title="Typing first" value={secs ? `${secs} s` : "no"} options={TYPING} at={secs && (TYPING as readonly number[]).includes(secs) ? (secs as typeof TYPING[number]) : null}
      label={v => `${v} s`} onPick={set} />
    <Foot>
      <span className="font-talk text-xs text-taupe">“Typing…” before it pops in</span>
      <IconButton icon={Trash2} size="sm" tone="danger" label="No typing" className="ml-auto" onClick={() => set(null)} />
    </Foot>
  </>;
}

// ---------------------------------------------------------------- the chat's head

function headAt(c: BoxCtx, line: number) { return blockAt(c.phone, line)?.head ?? null; }

/** Which chat: a group the game declares, or two people. */
function ChatMenu({ line }: { line: number }) {
  const c = useBox();
  const head = headAt(c, line);
  const [someone, setSomeone] = useState("");
  if (!head) return null;
  const pov = stageBefore(c, line).pov ?? c.cast[0];
  const set = (target: ChatTarget) => { closeMenu(); setChatHead(c.view, line, { ...head, target }); };
  // people who text: in a group, or in a chat with two people anywhere in the story so far
  const texting = [...(c.manifest?.chats ?? []).flatMap(g => g.members), ...[...c.phone.history, ...c.phone.msgs].map(m => m.who),
    ...c.phone.blocks.flatMap(b => ("dm" in b.head.target ? b.head.target.dm : []))];
  const others = [...new Set(texting)].filter(id => id !== pov);
  const known = c.manifest?.characters ?? [];
  const someoneId = known.find(x => x.id === someone.trim() || x.name.toLowerCase() === someone.trim().toLowerCase())?.id;
  const dms: DmTarget[] = others.map(id => ({ dm: [id, pov] }));
  if ("dm" in head.target && !dms.some(d => chatKey(d) === chatKey(head.target))) dms.push(head.target);
  const now = chatKey(head.target);
  const row = (t: ChatTarget, label: string, color: string, sub?: string) => (
    <button key={chatKey(t)} type="button" className={rowCls} onClick={() => set(t)}>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {sub && <span className="shrink-0 font-talk text-xs text-taupe">{sub}</span>}
      {chatKey(t) === now && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-caramel" />}
    </button>
  );
  return (
    <div>
      <Title>Chat</Title>
      {(c.manifest?.chats?.length ?? 0) > 0 && <Group>Groups</Group>}
      {c.manifest?.chats?.map(g => row({ group: g.id }, g.title, "var(--color-caramel)", g.members.map(id => look(c.manifest, id).name).join(", ")))}
      <Group>Two people</Group>
      {dms.map(d => row(d, chatTitle(c.manifest, d), look(c.manifest, d.dm.find(id => id !== pov) ?? pov).legible))}
      <input value={someone} onChange={e => setSomeone(e.target.value)} list="chat-people" placeholder="Someone else…" aria-label="Someone else"
        onKeyDown={e => { if (e.key === "Enter" && someoneId && someoneId !== pov) { e.preventDefault(); set({ dm: [someoneId, pov] }); } }}
        className="mt-1.5 w-full border-b-2 border-ink-line bg-transparent px-1 pb-1.5 font-talk text-base text-paper placeholder:text-taupe focus:border-caramel focus:outline-hidden" />
      <datalist id="chat-people">{known.filter(x => x.id !== pov).map(x => <option key={x.id} value={x.name} />)}</datalist>
      <p className="mt-2 px-1 font-talk text-xs leading-snug text-taupe">Groups are declared in features/phone/content/chats/chats.rpy. Written as <code>{chatCode(head.target)}</code>.</p>
    </div>
  );
}

/** The day a chat that arrived earlier is from. */
function DateMenu({ line }: { line: number }) {
  const c = useBox();
  const head = headAt(c, line);
  if (!head) return null;
  const set = (date: string | null) => { closeMenu(); setChatHead(c.view, line, { ...head, date } satisfies ChatHead); };
  const days: (string | null)[] = [null, "yesterday", "-2", "-3"];
  const exact = head.date && /^\d{4}/.test(head.date) ? head.date : "";
  let picked = false;   // Enter, then the blur as the menu closes: written once
  const pickDate = (v: string) => { if (picked || !/^\d{4}-\d\d-\d\d$/.test(v) || v === exact) return; picked = true; set(v); };
  return (
    <div>
      <Title>From which day</Title>
      {days.map(d => (
        <button key={d ?? "today"} type="button" className={rowCls} onClick={() => set(d)}>
          <CalendarDays className="h-4 w-4 shrink-0 text-taupe" strokeWidth={2.25} />
          <span className="flex-1">{dateWords(d).replace(/^./, ch => ch.toUpperCase())}</span>
          {(head.date ?? null) === d && <span className="h-1.5 w-1.5 rounded-full bg-caramel" />}
        </button>
      ))}
      <Group>A date</Group>
      {/* written when it's done (Enter or leaving the field): `change` fires while a year is still typed digit by digit */}
      <input type="date" defaultValue={exact} aria-label="A date"
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); pickDate(e.currentTarget.value); } }}
        onBlur={e => pickDate(e.target.value)}
        className="w-full rounded-md border border-ink-line bg-ink px-2 py-1 font-sans text-sm text-paper [color-scheme:dark] focus:border-caramel focus:outline-hidden" />
      <p className="mt-2 px-1 font-talk text-xs leading-snug text-taupe">Counted from the scene's day.</p>
    </div>
  );
}

