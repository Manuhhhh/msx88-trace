import { assemble } from "./assembler";
import { Cpu, CpuError, InputWait } from "./cpu";
import type { RunResult, TraceStep } from "./cpu";
import { Pic } from "./pic";
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

/** Assembles `source` and runs it with a PIC attached, returning the full trace. AsmError propagates. */
export function simulate(source: string, opts: SimOptions = {}): SimResult {
  const program = assemble(source);
  const timer = new Timer(() => pic.raise(TIMER_LINE), opts.stepsPerSecond);
  const pic: Pic = new Pic(timer);
  const cpu = new Cpu(program, {
    bus: pic,
    interruptPoll: () => pic.poll(),
    deviceState: () => pic.state(),
    input: opts.input,
    waitForInput: opts.waitForInput,
    random: opts.random,
  });
  const events = [...(opts.irqEvents ?? [])].sort((a, b) => a.step - b.step);
  const maxSteps = opts.maxSteps ?? 10_000;
  const steps: TraceStep[] = [];
  let reason: RunResult["reason"] = "halted";
  let error: string | undefined;

  while (!cpu.halted) {
    if (steps.length >= maxSteps) {
      reason = "max-steps";
      break;
    }
    while (events.length > 0 && events[0].step <= steps.length + 1) pic.raise(events.shift()!.line);
    try {
      steps.push(cpu.step());
      timer.advance();
    } catch (e) {
      if (e instanceof InputWait) {
        reason = "waiting-input";
        break;
      }
      if (!(e instanceof CpuError)) throw e;
      reason = "error";
      error = e.message;
      break;
    }
  }
  return { program, steps, reason, error, output: cpu.output, cpu };
}
