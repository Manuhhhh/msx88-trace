import { PlainBus } from "./cpu";
import type { Bus } from "./cpu";
import type { Width } from "./types";

// Port map and behaviour from the VonSim PIC documentation (8259A with modifications).
export const PIC_PORTS = { EOI: 0x20, IMR: 0x21, IRR: 0x22, ISR: 0x23, INT0: 0x24, INT7: 0x2b } as const;

/** Devices wired to the PIC lines. INT3..INT7 are not connected. */
export const LINE_NAMES: Record<number, string> = { 0: "F10", 1: "Timer", 2: "Handshake" };

export interface AcceptedInterrupt {
  vector: number;
  label: string;
}

export class Pic implements Bus {
  // ASSUMPTION: IMR starts fully masked and the INTn vector registers start at 0
  // (reset values are not documented in the sources read).
  imr = 0xff;
  irr = 0;
  isr = 0;
  readonly vectors = new Uint8Array(8);
  private other: Bus;

  constructor(other: Bus = new PlainBus()) {
    this.other = other;
  }

  /** A device raises line `n` (0..7): the request is latched in IRR. */
  raise(line: number): void {
    if (line < 0 || line > 7) throw new RangeError(`PIC line out of range: ${line}`);
    this.irr |= 1 << line;
  }

  /**
   * Called by the CPU while IF=1. No nesting: nothing is sent while a line is
   * in service. Lower line number = higher priority. Accepting moves IRR -> ISR.
   */
  poll(): AcceptedInterrupt | null {
    if (this.isr !== 0) return null;
    const pending = this.irr & ~this.imr & 0xff;
    if (pending === 0) return null;
    const line = lowestBit(pending);
    this.irr &= ~(1 << line);
    this.isr |= 1 << line;
    const vector = this.vectors[line];
    const dev = LINE_NAMES[line];
    return { vector, label: `PIC INT${line}${dev ? ` (${dev})` : ""} → vector ${vector}` };
  }

  state(): Record<string, number> {
    return { IMR: this.imr, IRR: this.irr, ISR: this.isr };
  }

  private isPicPort(port: number): boolean {
    return port >= PIC_PORTS.EOI && port <= PIC_PORTS.INT7;
  }

  in(port: number, width: Width): number {
    if (width === 16) return this.in(port, 8) | (this.in((port + 1) & 0xff, 8) << 8);
    if (!this.isPicPort(port)) return this.other.in(port, width);
    switch (port) {
      case PIC_PORTS.EOI: return 0;
      case PIC_PORTS.IMR: return this.imr;
      case PIC_PORTS.IRR: return this.irr;
      case PIC_PORTS.ISR: return this.isr;
      default: return this.vectors[port - PIC_PORTS.INT0];
    }
  }

  out(port: number, width: Width, value: number): void {
    if (width === 16) {
      this.out(port, 8, value & 0xff);
      this.out((port + 1) & 0xff, 8, (value >> 8) & 0xff);
      return;
    }
    if (!this.isPicPort(port)) {
      this.other.out(port, width, value);
      return;
    }
    switch (port) {
      case PIC_PORTS.EOI:
        // Writing 20h releases the line in service.
        if ((value & 0xff) === 0x20 && this.isr !== 0) this.isr &= ~(1 << lowestBit(this.isr));
        break;
      case PIC_PORTS.IMR:
        this.imr = value & 0xff;
        break;
      case PIC_PORTS.IRR:
      case PIC_PORTS.ISR:
        break; // read-only for the CPU
      default:
        this.vectors[port - PIC_PORTS.INT0] = value & 0xff;
    }
  }
}

function lowestBit(v: number): number {
  let n = 0;
  while (((v >> n) & 1) === 0) n++;
  return n;
}
