import { describe, expect, it } from "vitest";
import { simulateMips } from "../src/mips/sim";

const run = (src: string, maxSteps?: number) => simulateMips(src, { maxSteps });
const r = (res: ReturnType<typeof run>, n: number) => res.cpu.regs[n];

describe("MIPS64 CPU", () => {
  it("runs arithmetic and keeps r0 at zero", () => {
    const res = run("daddi r1, r0, 5\ndadd r2, r1, r1\ndaddi r0, r0, 9\nhalt");
    expect(res.reason).toBe("halted");
    expect(r(res, 2)).toBe(10n);
    expect(r(res, 0)).toBe(0n);
  });

  it("sign-extends arithmetic immediates and zero-extends logical ones", () => {
    const res = run("daddi r1, r0, -1\nandi r2, r1, 0xFF00\nori r3, r0, 0xFFFF\nhalt");
    expect(r(res, 1)).toBe(-1n);
    expect(r(res, 2)).toBe(0xff00n);
    expect(r(res, 3)).toBe(0xffffn);
  });

  it("traps on signed overflow in dadd but wraps in daddu", () => {
    const base = "daddi r1, r0, 1\ndsll r1, r1, 62\n";
    const trap = run(`${base}dadd r2, r1, r1\nhalt`);
    expect(trap.reason).toBe("error");
    expect(trap.error).toContain("Integer overflow");
    const wrap = run(`${base}daddu r2, r1, r1\nhalt`);
    expect(wrap.reason).toBe("halted");
    expect(r(wrap, 2)).toBe(-(2n ** 63n));
  });

  it("does lui, shifts and comparisons", () => {
    const res = run(`
      lui r1, 1
      dsrl r2, r1, 4
      daddi r3, r0, -8
      dsra r4, r3, 1
      slt r5, r3, r0
      sltu r6, r3, r0
      slti r7, r3, 0
      halt`);
    expect(r(res, 1)).toBe(65536n);
    expect(r(res, 2)).toBe(4096n);
    expect(r(res, 4)).toBe(-4n);
    expect(r(res, 5)).toBe(1n);
    expect(r(res, 6)).toBe(0n);
    expect(r(res, 7)).toBe(1n);
  });

  it("shifts by a register with dsllv rd, rt, rs", () => {
    const res = run("daddi r1, r0, 3\ndaddi r2, r0, 4\ndsllv r3, r1, r2\nhalt");
    expect(r(res, 3)).toBe(48n);
  });

  it("multiplies and divides with three registers, no LO/HI", () => {
    const res = run("daddi r1, r0, 17\ndaddi r2, r0, 5\ndmul r3, r1, r2\nddiv r4, r1, r2\nhalt");
    expect(r(res, 3)).toBe(85n);
    expect(r(res, 4)).toBe(3n);
  });

  it("stops with an error on division by zero", () => {
    const res = run("daddi r1, r0, 1\nddiv r2, r1, r0\nhalt");
    expect(res.reason).toBe("error");
    expect(res.error).toContain("Division by zero");
  });

  it("loads and stores little-endian with sign extension", () => {
    const res = run(`
      .data
      buf: .space 16
      .text
      daddi r1, r0, 0x1234
      sd r1, buf(r0)
      lbu r2, buf(r0)
      lbu r3, buf+1(r0)
      daddi r4, r0, -2
      sb r4, buf+8(r0)
      lb r5, buf+8(r0)
      lbu r6, buf+8(r0)
      lh r7, buf(r0)
      halt`);
    expect(r(res, 2)).toBe(0x34n);
    expect(r(res, 3)).toBe(0x12n);
    expect(r(res, 5)).toBe(-2n);
    expect(r(res, 6)).toBe(254n);
    expect(r(res, 7)).toBe(0x1234n);
  });

  it("stops on a misaligned access and on an out-of-range address", () => {
    const mis = run(".data\nv: .space 16\n.text\nld r1, v+4(r0)\nhalt");
    expect(mis.reason).toBe("error");
    expect(mis.error).toContain("Misaligned");
    const oob = run("daddi r2, r0, -8\nld r1, 0(r2)\nhalt");
    expect(oob.reason).toBe("error");
    expect(oob.error).toContain("outside data memory");
  });

  it("runs loops: sum 1..5", () => {
    const res = run(`
      daddi r1, r0, 5
      loop: dadd r2, r2, r1
            daddi r1, r1, -1
            bnez r1, loop
      halt`);
    expect(r(res, 2)).toBe(15n);
    expect(res.steps.filter((s) => s.instr.mnemonic === "bnez" && s.taken)).toHaveLength(4);
  });

  it("calls with jal and returns with jr", () => {
    const res = run(`
      jal f
      daddi r2, r0, 2
      halt
      f: daddi r1, r0, 1
      jr r31`);
    expect(r(res, 1)).toBe(1n);
    expect(r(res, 2)).toBe(2n);
    expect(r(res, 31)).toBe(4n);
  });

  const IO = `
      .data
      CONTROL: .word32 0x10000
      DATA: .word32 0x10008
      msg: .asciiz "hola"
      .text
      lwu r31, CONTROL(r0)
      lwu r30, DATA(r0)
`;

  it("prints a string through CONTROL=4 and DATA=address, with no newline", () => {
    const res = run(`${IO}
      daddi r29, r0, 4
      daddi r28, r0, msg
      sd r28, (r30)
      sd r29, (r31)
      halt`);
    expect(res.reason).toBe("halted");
    expect(res.output).toBe("hola");
    expect(res.steps.find((s) => s.output)?.output).toBe("hola");
  });

  it("prints unsigned and signed integers through CONTROL=1 and 2, one per line", () => {
    const res = run(`${IO}
      daddi r1, r0, -1
      sd r1, (r30)
      daddi r2, r0, 1
      sd r2, (r31)
      daddi r3, r0, -5
      sd r3, (r30)
      daddi r2, r0, 2
      sd r2, (r31)
      halt`);
    expect(res.output).toBe("18446744073709551615\n-5\n");
  });

  it("clears CONTROL after acting and clears the terminal with CONTROL=6", () => {
    const res = run(`${IO}
      daddi r1, r0, 7
      sd r1, (r30)
      daddi r2, r0, 1
      sd r2, (r31)
      ld r3, (r31)
      daddi r4, r0, 6
      sd r4, (r31)
      halt`);
    expect(r(res, 3)).toBe(0n);
    expect(res.output).toBe("");
  });

  it("stops on the unsupported I/O modes with a clear error", () => {
    const res = run(`${IO}
      daddi r4, r0, 8
      sd r4, (r31)
      halt`);
    expect(res.reason).toBe("error");
    expect(res.error).toContain("not supported");
  });

  it("rejects syscall: WinMIPS64 has none", () => {
    expect(() => run("syscall 0\nhalt")).toThrow("Unknown instruction syscall");
  });

  it("halts when execution runs past the last instruction", () => {
    expect(run("nop").reason).toBe("halted");
  });

  it("stops at maxSteps", () => {
    const res = run("loop: j loop", 50);
    expect(res.reason).toBe("max-steps");
    expect(res.steps).toHaveLength(50);
  });

  it("records what each step changed", () => {
    const res = run(".data\nv: .space 8\n.text\ndaddi r1, r0, 7\nsd r1, v(r0)\nhalt");
    const [add, sd] = res.steps;
    expect(add.regs).toEqual([{ reg: 1, before: 0n, after: 7n }]);
    expect(sd.mem).toEqual([{ kind: "write", addr: 0, size: 8, before: 0n, after: 7n }]);
    expect(sd.regs).toEqual([]);
  });
});
