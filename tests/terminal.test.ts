import { beforeAll, describe, expect, it } from "vitest";
import { simulate } from "../src/core/simulate";
import { setLang } from "../src/ui/i18n";
import { terminalEnd, terminalView } from "../src/ui/terminal";

// Reads one character into BUF, prints it back, and does it twice.
const ECHO = `BUF DB ?
ORG 2000H
MOV BX, OFFSET BUF
INT 6
MOV AL, 1
INT 7
INT 6
MOV AL, 1
INT 7
INT 0
END`;

describe("waiting for input", () => {
  it("pauses on INT 6 with an empty buffer instead of failing", () => {
    const r = simulate(ECHO, { waitForInput: true });
    expect(r.reason).toBe("waiting-input");
    expect(r.error).toBeUndefined();
    expect(r.steps).toHaveLength(1);
  });

  it("still fails without waitForInput, as before", () => {
    const r = simulate(ECHO, {});
    expect(r.reason).toBe("error");
    expect(r.error).toBe("INT 6: no input left");
  });

  it("resumes from the start once the buffer holds enough, and halts", () => {
    const r = simulate(ECHO, { input: "ab", waitForInput: true });
    expect(r.reason).toBe("halted");
    expect(r.output).toBe("ab");
  });

  it("pauses again when only part of the input was typed", () => {
    const r = simulate(ECHO, { input: "a", waitForInput: true });
    expect(r.reason).toBe("waiting-input");
    expect(r.output).toBe("a");
  });
});

describe("terminalView", () => {
  const run = simulate(ECHO, { input: "abc", waitForInput: true });
  const all = run.steps.length;

  it("echoes a typed line in full, with a line break, where the program first reads it", () => {
    expect(terminalView(run.steps, all, ["abc"]).text).toBe("abc\nab");
  });

  it("echoes each line at the step that starts reading it", () => {
    const two = simulate(ECHO, { input: "ab", waitForInput: true });
    expect(terminalView(two.steps, two.steps.length, ["a", "b"]).text).toBe("a\na" + "b\nb");
  });

  it("shows only what has happened up to the chosen step", () => {
    expect(terminalView(run.steps, 0, ["abc"])).toEqual({ text: "", pending: ["abc"] });
    const afterFirstRead = run.steps.findIndex((s) => s.input !== undefined) + 1;
    expect(terminalView(run.steps, afterFirstRead, ["abc"])).toEqual({ text: "abc\n", pending: [] });
  });

  it("keeps lines the program has not started reading as pending", () => {
    expect(terminalView(run.steps, all, ["abc", "xyz"]).pending).toEqual(["xyz"]);
  });
});

describe("terminalEnd", () => {
  beforeAll(() => setLang("en"));

  it("says how the run ended once the last step is shown", () => {
    expect(terminalEnd("halted", undefined, 5, 5)).toEqual({ kind: "halted", text: "Program ended" });
    expect(terminalEnd("max-steps", undefined, 5, 5)?.kind).toBe("max-steps");
    expect(terminalEnd("error", "Divide error: division by zero", 5, 5)).toEqual({ kind: "error", text: "Stopped by an error: Divide error: division by zero" });
  });

  it("says nothing while steps remain or the program waits for input", () => {
    expect(terminalEnd("halted", undefined, 4, 5)).toBeUndefined();
    expect(terminalEnd("waiting-input", undefined, 5, 5)).toBeUndefined();
  });
});

describe("F10 while the program waits for input", () => {
  const SRC = `EOI EQU 20H
IMR EQU 21H
INT0 EQU 24H
        ORG 40
IP_F10  DW RUT
        ORG 1000H
BUF     DB ?
CONT    DB 0
        ORG 2000H
        CLI
        MOV AL, 0FEH
        OUT IMR, AL
        MOV AL, 10
        OUT INT0, AL
        STI
        MOV BX, OFFSET BUF
        INT 6
        INT 0
        ORG 3000H
RUT:    PUSH AX
        INC CONT
        MOV AL, EOI
        OUT EOI, AL
        POP AX
        IRET
        END`;

  it("is served before the pending INT 6, and the program keeps waiting", () => {
    const waiting = simulate(SRC, { waitForInput: true });
    expect(waiting.reason).toBe("waiting-input");
    const pressed = simulate(SRC, { waitForInput: true, irqEvents: [{ step: waiting.steps.length + 1, line: 0 }] });
    expect(pressed.reason).toBe("waiting-input");
    expect(pressed.steps.filter((s) => s.kind === "irq")).toHaveLength(1);
    expect(pressed.steps.length).toBeGreaterThan(waiting.steps.length);
  });

  it("lets the program finish once the input arrives", () => {
    const first = simulate(SRC, { waitForInput: true });
    const done = simulate(SRC, { waitForInput: true, input: "a", irqEvents: [{ step: first.steps.length + 1, line: 0 }] });
    expect(done.reason).toBe("halted");
  });
});

describe("terminalView with a cleared terminal", () => {
  it("drops what was printed before a step that cleared it", () => {
    const steps = [{ output: "a" }, { output: "b" }, { clear: true }, { output: "c" }];
    expect(terminalView(steps, 2, []).text).toBe("ab");
    expect(terminalView(steps, 4, []).text).toBe("c");
  });
});
