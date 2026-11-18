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
