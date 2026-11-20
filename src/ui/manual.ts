import type { Lang } from "./i18n";

/** A text in both languages. */
interface L {
  en: string;
  es: string;
}
const l = (en: string, es: string): L => ({ en, es });

export interface ManualEntry {
  /** Every mnemonic this row documents (checked against the instruction set by the tests). */
  covers: string[];
  syntax: string;
  /** One or more lines that assemble as written, after a label `L:` and the data symbol `VAL`. */
  example: string;
  /** Flags the instruction changes; plain text, the same in both languages. */
  flags: string | L;
  effect: L;
}

export interface ManualGroup {
  id: string;
  title: L;
  intro?: L;
  entries: ManualEntry[];
}

const NONE = "—";
const ALL_FLAGS = "CF OF AF SF ZF PF";

export const MANUAL: ManualGroup[] = [
  {
    id: "move",
    title: l("Moving data", "Mover datos"),
    entries: [
      {
        covers: ["MOV"],
        syntax: "MOV dest, src",
        example: "MOV AX, 5",
        flags: NONE,
        effect: l(
          "Copies src into dest. Register to register, register to memory, memory to register or an immediate to either. Memory to memory is not allowed.",
          "Copia src en dest. Registro a registro, registro a memoria, memoria a registro o un inmediato a cualquiera de los dos. No se permite memoria a memoria.",
        ),
      },
      {
        covers: ["PUSH"],
        syntax: "PUSH src",
        example: "PUSH AX",
        flags: NONE,
        effect: l(
          "Subtracts 2 from SP and stores the 16-bit value at the new top of the stack.",
          "Resta 2 a SP y guarda el valor de 16 bits en la nueva cima del stack.",
        ),
      },
      {
        covers: ["POP"],
        syntax: "POP dest",
        example: "POP BX",
        flags: NONE,
        effect: l(
          "Takes the 16-bit value at the top of the stack into dest and adds 2 to SP.",
          "Toma el valor de 16 bits de la cima del stack y lo guarda en dest, y suma 2 a SP.",
        ),
      },
      {
        covers: ["PUSHF"],
        syntax: "PUSHF",
        example: "PUSHF",
        flags: NONE,
        effect: l("Pushes the flags word onto the stack.", "Apila la palabra de flags."),
      },
      {
        covers: ["POPF"],
        syntax: "POPF",
        example: "POPF",
        flags: l("all, from the stack", "todos, desde el stack"),
        effect: l("Pops a word from the stack into the flags.", "Saca una palabra del stack y la carga en los flags."),
      },
      {
        covers: ["IN"],
        syntax: "IN AL, port\nIN AX, DX",
        example: "IN AL, 21H",
        flags: NONE,
        effect: l(
          "Reads a byte (AL) or a word (AX) from an I/O port. The port is a number from 0 to 255 or the value in DX.",
          "Lee un byte (AL) o una palabra (AX) de un puerto de E/S. El puerto es un número de 0 a 255 o el valor de DX.",
        ),
      },
      {
        covers: ["OUT"],
        syntax: "OUT port, AL\nOUT DX, AX",
        example: "OUT 20H, AL",
        flags: NONE,
        effect: l(
          "Writes AL (a byte) or AX (a word) to an I/O port. The port is a number from 0 to 255 or the value in DX.",
          "Escribe AL (un byte) o AX (una palabra) en un puerto de E/S. El puerto es un número de 0 a 255 o el valor de DX.",
        ),
      },
    ],
  },
  {
    id: "arith",
    title: l("Arithmetic", "Aritmética"),
    entries: [
      {
        covers: ["ADD"],
        syntax: "ADD dest, src",
        example: "ADD AX, 1",
        flags: ALL_FLAGS,
        effect: l("dest = dest + src.", "dest = dest + src."),
      },
      {
        covers: ["ADC"],
        syntax: "ADC dest, src",
        example: "ADC AX, 0",
        flags: ALL_FLAGS,
        effect: l("dest = dest + src + CF. Chains the carry of a wider addition.", "dest = dest + src + CF. Encadena el acarreo de una suma más ancha."),
      },
      {
        covers: ["SUB"],
        syntax: "SUB dest, src",
        example: "SUB AX, 1",
        flags: ALL_FLAGS,
        effect: l("dest = dest - src. CF = 1 when a borrow was needed.", "dest = dest - src. CF = 1 si hizo falta un préstamo."),
      },
      {
        covers: ["SBB"],
        syntax: "SBB dest, src",
        example: "SBB AX, 0",
        flags: ALL_FLAGS,
        effect: l("dest = dest - src - CF.", "dest = dest - src - CF."),
      },
      {
        covers: ["CMP"],
        syntax: "CMP a, b",
        example: "CMP AX, 5",
        flags: ALL_FLAGS,
        effect: l(
          "Computes a - b and keeps only the flags; neither operand changes. Follow it with a conditional jump.",
          "Calcula a - b y conserva solo los flags; ningún operando cambia. Se sigue con un salto condicional.",
        ),
      },
      {
        covers: ["INC"],
        syntax: "INC dest",
        example: "INC AX",
        flags: "OF AF SF ZF PF",
        effect: l("Adds 1. CF is left as it was.", "Suma 1. CF queda como estaba."),
      },
      {
        covers: ["DEC"],
        syntax: "DEC dest",
        example: "DEC AX",
        flags: "OF AF SF ZF PF",
        effect: l("Subtracts 1. CF is left as it was.", "Resta 1. CF queda como estaba."),
      },
      {
        covers: ["NEG"],
        syntax: "NEG dest",
        example: "NEG AX",
        flags: ALL_FLAGS,
        effect: l(
          "dest = 0 - dest (two's complement). CF = 1 unless dest was 0.",
          "dest = 0 - dest (complemento a 2). CF = 1 salvo que dest fuera 0.",
        ),
      },
      {
        covers: ["MUL"],
        syntax: "MUL src",
        example: "MUL BL",
        flags: l("CF OF", "CF OF"),
        effect: l(
          "Unsigned multiply. 8-bit src: AX = AL × src. 16-bit src: DX:AX = AX × src. CF and OF are 1 when the upper half (AH or DX) is not 0.",
          "Multiplicación sin signo. src de 8 bits: AX = AL × src. src de 16 bits: DX:AX = AX × src. CF y OF valen 1 si la mitad alta (AH o DX) no es 0.",
        ),
      },
      {
        covers: ["DIV"],
        syntax: "DIV src",
        example: "DIV BL",
        flags: NONE,
        effect: l(
          "Unsigned divide. 8-bit src: AX ÷ src, quotient in AL, remainder in AH. 16-bit src: DX:AX ÷ src, quotient in AX, remainder in DX. Dividing by 0, or a quotient that does not fit, stops the run with a divide error.",
          "División sin signo. src de 8 bits: AX ÷ src, cociente en AL y resto en AH. src de 16 bits: DX:AX ÷ src, cociente en AX y resto en DX. Dividir por 0, o un cociente que no entra, detiene la ejecución con un error de división.",
        ),
      },
    ],
  },
  {
    id: "logic",
    title: l("Logic and shifts", "Lógica y desplazamientos"),
    entries: [
      {
        covers: ["AND"],
        syntax: "AND dest, src",
        example: "AND AL, 0FH",
        flags: l("CF OF AF = 0; SF ZF PF", "CF OF AF = 0; SF ZF PF"),
        effect: l("Bit-by-bit AND. Clears bits.", "AND bit a bit. Sirve para apagar bits."),
      },
      {
        covers: ["OR"],
        syntax: "OR dest, src",
        example: "OR AL, 80H",
        flags: l("CF OF AF = 0; SF ZF PF", "CF OF AF = 0; SF ZF PF"),
        effect: l("Bit-by-bit OR. Sets bits.", "OR bit a bit. Sirve para encender bits."),
      },
      {
        covers: ["XOR"],
        syntax: "XOR dest, src",
        example: "XOR AX, AX",
        flags: l("CF OF AF = 0; SF ZF PF", "CF OF AF = 0; SF ZF PF"),
        effect: l(
          "Bit-by-bit exclusive OR. XOR AX, AX is the usual way to zero a register.",
          "OR exclusivo bit a bit. XOR AX, AX es la forma habitual de poner un registro en cero.",
        ),
      },
      {
        covers: ["NOT"],
        syntax: "NOT dest",
        example: "NOT AX",
        flags: NONE,
        effect: l("Inverts every bit of dest.", "Invierte cada bit de dest."),
      },
      {
        covers: ["TEST"],
        syntax: "TEST a, b",
        example: "TEST AL, 1",
        flags: l("CF OF AF = 0; SF ZF PF", "CF OF AF = 0; SF ZF PF"),
        effect: l(
          "Computes a AND b and keeps only the flags; neither operand changes.",
          "Calcula a AND b y conserva solo los flags; ningún operando cambia.",
        ),
      },
      {
        covers: ["SHL"],
        syntax: "SHL dest, 1\nSHL dest, CL",
        example: "SHL AX, 1",
        flags: "CF OF SF ZF PF",
        effect: l(
          "Shifts left, filling with 0. CF receives the last bit shifted out. The count is 1 or the value in CL. Each step doubles an unsigned value.",
          "Desplaza a la izquierda, rellenando con 0. CF recibe el último bit que sale. El conteo es 1 o el valor de CL. Cada paso duplica un valor sin signo.",
        ),
      },
      {
        covers: ["SHR"],
        syntax: "SHR dest, 1\nSHR dest, CL",
        example: "SHR AX, 1",
        flags: "CF OF SF ZF PF",
        effect: l(
          "Shifts right, filling with 0. CF receives the last bit shifted out. The count is 1 or the value in CL. Each step halves an unsigned value.",
          "Desplaza a la derecha, rellenando con 0. CF recibe el último bit que sale. El conteo es 1 o el valor de CL. Cada paso divide por 2 un valor sin signo.",
        ),
      },
    ],
  },
  {
    id: "flow",
    title: l("Jumps, loops and calls", "Saltos, bucles y llamadas"),
    intro: l(
      "Every jump takes a label. The conditional jumps read the flags, so they usually follow CMP, TEST or an arithmetic instruction.",
      "Todos los saltos reciben una etiqueta. Los saltos condicionales leen los flags, así que suelen ir después de CMP, TEST o una instrucción aritmética.",
    ),
    entries: [
      {
        covers: ["JMP"],
        syntax: "JMP label",
        example: "JMP L",
        flags: NONE,
        effect: l("Always jumps to the label.", "Salta siempre a la etiqueta."),
      },
      {
        covers: ["JZ", "JE"],
        syntax: "JZ label\nJE label",
        example: "JZ L",
        flags: NONE,
        effect: l("Jumps if ZF = 1 (zero, equal).", "Salta si ZF = 1 (cero, igual)."),
      },
      {
        covers: ["JNZ", "JNE"],
        syntax: "JNZ label\nJNE label",
        example: "JNZ L",
        flags: NONE,
        effect: l("Jumps if ZF = 0 (not zero, not equal).", "Salta si ZF = 0 (no cero, distinto)."),
      },
      {
        covers: ["JC", "JB"],
        syntax: "JC label\nJB label",
        example: "JC L",
        flags: NONE,
        effect: l("Jumps if CF = 1 (carry, below, unsigned).", "Salta si CF = 1 (acarreo, menor sin signo)."),
      },
      {
        covers: ["JNC", "JAE"],
        syntax: "JNC label\nJAE label",
        example: "JNC L",
        flags: NONE,
        effect: l("Jumps if CF = 0 (no carry, above or equal, unsigned).", "Salta si CF = 0 (sin acarreo, mayor o igual sin signo)."),
      },
      {
        covers: ["JA"],
        syntax: "JA label",
        example: "JA L",
        flags: NONE,
        effect: l("Jumps if CF = 0 and ZF = 0 (above, unsigned).", "Salta si CF = 0 y ZF = 0 (mayor sin signo)."),
      },
      {
        covers: ["JBE"],
        syntax: "JBE label",
        example: "JBE L",
        flags: NONE,
        effect: l("Jumps if CF = 1 or ZF = 1 (below or equal, unsigned).", "Salta si CF = 1 o ZF = 1 (menor o igual sin signo)."),
      },
      {
        covers: ["JS"],
        syntax: "JS label",
        example: "JS L",
        flags: NONE,
        effect: l("Jumps if SF = 1 (negative result).", "Salta si SF = 1 (resultado negativo)."),
      },
      {
        covers: ["JNS"],
        syntax: "JNS label",
        example: "JNS L",
        flags: NONE,
        effect: l("Jumps if SF = 0 (non-negative result).", "Salta si SF = 0 (resultado no negativo)."),
      },
      {
        covers: ["JG"],
        syntax: "JG label",
        example: "JG L",
        flags: NONE,
        effect: l("Jumps if ZF = 0 and SF = OF (greater, signed).", "Salta si ZF = 0 y SF = OF (mayor con signo)."),
      },
      {
        covers: ["JGE"],
        syntax: "JGE label",
        example: "JGE L",
        flags: NONE,
        effect: l("Jumps if SF = OF (greater or equal, signed).", "Salta si SF = OF (mayor o igual con signo)."),
      },
      {
        covers: ["JL"],
        syntax: "JL label",
        example: "JL L",
        flags: NONE,
        effect: l("Jumps if SF ≠ OF (less, signed).", "Salta si SF ≠ OF (menor con signo)."),
      },
      {
        covers: ["JLE"],
        syntax: "JLE label",
        example: "JLE L",
        flags: NONE,
        effect: l("Jumps if ZF = 1 or SF ≠ OF (less or equal, signed).", "Salta si ZF = 1 o SF ≠ OF (menor o igual con signo)."),
      },
      {
        covers: ["LOOP"],
        syntax: "LOOP label",
        example: "LOOP L",
        flags: NONE,
        effect: l(
          "Subtracts 1 from CX and jumps to the label while CX is not 0. Load CX with the number of repetitions first.",
          "Resta 1 a CX y salta a la etiqueta mientras CX no sea 0. Antes hay que cargar CX con la cantidad de repeticiones.",
        ),
      },
      {
        covers: ["CALL"],
        syntax: "CALL label",
        example: "CALL L",
        flags: NONE,
        effect: l(
          "Pushes the address of the next instruction and jumps to the label (a subroutine).",
          "Apila la dirección de la instrucción siguiente y salta a la etiqueta (una subrutina).",
        ),
      },
      {
        covers: ["RET"],
        syntax: "RET",
        example: "RET",
        flags: NONE,
        effect: l("Pops the return address into IP, going back after the CALL.", "Saca la dirección de retorno hacia IP y vuelve después del CALL."),
      },
    ],
  },
  {
    id: "system",
    title: l("Interrupts and control", "Interrupciones y control"),
    intro: l(
      "INT 0, 3, 5, 6 and 7 are services the simulator provides itself (see the table below). Any other INT n pushes the flags and the return address, clears IF and jumps to the handler whose offset is stored in the vector table, at address 4 × n.",
      "INT 0, 3, 5, 6 y 7 son servicios que da el propio simulador (ver la tabla de abajo). Cualquier otro INT n apila los flags y la dirección de retorno, apaga IF y salta al manejador cuyo offset está guardado en la tabla de vectores, en la dirección 4 × n.",
    ),
    entries: [
      {
        covers: ["INT"],
        syntax: "INT n",
        example: "INT 0",
        flags: l("IF = 0 on a handler", "IF = 0 en un manejador"),
        effect: l("Software interrupt number n (0 to 255).", "Interrupción por software número n (0 a 255)."),
      },
      {
        covers: ["IRET"],
        syntax: "IRET",
        example: "IRET",
        flags: l("all, from the stack", "todos, desde el stack"),
        effect: l(
          "Ends an interrupt handler: pops IP, then the flags.",
          "Termina un manejador de interrupción: saca IP y después los flags.",
        ),
      },
      {
        covers: ["CLI"],
        syntax: "CLI",
        example: "CLI",
        flags: "IF = 0",
        effect: l("Blocks hardware interrupts.", "Bloquea las interrupciones de hardware."),
      },
      {
        covers: ["STI"],
        syntax: "STI",
        example: "STI",
        flags: "IF = 1",
        effect: l("Allows hardware interrupts.", "Permite las interrupciones de hardware."),
      },
      {
        covers: ["HLT"],
        syntax: "HLT",
        example: "HLT",
        flags: NONE,
        effect: l("Stops the program.", "Detiene el programa."),
      },
      {
        covers: ["NOP"],
        syntax: "NOP",
        example: "NOP",
        flags: NONE,
        effect: l("Does nothing.", "No hace nada."),
      },
      {
        covers: ["CLC"],
        syntax: "CLC",
        example: "CLC",
        flags: "CF = 0",
        effect: l("Clears the carry flag.", "Pone en 0 el flag de acarreo."),
      },
      {
        covers: ["STC"],
        syntax: "STC",
        example: "STC",
        flags: "CF = 1",
        effect: l("Sets the carry flag.", "Pone en 1 el flag de acarreo."),
      },
    ],
  },
];

/** The INT numbers the simulator answers itself. */
export const INT_SERVICES: { n: number; effect: L }[] = [
  { n: 0, effect: l("Ends the program.", "Termina el programa.") },
  { n: 3, effect: l("Breakpoint: it only leaves a note in the trace.", "Breakpoint: solo deja una nota en la traza.") },
  {
    n: 5,
    effect: l(
      "Puts a random number from 0 to AL (inclusive) in AL.",
      "Deja en AL un número al azar entre 0 y AL (inclusive).",
    ),
  },
  {
    n: 6,
    effect: l(
      "Reads one character from the keyboard input and stores its code at the address in BX. When the input is empty the run pauses and the terminal asks you to type.",
      "Lee un carácter de la entrada de teclado y guarda su código en la dirección que tiene BX. Si la entrada está vacía, la ejecución se pausa y la terminal te pide que escribas.",
    ),
  },
  {
    n: 7,
    effect: l(
      "Prints AL characters starting at the address in BX.",
      "Imprime AL caracteres a partir de la dirección que tiene BX.",
    ),
  },
];

const OPERANDS: L[] = [
  l(
    "<strong>Registers</strong>: <code>AX BX CX DX</code> (16 bits) with halves <code>AL AH BL BH CL CH DL DH</code> (8 bits), and <code>SI DI BP SP</code> (16 bits). The width of the registers decides the width of the operation.",
    "<strong>Registros</strong>: <code>AX BX CX DX</code> (16 bits) con sus mitades <code>AL AH BL BH CL CH DL DH</code> (8 bits), y <code>SI DI BP SP</code> (16 bits). El ancho de los registros decide el ancho de la operación.",
  ),
  l(
    "<strong>Immediates</strong>: decimal <code>10</code>, hexadecimal <code>0FFH</code> (it must start with a digit), binary <code>1010B</code> or a character <code>'A'</code>. Sums and differences work too: <code>TABLE + 2</code>.",
    "<strong>Inmediatos</strong>: decimal <code>10</code>, hexadecimal <code>0FFH</code> (tiene que empezar con un dígito), binario <code>1010B</code> o un carácter <code>'A'</code>. También se pueden sumar y restar: <code>TABLA + 2</code>.",
  ),
  l(
    "<strong>Memory</strong>: direct <code>[1000H]</code> or the name of a data symbol, and indirect through <code>[BX]</code>, <code>[SI]</code>, <code>[DI]</code> or <code>[BP]</code>. Only one operand can be in memory.",
    "<strong>Memoria</strong>: directa <code>[1000H]</code> o el nombre de un símbolo de datos, e indirecta con <code>[BX]</code>, <code>[SI]</code>, <code>[DI]</code> o <code>[BP]</code>. Solo un operando puede estar en memoria.",
  ),
  l(
    "<strong>Size</strong>: when no register or symbol tells the width, write <code>BYTE PTR</code> or <code>WORD PTR</code>, for example <code>MOV BYTE PTR [BX], 0</code>.",
    "<strong>Tamaño</strong>: cuando ningún registro ni símbolo indica el ancho, se escribe <code>BYTE PTR</code> o <code>WORD PTR</code>, por ejemplo <code>MOV BYTE PTR [BX], 0</code>.",
  ),
  l(
    "<strong>Address of a symbol</strong>: <code>OFFSET NAME</code> is its address as a number, so <code>MOV BX, OFFSET NAME</code> points BX at it.",
    "<strong>Dirección de un símbolo</strong>: <code>OFFSET NOMBRE</code> es su dirección como número, así que <code>MOV BX, OFFSET NOMBRE</code> hace que BX apunte a él.",
  ),
];

const DIRECTIVES: { syntax: string; effect: L }[] = [
  { syntax: "ORG addr", effect: l("Sets the address where the next instruction or data goes.", "Fija la dirección donde van la próxima instrucción o los próximos datos.") },
  { syntax: "NAME DB 1, 2, 'text'", effect: l("Reserves bytes. <code>?</code> leaves a byte undefined, <code>5 DUP(0)</code> repeats a value.", "Reserva bytes. <code>?</code> deja un byte sin definir y <code>5 DUP(0)</code> repite un valor.") },
  { syntax: "NAME DW 1, 2", effect: l("Reserves 16-bit words (low byte first). It takes numbers, not text.", "Reserva palabras de 16 bits (byte bajo primero). Recibe números, no texto.") },
  { syntax: "NAME EQU value", effect: l("Gives a name to a constant. It takes no memory.", "Le da nombre a una constante. No ocupa memoria.") },
  { syntax: "label:", effect: l("Names the address of the next instruction, to jump or call to it.", "Nombra la dirección de la próxima instrucción, para saltar o llamar a ella.") },
  { syntax: "; comment", effect: l("Everything after the semicolon is ignored.", "Todo lo que sigue al punto y coma se ignora.") },
  { syntax: "END", effect: l("Marks the end of the source.", "Marca el final del código.") },
];

const PORTS: { port: string; effect: L }[] = [
  { port: "10H CONT", effect: l("Timer counter. It goes up by one every second, but only after the first write to it. When it equals COMP the timer raises INT1. Write 0 to restart it.", "Contador del timer. Sube de a uno por segundo, pero recién después de la primera escritura. Cuando iguala a COMP el timer dispara INT1. Escribir 0 lo reinicia.") },
  { port: "11H COMP", effect: l("Timer compare value. The timer interrupt fires when CONT reaches it.", "Valor de comparación del timer. La interrupción del timer se dispara cuando CONT lo alcanza.") },
  { port: "20H EOI", effect: l("Write 20H to end the interrupt being served.", "Escribir 20H termina la interrupción que se está atendiendo.") },
  { port: "21H IMR", effect: l("Interrupt mask: a 1 bit blocks that line. It starts at FFH, everything blocked.", "Máscara de interrupciones: un bit en 1 bloquea esa línea. Arranca en FFH, todo bloqueado.") },
  { port: "22H IRR", effect: l("Requests waiting (read only).", "Pedidos pendientes (solo lectura).") },
  { port: "23H ISR", effect: l("Line being served (read only).", "Línea que se está atendiendo (solo lectura).") },
  { port: "24H to 2BH", effect: l("INT0 to INT7: the vector number each line raises.", "INT0 a INT7: el número de vector que dispara cada línea.") },
];

const TEXT = {
  en: {
    intro: "Reference for the MSX88 instructions this simulator runs: what each one does, which flags it changes and an example that assembles as written.",
    flagsNote: "In the Flags line, “none” means the instruction changes no flag.",
    syntax: "Syntax",
    flags: "Flags",
    example: "Example",
    none: "none",
    services: "Services of INT",
    servicesIntro: "These INT numbers are answered by the simulator itself.",
    operands: "Operands",
    directives: "Directives and syntax",
    instructions: "Instructions",
    ports: "Timer and interrupt controller ports",
    portsIntro: "Use IN and OUT with these ports to program the timer and the interrupt controller. F10 is line 0, the timer is line 1 and the handshake is line 2. The simulator has no real clock: one second of the timer is 100 executed steps.",
    port: "Port",
  },
  es: {
    intro: "Referencia de las instrucciones del MSX88 que ejecuta este simulador: qué hace cada una, qué flags modifica y un ejemplo que ensambla tal cual.",
    flagsNote: "En la línea de Flags, “ninguno” significa que la instrucción no cambia ningún flag.",
    syntax: "Sintaxis",
    flags: "Flags",
    example: "Ejemplo",
    none: "ninguno",
    services: "Servicios de INT",
    servicesIntro: "Estos números de INT los atiende el propio simulador.",
    operands: "Operandos",
    directives: "Directivas y sintaxis",
    instructions: "Instrucciones",
    ports: "Puertos del timer y del controlador de interrupciones",
    portsIntro: "Con IN y OUT sobre estos puertos se programan el timer y el controlador de interrupciones. F10 es la línea 0, el timer la línea 1 y el handshake la línea 2. El simulador no tiene reloj real: un segundo del timer son 100 pasos ejecutados.",
    port: "Puerto",
  },
} as const;

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const pre = (s: string): string => `<pre><code>${esc(s)}</code></pre>`;
const entryId = (e: ManualEntry): string => e.covers[0].toLowerCase();

export interface ManualDoc {
  /** The table of contents: a list of links to the sections of `body`. */
  nav: string;
  body: string;
}

/** The manual as documentation in the chosen language. Every text is fixed in this file, so it is safe to inject. */
export function manualDoc(lang: Lang): ManualDoc {
  const x = TEXT[lang];
  const nav: string[] = [];
  const body: string[] = [`<p class="docs-lead">${x.intro}</p><p>${x.flagsNote}</p>`];

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
  for (const g of MANUAL) {
    nav.push(`<li><a href="#${g.id}">${g.title[lang]}</a><ul>${g.entries.map((e) => `<li><a href="#${entryId(e)}">${e.covers.join(" / ")}</a></li>`).join("")}</ul></li>`);
    const articles = g.entries
      .map((e) => {
        const flags = typeof e.flags === "string" ? (e.flags === NONE ? x.none : e.flags) : e.flags[lang];
        return (
          `<article id="${entryId(e)}"><h3>${e.covers.join(" / ")}</h3>${pre(e.syntax)}<p>${e.effect[lang]}</p>` +
          `<p class="docs-meta"><strong>${x.flags}:</strong> ${esc(flags)}</p>` +
          `<p class="docs-meta"><strong>${x.example}:</strong></p>${pre(e.example)}</article>`
        );
      })
      .join("");
    body.push(`<section id="${g.id}"><h2>${g.title[lang]}</h2>${g.intro ? `<p>${g.intro[lang]}</p>` : ""}${articles}</section>`);
  }

  section(
    "int-services",
    x.services,
    `<p>${x.servicesIntro}</p>` + INT_SERVICES.map((s) => `<article><h3>INT ${s.n}</h3><p>${s.effect[lang]}</p></article>`).join(""),
  );
  section(
    "ports",
    x.ports,
    `<p>${x.portsIntro}</p>` + PORTS.map((p) => `<article><h3>${esc(p.port)}</h3><p>${p.effect[lang]}</p></article>`).join(""),
  );
  return { nav: `<ul>${nav.join("")}</ul>`, body: body.join("") };
}
