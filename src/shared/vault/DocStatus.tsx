import { SaveState } from "@/shared/ui/status";
import { useVault } from "./context";

const countWords = (s: string) => (s.match(/\S+/g) ?? []).length;

/** The open file's word count (`words`) and whether it's saved, for the path bar. The one part of the page that
 *  follows the text as it's typed, so the rest doesn't draw again on every keystroke. */
export function DocStatus({ words = false }: { words?: boolean }) {
  const useStore = useVault();
  const count = useStore(s => (words ? countWords(s.text) : 0));
  const unsaved = useStore(s => !!s.saved && s.text !== s.saved.text);
  const saving = useStore(s => s.saving);
  const github = useStore(s => s.loc?.kind === "github");
  return (
    <span className="shrink-0 font-talk text-xs text-taupe">
      {words && <>{count} words · </>}
      <SaveState saving={saving} unsaved={unsaved} github={github} />
    </span>
  );
}
