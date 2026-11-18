import { PlainBus } from "./cpu";
import type { Bus } from "./cpu";
import type { Width } from "./types";

// Port map and behaviour from the VonSim timer documentation (https://vonsim.github.io/en/io/modules/timer.html).
export const TIMER_PORTS = { CONT: 0x10, COMP: 0x11 } as const;

/** PIC line the timer raises when CONT matches COMP. */
export const TIMER_LINE = 1;

// ASSUMPTION: the simulator has no wall clock, so one second of the real clock is
// modelled as this many executed steps (instructions or accepted interrupts).
export const DEFAULT_STEPS_PER_SECOND = 100;

export class Timer implements Bus {
  cont = 0;
  comp = 0;
  /** The docs: it starts counting after the first write to CONT. */
  started = false;
  private elapsed = 0;
  private onMatch: () => void;
  private stepsPerSecond: number;
  private other: Bus;

  constructor(onMatch: () => void, stepsPerSecond: number = DEFAULT_STEPS_PER_SECOND, other: Bus = new PlainBus()) {
    if (!Number.isInteger(stepsPerSecond) || stepsPerSecond < 1) {
      throw new RangeError(`stepsPerSecond must be a positive integer: ${stepsPerSecond}`);
    }
    this.onMatch = onMatch;
    this.stepsPerSecond = stepsPerSecond;
    this.other = other;
  }

  /** One step of the CPU has passed. Every `stepsPerSecond` steps the clock ticks. */
  advance(): void {
    if (!this.started) return;
    if (++this.elapsed < this.stepsPerSecond) return;
    this.elapsed = 0;
    this.cont = (this.cont + 1) & 0xff; // ASSUMPTION: CONT wraps at 8 bits (not documented)
    if (this.cont === this.comp) this.onMatch();
  }

  in(port: number, width: Width): number {
    if (width === 16) return this.in(port, 8) | (this.in((port + 1) & 0xff, 8) << 8);
    switch (port) {
      case TIMER_PORTS.CONT: return this.cont;
      case TIMER_PORTS.COMP: return this.comp;
      default: return this.other.in(port, width);
    }
  }

  out(port: number, width: Width, value: number): void {
    if (width === 16) {
      this.out(port, 8, value & 0xff);
      this.out((port + 1) & 0xff, 8, (value >> 8) & 0xff);
      return;
    }
    switch (port) {
      case TIMER_PORTS.CONT:
        this.cont = value & 0xff;
        this.started = true;
        this.elapsed = 0; // ASSUMPTION: writing CONT restarts the current second
        break;
      case TIMER_PORTS.COMP:
        this.comp = value & 0xff;
        break;
      default:
        this.other.out(port, width, value);
    }
  }
}
