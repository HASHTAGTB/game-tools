/** One-time import of the vault's old timeline (02_Scenes/<Arc>/timeline.md + 03_Timeline/config.md) into the Timeline
 *  tool's files (.game-tools/timeline/arcs/<id>.json and .game-tools/characters.json).
 *
 *    node scripts/import-timeline.ts <vault> [--out <folder>] [--force]
 *
 *  --out writes into another folder instead of the vault (to look at the result first). It refuses to overwrite
 *  existing arc files unless --force is given. The roster only gets characters it doesn't have yet. Nothing in the
 *  vault's own folders is changed. */
import fs from "node:fs/promises";
import path from "node:path";
import { formatSpan } from "../src/tools/timeline/lib/duration.ts";
import { importTimeline, parseConfigCharacters, SCENES_DIR, type Pin } from "../src/tools/timeline/lib/import-md.ts";
import { resolve } from "../src/tools/timeline/lib/resolve.ts";
import type { Roster } from "../src/shared/lib/roster.ts";

/** Arcs whose name/id already says when they happen. These replace their old `prev:` link with a fixed date. */
const PINS: Record<string, Pin> = {
  "Frühe Kindheit": { start: "2012", end: "2020" },          // frühe_kindheit_grundschule_2012_2020
  "Mittelschule": { start: "2020", end: "2023" },            // mittelschule_2020_2023
  "1. Oberschuljahr": { start: "2023", end: "2025" },        // 1_oberschuljahr_sakura_gakuen_2023_2025
  "Prolog": { start: "2025-04-04", end: "2025-04-06" },      // prolog_frühlingsferien_4_6_april_2025
  "Woche 1": { start: "2025-04-07", end: "2025-04-11" },     // woche_1_erster_schultag_7_11_april_2025
  "Woche 2": { start: "2025-04-14", end: "2025-04-18" },     // woche_2_klub_beitritte_14_18_april_2025
  "Info-Kunst Kollaboration": { start: "2025-04-21", end: "2025-05-02" },
  "Klassenfahrt": { start: "2025-05-19", end: "2025-05-25" },
  "Entwicklungsphase": { end: "2025-09" },                   // entwicklungsphase_mai_september_2025 (starts after Klassenfahrt)
  "Kaishis Zerfall 1": { start: "2025-10" },                 // kaishis_zerfall_phase_1_erkenntnis_okt_w
  "2027": { start: "2027" },
};

/** Old links that point at an id no arc has, and what they were meant to be. */
const FIXES: Record<string, string> = {
  kaishis_zerfall_2: "kaishis_zerfall_phase_2_der_selbstlose_v",   // Parallele Krisen → Kaishis Zerfall 2
};

const args = process.argv.slice(2);
const vault = args[0];
if (!vault || vault.startsWith("--")) {
  console.error("usage: node scripts/import-timeline.ts <vault> [--out <folder>] [--force]");
  process.exit(1);
}
const outIdx = args.indexOf("--out");
const out = outIdx >= 0 ? args[outIdx + 1] : vault;
const force = args.includes("--force");

const exists = (p: string) => fs.access(p).then(() => true, () => false);

const scenes = path.join(vault, SCENES_DIR);
const files = [];
for (const d of (await fs.readdir(scenes, { withFileTypes: true })).filter(d => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
  const f = path.join(scenes, d.name, "timeline.md");
  if (await exists(f)) files.push({ folder: d.name, text: await fs.readFile(f, "utf8") });
}
const config = path.join(vault, "CANON/03_Story/03_Timeline/config.md");
const cast = (await exists(config)) ? parseConfigCharacters(await fs.readFile(config, "utf8")) : [];

const res = importTimeline(files, cast, PINS, FIXES);
for (const name of Object.keys(PINS)) if (!files.some(f => f.folder === name)) res.report.push(`Pin for "${name}" matches no arc folder.`);

// write
const tools = path.join(out, ".game-tools");
const arcsDir = path.join(tools, "timeline", "arcs");
if (!force && (await fs.readdir(arcsDir).catch(() => [])).length) {
  console.error(`${arcsDir} already has files. Pass --force to overwrite them.`);
  process.exit(1);
}
await fs.mkdir(arcsDir, { recursive: true });
for (const a of res.arcs) await fs.writeFile(path.join(arcsDir, `${a.id}.json`), JSON.stringify(a, null, 2) + "\n");

const rosterFile = path.join(tools, "characters.json");
const roster: Roster = (await exists(rosterFile)) ? JSON.parse(await fs.readFile(rosterFile, "utf8")) : { version: 1, characters: [] };
const have = new Set(roster.characters.map(c => c.id));
for (const c of res.roster) if (!have.has(c.id)) roster.characters.push(c);
await fs.writeFile(rosterFile, JSON.stringify(roster, null, 2) + "\n");

// report
const r = resolve(res.arcs);
const events = res.arcs.reduce((n, a) => n + a.events.length, 0);
const links = res.arcs.reduce((n, a) => n + a.connections.length, 0);
console.log(`Imported ${files.length} arcs, ${events} events, ${links} connections, ${roster.characters.length} characters → ${tools}\n`);
console.log("Arcs in story order:");
for (const a of [...res.arcs].sort((x, y) => r.arcs.get(x.id)!.start - r.arcs.get(y.id)!.start)) {
  const s = r.arcs.get(a.id)!;
  const how = "at" in a.start ? "fixed" : "after" in a.start ? `after ${"arc" in a.start.after ? a.start.after.arc : a.start.after.event}` : `parallel to ${"arc" in a.start.from ? a.start.from.arc : a.start.from.event}`;
  console.log(`  ${formatSpan(s.start, s.end, s.precision).padEnd(34)} ${a.name.padEnd(26)} ${a.events.length.toString().padStart(3)} events  (${how})`);
}
if (res.report.length) console.log("\nImport notes:\n" + res.report.map(l => "  - " + l).join("\n"));
if (r.issues.length) console.log("\nTimeline issues:\n" + r.issues.map(i => `  - [${i.kind}] ${i.message}`).join("\n"));
