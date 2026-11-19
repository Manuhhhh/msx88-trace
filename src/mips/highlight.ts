import type { Token } from "../ui/highlight";
import { FORMAT_OF, regNumber } from "./assembler";

const TOKEN = /([#;][^\n]*)|("(?:[^"\\\n]|\\.)*"?|'[^'\n]*'?)|([.$A-Za-z_][\w.$]*)(:)?|(0[xX][0-9a-fA-F]+|\d+)/g;

/**
 * Splits MIPS64 source into colourable tokens. They always join back into the exact source,
 * so the layer drawn from them lines up character for character with the textarea.
 */
export function tokenizeMips(source: string): Token[] {
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
      if (m[4]) out.push({ text: m[0], kind: "lab" });
      else if (m[3].startsWith(".")) out.push({ text: m[3], kind: "dir" });
      else if (FORMAT_OF.has(m[3].toLowerCase())) out.push({ text: m[3], kind: "ins" });
      else if (regNumber(m[3]) !== undefined) out.push({ text: m[3], kind: "reg" });
      else out.push({ text: m[3] });
    } else out.push({ text: m[5], kind: "num" });
  }
  plain(source.length);
  return out;
}
