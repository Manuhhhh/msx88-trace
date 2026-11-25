import { PlainBus } from "./cpu";
import type { Bus } from "./cpu";
import type { Width } from "./types";

// Port map and behaviour from the VonSim PIO documentation (https://vonsim.github.io/en/io/modules/pio.html).
export const PIO_PORTS = { PA: 0x30, PB: 0x31, CA: 0x32, CB: 0x33 } as const;

/**
 * 8255-style parallel port. In CA and CB a 1 bit makes that line an input and a 0 bit an output.
 * ASSUMPTION: nothing is wired to the lines, so an input line always reads 0, and an OUT to PA or PB
 * only changes the lines configured as outputs.
 * ASSUMPTION: CA and CB start at FFH (every line an input), like the real chip after a reset.
 */
export class Pio implements Bus {
  pa = 0;
  pb = 0;
  ca = 0xff;
  cb = 0xff;
  private other: Bus;

  constructor(other: Bus = new PlainBus()) {
    this.other = other;
  }

  state(): Record<string, number> {
    return { PA: this.pa, PB: this.pb, CA: this.ca, CB: this.cb };
  }

  in(port: number, width: Width): number {
    if (width === 16) return this.in(port, 8) | (this.in((port + 1) & 0xff, 8) << 8);
    switch (port) {
      case PIO_PORTS.PA: return this.pa;
      case PIO_PORTS.PB: return this.pb;
      case PIO_PORTS.CA: return this.ca;
      case PIO_PORTS.CB: return this.cb;
      default: return this.other.in(port, width);
    }
  }

  out(port: number, width: Width, value: number): void {
    if (width === 16) {
      this.out(port, 8, value & 0xff);
      this.out((port + 1) & 0xff, 8, (value >> 8) & 0xff);
      return;
    }
    const v = value & 0xff;
    switch (port) {
      case PIO_PORTS.PA:
        this.pa = v & ~this.ca & 0xff;
        break;
      case PIO_PORTS.PB:
        this.pb = v & ~this.cb & 0xff;
        break;
      case PIO_PORTS.CA:
        this.ca = v;
        this.pa &= ~v & 0xff; // lines turned into inputs stop driving their value
        break;
      case PIO_PORTS.CB:
        this.cb = v;
        this.pb &= ~v & 0xff;
        break;
      default:
        this.other.out(port, width, value);
    }
  }
}
