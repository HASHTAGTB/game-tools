import { Crop } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Chip } from "@/shared/ui/chip";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { Manifest } from "@/shared/lib/game";
import { useThumb, type ThumbImage } from "@/shared/lib/thumbs";
import { cn } from "@/shared/lib/utils";
import { locationVersion } from "@/shared/lib/workspace";
import { SearchField } from "@/shared/ui/search-field";
import { Segmented } from "@/shared/ui/segmented";
import { look as lookOf } from "../../../lib/look";
import { placeOf, type Sprite, type Stage } from "../../../lib/stage";
import { faceCss, faceKey, faceOf, joinLook, looksOf, outfitsOf, poseLabel, posesOf, splitLook, useFaces, type FaceBox, type Look } from "../../../lib/sprites";
import type { Stmt } from "../../../lib/statements";
import { peekAt } from "../../../lib/ui";
import { CardRow, NewName, UseTyped } from "./parts";
import { tabStop } from "./keys";
import { useLazyThumb } from "./thumb";

/** The show card: who, then a large portrait of the sprite as it will look beside the outfit, the poses and the faces
 *  (cut from the full-body sprites with each character's face box, `.game-tools/sprites.json`), then where they stand.
 *  Hovering a face shows it on the portrait and in the preview. */

type Show = Extract<Stmt, { kind: "show" }>;
const uniq = <T,>(xs: T[]) => [...new Set(xs)];
/** A typed name as one Ren'Py image word (a tag, an outfit, an expression: "confused blush" → "confused-blush"), or a
 *  pose as its words ("arms_crossed" → "arms crossed"). */
const oneWord = (s: string) => s.trim().split(/[\s_]+/).filter(Boolean).join("-");
const words = (s: string) => s.trim().split(/[\s_]+/).filter(Boolean).join(" ");

export function ShowPicker({ x, set, m, stage, cast }: {
  x: Show; set: (p: Partial<Show>) => void; m: Manifest | null; stage: Stage; cast: string[];
}) {
  const faces = useFaces(f => f.faces);
  useEffect(() => { if (useFaces.getState().readFor !== locationVersion()) void useFaces.getState().load(); }, []);

  const outfit = x.attrs[0] ?? "";
  const { expr, pose } = splitLook(x.attrs.slice(1).join(" "));
  const outfits = outfitsOf(m, x.tag);
  const looks = looksOf(m, x.tag, outfit);
  const poses = uniq([...posesOf(looks), pose]);
  const here = looks.filter(l => l.pose === pose);
  const current = looks.find(l => l.expr === expr && l.pose === pose) ?? null;
  const onStage = stage.sprites.find(s => s.tag === x.tag);
  const [hover, setHover] = useState<Look | null>(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);

  const setLook = (e: string, p: string, o = outfit) => set({ attrs: [o || "casual", ...joinLook(e, p).split(" ").filter(Boolean)] });
  // a pose starts on its own face (`rin_casual_drawing_drawing`: the expression named like the pose); with none, the
  // same expression when the pose has it, else its first
  const pickPose = (p: string) => {
    const inPose = looks.filter(l => l.pose === p);
    const own = p ? inPose.find(l => l.expr === oneWord(p) || l.expr === p) : undefined;
    setLook(own?.expr ?? (inPose.some(l => l.expr === expr) ? expr : inPose[0]?.expr ?? expr), p);
  };
  const pickOutfit = (o: string) => {
    const there = looksOf(m, x.tag, o);
    const keep = there.find(l => l.expr === expr && l.pose === pose) ?? there.find(l => l.expr === expr) ?? there[0];
    setLook(keep?.expr ?? expr, keep?.pose ?? pose, o);
  };
  const pickWho = (tag: string) => {
    if (tag === x.tag) return;
    const o = outfitsOf(m, tag)[0] ?? outfit;
    const l = looksOf(m, tag, o)[0];
    set({ tag, attrs: [o || "casual", ...(l ? l.look.split(" ") : x.attrs.slice(1))] });
  };

  // the preview: this sprite with the hovered face, where it will stand
  const peekLook = useCallback((l: Look | null, img: ThumbImage | null) => {
    setHover(l);
    if (!l) return peekAt(null);
    const sp: Sprite = { tag: x.tag, attrs: [outfit, ...l.look.split(" ")], at: x.at ?? onStage?.at ?? null };
    const sprites = onStage ? stage.sprites.map(s => (s.tag === x.tag ? sp : s)) : [...stage.sprites, sp];
    // the thumbnail stands in for the file only if the real size is known (the preview sizes sprites by it)
    const images = img?.src && l.file ? { [l.file]: { url: img.url, w: img.src.w, h: img.src.h } } : undefined;
    if (images) peekAt({ stage: { sprites }, images });
  }, [x.tag, x.at, outfit, onStage, stage.sprites]);

  const shown = hover ?? current;
  const typed = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  // the expression written here stays pickable (dashed) when the game has no file for it
  const exprs = expr && !here.some(l => l.expr === expr) ? [{ look: joinLook(expr, pose), expr, pose, file: null }, ...here] : here;
  const listed = exprs.filter(l => typed.every(w => l.expr.includes(w)));
  const useExpr = (e: string) => { setQuery(""); setLook(oneWord(e), pose); };
  const people = uniq([...cast, ...stage.sprites.map(s => s.tag), ...Object.keys(m?.sprites ?? {}), x.tag]).filter(Boolean);
  const box = faceOf(faces, x.tag, pose);

  const onFaceKeys = (e: KeyboardEvent) => {
    if (!/^[1-9]$/.test(e.key) || (e.target as HTMLElement).matches("input")) return;
    const l = listed[+e.key - 1];
    if (l) { e.preventDefault(); e.stopPropagation(); setLook(l.expr, l.pose); }
  };

  return <>
    <CardRow label="Who">
      <div className="flex flex-wrap items-center gap-1.5">
        {people.map(tag => <WhoChip key={tag} tag={tag} m={m} faces={faces} picked={tag === x.tag} onStage={stage.sprites.some(s => s.tag === tag)} onPick={() => pickWho(tag)} />)}
        <NewName label="Someone else (their image tag)" placeholder="image tag" onAdd={t => pickWho(oneWord(t).toLowerCase())} />
      </div>
    </CardRow>

    <div className="bx-show">
      <div className="flex min-w-0 flex-col items-center gap-1.5">
        <Portrait file={shown?.file ?? null} box={box} editing={editing} name={x.tag}
          onBox={b => void useFaces.getState().save(faceKey(x.tag, pose && faces[faceKey(x.tag, pose)] ? pose : ""), b)} />
        {looks.length > 0 && (
          <FaceBoxBar tag={x.tag} pose={pose} editing={editing} onEditing={setEditing} />
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-3" onKeyDown={onFaceKeys}>
        <CardRow label="Outfit">
          <Segmented label="Outfit" value={outfit} onChange={pickOutfit}
            options={uniq([...outfits, outfit]).filter(Boolean).map(o => ({ value: o, missing: !!m?.media && !outfits.includes(o) }))}>
            <NewName label="New outfit" placeholder="outfit name" onAdd={o => pickOutfit(oneWord(o))} />
          </Segmented>
        </CardRow>
        <CardRow label="Pose">
          <div data-grid className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {poses.map((p, i) => {
              const inPose = looks.filter(l => l.pose === p);
              const l = inPose.find(v => v.expr === expr) ?? inPose[0];
              return <PoseTile key={p || "plain"} pose={p} look={l} count={inPose.length} picked={p === pose} tab={tabStop(p === pose, i, true)} onPick={() => pickPose(p)} />;
            })}
            <NewName label="New pose" placeholder="arms crossed" className="flex-none" onAdd={p => pickPose(words(p))} />
          </div>
        </CardRow>
        <CardRow label="Expression" aside={<span className="font-talk text-xs">{here.length} for {poseLabel(pose)}</span>}>
          <SearchField value={query} onValueChange={setQuery} placeholder="Type a feeling: shy, laugh…" data-card-search aria-label="Filter expressions" className="mb-2"
            onKeyDown={e => { if (e.key === "Enter" && query.trim()) { e.preventDefault(); useExpr(listed[0]?.expr ?? query); } }} />
          <UseTyped query={oneWord(query)} known={e => exprs.some(l => l.expr === e)} what="a new expression" onUse={useExpr} />
          <div data-grid className="bx-faces mt-1.5" onPointerLeave={() => peekLook(null, null)}>
            {listed.map((l, i) => (
              <FaceTile key={l.look} look={l} n={i < 9 ? i + 1 : null} box={faceOf(faces, x.tag, l.pose)} picked={l.expr === expr}
                tab={tabStop(l.expr === expr, i, listed.some(v => v.expr === expr))} onPick={setLook} onPeek={peekLook} />
            ))}
            {!listed.length && <p className="col-span-full font-talk text-sm text-taupe">{looks.length ? `No expression matches "${query}".` : "No sprite files for this outfit yet: type one above."}</p>}
          </div>
        </CardRow>
      </div>
    </div>

    <CardRow label="Where">
      <Positions value={x.at} onChange={at => set({ at })} m={m} stays={onStage ? onStage.at ?? "where they are" : null} />
    </CardRow>
  </>;
}

// ---------------------------------------------------------------- who

function WhoChip({ tag, m, faces, picked, onStage, onPick }: {
  tag: string; m: Manifest | null; faces: Record<string, FaceBox>; picked: boolean; onStage: boolean; onPick: () => void;
}) {
  const c = lookOf(m, tag);
  const first = looksOf(m, tag, outfitsOf(m, tag)[0] ?? "")[0];
  const { ref, thumb } = useLazyThumb<HTMLSpanElement>(first?.file ?? null);
  return (
    <span ref={ref} className="inline-flex" title={first ? undefined : "No sprite files yet"}>
      <Chip color={c.legible} pressed={picked} onClick={onPick} className={cn("pl-0.5", !first && "border-dashed")}>
        {/* a block-level flex row: an inline one would sit on the text's baseline and ride up in the pill */}
        <span className="flex items-center gap-1.5">
          {thumb.img && first
            ? <span className="bx-face bx-face-round" style={{ width: 22, height: 22, ...faceCss(thumb.img.url, faceOf(faces, tag, first.pose), thumb.img.w, thumb.img.h, 22) }} />
            : <span className="ml-1 h-2 w-2 rounded-full" style={{ background: c.legible }} />}
          {c.name}
          {onStage && <span className="text-xs opacity-70">on stage</span>}
        </span>
      </Chip>
    </span>
  );
}

// ---------------------------------------------------------------- the portrait and its face box

function Portrait({ file, box, editing, onBox, name }: { file: string | null; box: FaceBox; editing: boolean; onBox: (b: FaceBox) => void; name: string }) {
  const t = useThumb(file);
  const img = t.img;
  return (
    <div className="bx-portrait" style={img ? { aspectRatio: `${img.w} / ${img.h}` } : undefined}>
      {img && <img src={img.url} alt={name} draggable={false} />}
      {!file && <span className="bx-th-note">no file yet</span>}
      {file && t.missing && <span className="bx-th-note">thumbnail missing</span>}
      {img && editing && <BoxEditor box={box} ratio={img.w / img.h} onDone={onBox} />}
    </div>
  );
}

/** The face box over the portrait: drag it to move it, its corner to resize it. Written when let go. */
function BoxEditor({ box, ratio, onDone }: { box: FaceBox; ratio: number; onDone: (b: FaceBox) => void }) {
  const [b, setB] = useState(box);
  useEffect(() => setB(box), [box]);
  const start = useRef<{ x: number; y: number; b: FaceBox; resize: boolean; w: number; h: number } | null>(null);
  const down = (e: PointerEvent, resize: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).closest(".bx-portrait")!.getBoundingClientRect();
    start.current = { x: e.clientX, y: e.clientY, b, resize, w: r.width, h: r.height };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    const s = start.current;
    if (!s) return;
    const dx = (e.clientX - s.x) / s.w, dy = (e.clientY - s.y) / s.h;
    if (s.resize) setB({ ...s.b, w: Math.min(1 - s.b.x, Math.max(0.05, s.b.w + dx)) });
    else setB({ ...s.b, x: Math.min(1 - s.b.w, Math.max(0, s.b.x + dx)), y: Math.min(1 - s.b.w * ratio, Math.max(0, s.b.y + dy)) });
  };
  const up = () => { if (start.current) onDone(b); start.current = null; };
  return (
    <div className="bx-facebox" style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, aspectRatio: "1" }}
      onPointerDown={e => down(e, false)} onPointerMove={move} onPointerUp={up}>
      <span className="bx-facebox-grip" onPointerDown={e => down(e, true)} onPointerMove={move} onPointerUp={up} />
    </div>
  );
}

function FaceBoxBar({ tag, pose, editing, onEditing }: { tag: string; pose: string; editing: boolean; onEditing: (v: boolean) => void }) {
  const faces = useFaces(f => f.faces);
  const own = pose ? !!faces[faceKey(tag, pose)] : false;
  if (!editing) {
    return <Button size="sm" variant="quiet" onClick={() => onEditing(true)}><Crop className="h-3.5 w-3.5" />Adjust face box</Button>;
  }
  return (
    <div className="flex flex-col items-center gap-1.5">
      {pose && (
        <Segmented label="Face box for" value={own ? "pose" : "all"}
          onChange={v => void useFaces.getState().save(faceKey(tag, pose), v === "pose" ? faceOf(faces, tag, pose) : null)}
          options={[{ value: "all", label: "every pose" }, { value: "pose", label: `only ${pose}` }]} />
      )}
      <Button size="sm" variant="quiet" onClick={() => onEditing(false)}>Done with the box</Button>
    </div>
  );
}

// ---------------------------------------------------------------- poses and faces

const PoseTile = memo(function PoseTile({ pose, look, count, picked, tab, onPick }: {
  pose: string; look: Look | undefined; count: number; picked: boolean; tab: number; onPick: () => void;
}) {
  const { ref, thumb } = useLazyThumb(look?.file ?? null);
  return (
    <button ref={ref} type="button" data-tile tabIndex={tab} aria-pressed={picked} onClick={onPick} className={cn("bx-pose", picked && "bx-tile-on")}>
      <span className="bx-pose-img">{thumb.img && <img src={thumb.img.url} alt="" draggable={false} />}</span>
      <span className="text-center font-talk text-xs leading-tight text-bone">{poseLabel(pose)}</span>
      <span className="font-talk text-[10.5px] text-taupe">{count} {count === 1 ? "face" : "faces"}</span>
    </button>
  );
});

const FaceTile = memo(function FaceTile({ look, n, box, picked, tab, onPick, onPeek }: {
  look: Look; n: number | null; box: FaceBox; picked: boolean; tab: number;
  onPick: (expr: string, pose: string) => void; onPeek: (l: Look | null, img: ThumbImage | null) => void;
}) {
  const { ref, thumb } = useLazyThumb(look.file);
  const img = thumb.img;
  return (
    <button ref={ref} type="button" data-tile tabIndex={tab} aria-pressed={picked} title={look.file?.split("/").pop() ?? look.look}
      onClick={() => onPick(look.expr, look.pose)} onPointerEnter={() => onPeek(look, img)} onFocus={() => onPeek(look, img)}
      className={cn("bx-face-tile", picked && "bx-tile-on", !look.file && "border-dashed")}>
      <span className="bx-face" style={img ? { width: 56, height: 56, ...faceCss(img.url, box, img.w, img.h, 56) } : { width: 56, height: 56 }}>
        {look.file && thumb.missing && <span className="bx-th-note">no thumb</span>}
      </span>
      <span className="max-w-full truncate font-talk text-xs text-bone">{look.expr}</span>
      {n && <span className="font-mono text-[10px] text-taupe">{n}</span>}
    </button>
  );
});

// ---------------------------------------------------------------- where

/** The game's positions, each with a small figure where it puts the sprite; "stays" (written as no `at`) keeps it
 *  where it is; "+" for any other transform. */
function Positions({ value, onChange, m, stays }: { value?: string; onChange: (at: string | undefined) => void; m: Manifest | null; stays: string | null }) {
  const names = useMemo(() => m?.positions.filter(p => !p.params).map(p => p.name) ?? ["center", "left", "right", "small"], [m]);
  const options = [
    ...(stays !== null ? [{ value: "", label: <><PosIcon at={null} m={m} />stays ({stays})</> }] : []),
    ...[...names, ...(value && !names.includes(value) ? [value] : [])].map(n => ({ value: n, label: <><PosIcon at={n} m={m} />{n}</> })),
  ];
  return (
    <Segmented label="Where" value={value ?? ""} onChange={v => onChange(v || undefined)} options={options}>
      <NewName label="Another transform" placeholder="sprite(xalign=0.3)" onAdd={onChange} />
    </Segmented>
  );
}

function PosIcon({ at, m }: { at: string | null; m: Manifest | null }) {
  if (at === null) return (
    <svg width="30" height="18" viewBox="0 0 30 18" aria-hidden><rect x=".5" y=".5" width="29" height="17" rx="2.5" fill="none" stroke="currentColor" opacity=".45" />
      <circle cx="15" cy="9" r="4" fill="none" stroke="currentColor" strokeWidth="1.4" /><circle cx="15" cy="9" r="1.3" fill="currentColor" /></svg>
  );
  const { x, scale } = placeOf(at, m?.positions);
  const cx = 2 + x * 26, k = Math.min(1.2, scale);
  return (
    <svg width="30" height="18" viewBox="0 0 30 18" aria-hidden>
      <rect x=".5" y=".5" width="29" height="17" rx="2.5" fill="none" stroke="currentColor" opacity=".45" />
      <circle cx={cx} cy={18 - 12 * k} r={2.6 * k} fill="currentColor" />
      <rect x={cx - 3.4 * k} y={18 - 9 * k} width={6.8 * k} height={9 * k} rx={2 * k} fill="currentColor" />
    </svg>
  );
}
