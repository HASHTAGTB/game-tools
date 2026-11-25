import { redo, undo } from "@codemirror/commands";
import { syntaxTree } from "@codemirror/language";
import { StateEffect, StateField, type EditorState, type Range } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";
import {
  AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BetweenHorizontalEnd, BetweenHorizontalStart,
  BetweenVerticalEnd, BetweenVerticalStart, Code, Trash2,
} from "lucide-react";
import { openTableMenu, type TableMenuItem } from "../components/TableMenu";
import { renderInline } from "./livePreview";
import * as T from "./tableModel";

/** Tables in Live Preview, edited in place: click a cell and type (that cell shows its Markdown, the rest stays
 *  rendered). Hover handles on rows and columns open a menu or drag to reorder; the + bars add a row or column. Every
 *  edit writes the whole table back with its pipes lined up, as one change, so undo works as usual. The corner handle's
 *  "Edit as Markdown" shows the table's text until the cursor leaves it. */

type Caret = "start" | "end";
/** Where the next drawn table puts the cursor, after an edit that adds or moves cells. */
let focusNext: { row: number; col: number; caret: Caret } | null = null;

const SVG = "http://www.w3.org/2000/svg";
function icon(paths: string[], dots?: [number, number][]) {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  for (const d of paths) {
    const p = document.createElementNS(SVG, "path");
    p.setAttribute("d", d);
    svg.append(p);
  }
  for (const [cx, cy] of dots ?? []) {
    const c = document.createElementNS(SVG, "circle");
    c.setAttribute("cx", String(cx)); c.setAttribute("cy", String(cy)); c.setAttribute("r", "1.6");
    svg.append(c);
  }
  return svg;
}
const gripV = () => icon([], [[9, 5], [9, 12], [9, 19], [15, 5], [15, 12], [15, 19]]);
const gripH = () => icon([], [[5, 9], [12, 9], [19, 9], [5, 15], [12, 15], [19, 15]]);
const plus = () => icon(["M12 5v14M5 12h14"]);

function button(cls: string, label: string, child: SVGElement) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = cls;
  b.title = label;
  b.setAttribute("aria-label", label);
  b.append(child);
  return b;
}

const views = new WeakMap<HTMLElement, TableView>();

class TableView {
  readonly dom = document.createElement("div");
  private inner = document.createElement("div");
  private table = document.createElement("table");
  source = "";
  model!: T.Table;
  private active: { row: number; col: number; input: HTMLInputElement } | null = null;
  /** Set while the table redraws or writes, so the input's blur and value aren't taken as the user's. */
  private busy = false;
  private typing = false;

  constructor(readonly view: EditorView, source: string) {
    this.dom.className = "cm-tg";
    this.inner.className = "cm-tg-inner";
    this.table.className = "cm-table";
    const addCol = button("cm-tg-add cm-tg-addcol", "Add a column", plus());
    const addRow = button("cm-tg-add cm-tg-addrow", "Add a row", plus());
    addCol.addEventListener("mousedown", e => e.preventDefault());
    addRow.addEventListener("mousedown", e => e.preventDefault());
    addCol.addEventListener("click", () => this.commit(T.insertCol(this.model, this.cols), { row: -1, col: this.cols, caret: "end" }));
    addRow.addEventListener("click", () => this.commit(T.insertRow(this.model, this.model.rows.length), { row: this.model.rows.length, col: 0, caret: "end" }));
    this.inner.append(this.table, addCol, addRow);
    this.dom.append(this.inner);

    this.table.addEventListener("mousedown", e => this.onMouseDown(e));
    this.table.addEventListener("mouseover", e => this.showColGrip(this.cellOf(e.target)?.col ?? -1));
    this.dom.addEventListener("mouseleave", () => this.showColGrip(-1));
    views.set(this.dom, this);
    this.render(source);
  }

  private get cols() { return this.model.header.length; }

  // ---------------------------------------------------------------- drawing

  render(source: string) {
    this.source = source;
    this.model = T.parseTable(source);
    const keep = this.active;
    const sel = keep && [keep.input.selectionStart, keep.input.selectionEnd] as const;
    const refocus = keep && document.activeElement === keep.input;
    this.busy = true;

    const tr = (...cells: HTMLElement[]) => { const r = document.createElement("tr"); r.append(...cells); return r; };
    const handleCell = (child?: HTMLElement) => {
      const td = document.createElement("td");
      td.className = "cm-tg-h";
      if (child) td.append(child);
      return td;
    };

    // the bar above the header: the table's corner handle, then one handle per column
    const corner = button("cm-tg-grip cm-tg-corner", "Table", gripV());
    this.grip(corner, "table", 0);
    const colBar = tr(handleCell(corner), ...this.model.header.map((_, c) => {
      const g = button("cm-tg-grip cm-tg-colgrip", "Column: click for options, drag to move", gripH());
      g.dataset.col = String(c);
      this.grip(g, "col", c);
      return handleCell(g);
    }));
    colBar.className = "cm-tg-colbar";

    const cell = (tag: "th" | "td", row: number, col: number) => {
      const el = document.createElement(tag);
      el.dataset.row = String(row);
      el.dataset.col = String(col);
      const a = this.model.align[col];
      if (a) el.style.textAlign = a;
      renderInline(el, T.cellText(this.model, row, col));
      return el;
    };
    const head = document.createElement("thead");
    head.append(colBar, tr(handleCell(), ...this.model.header.map((_, c) => cell("th", -1, c))));
    const body = document.createElement("tbody");
    this.model.rows.forEach((r, i) => {
      const g = button("cm-tg-grip cm-tg-rowgrip", "Row: click for options, drag to move", gripV());
      this.grip(g, "row", i);
      body.append(tr(handleCell(g), ...r.map((_, c) => cell("td", i, c))));
    });
    this.table.replaceChildren(head, body);

    // the cell being edited keeps its input (and the caret), with the text from the file unless it was typed here
    this.active = null;
    if (keep && this.cellEl(keep.row, keep.col)) {
      this.mount(keep.row, keep.col, keep.input);
      if (!this.typing) keep.input.value = T.cellText(this.model, keep.row, keep.col);
      if (refocus) { keep.input.focus(); keep.input.setSelectionRange(sel![0], sel![1]); }
    } else if (keep && refocus) {
      this.view.focus();
    }
    this.busy = false;

    if (focusNext) {
      const f = focusNext;
      focusNext = null;
      this.activate(f.row, f.col, f.caret);
    }
  }

  private cellEl(row: number, col: number) {
    return this.table.querySelector<HTMLElement>(`[data-row="${row}"][data-col="${col}"]`);
  }
  private cellOf(target: EventTarget | null) {
    const el = (target as Element | null)?.closest?.<HTMLElement>("th[data-row], td[data-row]");
    return el ? { el, row: Number(el.dataset.row), col: Number(el.dataset.col) } : null;
  }

  private showColGrip(col: number) {
    for (const g of this.table.querySelectorAll<HTMLElement>(".cm-tg-colgrip")) g.classList.toggle("cm-tg-show", Number(g.dataset.col) === col);
  }

  // ---------------------------------------------------------------- writing

  /** The table's place in the document right now (null if it changed under us). */
  private range() {
    const from = this.view.posAtDOM(this.dom);
    const to = from + this.source.length;
    return this.view.state.sliceDoc(from, to) === this.source ? { from, to } : null;
  }

  private commit(next: T.Table, focus?: typeof focusNext, typing = false) {
    const r = this.range();
    if (!r) return;
    const text = T.formatTable(next);
    if (text === this.source) {
      if (focus) this.activate(focus.row, focus.col, focus.caret);
      return;
    }
    // only the part that differs, so the change (and undo) stays small
    const old = this.source;
    let a = 0, b = 0;
    while (a < text.length && a < old.length && text[a] === old[a]) a++;
    while (b < text.length - a && b < old.length - a && text[text.length - 1 - b] === old[old.length - 1 - b]) b++;
    focusNext = focus ?? null;
    this.typing = typing;
    this.view.dispatch({ changes: { from: r.from + a, to: r.to - b, insert: text.slice(a, text.length - b) }, userEvent: typing ? "input.type" : "input" });
    this.typing = false;
    focusNext = null;
  }

  // ---------------------------------------------------------------- editing a cell

  private mount(row: number, col: number, input: HTMLInputElement) {
    const el = this.cellEl(row, col)!;
    el.classList.add("cm-tg-active");
    el.replaceChildren(input);
    this.active = { row, col, input };
  }

  activate(row: number, col: number, caret: Caret) {
    if (!this.cellEl(row, col)) return;
    if (this.active) this.deactivate();
    const input = document.createElement("input");
    input.className = "cm-tg-input";
    input.spellcheck = true;
    input.value = T.cellText(this.model, row, col);
    input.addEventListener("input", e => { if (!(e as InputEvent).isComposing) this.typed(input); });
    input.addEventListener("compositionend", () => this.typed(input));
    input.addEventListener("keydown", e => this.onKey(e, input));
    input.addEventListener("blur", () => { if (!this.busy && this.active?.input === input) this.deactivate(); });
    this.mount(row, col, input);
    input.focus();
    const at = caret === "start" ? 0 : input.value.length;
    input.setSelectionRange(at, at);
  }

  private deactivate() {
    const a = this.active;
    if (!a) return;
    this.active = null;
    const el = this.cellEl(a.row, a.col);
    if (!el) return;
    el.classList.remove("cm-tg-active");
    el.replaceChildren();
    renderInline(el, T.cellText(this.model, a.row, a.col));
  }

  private typed(input: HTMLInputElement) {
    const a = this.active;
    if (a?.input !== input) return;
    this.commit(T.setCell(this.model, a.row, a.col, input.value), undefined, true);
  }

  /** Leave the table, putting the editor's cursor on the line above or below it. */
  private exit(where: "above" | "below") {
    const r = this.range();
    this.deactivate();
    if (!r) return this.view.focus();
    const len = this.view.state.doc.length;
    const at = where === "above" ? Math.max(0, r.from - 1) : Math.min(len, r.to + 1);
    this.view.dispatch({ selection: { anchor: at }, scrollIntoView: true });
    this.view.focus();
  }

  private onKey(e: KeyboardEvent, input: HTMLInputElement) {
    const a = this.active;
    if (!a || e.isComposing) return;
    const { row, col } = a;
    const last = this.model.rows.length - 1;
    const mod = e.ctrlKey || e.metaKey;
    const go = (r: number, c: number, caret: Caret = "end") => { e.preventDefault(); this.activate(r, c, caret); };
    const at = input.selectionStart, empty = input.selectionStart === input.selectionEnd;

    if (mod && !e.altKey && (e.key.toLowerCase() === "z" || e.key.toLowerCase() === "y")) {
      e.preventDefault();
      if (e.key.toLowerCase() === "y" || e.shiftKey) redo(this.view); else undo(this.view);
      return;
    }
    if (mod && (e.key.toLowerCase() === "b" || e.key.toLowerCase() === "i")) {
      e.preventDefault();
      const mark = e.key.toLowerCase() === "b" ? "**" : "*";
      const [s, t] = [input.selectionStart ?? 0, input.selectionEnd ?? 0];
      input.setRangeText(mark + input.value.slice(s, t) + mark, s, t, "select");
      input.setSelectionRange(s + mark.length, t + mark.length);
      this.typed(input);
      return;
    }
    switch (e.key) {
      case "Tab": {
        e.preventDefault();
        const i = (row + 1) * this.cols + col + (e.shiftKey ? -1 : 1);   // cells counted from the header's first
        if (i < 0) return;
        if (i >= (last + 2) * this.cols) return this.commit(T.insertRow(this.model, last + 1), { row: last + 1, col: 0, caret: "end" });
        return go(Math.floor(i / this.cols) - 1, i % this.cols);
      }
      case "Enter":
        if (e.shiftKey || mod) return;
        if (row >= last) { e.preventDefault(); return this.commit(T.insertRow(this.model, last + 1), { row: last + 1, col, caret: "end" }); }
        return go(row + 1, col);
      case "ArrowUp":
        e.preventDefault();
        return row < 0 ? this.exit("above") : go(row - 1, col);
      case "ArrowDown":
        e.preventDefault();
        return row >= last ? this.exit("below") : go(row + 1, col);
      case "ArrowLeft":
        if (empty && at === 0 && col > 0) go(row, col - 1, "end");
        return;
      case "ArrowRight":
        if (empty && at === input.value.length && col < this.cols - 1) go(row, col + 1, "start");
        return;
      case "Escape":
        e.preventDefault();
        return this.exit("below");
    }
  }

  private onMouseDown(e: MouseEvent) {
    const t = e.target as Element;
    if (e.button !== 0 || t.closest("[data-link], .cm-tg-input, .cm-tg-grip")) return;
    const c = this.cellOf(t);
    if (!c) return;
    e.preventDefault();
    this.activate(c.row, c.col, "end");
  }

  // ---------------------------------------------------------------- handles: click for the menu, drag to move

  private grip(el: HTMLElement, kind: "row" | "col" | "table", index: number) {
    el.addEventListener("mousedown", e => e.preventDefault());
    el.addEventListener("pointerdown", e => {
      if (e.button !== 0) return;
      e.preventDefault();
      const x0 = e.clientX, y0 = e.clientY;
      let dragging = false, target = index;
      const mark = (on: boolean) => this.markDrop(kind, index, target, on);
      const move = (ev: PointerEvent) => {
        if (kind === "table") return;
        if (!dragging && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
        dragging = true;
        mark(false);
        target = this.dropIndex(kind, ev);
        mark(true);
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        mark(false);
        if (!dragging) return openTableMenu(el, this.menu(kind, index));
        if (target === index) return;
        this.commit(kind === "row" ? T.moveRow(this.model, index, target) : T.moveCol(this.model, index, target));
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });
  }

  /** The row or column the pointer is over, as the place to move to. */
  private dropIndex(kind: "row" | "col", e: PointerEvent) {
    const els = kind === "row"
      ? [...this.table.tBodies[0].rows]
      : [...this.table.querySelectorAll<HTMLElement>("th[data-col]")];
    let best = 0;
    els.forEach((el, i) => {
      const r = el.getBoundingClientRect();
      if ((kind === "row" ? e.clientY : e.clientX) > (kind === "row" ? r.top : r.left)) best = i;
    });
    return best;
  }

  private markDrop(kind: "row" | "col" | "table", from: number, to: number, on: boolean) {
    if (kind === "row") {
      this.table.tBodies[0].rows[from]?.classList.toggle("cm-tg-dragging", on);
      if (to !== from) this.table.tBodies[0].rows[to]?.classList.toggle(to > from ? "cm-tg-drop-after" : "cm-tg-drop-before", on);
    } else if (kind === "col") {
      for (const el of this.table.querySelectorAll(`[data-row][data-col="${from}"]`)) el.classList.toggle("cm-tg-dragging", on);
      if (to !== from) {
        for (const el of this.table.querySelectorAll(`[data-row][data-col="${to}"]`)) el.classList.toggle(to > from ? "cm-tg-drop-right" : "cm-tg-drop-left", on);
      }
    }
  }

  private menu(kind: "row" | "col" | "table", i: number): TableMenuItem[] {
    const m = this.model;
    const edit = (next: T.Table, focus?: typeof focusNext) => () => this.commit(next, focus);
    if (kind === "row") return [
      { icon: BetweenHorizontalStart, label: "Insert row above", run: edit(T.insertRow(m, i), { row: i, col: 0, caret: "end" }) },
      { icon: BetweenHorizontalEnd, label: "Insert row below", run: edit(T.insertRow(m, i + 1), { row: i + 1, col: 0, caret: "end" }) },
      { icon: ArrowUp, label: "Move up", disabled: i === 0, run: edit(T.moveRow(m, i, i - 1)) },
      { icon: ArrowDown, label: "Move down", disabled: i === m.rows.length - 1, run: edit(T.moveRow(m, i, i + 1)) },
      "-",
      { icon: Trash2, label: "Delete row", danger: true, run: edit(T.deleteRow(m, i)) },
    ];
    if (kind === "col") return [
      { icon: BetweenVerticalStart, label: "Insert column left", run: edit(T.insertCol(m, i), { row: -1, col: i, caret: "end" }) },
      { icon: BetweenVerticalEnd, label: "Insert column right", run: edit(T.insertCol(m, i + 1), { row: -1, col: i + 1, caret: "end" }) },
      { icon: ArrowLeft, label: "Move left", disabled: i === 0, run: edit(T.moveCol(m, i, i - 1)) },
      { icon: ArrowRight, label: "Move right", disabled: i === this.cols - 1, run: edit(T.moveCol(m, i, i + 1)) },
      "-",
      { icon: AlignLeft, label: "Align left", checked: m.align[i] === "left", run: edit(T.alignCol(m, i, m.align[i] === "left" ? null : "left")) },
      { icon: AlignCenter, label: "Align center", checked: m.align[i] === "center", run: edit(T.alignCol(m, i, m.align[i] === "center" ? null : "center")) },
      { icon: AlignRight, label: "Align right", checked: m.align[i] === "right", run: edit(T.alignCol(m, i, m.align[i] === "right" ? null : "right")) },
      "-",
      { icon: Trash2, label: "Delete column", danger: true, disabled: this.cols <= 1, run: edit(T.deleteCol(m, i)) },
    ];
    return [
      { icon: Code, label: "Edit as Markdown", run: () => this.editRaw() },
      "-",
      { icon: Trash2, label: "Delete table", danger: true, run: () => this.removeTable() },
    ];
  }

  private editRaw() {
    const r = this.range();
    if (!r) return;
    this.view.dispatch({ effects: showRaw.of(r.from), selection: { anchor: r.to }, scrollIntoView: true });
    this.view.focus();
  }

  private removeTable() {
    const r = this.range();
    if (!r) return;
    const { doc } = this.view.state;
    const to = r.to < doc.length ? r.to + 1 : r.to;
    const from = to === r.to && r.from > 0 ? r.from - 1 : r.from;
    this.view.dispatch({ changes: { from, to }, selection: { anchor: from }, userEvent: "delete" });
    this.view.focus();
  }
}

class TableWidget extends WidgetType {
  constructor(readonly source: string) { super(); }
  eq(o: TableWidget) { return o.source === this.source; }
  toDOM(view: EditorView) { return new TableView(view, this.source).dom; }
  /** The table changed (an edit here, undo, a reload): redraw into the same element, so a cell being typed in keeps
   *  its input and caret. */
  updateDOM(dom: HTMLElement) {
    const v = views.get(dom);
    if (!v) return false;
    v.render(this.source);
    return true;
  }
  /** Links are left to the editor's link handler; everything else in the table is handled by the table. */
  ignoreEvent(e: Event) { return !(e.target as Element).closest?.("[data-link]"); }
}

// ---------------------------------------------------------------- finding the tables

/** Show the table starting here as Markdown, until the cursor leaves it. */
const showRaw = StateEffect.define<number>();

/** Nodes that can't hold a table, so the walk can skip them. */
const LEAF = new Set(["Paragraph", "FencedCode", "CodeBlock", "Frontmatter", "HTMLBlock", "LinkReference",
  "ATXHeading1", "ATXHeading2", "ATXHeading3", "ATXHeading4", "ATXHeading5", "ATXHeading6", "SetextHeading1", "SetextHeading2"]);

type Tables = { deco: DecorationSet; raw: number | null };

function tables(state: EditorState, raw: number | null): Tables {
  const out: Range<Decoration>[] = [];
  const sel = state.selection.ranges;
  let keepRaw: number | null = null;
  syntaxTree(state).iterate({
    enter: n => {
      if (LEAF.has(n.name)) return false;
      if (n.name !== "Table") return;
      // whole lines, so the widget can stand in for them as a block
      const from = state.doc.lineAt(n.from).from, to = state.doc.lineAt(n.to).to;
      if (raw !== null && raw >= from && raw <= to && sel.some(r => r.from <= to && r.to >= from)) {
        keepRaw = from;
        return false;
      }
      const source = state.doc.sliceString(from, to);
      if (source.split("\n").length >= 2) out.push(Decoration.replace({ widget: new TableWidget(source), block: true }).range(from, to));
      return false;
    },
  });
  return { deco: Decoration.set(out), raw: keepRaw };
}

/** Tables, drawn and edited as tables (Live Preview only). A state field, because only those may replace whole lines. */
export const liveTables = StateField.define<Tables>({
  create: state => tables(state, null),
  update: (v, tr) => {
    let raw = v.raw === null ? null : tr.changes.mapPos(v.raw);
    for (const e of tr.effects) if (e.is(showRaw)) raw = e.value;
    const changed = tr.docChanged || tr.selection || raw !== v.raw || syntaxTree(tr.startState) !== syntaxTree(tr.state);
    return changed ? tables(tr.state, raw) : v;
  },
  provide: f => EditorView.decorations.from(f, v => v.deco),
});
