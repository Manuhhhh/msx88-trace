import { describe, expect, it } from "vitest";
import { assemble } from "../src/core/assembler";
import { simulate } from "../src/core/simulate";
import { AsmError } from "../src/core/types";
import { DICTIONARIES, plural, t, translateCore } from "../src/ui/i18n";
import type { Key } from "../src/ui/i18n";

const asmMessage = (src: string): string => {
  try {
    assemble(src);
  } catch (e) {
    if (e instanceof AsmError) return e.message;
  }
  throw new Error("expected an assembly error");
};

describe("dictionaries", () => {
  const keys = Object.keys(DICTIONARIES.en) as Key[];
  const slots = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

  it("have the same keys in both languages and no empty text", () => {
    expect(Object.keys(DICTIONARIES.es).sort()).toEqual([...keys].sort());
    for (const k of keys) {
      expect(DICTIONARIES.en[k].length, `en ${k}`).toBeGreaterThan(0);
      expect(DICTIONARIES.es[k].length, `es ${k}`).toBeGreaterThan(0);
    }
  });

  it("use the same {placeholders} in both languages", () => {
    for (const k of keys) expect(slots(DICTIONARIES.es[k]), k).toEqual(slots(DICTIONARIES.en[k]));
  });

  it("fill placeholders and pick singular or plural", () => {
    expect(t("summary.steps", { n: 80 }, "es")).toBe("80 pasos");
    expect(t("summary.steps", { n: 80 }, "en")).toBe("80 steps");
    expect(plural("summary.interrupts", 1, "es")).toBe("1 interrupción");
    expect(plural("summary.interrupts", 3, "es")).toBe("3 interrupciones");
    expect(plural("settings.title", 1, "en")).toBe("Run settings, 1 interrupt request");
  });

  it("speak Rioplatense Spanish (voseo) in the instructions", () => {
    expect(t("example.choose", {}, "es")).toBe("Elegí un ejemplo");
    expect(t("hover.hint", {}, "es")).toContain("Pasá");
  });
});

describe("assembler and CPU messages in Spanish", () => {
  it("translates real assembler errors, keeping the line number and the names", () => {
    expect(translateCore(asmMessage("FOO AX"), "es")).toBe("Línea 1: Instrucción desconocida FOO");
    expect(translateCore(asmMessage("MOV AX"), "es")).toBe("Línea 1: MOV espera 2 operando(s), recibió 1");
    expect(translateCore(asmMessage("JMP NOWHERE"), "es")).toBe("Línea 1: Símbolo no definido NOWHERE");
    expect(translateCore(asmMessage("A EQU 1\nA EQU 2"), "es")).toBe("Línea 2: Símbolo duplicado A");
    expect(translateCore(asmMessage("MOV AL, 300"), "es")).toBe("Línea 1: El inmediato 300 no entra en 8 bits");
    expect(translateCore(asmMessage("MOV [BX], 5"), "es")).toBe("Línea 1: MOV: indicá BYTE PTR o WORD PTR");
  });

  it("translates CPU errors raised while running", () => {
    const div = simulate("ORG 2000H\nMOV AX, 4\nMOV BL, 0\nDIV BL\nINT 0\nEND");
    expect(div.reason).toBe("error");
    expect(translateCore(div.error!, "es")).toBe("Error de división: división por cero");
    const input = simulate("ORG 2000H\nINT 6\nINT 0\nEND");
    expect(translateCore(input.error!, "es")).toBe("INT 6: no queda entrada");
  });

  it("leaves English untouched and unknown messages as they were", () => {
    expect(translateCore("Line 3: Unknown instruction FOO", "en")).toBe("Line 3: Unknown instruction FOO");
    expect(translateCore("Line 3: something new", "es")).toBe("Línea 3: something new");
  });

  it("knows every message the assembler and the CPU can raise", () => {
    // each sample is a real message shape from src/core; none may fall through untranslated
    const samples = [
      "Unknown instruction X", "MOV expects 2 operand(s), got 1", "Invalid operands for MOV", "MOV: specify BYTE PTR or WORD PTR",
      "SHL count must be 1 or CL", "MOV: operand size mismatch", "INT number out of range: 300", "Port out of range (use DX): 300",
      "Immediate 300 does not fit in 8 bits", "Empty operand", 'Unexpected text in expression: "?"', "Empty expression", 'Unexpected "x"',
      'Invalid number "9Z"', "OFFSET needs a symbol", "Undefined symbol X", "Symbol X is not defined yet", "Incomplete expression",
      "Unsupported addressing mode: [AX]", "Address out of range: 70000", "DW cannot hold a string", "Invalid DUP count: -1",
      "Reserved name ORG", "Duplicate symbol X", "EQU expects one value", "ORG expects one address", "ORG out of range: 70000",
      "DB needs at least one value", "Program exceeds 64 KiB of memory", "Value 300 does not fit in 8 bits",
      "Code overlaps another instruction at 2000H", "Cannot write to an immediate", "Unsupported ALU operation X", "Unsupported jump X",
      "INT 6: no input left", "Divide error: division by zero", "Divide error: quotient overflow", "Unsupported instruction X",
      "CPU is halted", "No instruction at 2000H",
    ];
    for (const s of samples) expect(translateCore(s, "es"), s).not.toBe(s);
  });
});
