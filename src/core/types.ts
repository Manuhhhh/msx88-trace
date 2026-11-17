export type Reg8 = "AL" | "AH" | "BL" | "BH" | "CL" | "CH" | "DL" | "DH";
export type Reg16 = "AX" | "BX" | "CX" | "DX" | "SI" | "DI" | "BP" | "SP";
export type Reg = Reg8 | Reg16;
export type Width = 8 | 16;
export type IndexReg = "BX" | "SI" | "DI" | "BP";

export type Operand =
  | { kind: "reg"; reg: Reg }
  | { kind: "imm"; value: number }
  | { kind: "mem"; addr: number; width?: Width }
  | { kind: "memReg"; base: IndexReg; width?: Width };

export type MemOperand = Extract<Operand, { kind: "mem" | "memReg" }>;

export interface Instr {
  addr: number;
  size: number;
  mnemonic: string;
  operands: Operand[];
  /** Source line number (1-based). */
  line: number;
  /** Instruction text as written, without label or comment. */
  text: string;
}

export interface Sym {
  kind: "const" | "data" | "code";
  value: number;
  width?: Width;
  defined: boolean;
}

export interface Program {
  /** Instructions by start address. */
  instrs: Map<number, Instr>;
  /** Initial memory image (data from DB/DW). */
  memory: Uint8Array;
  symbols: Map<string, Sym>;
  /** Address of the first instruction in source order. */
  entry: number;
}

export class AsmError extends Error {
  line: number;
  constructor(message: string, line: number) {
    super(`Line ${line}: ${message}`);
    this.name = "AsmError";
    this.line = line;
  }
}
