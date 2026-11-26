import { useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import type { VaultStore } from "./store";

/** Keeps the address in step with the open file (/notes/CANON/01_Characters/Rin, /scenes/Prolog/04.04.2025 Fr: the
 *  path inside the tool's root, without .md), both ways: opening a file adds a history entry, back/forward and typed
 *  addresses open the file. Renames, deletes and the like replace the entry. Also starts the store. */
export function useVaultUrl(store: VaultStore, base: "/notes" | "/scenes") {
  const { root } = store.config;
  const toUrl = (path: string | null) => (path ? (root ? path.slice(root.length + 1) : path).replace(/\.md$/i, "") : "");
  const fromUrl = (splat: string) => (splat ? [root, splat + ".md"].filter(Boolean).join("/") : null);

  const splat = (useParams({ strict: false }) as { _splat?: string })._splat ?? "";
  const navigate = useNavigate();
  const ready = store(s => s.ready);
  const path = store(s => s.path);
  const opened = store(s => s.opened);
  const seen = useRef(opened);
  const first = useRef(splat);

  // the routes are typed per tool; both have the same shape
  const go = (p: string | null, replace: boolean) =>
    p ? navigate({ to: `${base}/$` as "/notes/$", params: { _splat: toUrl(p) }, replace }) : navigate({ to: base, replace });

  useEffect(() => store.getState().init(fromUrl(first.current)), []);   // eslint-disable-line react-hooks/exhaustive-deps

  // file → address
  useEffect(() => {
    const push = opened !== seen.current;
    seen.current = opened;
    if (!ready || toUrl(path) === splat) return;
    go(path, !push);
  }, [path, opened, ready]);   // eslint-disable-line react-hooks/exhaustive-deps

  // address → file
  useEffect(() => {
    if (!ready) return;
    const s = store.getState();
    if (toUrl(s.path) === splat) return;
    const want = fromUrl(splat);
    if (!want) return void go(s.path, true);
    s.open(want).then(() => {
      const now = store.getState().path;
      if (toUrl(now) !== splat) go(now, true);   // it didn't open (gone?): show what's open instead
    });
  }, [splat, ready]);   // eslint-disable-line react-hooks/exhaustive-deps
}
