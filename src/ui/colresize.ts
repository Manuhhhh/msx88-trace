/**
 * Draggable column widths for the trace tables. The grip is the right edge of a header cell: dragging it
 * sets that column's width, a double click clears it. A sized column keeps its text on one line and cuts
 * it with an ellipsis (the full text is the cell's tooltip). Widths are kept per table (ledger) and column
 * position, so they survive the tables being rebuilt on every step.
 */

/** Width of the grip, in CSS pixels, measured inwards from the right edge of a header cell. */
export const GRIP = 6;
export const MIN_WIDTH = 32;

/** True when a pointer at `x` is on the grip of a cell spanning `left`..`right`. */
export function onGrip(x: number, left: number, right: number): boolean {
  return x <= right && x >= right - GRIP && x >= left;
}

/** The width a column takes after dragging `delta` pixels from `start`. */
export function dragWidth(start: number, delta: number): number {
  return Math.max(MIN_WIDTH, Math.round(start + delta));
}

type Widths = Map<number, number>;

/** Applies the stored widths to a table: every cell of a sized column is fixed to it and cut with an ellipsis. */
export function applyWidths(table: HTMLTableElement, widths: Widths): void {
  for (const row of Array.from(table.rows)) {
    for (const cell of Array.from(row.cells)) {
      if (cell.colSpan !== 1) continue;
      const w = widths.get(cell.cellIndex);
      if (w === undefined) {
        if (cell.classList.contains("is-sized")) {
          cell.classList.remove("is-sized");
          cell.style.removeProperty("width");
          cell.style.removeProperty("min-width");
          cell.style.removeProperty("max-width");
          cell.removeAttribute("title");
        }
        continue;
      }
      cell.classList.add("is-sized");
      cell.style.width = cell.style.minWidth = cell.style.maxWidth = `${w}px`;
      const text = cell.textContent ?? "";
      if (cell.title !== text) cell.title = text;
    }
  }
}

/** Wires column resizing on every table inside `root`, keeping widths per `.ledger[data-ledger]`. */
export function enableColumnResize(root: HTMLElement): void {
  const store = new Map<string, Widths>();
  const keyOf = (el: Element): string => el.closest<HTMLElement>("[data-ledger]")?.dataset.ledger ?? "";
  const widthsOf = (key: string): Widths => {
    let w = store.get(key);
    if (!w) store.set(key, (w = new Map()));
    return w;
  };
  const reapply = (): void => {
    for (const table of root.querySelectorAll<HTMLTableElement>("table.log")) {
      const w = store.get(keyOf(table));
      if (w && w.size > 0) applyWidths(table, w);
    }
  };

  // The tables are rebuilt on every step: put the widths back once per burst of changes.
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      reapply();
    });
  }).observe(root, { childList: true, subtree: true });

  const headCell = (e: Event): HTMLTableCellElement | null =>
    (e.target as Element | null)?.closest<HTMLTableCellElement>("table.log thead th") ?? null;

  root.addEventListener("pointermove", (e) => {
    const th = headCell(e);
    if (!th || e.buttons !== 0) return;
    const r = th.getBoundingClientRect();
    th.classList.toggle("is-grip", onGrip(e.clientX, r.left, r.right));
  });

  root.addEventListener("pointerdown", (e) => {
    const th = headCell(e);
    if (!th || th.colSpan !== 1 || e.button !== 0) return;
    const r = th.getBoundingClientRect();
    if (!onGrip(e.clientX, r.left, r.right)) return;
    e.preventDefault();
    const table = th.closest<HTMLTableElement>("table.log")!;
    const w = widthsOf(keyOf(table));
    const col = th.cellIndex;
    const startX = e.clientX;
    const startW = r.width;
    // The tables are rebuilt while a drag is under way, so listen on the document and re-apply on whatever table is current.
    const move = (m: PointerEvent): void => {
      w.set(col, dragWidth(startW, m.clientX - startX));
      reapply();
    };
    const up = (): void => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
  });

  root.addEventListener("dblclick", (e) => {
    const th = headCell(e);
    if (!th) return;
    const r = th.getBoundingClientRect();
    if (!onGrip((e as MouseEvent).clientX, r.left, r.right)) return;
    const table = th.closest<HTMLTableElement>("table.log")!;
    const w = widthsOf(keyOf(table));
    w.delete(th.cellIndex);
    applyWidths(table, w);
  });
}
