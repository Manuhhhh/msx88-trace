/** Scrolls a ledger just enough to bring the current step's row or cell into view, clear of the sticky headers. */
export function revealCurrent(body: HTMLElement): void {
  const cur = body.querySelectorAll<HTMLElement>(".is-current");
  if (cur.length === 0) return;
  const box = body.getBoundingClientRect();
  const headH = body.querySelector("thead")?.getBoundingClientRect().height ?? 0;
  const sideW = body.querySelector<HTMLElement>("tbody th")?.getBoundingClientRect().width ?? 0;
  for (const el of [cur[0], cur[cur.length - 1]]) {
    const r = el.getBoundingClientRect();
    if (r.top < box.top + headH) body.scrollTop += r.top - box.top - headH;
    else if (r.bottom > box.bottom) body.scrollTop += r.bottom - box.bottom;
    if (r.left < box.left + sideW) body.scrollLeft += r.left - box.left - sideW;
    else if (r.right > box.right) body.scrollLeft += r.right - box.right;
  }
}
