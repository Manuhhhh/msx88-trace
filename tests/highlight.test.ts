import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../src/ui/examples";
import { markRange, tokenize } from "../src/ui/highlight";

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

describe("markRange", () => {
  it("flags only the given text and still joins back into the source", () => {
    const src = "        MOV AX, 1 ; note";
    const out = markRange(tokenize(src), 12, 14);
    expect(out.map((t) => t.text).join("")).toBe(src);
    expect(out.filter((t) => t.mark).map((t) => t.text)).toEqual(["AX"]);
  });

  it("splits a token at the edges and keeps its colour", () => {
    const out = markRange(tokenize("MOV AX"), 1, 5);
    expect(out.filter((t) => t.mark).map((t) => t.text).join("")).toBe("OV A");
    expect(out.filter((t) => t.mark).map((t) => t.kind)).toEqual(["ins", undefined, "reg"]);
  });

  it("returns the tokens untouched for an empty range", () => {
    const tokens = tokenize("MOV AX");
    expect(markRange(tokens, 3, 3)).toBe(tokens);
  });
});
