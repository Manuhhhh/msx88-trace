/** Fewest and most steps per second a live run may be asked for, and the rate it starts with. */
export const MIN_RATE = 1;
export const MAX_RATE = 5000;
export const DEFAULT_RATE = 200;

/** A usable steps-per-second value from anything (a typed field, a shared link). */
export function liveRate(value: unknown): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.min(MAX_RATE, Math.max(MIN_RATE, n)) : DEFAULT_RATE;
}

/** What a run needs to be driven live: advance a few steps, and say whether it can still go on. */
export interface LiveRun {
  advance(count: number): void;
  readonly status: string;
}

const TICK_MS = 100;
/** A tab that was asleep must not make up the time it missed in one burst. */
const MAX_CATCH_UP_MS = 250;

/**
 * How many whole steps `rate` steps per second allows after `elapsedMs`, plus the fraction left over to carry into the
 * next tick so the average rate stays exact.
 */
export function stepBudget(rate: number, elapsedMs: number, carry = 0): { steps: number; carry: number } {
  const owed = (rate * Math.min(elapsedMs, MAX_CATCH_UP_MS)) / 1000 + carry;
  const steps = Math.floor(owed);
  return { steps, carry: owed - steps };
}

export interface Driver {
  /** Starts ticking again, e.g. after the run was given input. A run that is not "running" is left alone. */
  resume(): void;
  /** Stops ticking; the run itself is untouched. */
  halt(): void;
}

/** Advances `run` at most `rate` steps per second, calling `onTick` after each batch, until it is no longer "running". */
export function drive(run: LiveRun, rate: number, onTick: () => void): Driver {
  let timer: number | undefined;
  let last = 0;
  let carry = 0;

  const halt = (): void => {
    if (timer !== undefined) window.clearInterval(timer);
    timer = undefined;
  };
  const tick = (): void => {
    const now = performance.now();
    const budget = stepBudget(rate, now - last, carry);
    last = now;
    carry = budget.carry;
    if (budget.steps > 0) run.advance(budget.steps);
    onTick();
    if (run.status !== "running") halt();
  };
  const resume = (): void => {
    if (timer !== undefined || run.status !== "running") return;
    last = performance.now();
    carry = 0;
    timer = window.setInterval(tick, TICK_MS);
  };
  resume();
  return { resume, halt };
}
