import { describe, expect, it } from "vitest";
import { assembleMips, regNumber } from "../src/mips/assembler";
import { AsmError } from "../src/core/types";

const asm = (src: string) => assembleMips(src);

describe("EduMIPS64 assembler", () => {
  it("assembles registers in r5, $5 and ABI spellings", () => {
    expect(regNumber("r31")).toBe(31);
    expect(regNumber("$7")).toBe(7);
    expect(regNumber("$t0")).toBe(8);
    expect(regNumber("r32")).toBeUndefined();
    expect(regNumber("foo")).toBeUndefined();
  });

  it("lays out .data with natural alignment and resolves data labels", () => {
    const p = asm(`
      .data
      a: .byte 1
      b: .word 0x0102030405060708
      c: .word32 7, 8
      .text
      halt`);
    expect(p.symbols.get("a")).toEqual({ kind: "data", value: 0 });
    expect(p.symbols.get("b")).toEqual({ kind: "data", value: 8 });
    expect(p.symbols.get("c")).toEqual({ kind: "data", value: 16 });
    expect(Array.from(p.data.slice(8, 16))).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
    expect(Array.from(p.data.slice(16, 24))).toEqual([7, 0, 0, 0, 8, 0, 0, 0]);
  });

  it("aligns a label that sits alone on its line with the datum that follows", () => {
    const p = asm(".data\nx: .byte 1\nw:\n.word 5\n.text\nhalt");
    expect(p.symbols.get("w")?.value).toBe(8);
  });

  it("encodes strings with escapes and .space", () => {
    const p = asm('.data\ns: .asciiz "a\\n"\nz: .space 3\n.text\nhalt');
    expect(Array.from(p.data.slice(0, 3))).toEqual([97, 10, 0]);
    expect(p.symbols.get("z")?.value).toBe(3);
  });

  it("assembles each instruction format", () => {
    const p = asm(`
      .data
      v: .word 9
      .text
      main: daddi r1, r0, 5
            dadd r3, r1, r1
            dsll r4, r3, 2
            ld r5, v(r0)
            sd r5, 8(r2)
            beq r1, r3, main
            bnez r1, end
            jal main
            jr r31
      end:  syscall 0`);
    const [i0, i1, i2, i3, i4, i5, i6, i7, i8, i9] = p.instrs;
    expect([i0.rt, i0.rs, i0.imm]).toEqual([1, 0, 5n]);
    expect([i1.rd, i1.rs, i1.rt]).toEqual([3, 1, 1]);
    expect([i2.rd, i2.rt, i2.imm]).toEqual([4, 3, 2n]);
    expect([i3.rt, i3.rs, i3.imm]).toEqual([5, 0, 0n]);
    expect([i4.rt, i4.rs, i4.imm]).toEqual([5, 2, 8n]);
    expect([i5.rs, i5.rt, i5.target]).toEqual([1, 3, 0]);
    expect([i6.rs, i6.target]).toEqual([1, 9]);
    expect(i7.target).toBe(0);
    expect(i8.rs).toBe(31);
    expect(i9.imm).toBe(0n);
    expect(p.instrs.map((i) => i.addr)).toEqual([0, 4, 8, 12, 16, 20, 24, 28, 32, 36]);
  });

  it("uses a data label as an immediate and accepts label+N", () => {
    const p = asm(".data\nv: .word 1\n.text\ndaddi r1, r0, v+8\nhalt");
    expect(p.instrs[0].imm).toBe(8n);
  });

  it("supports # and ; comments and ignores them inside strings", () => {
    const p = asm('.data\ns: .asciiz "a#b;c" # tail\n.text\nhalt ; done');
    expect(Array.from(p.data.slice(0, 6))).toEqual([97, 35, 98, 59, 99, 0]);
    expect(p.instrs).toHaveLength(1);
  });

  it("honours .global as the entry point", () => {
    const p = asm(".text\n.global main\nnop\nmain: halt");
    expect(p.entry).toBe(1);
  });

  it.each([
    ["foo r1", "Unknown instruction foo"],
    [".data\ndadd r1, r2, r3", "Instruction dadd found in the .data section"],
    ["dadd r1, r2", "dadd expects 3 operand(s), got 2"],
    ["dadd r1, r2, r99", "r99 is not a register"],
    ["daddi r1, r0, 70000", "does not fit in 16 bits"],
    ["dsll r1, r1, 64", "between 0 and 63"],
    ["beq r1, r2, nowhere", "Undefined label nowhere"],
    [".data\nv: .word 1\n.text\nj v", "data label"],
    [".bogus 1", "Unknown directive .bogus"],
    [".text\n.word 1", "only allowed in the .data section"],
    ["a: nop\na: nop", "already defined"],
    ["ld r1, 4", "expected offset(register)"],
  ])("rejects %j", (src, msg) => {
    expect(() => asm(src)).toThrow(AsmError);
    expect(() => asm(src)).toThrow(msg);
  });

  it("reports the source line in errors", () => {
    expect(() => asm("nop\nnop\nfoo")).toThrow("Line 3:");
  });
});
