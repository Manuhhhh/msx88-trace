import { assemble } from "./assembler";
import { Cpu, CpuError, InputWait } from "./cpu";
import type { RunResult, TraceStep } from "./cpu";
import { Pic } from "./pic";
import { Pio } from "./pio";
import { Timer, TIMER_LINE } from "./timer";
import type { Program } from "./types";

/** Raise PIC line `line` right before step number `step` (1-based) executes. */
export interface IrqEvent {
  step: number;
  line: number;
}

export interface SimOptions {
  /** Characters consumed by INT 6. */
  input?: string;
  /** Pause with reason "waiting-input" when INT 6 finds the buffer empty, instead of failing. */
  waitForInput?: boolean;
  random?: (max: number) => number;
  /** Stop with reason "max-steps" after this many steps. Infinity (or leaving it out in a Simulation) never stops by count. */
  maxSteps?: number;
  /** External events, e.g. F10 presses (line 0) or timer ticks (line 1). */
  irqEvents?: IrqEvent[];
  /** How many executed steps make one second of the timer clock. Defaults to 100. */
  stepsPerSecond?: number;
}

export interface SimResult extends RunResult {
  program: Program;
  output: string;
  cpu: Cpu;
}

/**
 * A run that can be advanced a few steps at a time, paused for input, given more input or interrupts, and stopped.
 * `steps` is the live list: it grows as the run advances.
 */
export class Simulation {
  readonly program: Program;
  readonly cpu: Cpu;
  readonly steps: TraceStep[] = [];
  /** "running" while it can still advance; otherwise how it ended or why it is paused. */
  status: SimResult["reason"] = "running";
  error?: string;
  private readonly pic: Pic;
  private readonly timer: Timer;
  private readonly pio = new Pio();
  private readonly events: IrqEvent[];
  private readonly maxSteps: number;

  /** Assembles `source`; AsmError propagates. */
  constructor(source: string, opts: SimOptions = {}) {
    this.program = assemble(source);
    this.timer = new Timer(() => this.pic.raise(TIMER_LINE), opts.stepsPerSecond, this.pio);
    this.pic = new Pic(this.timer);
    this.cpu = new Cpu(this.program, {
      bus: this.pic,
      interruptPoll: () => this.pic.poll(),
      deviceState: () => this.pic.state(),
      portState: () => this.pio.state(),
      input: opts.input,
      waitForInput: opts.waitForInput,
      random: opts.random,
    });
    this.events = [...(opts.irqEvents ?? [])].sort((a, b) => a.step - b.step);
    this.maxSteps = opts.maxSteps ?? 10_000;
  }

  /** Runs up to `count` more steps, stopping early when the run ends or pauses. */
  advance(count = Infinity): void {
    for (let i = 0; i < count && this.status === "running"; i++) {
      if (this.cpu.halted) {
        this.status = "halted";
        break;
      }
      if (this.steps.length >= this.maxSteps) {
        this.status = "max-steps";
        break;
      }
      while (this.events.length > 0 && this.events[0].step <= this.steps.length + 1) this.pic.raise(this.events.shift()!.line);
      try {
        this.steps.push(this.cpu.step());
        this.timer.advance();
      } catch (e) {
        if (e instanceof InputWait) {
          this.status = "waiting-input";
        } else if (e instanceof CpuError) {
          this.status = "error";
          this.error = e.message;
        } else {
          throw e;
        }
      }
    }
    if (this.status === "running" && this.cpu.halted) this.status = "halted";
  }

  /** Makes a paused run try again: after more input, or after an interrupt that may be served first. */
  resume(): void {
    if (this.status === "waiting-input") this.status = "running";
  }

  /** Adds characters to the input buffer and lets a run that was waiting for them carry on. */
  feed(text: string): void {
    this.cpu.feed(text);
    this.resume();
  }

  /** Raises a PIC line before step number `step` (1-based), like an `irqEvents` entry. */
  addEvent(ev: IrqEvent): void {
    this.events.push(ev);
    this.events.sort((a, b) => a.step - b.step);
  }

  /** Ends a run that was still going or waiting. */
  stop(): void {
    if (this.status === "running" || this.status === "waiting-input") this.status = "stopped";
  }

  /** The run so far; `steps` is shared with the simulation. */
  result(): SimResult {
    return { program: this.program, steps: this.steps, reason: this.status, error: this.error, output: this.cpu.output, cpu: this.cpu };
  }
}

/** Assembles `source` and runs it with a PIC attached, returning the full trace. AsmError propagates. */
export function simulate(source: string, opts: SimOptions = {}): SimResult {
  const sim = new Simulation(source, opts);
  sim.advance();
  return sim.result();
}
