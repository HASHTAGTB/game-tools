/** Every tool in the app. Each one gets a route in router.tsx and is only loaded when opened. */
export type ToolInfo = {
  path: `/${string}`;
  name: string;
  description: string;
  /** Needs the local server (`pnpm dev`). On GitHub Pages it shows a notice instead of the tool. */
  needsServer?: boolean;
};

export const TOOLS = {
  promptBuilder: {
    path: "/prompt-builder",
    name: "Prompt Builder",
    description: "Build Danbooru-tag character prompts from presets and toggles.",
  },
  timeline: {
    path: "/timeline",
    name: "Timeline",
    description: "The story's chronology: chapters, storylines and who does what when.",
  },
  notes: {
    path: "/notes",
    name: "Notes",
    description: "The vault's Markdown notes, with a folder tree like Obsidian's.",
  },
} satisfies Record<string, ToolInfo>;

export const DEFAULT_TOOL = TOOLS.promptBuilder;
