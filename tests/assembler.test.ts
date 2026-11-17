import { describe, expect, it } from "vitest";
import { assemble } from "../src/core/assembler";
import { AsmError } from "../src/core/types";

const F10_EXAMPLE = `
EOI     EQU 20H
IMR     EQU 21H
INT0    EQU 24H

        ORG 40
IP_F10  DW  RUT_F10

        ORG 1000H
CONT    DB  0

        ORG 2000H
        CLI
        MOV AL, 0FEH
        OUT IMR, AL
        MOV AL, 10
        OUT INT0, AL
        STI
LAZO:   CMP CONT, 3      ; wait for 3 presses
        JNZ LAZO
        INT 0

        ORG 3000H
RUT_F10: PUSH AX
        INC CONT
        MOV AL, EOI
        OUT EOI, AL
        POP AX
        IRET
        END
`;

describe("assembler", () => {
  const p = assemble(F10_EXAMPLE);

  it("starts at the first instruction in source order", () => {
    expect(p.entry).toBe(0x2000);
  });

  it("lays out instructions with 8086 sizes", () => {
    const seq = [0x2000, 0x2001, 0x2003, 0x2005, 0x2007, 0x2009, 0x200a, 0x200f, 0x2011];
    expect([...p.instrs.keys()].filter((a) => a < 0x3000)).toEqual(seq);
    expect(p.instrs.get(0x200a)).toMatchObject({ mnemonic: "CMP", size: 5 });
    expect(p.instrs.get(0x3000)).toMatchObject({ mnemonic: "PUSH", size: 1 });
    expect(p.instrs.get(0x300a)).toMatchObject({ mnemonic: "IRET" });
  });

  it("stores the handler address in the vector table slot (little-endian)", () => {
    expect(p.memory[40]).toBe(0x00);
    expect(p.memory[41]).toBe(0x30);
  });

  it("classifies EQU as immediate and DB labels as memory", () => {
    expect(p.instrs.get(0x2003)!.operands[0]).toEqual({ kind: "imm", value: 0x21 });
    expect(p.instrs.get(0x200a)!.operands[0]).toEqual({ kind: "mem", addr: 0x1000, width: 8 });
    expect(p.instrs.get(0x200f)!.operands[0]).toEqual({ kind: "imm", value: 0x200a });
  });

  it("keeps the source text of each instruction without comments or labels", () => {
    expect(p.instrs.get(0x200a)!.text).toBe("CMP CONT, 3");
  });
});

describe("data directives", () => {
  it("handles strings, DUP, ? and DW", () => {
    const p = assemble(`
      ORG 1000H
MSG   DB 'Hi', 0
BUF   DB 3 DUP(?)
W     DW 1234H, OFFSET MSG
      ORG 2000H
      HLT
      END`);
    expect([...p.memory.slice(0x1000, 0x1003)]).toEqual([0x48, 0x69, 0]);
    expect(p.symbols.get("W")!.value).toBe(0x1006);
    expect([...p.memory.slice(0x1006, 0x100a)]).toEqual([0x34, 0x12, 0x00, 0x10]);
  });

  it("ignores everything after END", () => {
    const p = assemble("HLT\nEND\nthis is not valid");
    expect(p.instrs.size).toBe(1);
  });
});

describe("errors", () => {
  const err = (src: string): AsmError => {
    try {
      assemble(src);
    } catch (e) {
      return e as AsmError;
    }
    throw new Error("expected AsmError");
  };

  it("reports unknown instructions with the line number", () => {
    const e = err("NOP\nFOO AX");
    expect(e).toBeInstanceOf(AsmError);
    expect(e.line).toBe(2);
    expect(e.message).toContain("Unknown instruction FOO");
  });

  it("rejects wrong operand counts", () => {
    expect(err("MOV AX").message).toContain("expects 2 operand(s), got 1");
  });

  it("rejects undefined and duplicate symbols", () => {
    expect(err("JMP NOWHERE").message).toContain("Undefined symbol NOWHERE");
    expect(err("A EQU 1\nA EQU 2").message).toContain("Duplicate symbol A");
  });

  it("rejects size mismatches and out-of-range immediates", () => {
    expect(err("MOV AL, BX").message).toContain("operand size mismatch");
    expect(err("MOV AL, 300").message).toContain("does not fit in 8 bits");
    expect(err("OUT 300, AL").message).toContain("Port out of range");
  });

  it("asks for BYTE/WORD PTR when the width is unknown", () => {
    expect(err("MOV [BX], 5").message).toContain("BYTE PTR or WORD PTR");
  });
});
