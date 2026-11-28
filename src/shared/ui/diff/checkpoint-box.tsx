import { Flag } from "lucide-react";
import { useEffect, useState } from "react";
import { ago, useCheckpoint } from "@/shared/lib/checkpoint";
import { errorMessage } from "@/shared/lib/utils";
import { Confirm } from "../confirm";
import { IconButton } from "../icon-button";
import type { ToolData } from "../tool-page";
import { reviewCheckpoint } from "./sessions";

/** Sidebar footer, while the data isn't on GitHub: the checkpoint (this browser's snapshot of every text file) and
 *  "See changes" since then. On GitHub the Save button's list does this, against the last save. */
export function CheckpointBox({ data }: { data: Pick<ToolData, "loc" | "flush" | "reload"> }) {
  const { at, load, set } = useCheckpoint();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [, tick] = useState(0);
  useEffect(() => { void load(); }, [data.loc, load]);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 60_000); return () => clearInterval(t); }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr("");
    try { await fn(); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };
  const setNow = () => run(async () => { await data.flush(); await set(); });
  const flag = <IconButton icon={Flag} disabled={busy} tooltipSide="top" label={at ? "Move the checkpoint to now" : "Set a checkpoint now"}
    onClick={at ? undefined : setNow} />;

  return (
    <div className="px-4 pt-3">
      <div className="flex items-center gap-1">
        <button disabled={!at || busy} onClick={() => run(() => reviewCheckpoint(data))}
          className="group min-w-0 flex-1 rounded-md p-2 text-left disabled:cursor-default">
          <span className="block font-sans text-base text-bone underline-offset-4 decoration-2 group-enabled:group-hover:text-paper group-enabled:group-hover:underline">
            {busy ? "Reading files…" : at ? "See changes" : "No checkpoint yet"}
          </span>
          <span className="mt-0.5 block font-talk text-xs text-taupe">
            {at ? `since the checkpoint, ${ago(at)}` : "Set one with the flag to see later what changed"}
          </span>
        </button>
        {at ? (
          <Confirm message="Move the checkpoint to now? “See changes” then starts from here; what changed before can't be compared any more."
            label="Move it" onConfirm={setNow}>{flag}</Confirm>
        ) : flag}
      </div>
      {err && <p className="mt-1 text-sm text-coral">{err}</p>}
    </div>
  );
}
