import { describe, expect, it } from "vitest";
import { diagnose } from "../src/ui/lint";
import { examplesFor } from "../src/ui/examples";

describe("diagnose", () => {
  it("finds nothing in an empty or valid program", () => {
    expect(diagnose("")).toBeNull();
    expect(diagnose("  \n ")).toBeNull();
    expect(diagnose("ORG 2000H\nMOV AX, 5\nINT 0\nEND")).toBeNull();
  });

  it("reports the line and the assembler's message for a syntax error", () => {
    expect(diagnose("ORG 2000H\nFOO AX\nINT 0\nEND")).toMatchObject({ line: 2, message: "Line 2: Unknown instruction FOO" });
    expect(diagnose("ORG 2000H\nMOV AX\nEND")).toMatchObject({ line: 2, message: "Line 2: MOV expects 2 operand(s), got 1" });
  });

  it("catches an undefined symbol and a value that does not fit", () => {
    expect(diagnose("ORG 2000H\nJMP NOWHERE\nEND")?.line).toBe(2);
    expect(diagnose("ORG 2000H\nMOV AL, 300\nEND")?.line).toBe(2);
  });

  it("reports the same error that running the program would", () => {
    const src = "ORG 2000H\nMOV AX, 1\nBAD\nEND";
    expect(diagnose(src)?.message).toBe("Line 3: Unknown instruction BAD");
  });

  it("flags none of the built-in examples", () => {
    for (const ex of [...examplesFor("en"), ...examplesFor("es")]) expect(diagnose(ex.state.source)).toBeNull();
  });
});

/** The text the diagnostic points at. */
const marked = (src: string): string | undefined => {
  const d = diagnose(src);
  return d ? src.slice(d.from, d.to) : undefined;
};

describe("which text is marked", () => {
  it("marks the unknown instruction, not the whole line", () => {
    expect(marked("ORG 2000H\n        FOO AX, 1\nEND")).toBe("FOO");
    expect(marked("ORG 2000H\nLAZO:   foo AX\nEND")).toBe("foo");
  });

  it("marks the undefined symbol wherever it is on the line", () => {
    expect(marked("ORG 2000H\n        JMP NOWHERE ; go\nEND")).toBe("NOWHERE");
    expect(marked("ORG 2000H\n        MOV AX, MISSING\nEND")).toBe("MISSING");
  });

  it("marks the mnemonic when the operand count is wrong", () => {
    expect(marked("ORG 2000H\n        MOV AX\nEND")).toBe("MOV");
  });

  it("marks the value that does not fit, in decimal or hex", () => {
    expect(marked("ORG 2000H\n        MOV AL, 300\nEND")).toBe("300");
    expect(marked("ORG 2000H\n        MOV AL, 12CH\nEND")).toBe("12CH");
  });

  it("marks the duplicated name", () => {
    expect(marked("A EQU 1\nA EQU 2\nEND")).toBe("A");
  });

  it("falls back to the whole statement, never the comment or the blanks around it", () => {
    expect(marked("ORG 2000H\n        MOV [BX], 5   ; no size\nEND")).toBe("MOV");
    expect(marked("ORG 2000H\n        INC AX, BX ; extra\nEND")).toBe("INC");
  });

  it("always points at some text on the offending line", () => {
    for (const src of ["ORG 2000H\nFOO\nEND", "A EQU 1\nA EQU 2"]) {
      const d = diagnose(src)!;
      expect(d.to).toBeGreaterThan(d.from);
    }
  });
});

import { DEFAULT_LINT, lint, loadLintSettings, saveLintSettings } from "../src/ui/lint";
import type { LintSettings } from "../src/ui/lint";

const keys = (src: string, on: LintSettings = DEFAULT_LINT, run = {}) => lint(src, run, on).map((d) => `${d.check}:${d.line}:${d.key ?? "error"}`);
const textOf = (src: string, i = 0): string => {
  const d = lint(src)[i];
  return src.slice(d.from, d.to);
};

describe("code that never runs", () => {
  const dead = "ORG 2000H\n        MOV AX, 1\n        INT 0\nSUMA:   ADD AX, 1\n        RET\n        END";

  it("flags a procedure nothing calls, on its label", () => {
    expect(keys(dead)).toEqual(["dead:4:lint.msg.deadLabel"]);
    expect(textOf(dead)).toBe("SUMA");
    expect(lint(dead)[0].vars).toEqual({ name: "SUMA" });
  });

  it("does not flag a procedure that is called or jumped to", () => {
    expect(keys("ORG 2000H\n        CALL SUMA\n        INT 0\nSUMA:   ADD AX, 1\n        RET\n        END")).toEqual([]);
    expect(keys("ORG 2000H\n        JMP FIN\nFIN:    INT 0\n        END")).toEqual([]);
  });

  it("flags unlabelled code after an INT 0 or a JMP once, on its first line", () => {
    expect(keys("ORG 2000H\n        INT 0\n        MOV AX, 1\n        MOV BX, 2\n        END")).toEqual(["dead:3:lint.msg.dead"]);
    expect(textOf("ORG 2000H\n        INT 0\n        MOV AX, 1\n        END")).toBe("MOV AX, 1");
  });

  it("counts an interrupt handler installed in the vector table as running", () => {
    const f10 = examplesFor("en").find((e) => e.id === "f10")!.state.source;
    expect(keys(f10)).toEqual([]);
  });

  it("stays quiet when an address is taken as a value, since it may be jumped to later", () => {
    expect(keys("ORG 2000H\n        MOV BX, OFFSET PROC\n        INT 0\nPROC:   RET\n        END")).toEqual([]);
  });
});

describe("loops that never end", () => {
  it("flags a jump back that nothing can leave", () => {
    const src = "ORG 2000H\nLAZO:   INC AX\n        JMP LAZO\n        END";
    expect(keys(src)).toEqual(["loop:3:lint.msg.loop"]);
    expect(textOf(src)).toBe("JMP LAZO");
  });

  it("does not flag a loop with a way out", () => {
    expect(keys("ORG 2000H\n        MOV CX, 5\nLAZO:   DEC CX\n        JNZ LAZO\n        INT 0\n        END")).toEqual([]);
    expect(keys("ORG 2000H\n        MOV CX, 5\nLAZO:   NOP\n        LOOP LAZO\n        INT 0\n        END")).toEqual([]);
  });

  it("does not flag a wait loop when an interrupt handler can end the program", () => {
    const src = "ORG 40\nIP DW RUT\nORG 2000H\nLAZO: JMP LAZO\nORG 3000H\nRUT: INT 0\nEND";
    expect(keys(src)).toEqual([]);
    // the same loop with a handler that does not end it is still stuck
    expect(keys("ORG 40\nIP DW RUT\nORG 2000H\nLAZO: JMP LAZO\nORG 3000H\nRUT: IRET\nEND")).toEqual(["loop:4:lint.msg.loop"]);
  });

  it("is not fooled by an unrelated stuck-looking procedure that is never reached", () => {
    expect(keys("ORG 2000H\n        INT 0\nSPIN:   JMP SPIN\n        END")).toEqual(["dead:3:lint.msg.deadLabel"]);
  });
});

describe("variables read before they are assigned", () => {
  it("flags a read of a `?` variable that nothing stored into", () => {
    const src = "ORG 1000H\nX DW ?\nORG 2000H\n        MOV AX, X\n        INT 0\n        END";
    expect(keys(src)).toEqual(["uninit:4:lint.msg.uninit"]);
    expect(textOf(src)).toBe("X");
    expect(lint(src)[0].vars).toEqual({ name: "X" });
  });

  it("does not flag it once the variable was assigned, or when it was given a value", () => {
    expect(keys("ORG 1000H\nX DW ?\nORG 2000H\n        MOV X, 5\n        MOV AX, X\n        INT 0\n        END")).toEqual([]);
    expect(keys("ORG 1000H\nX DW 7\nORG 2000H\n        MOV AX, X\n        INT 0\n        END")).toEqual([]);
  });

  it("flags printing a buffer that was never filled, and accepts one filled by INT 6", () => {
    const head = "ORG 1000H\nBUF DB ?, ?\nFIN DB ?\nORG 2000H\n        MOV BX, OFFSET BUF\n";
    const printOnly = `${head}        MOV AL, 2\n        INT 7\n        INT 0\n        END`;
    expect(keys(printOnly)).toEqual(["uninit:7:lint.msg.uninit"]);
    const filled = `${head}        INT 6\n        INC BX\n        INT 6\n        MOV BX, OFFSET BUF\n        MOV AL, 2\n        INT 7\n        INT 0\n        END`;
    expect(keys(filled, DEFAULT_LINT, { input: "hi" })).toEqual([]);
  });

  it("reads each line once, even when it runs many times", () => {
    const src = "ORG 1000H\nX DB ?\nORG 2000H\n        MOV CX, 3\nL:      MOV AL, X\n        LOOP L\n        INT 0\n        END";
    expect(keys(src)).toEqual(["uninit:5:lint.msg.uninit"]);
  });
});

describe("turning checks on and off", () => {
  const all = "ORG 1000H\nX DW ?\nORG 2000H\n        MOV AX, X\n        INT 0\nSUMA:   RET\n        END";

  it("reports one finding per check, sorted by line", () => {
    expect(keys(all)).toEqual(["uninit:4:lint.msg.uninit", "dead:6:lint.msg.deadLabel"]);
  });

  it("drops what the user switched off", () => {
    expect(keys(all, { ...DEFAULT_LINT, uninit: false })).toEqual(["dead:6:lint.msg.deadLabel"]);
    expect(keys(all, { ...DEFAULT_LINT, dead: false })).toEqual(["uninit:4:lint.msg.uninit"]);
    expect(keys(all, { syntax: true, dead: false, loop: false, uninit: false })).toEqual([]);
  });

  it("keeps the syntax error unless that check is off too", () => {
    expect(keys("ORG 2000H\nFOO\nEND")).toEqual(["syntax:2:error"]);
    expect(keys("ORG 2000H\nFOO\nEND", { ...DEFAULT_LINT, syntax: false })).toEqual([]);
  });

  it("remembers the choice and falls back to everything on when it cannot read it", () => {
    const data = new Map<string, string>();
    const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    expect(loadLintSettings(store)).toEqual(DEFAULT_LINT);
    saveLintSettings({ ...DEFAULT_LINT, loop: false }, store);
    expect(loadLintSettings(store)).toEqual({ ...DEFAULT_LINT, loop: false });
    data.set("msx88-trace:lint", "{broken");
    expect(loadLintSettings(store)).toEqual(DEFAULT_LINT);
    data.set("msx88-trace:lint", JSON.stringify({ dead: "no", loop: false }));
    expect(loadLintSettings(store)).toEqual({ ...DEFAULT_LINT, loop: false });
    expect(loadLintSettings(null)).toEqual(DEFAULT_LINT);
  });
});

describe("the built-in examples", () => {
  it("raise no warnings", () => {
    for (const ex of [...examplesFor("en"), ...examplesFor("es")]) {
      expect(lint(ex.state.source, { input: ex.state.input, maxSteps: ex.state.maxSteps, events: ex.state.events })).toEqual([]);
    }
  });
});
