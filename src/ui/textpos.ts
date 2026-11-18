export interface TextMetrics {
  /** Viewport position of the start of the text at `offset`, and the height of a line. */
  wordPosition(offset: number): { x: number; y: number; lh: number };
  /** Source offset of the character under a viewport point, or -1 outside the text. */
  offsetAtPoint(x: number, y: number): number;
}

/** Maps between source offsets and screen positions in the (monospace, tab size 8) editor textarea. */
export function createTextMetrics(source: HTMLTextAreaElement): TextMetrics {
  let charWidth = 0;

  function measureChar(cs: CSSStyleDeclaration): number {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return parseFloat(cs.fontSize) * 0.6;
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    return ctx.measureText("0").width;
  }

  function wordPosition(offset: number): { x: number; y: number; lh: number } {
    const cs = getComputedStyle(source);
    const fontSize = parseFloat(cs.fontSize);
    const lh = parseFloat(cs.lineHeight) || fontSize * 1.6;
    charWidth ||= measureChar(cs);
    const before = source.value.slice(0, offset);
    const line = before.split("\n").length - 1;
    let col = 0;
    for (const c of before.slice(before.lastIndexOf("\n") + 1)) col = c === "\t" ? (Math.floor(col / 8) + 1) * 8 : col + 1;
    const rect = source.getBoundingClientRect();
    return {
      x: rect.left + parseFloat(cs.paddingLeft) + col * charWidth - source.scrollLeft,
      y: rect.top + parseFloat(cs.paddingTop) + (line + 1) * lh - source.scrollTop,
      lh,
    };
  }

  function offsetAtPoint(x: number, y: number): number {
    const cs = getComputedStyle(source);
    const lh = parseFloat(cs.lineHeight) || 1.6 * parseFloat(cs.fontSize);
    charWidth ||= measureChar(cs);
    const rect = source.getBoundingClientRect();
    const line = Math.floor((y - rect.top - parseFloat(cs.paddingTop) + source.scrollTop) / lh);
    const col = Math.floor((x - rect.left - parseFloat(cs.paddingLeft) + source.scrollLeft) / charWidth);
    const lines = source.value.split("\n");
    if (line < 0 || line >= lines.length || col < 0) return -1;
    let at = lines.slice(0, line).reduce((n, l) => n + l.length + 1, 0);
    let visual = 0;
    for (const c of lines[line]) {
      const next = c === "\t" ? (Math.floor(visual / 8) + 1) * 8 : visual + 1;
      if (col < next) return at;
      visual = next;
      at++;
    }
    return -1;
  }

  return { wordPosition, offsetAtPoint };
}
