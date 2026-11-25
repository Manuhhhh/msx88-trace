import { describe, expect, it } from "vitest";
import { completeMips } from "../src/mips/complete";

/** Runs the completion with the caret at `|`. */
function at(marked: string, manual = false) {
  const caret = marked.indexOf("|");
  const source = marked.replace("|", "");
  return completeMips(source, caret, manual);
}
const labels = (marked: string, manual = false): string[] => at(marked, manual)?.items.map((i) => i.label) ?? [];

describe("MIPS64 suggestions", () => {
  it("offers instructions for a word at the start of an indented statement", () => {
    expect(labels(".text\n        dsl|")).toEqual(["dsll", "dsllv"]);
    expect(labels(".text\n        bn|")).toEqual(["bne", "bnez"]);
  });

  it("completes after a label on the same line", () => {
    expect(labels(".text\nloop:   bn|")).toEqual(["bne", "bnez"]);
  });

  it("stays quiet for a bare word at column 0 (a new name), and inside comments", () => {
    expect(labels("da|")).toEqual([]);
    expect(labels("        daddi r1 # da|")).toEqual([]);
    expect(labels("        daddi r1 ; da|")).toEqual([]);
  });

  it("offers only data directives in .data and section directives in .text", () => {
    expect(labels(".data\n        .w|")).toEqual([".word", ".word16", ".word32"]);
    expect(labels(".text\n        .d|")).toEqual([".data"]);
  });

  it("offers registers for a register operand, in r and $ spellings", () => {
    expect(labels(".text\n        daddi r3|")).toEqual(["r3", "r30", "r31"]);
    expect(labels(".text\n        dadd $t|")).toEqual(["$t0", "$t1", "$t2", "$t3", "$t4", "$t5", "$t6", "$t7", "$t8", "$t9"]);
  });

  it("offers data labels for an immediate and for the offset of a memory operand", () => {
    const data = ".data\nvalor: .word 1\n.text\nmain: nop\n";
    expect(labels(`${data}        daddi r1, r0, va|`)).toEqual(["valor"]);
    expect(labels(`${data}        ld r1, va|`)).toEqual(["valor"]);
  });

  it("offers registers inside the parentheses of a memory operand", () => {
    const l = labels(".text\n        ld r1, 8(r2|");
    expect(l).toContain("r2");
    expect(l.every((x) => x.startsWith("r2"))).toBe(true);
    expect(labels(".text\n        ld r1, 8(|", true)).toContain("r0");
  });

  it("offers only code labels after a branch or jump", () => {
    const src = ".data\nlo: .word 1\n.text\nloop: nop\n        bnez r1, lo|";
    expect(labels(src)).toEqual(["loop"]);
    expect(labels(".text\nsuma: jr r31\n        jal s|")).toEqual(["suma"]);
  });

  it("offers nothing past the last operand of an instruction", () => {
    expect(labels(".text\n        dadd r1, r2, r3, |", true)).toEqual([]);
    expect(labels(".text\n        nop |", true)).toEqual([]);
  });

  it("offers nothing after .global: it takes no operand in WinMIPS64", () => {
    expect(labels(".text\n.global ma|\nmain: nop")).toEqual([]);
  });

  it("answers Ctrl+Space on an empty indented line with every instruction", () => {
    const l = labels(".text\n        |", true);
    expect(l).toContain("dadd");
    expect(l).toContain("halt");
    expect(l).toContain(".data");
  });

  it("adds a space after what takes an operand, not after what does not", () => {
    const items = at(".text\n        |", true)!.items;
    expect(items.find((i) => i.label === "dadd")!.insert).toBe("dadd ");
    expect(items.find((i) => i.label === "nop")!.insert).toBe("nop");
    expect(items.find((i) => i.label === "halt")!.insert).toBe("halt");
  });

  it("does not offer a word that is already complete while typing", () => {
    expect(labels(".text\n        nop|")).toEqual([]);
  });

  it("reports the span of the word being completed", () => {
    const c = at(".text\n        dsl|")!;
    expect(c.prefix).toBe("dsl");
    expect(c.to - c.from).toBe(3);
  });
});
