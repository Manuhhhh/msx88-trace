import type { Lang } from "./i18n";
import type { ManualDoc } from "./manual";

/** A text in both languages. */
interface L {
  en: string;
  es: string;
}
const l = (en: string, es: string): L => ({ en, es });

export interface MipsManualEntry {
  /** Every mnemonic this row documents (checked against the instruction set by the tests). */
  covers: string[];
  syntax: string;
  /** One line that assembles as written, after a label `L:` that points at the line itself and the data symbol `VAL`. */
  example: string;
  effect: L;
}

export interface MipsManualGroup {
  id: string;
  title: L;
  intro?: L;
  entries: MipsManualEntry[];
}

export const MIPS_MANUAL: MipsManualGroup[] = [
  {
    id: "arith",
    title: l("Arithmetic", "Aritmética"),
    intro: l(
      "Every register is 64 bits wide. The instructions without a trailing <code>u</code> stop the program with “Integer overflow” when the result does not fit in a signed 64-bit number; the <code>u</code> forms wrap around instead.",
      "Todos los registros son de 64 bits. Las instrucciones sin <code>u</code> al final detienen el programa con “Integer overflow” cuando el resultado no entra en un número de 64 bits con signo; las que tienen <code>u</code> dan la vuelta sin error.",
    ),
    entries: [
      {
        covers: ["dadd"],
        syntax: "dadd rd, rs, rt",
        example: "dadd r3, r1, r2",
        effect: l("rd = rs + rt. Stops with an error on signed overflow.", "rd = rs + rt. Se detiene con un error si hay desborde con signo."),
      },
      {
        covers: ["daddu"],
        syntax: "daddu rd, rs, rt",
        example: "daddu r3, r1, r2",
        effect: l("rd = rs + rt, wrapping around on overflow.", "rd = rs + rt, dando la vuelta si hay desborde."),
      },
      {
        covers: ["dsub"],
        syntax: "dsub rd, rs, rt",
        example: "dsub r3, r1, r2",
        effect: l("rd = rs - rt. Stops with an error on signed overflow.", "rd = rs - rt. Se detiene con un error si hay desborde con signo."),
      },
      {
        covers: ["dsubu"],
        syntax: "dsubu rd, rs, rt",
        example: "dsubu r3, r1, r2",
        effect: l("rd = rs - rt, wrapping around on overflow.", "rd = rs - rt, dando la vuelta si hay desborde."),
      },
      {
        covers: ["daddi"],
        syntax: "daddi rt, rs, imm",
        example: "daddi r1, r0, 5",
        effect: l(
          "rt = rs + imm, with imm a signed 16-bit number. <code>daddi r1, r0, 5</code> is the usual way to load a small constant. Stops with an error on overflow.",
          "rt = rs + imm, con imm un número de 16 bits con signo. <code>daddi r1, r0, 5</code> es la forma habitual de cargar una constante chica. Se detiene con un error si hay desborde.",
        ),
      },
      {
        covers: ["daddiu"],
        syntax: "daddiu rt, rs, imm",
        example: "daddiu r1, r0, 5",
        effect: l("Same as daddi but wraps around on overflow.", "Igual que daddi pero da la vuelta si hay desborde."),
      },
      {
        covers: ["dmul", "dmulu"],
        syntax: "dmul rd, rs, rt",
        example: "dmul r3, r1, r2",
        effect: l(
          "rd = the low 64 bits of rs × rt. <code>dmulu</code> is the same instruction.",
          "rd = los 64 bits bajos de rs × rt. <code>dmulu</code> es la misma instrucción.",
        ),
      },
      {
        covers: ["ddiv"],
        syntax: "ddiv rs, rt",
        example: "ddiv r1, r2",
        effect: l(
          "Signed division: LO = rs / rt (the quotient) and HI = rs % rt (the remainder). Read them with <code>mflo</code> and <code>mfhi</code>. Dividing by zero stops the program.",
          "División con signo: LO = rs / rt (el cociente) y HI = rs % rt (el resto). Se leen con <code>mflo</code> y <code>mfhi</code>. Dividir por cero detiene el programa.",
        ),
      },
      {
        covers: ["ddivu"],
        syntax: "ddivu rs, rt",
        example: "ddivu r1, r2",
        effect: l("Same as ddiv, treating both values as unsigned.", "Igual que ddiv, pero tratando los dos valores como sin signo."),
      },
      {
        covers: ["mflo"],
        syntax: "mflo rd",
        example: "mflo r3",
        effect: l("rd = LO, the quotient of the last division.", "rd = LO, el cociente de la última división."),
      },
      {
        covers: ["mfhi"],
        syntax: "mfhi rd",
        example: "mfhi r3",
        effect: l("rd = HI, the remainder of the last division.", "rd = HI, el resto de la última división."),
      },
    ],
  },
  {
    id: "logic",
    title: l("Logic and comparison", "Lógica y comparación"),
    entries: [
      {
        covers: ["and"],
        syntax: "and rd, rs, rt",
        example: "and r3, r1, r2",
        effect: l("rd = rs AND rt, bit by bit.", "rd = rs AND rt, bit a bit."),
      },
      {
        covers: ["or"],
        syntax: "or rd, rs, rt",
        example: "or r3, r1, r2",
        effect: l("rd = rs OR rt, bit by bit. <code>or r1, r2, r0</code> copies r2 into r1.", "rd = rs OR rt, bit a bit. <code>or r1, r2, r0</code> copia r2 en r1."),
      },
      {
        covers: ["xor"],
        syntax: "xor rd, rs, rt",
        example: "xor r3, r1, r2",
        effect: l("rd = rs XOR rt, bit by bit. <code>xor r1, r1, r1</code> clears r1.", "rd = rs XOR rt, bit a bit. <code>xor r1, r1, r1</code> deja r1 en 0."),
      },
      {
        covers: ["nor"],
        syntax: "nor rd, rs, rt",
        example: "nor r3, r1, r2",
        effect: l("rd = NOT (rs OR rt), bit by bit.", "rd = NOT (rs OR rt), bit a bit."),
      },
      {
        covers: ["andi"],
        syntax: "andi rt, rs, imm",
        example: "andi r1, r2, 255",
        effect: l(
          "rt = rs AND imm. The 16-bit imm is taken as a positive number, not sign-extended.",
          "rt = rs AND imm. El imm de 16 bits se toma como un número positivo, sin extender el signo.",
        ),
      },
      {
        covers: ["ori"],
        syntax: "ori rt, rs, imm",
        example: "ori r1, r2, 255",
        effect: l("rt = rs OR imm, with imm taken as a positive 16-bit number.", "rt = rs OR imm, con imm tomado como un número positivo de 16 bits."),
      },
      {
        covers: ["xori"],
        syntax: "xori rt, rs, imm",
        example: "xori r1, r2, 255",
        effect: l("rt = rs XOR imm, with imm taken as a positive 16-bit number.", "rt = rs XOR imm, con imm tomado como un número positivo de 16 bits."),
      },
      {
        covers: ["slt"],
        syntax: "slt rd, rs, rt",
        example: "slt r3, r1, r2",
        effect: l("rd = 1 if rs < rt comparing as signed numbers, else 0.", "rd = 1 si rs < rt comparando con signo, si no 0."),
      },
      {
        covers: ["sltu"],
        syntax: "sltu rd, rs, rt",
        example: "sltu r3, r1, r2",
        effect: l("rd = 1 if rs < rt comparing as unsigned numbers, else 0.", "rd = 1 si rs < rt comparando sin signo, si no 0."),
      },
      {
        covers: ["slti"],
        syntax: "slti rt, rs, imm",
        example: "slti r1, r2, 10",
        effect: l("rt = 1 if rs < imm (signed), else 0.", "rt = 1 si rs < imm (con signo), si no 0."),
      },
      {
        covers: ["sltiu"],
        syntax: "sltiu rt, rs, imm",
        example: "sltiu r1, r2, 10",
        effect: l("rt = 1 if rs < imm comparing as unsigned numbers, else 0.", "rt = 1 si rs < imm comparando sin signo, si no 0."),
      },
      {
        covers: ["lui"],
        syntax: "lui rt, imm",
        example: "lui r1, 1",
        effect: l(
          "Loads imm into bits 16 to 31 of rt and clears the lower bits; the 32-bit result is sign-extended to 64 bits.",
          "Carga imm en los bits 16 a 31 de rt y deja en 0 los bits más bajos; el resultado de 32 bits se extiende con signo a 64.",
        ),
      },
    ],
  },
  {
    id: "shift",
    title: l("Shifts", "Desplazamientos"),
    intro: l(
      "The fixed shifts take an amount from 0 to 63. The variable ones read the amount from a register (only its low 6 bits count) and put the value to shift in the <em>second</em> operand: <code>dsllv rd, rt, rs</code>.",
      "Los desplazamientos fijos toman una cantidad de 0 a 63. Los variables leen la cantidad de un registro (solo cuentan sus 6 bits bajos) y el valor a desplazar va en el <em>segundo</em> operando: <code>dsllv rd, rt, rs</code>.",
    ),
    entries: [
      {
        covers: ["dsll"],
        syntax: "dsll rd, rt, sa",
        example: "dsll r3, r1, 2",
        effect: l("Shifts rt left by sa bits, filling with zeros. Each bit is a multiplication by 2.", "Desplaza rt a la izquierda sa bits, rellenando con ceros. Cada bit multiplica por 2."),
      },
      {
        covers: ["dsrl"],
        syntax: "dsrl rd, rt, sa",
        example: "dsrl r3, r1, 2",
        effect: l("Shifts rt right by sa bits, filling with zeros (logical shift).", "Desplaza rt a la derecha sa bits, rellenando con ceros (desplazamiento lógico)."),
      },
      {
        covers: ["dsra"],
        syntax: "dsra rd, rt, sa",
        example: "dsra r3, r1, 2",
        effect: l("Shifts rt right by sa bits keeping the sign (arithmetic shift).", "Desplaza rt a la derecha sa bits conservando el signo (desplazamiento aritmético)."),
      },
      {
        covers: ["dsllv"],
        syntax: "dsllv rd, rt, rs",
        example: "dsllv r3, r1, r2",
        effect: l("Like dsll, with the amount taken from rs.", "Como dsll, con la cantidad tomada de rs."),
      },
      {
        covers: ["dsrlv"],
        syntax: "dsrlv rd, rt, rs",
        example: "dsrlv r3, r1, r2",
        effect: l("Like dsrl, with the amount taken from rs.", "Como dsrl, con la cantidad tomada de rs."),
      },
      {
        covers: ["dsrav"],
        syntax: "dsrav rd, rt, rs",
        example: "dsrav r3, r1, r2",
        effect: l("Like dsra, with the amount taken from rs.", "Como dsra, con la cantidad tomada de rs."),
      },
    ],
  },
  {
    id: "memory",
    title: l("Loads and stores", "Cargas y almacenamientos"),
    intro: l(
      "The address is <code>offset(register)</code>: the register plus a signed 16-bit offset. The offset can be a number or the name of a data label, so <code>ld r1, n(r0)</code> reads the variable <code>n</code>. The address must be a multiple of the size accessed, otherwise the program stops with “Misaligned memory access”. Loads that start with <code>l</code> and have no <code>u</code> extend the sign; the <code>u</code> forms fill with zeros.",
      "La dirección es <code>desplazamiento(registro)</code>: el registro más un desplazamiento de 16 bits con signo. El desplazamiento puede ser un número o el nombre de una etiqueta de datos, así que <code>ld r1, n(r0)</code> lee la variable <code>n</code>. La dirección tiene que ser múltiplo del tamaño accedido; si no, el programa se detiene con “Misaligned memory access”. Las cargas sin <code>u</code> extienden el signo; las que tienen <code>u</code> rellenan con ceros.",
    ),
    entries: [
      {
        covers: ["lb"],
        syntax: "lb rt, offset(rs)",
        example: "lb r1, VAL(r0)",
        effect: l("Loads 1 byte into rt, extending its sign.", "Carga 1 byte en rt, extendiendo su signo."),
      },
      {
        covers: ["lbu"],
        syntax: "lbu rt, offset(rs)",
        example: "lbu r1, VAL(r0)",
        effect: l("Loads 1 byte into rt, filling with zeros.", "Carga 1 byte en rt, rellenando con ceros."),
      },
      {
        covers: ["lh"],
        syntax: "lh rt, offset(rs)",
        example: "lh r1, VAL(r0)",
        effect: l("Loads 2 bytes (a half word) into rt, extending the sign.", "Carga 2 bytes (media palabra) en rt, extendiendo el signo."),
      },
      {
        covers: ["lhu"],
        syntax: "lhu rt, offset(rs)",
        example: "lhu r1, VAL(r0)",
        effect: l("Loads 2 bytes into rt, filling with zeros.", "Carga 2 bytes en rt, rellenando con ceros."),
      },
      {
        covers: ["lw"],
        syntax: "lw rt, offset(rs)",
        example: "lw r1, VAL(r0)",
        effect: l("Loads 4 bytes (a word) into rt, extending the sign.", "Carga 4 bytes (una palabra) en rt, extendiendo el signo."),
      },
      {
        covers: ["lwu"],
        syntax: "lwu rt, offset(rs)",
        example: "lwu r1, VAL(r0)",
        effect: l("Loads 4 bytes into rt, filling with zeros.", "Carga 4 bytes en rt, rellenando con ceros."),
      },
      {
        covers: ["ld"],
        syntax: "ld rt, offset(rs)",
        example: "ld r1, VAL(r0)",
        effect: l("Loads 8 bytes (a double word) into rt.", "Carga 8 bytes (una palabra doble) en rt."),
      },
      {
        covers: ["sb"],
        syntax: "sb rt, offset(rs)",
        example: "sb r1, VAL(r0)",
        effect: l("Stores the lowest byte of rt.", "Guarda el byte más bajo de rt."),
      },
      {
        covers: ["sh"],
        syntax: "sh rt, offset(rs)",
        example: "sh r1, VAL(r0)",
        effect: l("Stores the lowest 2 bytes of rt.", "Guarda los 2 bytes más bajos de rt."),
      },
      {
        covers: ["sw"],
        syntax: "sw rt, offset(rs)",
        example: "sw r1, VAL(r0)",
        effect: l("Stores the lowest 4 bytes of rt.", "Guarda los 4 bytes más bajos de rt."),
      },
      {
        covers: ["sd"],
        syntax: "sd rt, offset(rs)",
        example: "sd r1, VAL(r0)",
        effect: l("Stores all 8 bytes of rt.", "Guarda los 8 bytes de rt."),
      },
    ],
  },
  {
    id: "control",
    title: l("Branches and jumps", "Saltos"),
    intro: l(
      "A branch or jump goes to a code label. The jumps through a register (<code>jr</code>, <code>jalr</code>) need an instruction address, a multiple of 4, such as the one <code>jal</code> leaves in r31.",
      "Un salto va a una etiqueta de código. Los saltos por registro (<code>jr</code>, <code>jalr</code>) necesitan una dirección de instrucción, múltiplo de 4, como la que <code>jal</code> deja en r31.",
    ),
    entries: [
      {
        covers: ["beq"],
        syntax: "beq rs, rt, label",
        example: "beq r1, r2, L",
        effect: l("Jumps to label when rs equals rt.", "Salta a label cuando rs es igual a rt."),
      },
      {
        covers: ["bne"],
        syntax: "bne rs, rt, label",
        example: "bne r1, r2, L",
        effect: l("Jumps to label when rs differs from rt.", "Salta a label cuando rs es distinto de rt."),
      },
      {
        covers: ["beqz"],
        syntax: "beqz rs, label",
        example: "beqz r1, L",
        effect: l("Jumps to label when rs is 0.", "Salta a label cuando rs vale 0."),
      },
      {
        covers: ["bnez"],
        syntax: "bnez rs, label",
        example: "bnez r1, L",
        effect: l("Jumps to label when rs is not 0. It closes most loops.", "Salta a label cuando rs no vale 0. Cierra la mayoría de los bucles."),
      },
      {
        covers: ["j", "b"],
        syntax: "j label",
        example: "j L",
        effect: l("Always jumps to label. <code>b</code> does the same.", "Salta siempre a label. <code>b</code> hace lo mismo."),
      },
      {
        covers: ["jal"],
        syntax: "jal label",
        example: "jal L",
        effect: l("Calls a subroutine: stores the address of the next instruction in r31 and jumps to label.", "Llama a una subrutina: guarda en r31 la dirección de la próxima instrucción y salta a label."),
      },
      {
        covers: ["jr"],
        syntax: "jr rs",
        example: "jr r31",
        effect: l("Jumps to the address in rs. <code>jr r31</code> returns from a subroutine.", "Salta a la dirección que tiene rs. <code>jr r31</code> vuelve de una subrutina."),
      },
      {
        covers: ["jalr"],
        syntax: "jalr rs",
        example: "jalr r2",
        effect: l("Like jal, but the destination is the address in rs.", "Como jal, pero el destino es la dirección que tiene rs."),
      },
    ],
  },
  {
    id: "system",
    title: l("System", "Sistema"),
    entries: [
      {
        covers: ["nop"],
        syntax: "nop",
        example: "nop",
        effect: l("Does nothing for one instruction.", "No hace nada durante una instrucción."),
      },
      {
        covers: ["halt"],
        syntax: "halt",
        example: "halt",
        effect: l("Ends the program.", "Termina el programa."),
      },
      {
        covers: ["syscall"],
        syntax: "syscall [number]",
        example: "syscall 0",
        effect: l(
          "Asks the simulator for a service. Without a number it is 0. See “Syscalls” below for the ones that work; any other number stops the program.",
          "Le pide un servicio al simulador. Sin número vale 0. Los que funcionan están en “Syscalls” más abajo; cualquier otro número detiene el programa.",
        ),
      },
    ],
  },
];

/** The syscall numbers the simulator handles. */
export const MIPS_SYSCALLS: { n: number; effect: L }[] = [
  { n: 0, effect: l("Ends the program, like halt.", "Termina el programa, igual que halt.") },
  {
    n: 5,
    effect: l(
      "printf. r14 holds the address of a block of 64-bit values: the first one is the address of the format string and the next ones are its arguments. <code>%d</code> and <code>%i</code> print a number, <code>%s</code> a string, <code>%c</code> a character and <code>%%</code> a percent sign. When it ends, r1 holds the number of characters printed.",
      "printf. r14 tiene la dirección de un bloque de valores de 64 bits: el primero es la dirección del texto de formato y los siguientes son sus argumentos. <code>%d</code> y <code>%i</code> imprimen un número, <code>%s</code> un texto, <code>%c</code> un carácter y <code>%%</code> un signo de porcentaje. Al terminar, r1 tiene la cantidad de caracteres impresos.",
    ),
  },
];

const OPERANDS: L[] = [
  l(
    "<strong>Registers</strong>: 32 registers of 64 bits, written <code>r0</code> to <code>r31</code>, <code>$0</code> to <code>$31</code> or by their usual names (<code>$t0</code>, <code>$sp</code>, <code>$ra</code>…). <code>r0</code> is always 0 and ignores writes. <code>jal</code> leaves its return address in <code>r31</code>.",
    "<strong>Registros</strong>: 32 registros de 64 bits, que se escriben <code>r0</code> a <code>r31</code>, <code>$0</code> a <code>$31</code> o por sus nombres habituales (<code>$t0</code>, <code>$sp</code>, <code>$ra</code>…). <code>r0</code> siempre vale 0 e ignora las escrituras. <code>jal</code> deja su dirección de retorno en <code>r31</code>.",
  ),
  l(
    "<strong>Immediates</strong>: decimal <code>10</code>, <code>-3</code>, hexadecimal <code>0xFF</code> or a character <code>'A'</code>. In the instructions with a 16-bit immediate it must be between -32768 and 65535. A data label plus or minus a number also works: <code>table+8</code>.",
    "<strong>Inmediatos</strong>: decimal <code>10</code>, <code>-3</code>, hexadecimal <code>0xFF</code> o un carácter <code>'A'</code>. En las instrucciones con un inmediato de 16 bits tiene que estar entre -32768 y 65535. También sirve una etiqueta de datos más o menos un número: <code>tabla+8</code>.",
  ),
  l(
    "<strong>Memory</strong>: <code>offset(register)</code>, for example <code>8(r2)</code>, <code>(r2)</code> or <code>n(r0)</code>. Data memory has 65536 bytes and starts at address 0; instructions live apart from it, 4 bytes each.",
    "<strong>Memoria</strong>: <code>desplazamiento(registro)</code>, por ejemplo <code>8(r2)</code>, <code>(r2)</code> o <code>n(r0)</code>. La memoria de datos tiene 65536 bytes y empieza en la dirección 0; las instrucciones viven aparte, de 4 bytes cada una.",
  ),
  l(
    "<strong>Labels</strong>: <code>name:</code> before an instruction names its address; before data it names the address of that datum. A label can sit on its own line.",
    "<strong>Etiquetas</strong>: <code>nombre:</code> antes de una instrucción nombra su dirección; antes de un dato nombra la dirección de ese dato. Una etiqueta puede ir sola en su línea.",
  ),
];

const DIRECTIVES: { syntax: string; effect: L }[] = [
  { syntax: ".data", effect: l("Starts the data section: the lines that follow reserve memory.", "Empieza la sección de datos: las líneas que siguen reservan memoria.") },
  { syntax: ".text", effect: l("Starts the code section (the program begins in it). <code>.code</code> is the same.", "Empieza la sección de código (el programa arranca en ella). <code>.code</code> es lo mismo.") },
  { syntax: ".global label", effect: l("Makes label the first instruction to run; without it the program starts at the first one. <code>.globl</code> and <code>.entry</code> are the same.", "Hace que label sea la primera instrucción en ejecutarse; sin esto el programa arranca en la primera. <code>.globl</code> y <code>.entry</code> son lo mismo.") },
  { syntax: "name: .word 1, 2", effect: l("Reserves 64-bit numbers. <code>.word64</code> is the same.", "Reserva números de 64 bits. <code>.word64</code> es lo mismo.") },
  { syntax: ".word32 / .word16 / .byte", effect: l("Reserve numbers of 32, 16 and 8 bits.", "Reservan números de 32, 16 y 8 bits.") },
  { syntax: ".space n", effect: l("Reserves n bytes, all 0.", "Reserva n bytes, todos en 0.") },
  { syntax: ".ascii \"text\"", effect: l("Stores the characters of a string. <code>.asciiz</code> adds a final 0 byte, which printf needs to know where a string ends.", "Guarda los caracteres de un texto. <code>.asciiz</code> agrega un byte 0 al final, que printf necesita para saber dónde termina el texto.") },
  { syntax: "# comment", effect: l("Everything after <code>#</code> or <code>;</code> is ignored.", "Todo lo que sigue a <code>#</code> o <code>;</code> se ignora.") },
];

const TEXT = {
  en: {
    intro: "Reference for the MIPS64 instructions this simulator runs: what each one does and an example that assembles as written.",
    note: "Data is aligned to its size: a .word starts at a multiple of 8, a .word32 at a multiple of 4, and so on.",
    syntax: "Syntax",
    example: "Example",
    operands: "Operands",
    directives: "Directives and syntax",
    instructions: "Instructions",
    syscalls: "Syscalls",
    syscallsIntro: "These syscall numbers are answered by the simulator itself.",
  },
  es: {
    intro: "Referencia de las instrucciones de MIPS64 que ejecuta este simulador: qué hace cada una y un ejemplo que ensambla tal cual.",
    note: "Los datos se alinean a su tamaño: un .word empieza en un múltiplo de 8, un .word32 en un múltiplo de 4, y así.",
    syntax: "Sintaxis",
    example: "Ejemplo",
    operands: "Operandos",
    directives: "Directivas y sintaxis",
    instructions: "Instrucciones",
    syscalls: "Syscalls",
    syscallsIntro: "Estos números de syscall los atiende el propio simulador.",
  },
} as const;

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const pre = (s: string): string => `<pre><code>${esc(s)}</code></pre>`;
const entryId = (e: MipsManualEntry): string => e.covers[0];

/** The MIPS64 manual as documentation in the chosen language. Every text is fixed in this file, so it is safe to inject. */
export function mipsManualDoc(lang: Lang): ManualDoc {
  const x = TEXT[lang];
  const nav: string[] = [];
  const body: string[] = [`<p class="docs-lead">${x.intro}</p><p>${x.note}</p>`];

  const section = (id: string, title: string, content: string): void => {
    nav.push(`<li><a href="#${id}">${title}</a></li>`);
    body.push(`<section id="${id}"><h2>${title}</h2>${content}</section>`);
  };

  section("operands", x.operands, `<ul>${OPERANDS.map((o) => `<li>${o[lang]}</li>`).join("")}</ul>`);
  section(
    "directives",
    x.directives,
    DIRECTIVES.map((d) => `<article><h3>${esc(d.syntax)}</h3><p>${d.effect[lang]}</p></article>`).join(""),
  );

  nav.push(`<li class="docs-nav-title">${x.instructions}</li>`);
  for (const g of MIPS_MANUAL) {
    nav.push(`<li><a href="#${g.id}">${g.title[lang]}</a><ul>${g.entries.map((e) => `<li><a href="#${entryId(e)}">${e.covers.join(" / ")}</a></li>`).join("")}</ul></li>`);
    const articles = g.entries
      .map(
        (e) =>
          `<article id="${entryId(e)}"><h3>${e.covers.join(" / ")}</h3>${pre(e.syntax)}<p>${e.effect[lang]}</p>` +
          `<p class="docs-meta"><strong>${x.example}:</strong></p>${pre(e.example)}</article>`,
      )
      .join("");
    body.push(`<section id="${g.id}"><h2>${g.title[lang]}</h2>${g.intro ? `<p>${g.intro[lang]}</p>` : ""}${articles}</section>`);
  }

  section(
    "syscalls",
    x.syscalls,
    `<p>${x.syscallsIntro}</p>` + MIPS_SYSCALLS.map((s) => `<article><h3>syscall ${s.n}</h3><p>${s.effect[lang]}</p></article>`).join(""),
  );
  return { nav: `<ul>${nav.join("")}</ul>`, body: body.join("") };
}
