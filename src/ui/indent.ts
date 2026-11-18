/** A text replacement plus the selection to leave behind, so the textarea can apply it in one step. */
export interface TabEdit {
  from: number;
  to: number;
  text: string;
  selStart: number;
  selEnd: number;
}

/**
 * What Tab (or Shift+Tab) does in the editor: on a caret or a one-line selection, Tab types a tab character;
 * on several lines it indents each of them; Shift+Tab always takes one level off the lines it touches.
 */
export function tabEdit(value: string, start: number, end: number, shift: boolean): TabEdit {
  const multiline = value.slice(start, end).includes("\n");
  if (!shift && !multiline) return { from: start, to: end, text: "\t", selStart: start + 1, selEnd: start + 1 };

  // a selection that stops right after a line break does not include the line that follows
  const last = end > start && value[end - 1] === "\n" ? end - 1 : end;
  const from = value.lastIndexOf("\n", start - 1) + 1;
  const nl = value.indexOf("\n", last);
  const to = nl === -1 ? value.length : nl;

  const deltas: number[] = [];
  const lines = value
    .slice(from, to)
    .split("\n")
    .map((line) => {
      if (!shift) {
        deltas.push(1);
        return `\t${line}`;
      }
      const lead = line.startsWith("\t") ? 1 : (/^ {1,8}/.exec(line)?.[0].length ?? 0);
      deltas.push(-lead);
      return line.slice(lead);
    });

  const total = deltas.reduce((a, b) => a + b, 0);
  const selStart = start === from ? start : Math.max(from, start + deltas[0]);
  return { from, to, text: lines.join("\n"), selStart, selEnd: Math.max(selStart, end + total) };
}
