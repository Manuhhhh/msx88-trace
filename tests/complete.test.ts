import { describe, expect, it } from "vitest";
import { complete } from "../src/ui/complete";

/** Runs the completion with the caret at `|`. */
function at(marked: string, manual = false) {
  const caret = marked.indexOf("|");
  const source = marked.replace("|", "");
  return { source, c: complete(source, caret, manual) };
}
const labels = (marked: string, manual = false): string[] => at(marked, manual).c?.items.map((i) => i.label) ?? [];

describe("suggestions while typing", () => {
  it("offers instructions and directives for a word at the start of an indented statement", () => {
    expect(labels("        MO|")).toEqual(["MOV"]);
    expect(labels("        M|")).toEqual(["MOV", "MUL"]);
    expect(labels("        OR|")).toEqual(["OR", "ORG"]);
  });

  it("completes after a label on the same line", () => {
    expect(labels("LAZO:   CM|")).toEqual(["CMP"]);
  });

  it("offers registers, directives and the program's own names for an operand", () => {
    const src = "CONT    DB 0\n        MOV A|";
    expect(labels(src)).toEqual(["AH", "AL", "AX"]);
    expect(labels("CONT    DB 0\n        MOV AX, C|")).toEqual(["CH", "CL", "CX", "CONT"]);
    expect(labels("        MOV BX, OFF|")).toEqual(["OFFSET"]);
  });

  it("offers only code labels after a jump, CALL or LOOP", () => {
    const src = "CONT DB 0\nLAZO: NOP\nLISTA: NOP\n        JNZ L|";
    expect(labels(src)).toEqual(["LAZO", "LISTA"]);
    expect(labels("SUMA: RET\n        CALL S|")).toEqual(["SUMA"]);
  });

  it("offers DB, DW and EQU after a symbol name", () => {
    expect(labels("CONT    D|")).toEqual(["DB", "DW"]);
  });

  it("explains the INT numbers the simulator handles", () => {
    expect(at("        INT |", true).c?.items.map((i) => i.label)).toEqual(["0", "3", "5", "6", "7"]);
    expect(at("        INT |", true).c?.items[3]).toMatchObject({ detail: "int.6", kind: "num" });
  });

  it("stays quiet where a suggestion would only get in the way", () => {
    expect(labels("MO|")).toEqual([]); // column 0 is usually a new name
    expect(labels("        MOV AX, |")).toEqual([]); // nothing typed yet
    expect(labels("        MOV AX, 1|")).toEqual([]); // a number
    expect(labels("        MOV AX, 5 ; MO|")).toEqual([]); // comment
    expect(labels('MSG DB "MO|')).toEqual([]); // string
    expect(labels("        MOV|")).toEqual([]); // the word is already complete
    expect(labels("        ORG 2|")).toEqual([]);
  });
});

describe("suggestions on Ctrl+Space", () => {
  it("answers an empty word and the start of a line", () => {
    expect(labels("        |", true)).toContain("MOV");
    expect(labels("|", true)).toContain("ORG");
    expect(labels("M|", true)).toEqual(["MOV", "MUL"]);
    expect(labels("        MOV AX, |", true)).toContain("BX");
  });

  it("still answers when the word is already complete", () => {
    expect(labels("        MOV|", true)).toEqual(["MOV"]);
  });
});

describe("what gets inserted", () => {
  it("adds a space after an instruction that takes operands, not after one that takes none", () => {
    expect(at("        MO|").c?.items[0].insert).toBe("MOV ");
    expect(at("        RE|").c?.items[0].insert).toBe("RET");
    expect(at("        MOV BX, OFF|").c?.items[0].insert).toBe("OFFSET ");
  });

  it("does not add a second space when one already follows", () => {
    expect(at("        MO| AX, 1").c?.items[0].insert).toBe("MOV");
  });

  it("replaces the whole word under the caret", () => {
    const { source, c } = at("        MO|X AX, 1");
    expect(source.slice(c!.from, c!.to)).toBe("MOX");
  });

  it("keeps the case the user is typing in", () => {
    expect(at("        mo|").c?.items[0].insert).toBe("mov ");
    expect(at("        MO|").c?.items[0].insert).toBe("MOV ");
    expect(at("        mov a|").c?.items.map((i) => i.insert)).toEqual(["ah", "al", "ax"]);
    expect(at("LAZO: NOP\n        jnz l|").c?.items[0].insert).toBe("LAZO"); // names keep their own case
  });
});
