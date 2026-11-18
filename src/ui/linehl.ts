export interface LineHighlight {
  /** Lights source line `line` (1-based) and scrolls it into view; 0 fades the band out where it is. */
  show(line: number): void;
  /** Keeps the band aligned with the textarea after it scrolls. */
  sync(): void;
}

/**
 * The band is positioned in the text's own coordinates and shifted by the scroll, so scrolling never
 * fights the glide: only `top` is animated (see .line-hl), and it slides from line to line.
 */
export function createLineHighlight(source: HTMLTextAreaElement, band: HTMLElement): LineHighlight {
  const sync = (): void => {
    band.style.transform = `translateY(${-source.scrollTop}px)`;
  };
  function place(line: number): void {
    const cs = getComputedStyle(source);
    const lh = parseFloat(cs.lineHeight) || 1.6 * parseFloat(cs.fontSize);
    const top = parseFloat(cs.paddingTop) + (line - 1) * lh;
    if (top < source.scrollTop || top + lh > source.scrollTop + source.clientHeight) {
      source.scrollTop = Math.max(0, top - source.clientHeight / 2);
    }
    // the very first placement appears in place; every later one glides from where the band was
    const first = band.style.top === "";
    if (first) band.style.transition = "none";
    band.style.top = `${top}px`;
    band.style.height = `${lh}px`;
    sync();
    if (first) {
      void band.offsetHeight;
      band.style.transition = "";
    }
    band.classList.remove("is-off");
  }
  return {
    show(line) {
      if (line > 0) place(line);
      // fade out where it is, so the next line it lights glides in from here
      else band.classList.add("is-off");
    },
    sync,
  };
}
