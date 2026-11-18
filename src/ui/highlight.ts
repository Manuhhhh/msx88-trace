import { ARITY } from "../core/isa";
import { REGS, RESERVED } from "../core/parser";

export type TokenKind = "ins" | "dir" | "reg" | "num" | "str" | "com" | "lab";

export interface Token {
  text: string;
  /** Absent for text that stays plain: symbols, punctuation, whitespace. */
  kind?: TokenKind;
  /** Set on the text the linter points at: an error (syntax) or a warning. */
  mark?: "error" | "warning";
}

const TOKEN = /(;[^\n]*)|('[^'\n]*'?|"[^"\n]*"?)|([A-Za-z_@?$][\w@?$]*)(:)?|(\d[0-9A-Fa-f]*[HhBbDd]?(?!\w))/g;

/**
 * Splits assembly source into colourable tokens. The tokens always join back into the exact
 * source, so a layer drawn from them lines up character for character with the textarea.
 */
export function tokenize(source: string): Token[] {
  const out: Token[] = [];
  let last = 0;
  const plain = (to: number): void => {
    if (to > last) out.push({ text: source.slice(last, to) });
  };
  for (const m of source.matchAll(TOKEN)) {
    plain(m.index);
    last = m.index + m[0].length;
    if (m[1] !== undefined) out.push({ text: m[1], kind: "com" });
    else if (m[2] !== undefined) out.push({ text: m[2], kind: "str" });
    else if (m[3] !== undefined) {
      const word = m[3].toUpperCase();
      if (m[4]) out.push({ text: m[0], kind: "lab" });
      else if (ARITY.has(word)) out.push({ text: m[3], kind: "ins" });
      else if (RESERVED.has(word)) out.push({ text: m[3], kind: "dir" });
      else if (REGS.has(word)) out.push({ text: m[3], kind: "reg" });
      else out.push({ text: m[3] });
    } else out.push({ text: m[5], kind: "num" });
  }
  plain(source.length);
  return out;
}

/** Flags the text in [from, to) as an error or a warning, splitting tokens at the edges so the text still joins back unchanged. */
export function markRange(tokens: Token[], from: number, to: number, mark: "error" | "warning" = "error"): Token[] {
  if (to <= from) return tokens;
  const out: Token[] = [];
  let at = 0;
  for (const tok of tokens) {
    const start = at;
    at += tok.text.length;
    if (at <= from || start >= to) {
      out.push(tok);
      continue;
    }
    const a = Math.max(from, start) - start;
    const b = Math.min(to, at) - start;
    const piece = (text: string, flag?: "error" | "warning"): void => {
      if (text) out.push(flag ? { ...tok, text, mark: flag } : { ...tok, text });
    };
    piece(tok.text.slice(0, a));
    piece(tok.text.slice(a, b), mark);
    piece(tok.text.slice(b));
  }
  return out;
}
