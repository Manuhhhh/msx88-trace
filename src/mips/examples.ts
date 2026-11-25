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
    title: { en: "Print a string (CONTROL/DATA)", es: "Imprimir un string (CONTROL/DATA)" },
    source: {
      en: `; WinMIPS64 output is memory mapped: write what to show in DATA,
; then the operation (4 = string at that address) in CONTROL.
        .data
CONTROL: .word32 0x10000
DATA:    .word32 0x10008
msg:     .asciiz "Hola mundo!"

        .text
        lwu   r31, CONTROL(r0)
        lwu   r30, DATA(r0)
        daddi r29, r0, 4      ; 4 = print the string
        daddi r28, r0, msg
        sd    r28, (r30)      ; DATA = address of msg
        sd    r29, (r31)      ; CONTROL = 4
        halt
`,
      es: `; La salida de WinMIPS64 está mapeada en memoria: escribí qué mostrar en DATA
; y después la operación (4 = string en esa dirección) en CONTROL.
        .data
CONTROL: .word32 0x10000
DATA:    .word32 0x10008
msg:     .asciiz "Hola mundo!"

        .text
        lwu   r31, CONTROL(r0)
        lwu   r30, DATA(r0)
        daddi r29, r0, 4      ; 4 = imprimir el string
        daddi r28, r0, msg
        sd    r28, (r30)      ; DATA = dirección de msg
        sd    r29, (r31)      ; CONTROL = 4
        halt
`,
    },
  },
  {
    id: "print-int",
    title: { en: "Print an integer (CONTROL = 2)", es: "Imprimir un entero (CONTROL = 2)" },
    source: {
      en: `; CONTROL = 2 prints DATA as a signed integer followed by a newline.
        .data
CONTROL: .word32 0x10000
DATA:    .word32 0x10008

        .text
        lwu   r31, CONTROL(r0)
        lwu   r30, DATA(r0)
        daddi r1, r0, 6
        daddi r2, r0, 7
        dmul  r3, r1, r2
        daddi r29, r0, 2      ; 2 = signed integer
        sd    r3, (r30)       ; DATA = 42
        sd    r29, (r31)      ; CONTROL = 2
        halt
`,
      es: `; CONTROL = 2 imprime DATA como entero con signo seguido de un salto de línea.
        .data
CONTROL: .word32 0x10000
DATA:    .word32 0x10008

        .text
        lwu   r31, CONTROL(r0)
        lwu   r30, DATA(r0)
        daddi r1, r0, 6
        daddi r2, r0, 7
        dmul  r3, r1, r2
        daddi r29, r0, 2      ; 2 = entero con signo
        sd    r3, (r30)       ; DATA = 42
        sd    r29, (r31)      ; CONTROL = 2
        halt
`,
    },
  },
];

export function mipsExamplesFor(lang: Lang): MipsExample[] {
  return EXAMPLES.map((e) => ({ id: e.id, title: e.title[lang], source: e.source[lang] }));
}
