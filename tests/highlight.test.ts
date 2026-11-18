import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../src/ui/examples";
import { tokenize } from "../src/ui/highlight";

const kinds = (src: string) => tokenize(src).filter((t) => t.kind).map((t) => [t.text, t.kind]);

describe("source highlighting", () => {
  it("tells instructions, registers, numbers and directives apart", () => {
    expect(kinds("        MOV AX, 0FEH")).toEqual([
      ["MOV", "ins"],
      ["AX", "reg"],
      ["0FEH", "num"],
    ]);
    expect(kinds("ORG 2000H")).toEqual([
      ["ORG", "dir"],
      ["2000H", "num"],
    ]);
  });

  it("marks labels, comments and strings, and leaves symbols plain", () => {
    expect(kinds("LAZO:   CMP CONT, 3 ; loop")).toEqual([
      ["LAZO:", "lab"],
      ["CMP", "ins"],
      ["3", "num"],
      ["; loop", "com"],
    ]);
    expect(kinds("MSG DB 'Hi; there'")).toEqual([
      ["DB", "dir"],
      ["'Hi; there'", "str"],
    ]);
  });

  it("is case-insensitive and keeps digits inside names out of the numbers", () => {
    expect(kinds("mov al, 10")).toEqual([
      ["mov", "ins"],
      ["al", "reg"],
      ["10", "num"],
    ]);
    expect(kinds("INT0 EQU 24H")).toEqual([
      ["EQU", "dir"],
      ["24H", "num"],
    ]);
  });

  it("joins back into the exact source for every example, so layers stay aligned", () => {
    for (const ex of EXAMPLES) {
      expect(tokenize(ex.state.source).map((t) => t.text).join("")).toBe(ex.state.source);
    }
  });
});
