import { describe, expect, it } from "vitest";
import { DEFAULT_LINT, loadLintSettings, saveLintSettings } from "../src/ui/lint";
import type { Diagnostic, LintSettings } from "../src/ui/lint";
import { lintMips } from "../src/mips/lint";
import { mipsExamplesFor } from "../src/mips/examples";

const only = (check: keyof LintSettings): LintSettings => ({ syntax: false, dead: false, loop: false, uninit: false, [check]: true });
const marked = (src: string, d: Diagnostic): string => src.slice(d.from, d.to);

describe("EduMIPS64 linter: syntax", () => {
  it("finds nothing in an empty or valid program", () => {
    expect(lintMips("")).toEqual([]);
    expect(lintMips("daddi r1, r0, 5\nhalt")).toEqual([]);
  });

  it.each([
    ["daddi r1, r0, 5\ndadd r2, r1, r99\nhalt", 2, "r99"],
    ["nop\nfoo r1\nhalt", 2, "foo"],
    ["beq r1, r2, nowhere\nhalt", 1, "nowhere"],
    ["daddi r1, r0, 70000\nhalt", 1, "70000"],
    ["dsll r1, r1, 64\nhalt", 1, "64"],
    ["ld r1, 4\nhalt", 1, "4"],
    ["a: nop\na: nop\nhalt", 2, "a"],
    [".bogus 1\nhalt", 1, ".bogus"],
  ])("underlines the culprit in %j", (src, line, text) => {
    const [d] = lintMips(src);
    expect(d).toMatchObject({ severity: "error", check: "syntax", line });
    expect(marked(src, d)).toBe(text);
  });

  it("marks the whole statement when the message names nothing", () => {
    const src = ".data\n        .space -1   # comment\n.text\nhalt";
    const [d] = lintMips(src);
    expect(marked(src, d)).toBe(".space -1");
  });

  it("marks the mnemonic when the operand count is wrong, as the MSX88 linter does", () => {
    const src = "nop\n        dadd r1, r2   # comment\nhalt";
    expect(marked(src, lintMips(src)[0])).toBe("dadd");
  });

  it("keeps the assembler's message so the screen can translate it", () => {
    expect(lintMips("nop\nfoo r1")[0].message).toBe("Line 2: Unknown instruction foo");
  });

  it("reports only the syntax error and nothing else while the program does not assemble", () => {
    expect(lintMips("j end\nnop\nfoo\nend: halt")).toHaveLength(1);
  });

  it("is silent about syntax when that check is off", () => {
    expect(lintMips("foo r1", {}, { ...DEFAULT_LINT, syntax: false })).toEqual([]);
  });
});

describe("EduMIPS64 linter: code that never runs", () => {
  const dead = only("dead");

  it("flags an instruction nothing reaches, once per dead stretch", () => {
    const src = "j end\nnop\nnop\nend: halt";
    const out = lintMips(src, {}, dead);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ severity: "warning", check: "dead", line: 2, key: "lint.msg.dead" });
    expect(marked(src, out[0])).toBe("nop");
  });

  it("names a label nothing jumps to", () => {
    const src = "j end\nsobra: nop\nend: halt";
    const [d] = lintMips(src, {}, dead);
    expect(d).toMatchObject({ line: 2, key: "lint.msg.deadLabel", vars: { name: "sobra" } });
    expect(marked(src, d)).toBe("sobra");
  });

  it("flags code after halt and after syscall 0", () => {
    expect(lintMips("halt\nnop", {}, dead).map((d) => d.line)).toEqual([2]);
    expect(lintMips("syscall 0\nnop", {}, dead).map((d) => d.line)).toEqual([2]);
  });

  it("counts both sides of a conditional branch, a call and its return as reachable", () => {
    expect(lintMips("bnez r1, end\nnop\nend: halt", {}, dead)).toEqual([]);
    expect(lintMips("jal f\nhalt\nf: jr r31", {}, dead)).toEqual([]);
  });

  it("stays quiet when a jump goes through a register, since the target cannot be known", () => {
    expect(lintMips("daddi r5, r0, 8\njr r5\nnop\nhalt", {}, dead)).toEqual([]);
    expect(lintMips("jalr r5\nhalt\nnop", {}, dead)).toEqual([]);
  });

  it("starts from the entry point set with .global", () => {
    const out = lintMips(".text\n.global main\nantes: nop\nmain: halt", {}, dead);
    expect(out.map((d) => d.line)).toEqual([3]);
  });
});

describe("EduMIPS64 linter: loops that never end", () => {
  const loop = only("loop");

  it("flags a backward jump from which nothing can leave", () => {
    const src = "main: nop\nloop: j loop\nhalt";
    const out = lintMips(src, {}, loop);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ check: "loop", line: 2, key: "lint.msg.loop" });
  });

  it("accepts a loop with a way out", () => {
    expect(lintMips("daddi r1, r0, 3\nloop: daddi r1, r1, -1\nbnez r1, loop\nhalt", {}, loop)).toEqual([]);
  });

  it("stays quiet when a jump goes through a register", () => {
    expect(lintMips("daddi r5, r0, 0\nloop: jr r5", {}, loop)).toEqual([]);
  });
});

describe("EduMIPS64 linter: registers read before they are assigned", () => {
  const uninit = only("uninit");

  it("flags a register read before anything is written to it, once per line", () => {
    const src = "dadd r2, r1, r1\nhalt";
    const out = lintMips(src, {}, uninit);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ severity: "warning", check: "uninit", line: 1, key: "lint.msg.uninitReg", vars: { name: "r1" } });
    expect(marked(src, out[0])).toBe("r1");
  });

  it("does not count r0, nor a register that was written first", () => {
    expect(lintMips("dadd r2, r0, r0\nhalt", {}, uninit)).toEqual([]);
    expect(lintMips("daddi r1, r0, 1\ndadd r2, r1, r1\nhalt", {}, uninit)).toEqual([]);
  });

  it("counts a store's data register and the printf parameter register as reads", () => {
    expect(lintMips(".data\nv: .space 8\n.text\nsd r3, v(r0)\nhalt", {}, uninit)[0]?.vars).toEqual({ name: "r3" });
    const src = "syscall 5\nhalt";
    const [d] = lintMips(src, {}, uninit);
    expect(d.vars).toEqual({ name: "r14" });
    expect(marked(src, d)).toBe("syscall 5"); // no r14 on the line: the whole statement is marked
  });

  it("names the register as it was written, $t0 included", () => {
    const src = "dadd $t1, $t0, $t0\nhalt";
    const [d] = lintMips(src, {}, uninit);
    expect(marked(src, d)).toBe("$t0");
    expect(d.vars).toEqual({ name: "$t0" });
  });

  it("only looks at what actually runs", () => {
    expect(lintMips("j end\ndadd r2, r1, r1\nend: halt", {}, uninit)).toEqual([]);
  });

  it("is off when its check is off", () => {
    expect(lintMips("dadd r2, r1, r1\nhalt", {}, { ...DEFAULT_LINT, uninit: false })).toEqual([]);
  });
});

describe("EduMIPS64 linter: ordering and the built-in examples", () => {
  it("sorts findings by line", () => {
    const out = lintMips("dadd r2, r1, r1\nj end\nnop\nend: halt");
    expect(out.map((d) => d.line)).toEqual([1, 3]);
  });

  it("flags none of the built-in examples", () => {
    for (const lang of ["en", "es"] as const) {
      for (const ex of mipsExamplesFor(lang)) expect(lintMips(ex.source), ex.title).toEqual([]);
    }
  });
});

describe("EduMIPS64 linter: settings", () => {
  it("keeps the user's choice of checks under its own key, apart from MSX88's", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    saveLintSettings({ ...DEFAULT_LINT, dead: false }, storage, "k-mips");
    expect(loadLintSettings(storage, "k-mips").dead).toBe(false);
    expect(loadLintSettings(storage).dead).toBe(true);
  });
});
