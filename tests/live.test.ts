import { describe, expect, it } from "vitest";
import { MipsSimulation, simulateMips } from "../src/mips/sim";
import { Simulation, simulate } from "../src/core/simulate";
import { decodeMipsState, encodeMipsState } from "../src/mips/share";
import { DEFAULT_RATE, MAX_RATE, liveRate, stepBudget } from "../src/ui/live";
import { decodeState, encodeState } from "../src/ui/share";

const LOOP = "ORG 2000H\nL: INC AX\nJMP L\nEND";
const READ = `BUF DB ?
ORG 2000H
MOV BX, OFFSET BUF
INT 6
INT 6
INT 0
END`;

// enables the F10 line, then waits for one character
const F10_READ = `EOI EQU 20H
IMR EQU 21H
INT0 EQU 24H
        ORG 40
IP_F10  DW RUT
        ORG 1000H
BUF     DB ?
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
        MOV AL, EOI
        OUT EOI, AL
        POP AX
        IRET
        END`;

describe("Simulation", () => {
  it("advanced in small batches it gives the same run as simulate()", () => {
    const whole = simulate(READ, { input: "ab" });
    const sim = new Simulation(READ, { input: "ab" });
    while (sim.status === "running") sim.advance(2);
    expect(sim.status).toBe("halted");
    expect(sim.steps).toEqual(whole.steps);
  });

  it("never stops by count without a limit, and keeps its steps list live", () => {
    const sim = new Simulation(LOOP, { maxSteps: Infinity });
    const steps = sim.steps;
    sim.advance(50);
    sim.advance(50);
    expect(sim.status).toBe("running");
    expect(steps).toHaveLength(100);
  });

  it("stops with max-steps at its limit", () => {
    const sim = new Simulation(LOOP, { maxSteps: 7 });
    sim.advance();
    expect(sim.status).toBe("max-steps");
    expect(sim.steps).toHaveLength(7);
  });

  it("can be stopped, and stays stopped", () => {
    const sim = new Simulation(LOOP, { maxSteps: Infinity });
    sim.advance(5);
    sim.stop();
    sim.advance(5);
    expect(sim.status).toBe("stopped");
    expect(sim.steps).toHaveLength(5);
  });

  it("waits on INT 6 without moving, and carries on from the same INT 6 once fed", () => {
    const sim = new Simulation(READ, { waitForInput: true });
    sim.advance();
    expect(sim.status).toBe("waiting-input");
    const waitingAt = sim.steps.length;
    const ip = sim.cpu.ip;
    sim.advance(10); // nothing to do while waiting
    expect(sim.steps).toHaveLength(waitingAt);
    sim.feed("a");
    sim.advance();
    expect(sim.status).toBe("waiting-input");
    expect(sim.steps).toHaveLength(waitingAt + 1);
    expect(sim.cpu.ip).not.toBe(ip);
    sim.feed("b");
    sim.advance();
    expect(sim.status).toBe("halted");
    // the run that was paused and fed equals the one that had the input from the start
    expect(sim.steps).toEqual(simulate(READ, { input: "ab", waitForInput: true }).steps);
  });

  it("takes an interrupt added while it waits, then goes on waiting", () => {
    const sim = new Simulation(F10_READ, { waitForInput: true });
    sim.advance();
    const n = sim.steps.length;
    sim.addEvent({ step: n + 1, line: 0 });
    sim.resume();
    sim.advance();
    expect(sim.steps[n]?.kind).toBe("irq");
    expect(sim.status).toBe("waiting-input");
  });
});

describe("MipsSimulation", () => {
  const MIPS_LOOP = ".text\nL: daddi r1, r1, 1\nj L\nnop\n";

  it("matches simulateMips when advanced in batches", () => {
    const src = ".text\ndaddi r1, r0, 3\nhalt\n";
    const whole = simulateMips(src);
    const sim = new MipsSimulation(src);
    while (sim.status === "running") sim.advance(1);
    expect(sim.steps).toEqual(whole.steps);
    expect(sim.status).toBe(whole.reason);
  });

  it("runs without a limit until stopped", () => {
    const sim = new MipsSimulation(MIPS_LOOP, { maxSteps: Infinity });
    sim.advance(300);
    expect(sim.status).toBe("running");
    sim.stop();
    expect(sim.result().reason).toBe("stopped");
  });
});

describe("pacing", () => {
  it("allows the steps owed for the elapsed time and carries the fraction", () => {
    expect(stepBudget(200, 100)).toEqual({ steps: 20, carry: 0 });
    const a = stepBudget(15, 100); // 1.5 steps
    expect(a.steps).toBe(1);
    expect(stepBudget(15, 100, a.carry).steps).toBe(2);
  });

  it("does not make up a long pause in one burst", () => {
    expect(stepBudget(200, 60_000).steps).toBe(50);
  });

  it("keeps the rate inside its bounds and falls back to the default", () => {
    expect(liveRate(0)).toBe(1);
    expect(liveRate(10 ** 9)).toBe(MAX_RATE);
    expect(liveRate("abc")).toBe(DEFAULT_RATE);
    expect(liveRate(250.9)).toBe(250);
  });
});

describe("shared links with no step limit", () => {
  it("round-trips the live settings and leaves them out when off", () => {
    const base = { source: "INT 0", input: "", maxSteps: 2000, events: [] };
    const on = { ...base, unlimited: true, stepsPerSecond: 300 };
    expect(decodeState(encodeState(on))).toEqual(on);
    expect(decodeState(encodeState(base))).toEqual(base);
    const mips = { source: "x", maxSteps: 50, forwarding: true };
    expect(decodeMipsState(encodeMipsState({ ...mips, unlimited: true, stepsPerSecond: 40 }))).toEqual({ ...mips, unlimited: true, stepsPerSecond: 40 });
    expect(decodeMipsState(encodeMipsState(mips))).toEqual(mips);
  });
});
