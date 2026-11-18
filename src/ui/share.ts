import type { IrqEvent } from "../core/simulate";

/** Everything needed to reproduce a trace; lives in the URL hash so a link shares the run. */
export interface ShareState {
  source: string;
  input: string;
  maxSteps: number;
  events: IrqEvent[];
}

const toBase64Url = (bytes: Uint8Array): string => {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (s: string): Uint8Array => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

export function encodeState(state: ShareState): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(state)));
}

/** Returns null for anything that is not a valid state, never throws. */
export function decodeState(encoded: string): ShareState | null {
  try {
    const raw: unknown = JSON.parse(new TextDecoder().decode(fromBase64Url(encoded)));
    if (typeof raw !== "object" || raw === null) return null;
    const s = raw as Record<string, unknown>;
    if (typeof s.source !== "string" || typeof s.input !== "string") return null;
    if (typeof s.maxSteps !== "number" || !Number.isInteger(s.maxSteps) || s.maxSteps < 1) return null;
    if (!Array.isArray(s.events)) return null;
    const events: IrqEvent[] = [];
    for (const e of s.events) {
      const ev = e as Record<string, unknown>;
      if (
        typeof ev?.step !== "number" || !Number.isInteger(ev.step) || ev.step < 1 ||
        typeof ev.line !== "number" || !Number.isInteger(ev.line) || ev.line < 0 || ev.line > 7
      ) {
        return null;
      }
      events.push({ step: ev.step, line: ev.line });
    }
    return { source: s.source, input: s.input, maxSteps: s.maxSteps, events };
  } catch {
    return null;
  }
}
