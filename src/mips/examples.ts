import type { Lang } from "../ui/i18n";

export interface MipsExample {
  id: string;
  title: string;
  source: string;
}

interface Pair<T> {
  en: T;
  es: T;
}

const EXAMPLES: { id: string; title: Pair<string>; source: Pair<string> }[] = [
  {
    id: "sum-loop",
    title: { en: "Sum 1..N with a loop", es: "Suma 1..N con un bucle" },
    source: {
      en: `; Adds 1..N and stores the result in memory.
        .data
n:      .word 5
total:  .word 0

        .text
main:   ld    r1, n(r0)
        daddi r2, r0, 0
loop:   dadd  r2, r2, r1      ; total += i
        daddi r1, r1, -1
        bnez  r1, loop        ; taken branches cost a cycle
        sd    r2, total(r0)
        halt
`,
      es: `; Suma 1..N y guarda el resultado en memoria.
        .data
n:      .word 5
total:  .word 0

        .text
main:   ld    r1, n(r0)
        daddi r2, r0, 0
loop:   dadd  r2, r2, r1      ; total += i
        daddi r1, r1, -1
        bnez  r1, loop        ; un salto tomado cuesta un ciclo
        sd    r2, total(r0)
        halt
`,
    },
  },
  {
    id: "raw-hazards",
    title: { en: "RAW hazards (try forwarding)", es: "Riesgos RAW (probá el forwarding)" },
    source: {
      en: `; Every instruction needs the previous result: watch the RAW stalls,
; then switch Forwarding on and run it again.
        .text
        daddi r1, r0, 4
        daddi r2, r0, 6
        dadd  r3, r1, r2
        dsub  r4, r3, r1
        dmul  r5, r4, r4
        halt
`,
      es: `; Cada instrucción necesita el resultado de la anterior: mirá los
; stalls RAW y después activá Forwarding y ejecutá de nuevo.
        .text
        daddi r1, r0, 4
        daddi r2, r0, 6
        dadd  r3, r1, r2
        dsub  r4, r3, r1
        dmul  r5, r4, r4
        halt
`,
    },
  },
  {
    id: "load-use",
    title: { en: "Array sum (load-use)", es: "Suma de un arreglo (load-use)" },
    source: {
      en: `; A load followed by its use: with forwarding one stall is still left.
        .data
v:      .word 3, 5, 7, 9
sum:    .word 0

        .text
        daddi r1, r0, v       ; pointer
        daddi r2, r0, 4       ; count
        daddi r4, r0, 0       ; sum
loop:   ld    r3, 0(r1)
        dadd  r4, r4, r3      ; uses r3 right after the load
        daddi r1, r1, 8
        daddi r2, r2, -1
        bnez  r2, loop
        sd    r4, sum(r0)
        halt
`,
      es: `; Un load seguido de su uso: con forwarding todavía queda un stall.
        .data
v:      .word 3, 5, 7, 9
sum:    .word 0

        .text
        daddi r1, r0, v       ; puntero
        daddi r2, r0, 4       ; cantidad
        daddi r4, r0, 0       ; suma
loop:   ld    r3, 0(r1)
        dadd  r4, r4, r3      ; usa r3 justo después del load
        daddi r1, r1, 8
        daddi r2, r2, -1
        bnez  r2, loop
        sd    r4, sum(r0)
        halt
`,
    },
  },
  {
    id: "print",
    title: { en: "Print with syscall 5", es: "Imprimir con syscall 5" },
    source: {
      en: `; printf: r14 points at a block with the format and its arguments.
        .data
fmt:    .asciiz "6 * 7 = %d\\n"
params: .word fmt, 0

        .text
        daddi r1, r0, 6
        daddi r2, r0, 7
        dmul  r3, r1, r2
        sd    r3, params+8(r0)
        daddi r14, r0, params
        syscall 5
        syscall 0
`,
      es: `; printf: r14 apunta a un bloque con el formato y sus argumentos.
        .data
fmt:    .asciiz "6 * 7 = %d\\n"
params: .word fmt, 0

        .text
        daddi r1, r0, 6
        daddi r2, r0, 7
        dmul  r3, r1, r2
        sd    r3, params+8(r0)
        daddi r14, r0, params
        syscall 5
        syscall 0
`,
    },
  },
];

export function mipsExamplesFor(lang: Lang): MipsExample[] {
  return EXAMPLES.map((e) => ({ id: e.id, title: e.title[lang], source: e.source[lang] }));
}
