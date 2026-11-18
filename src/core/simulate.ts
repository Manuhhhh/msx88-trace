import { assemble } from "./assembler";
import { Cpu, CpuError } from "./cpu";
import type { RunResult, TraceStep } from "./cpu";
import { Pic } from "./pic";
import type { Program } from "./types";

/** Raise PIC line `line` right before step number `step` (1-based) executes. */
export interface IrqEvent {
  step: number;
  line: number;
}

export interface SimOptions {
  /** Characters consumed by INT 6. */
  input?: string;
  random?: (max: number) => number;
  maxSteps?: number;
  /** External events, e.g. F10 presses (line 0) or timer ticks (line 1). */
  irqEvents?: IrqEvent[];
}

export interface SimResult extends RunResult {
  program: Program;
  output: string;
  cpu: Cpu;
}

/** Assembles `source` and runs it with a PIC attached, returning the full trace. AsmError propagates. */
export function simulate(source: string, opts: SimOptions = {}): SimResult {
  const program = assemble(source);
  const pic = new Pic();
  const cpu = new Cpu(program, {
    bus: pic,
    interruptPoll: () => pic.poll(),
    deviceState: () => pic.state(),
    input: opts.input,
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
    } catch (e) {
      if (!(e instanceof CpuError)) throw e;
      reason = "error";
      error = e.message;
      break;
    }
  }
  return { program, steps, reason, error, output: cpu.output, cpu };
}
