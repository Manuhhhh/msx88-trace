import type { Lang } from "./i18n";
import type { ShareState } from "./share";

export interface Example {
  id: string;
  title: string;
  state: ShareState;
}

// The programs are the same in both languages; only the comments and the titles are translated.
const F10_COUNTER: Record<Lang, string> = {
  en: `; Count three F10 key presses, then end the program.
EOI     EQU 20H          ; end-of-interrupt port and value
IMR     EQU 21H          ; interrupt mask register
INT0    EQU 24H          ; vector number for the F10 line

        ORG 40           ; vector 10 lives at 4 * 10
IP_F10  DW  RUT_F10      ; address of the handler

        ORG 1000H
CONT    DB  0            ; presses so far

        ORG 2000H
        CLI
        MOV AL, 0FEH     ; unmask only INT0
        OUT IMR, AL
        MOV AL, 10       ; F10 uses vector 10
        OUT INT0, AL
        STI
LAZO:   CMP CONT, 3
        JNZ LAZO
        INT 0

        ORG 3000H
RUT_F10: PUSH AX
        INC CONT
        MOV AL, EOI
        OUT EOI, AL      ; without this the PIC never serves another press
        POP AX
        IRET
        END
`,
  es: `; Cuenta tres pulsaciones de la tecla F10 y después termina el programa.
EOI     EQU 20H          ; puerto y valor de fin de interrupción
IMR     EQU 21H          ; registro de máscara de interrupciones
INT0    EQU 24H          ; número de vector de la línea F10

        ORG 40           ; el vector 10 está en 4 * 10
IP_F10  DW  RUT_F10      ; dirección de la rutina de atención

        ORG 1000H
CONT    DB  0            ; pulsaciones hasta ahora

        ORG 2000H
        CLI
        MOV AL, 0FEH     ; habilita solo INT0
        OUT IMR, AL
        MOV AL, 10       ; F10 usa el vector 10
        OUT INT0, AL
        STI
LAZO:   CMP CONT, 3
        JNZ LAZO
        INT 0

        ORG 3000H
RUT_F10: PUSH AX
        INC CONT
        MOV AL, EOI
        OUT EOI, AL      ; sin esto el PIC nunca atiende otra pulsación
        POP AX
        IRET
        END
`,
};

const SUM_LOOP: Record<Lang, string> = {
  en: `; Add 5 + 4 + 3 + 2 + 1 into AX.
        ORG 2000H
        MOV AX, 0
        MOV CX, 5
SUMA:   ADD AX, CX
        LOOP SUMA
        INT 0
        END
`,
  es: `; Suma 5 + 4 + 3 + 2 + 1 en AX.
        ORG 2000H
        MOV AX, 0
        MOV CX, 5
SUMA:   ADD AX, CX
        LOOP SUMA
        INT 0
        END
`,
};

const PRINT_MESSAGE: Record<Lang, string> = {
  en: `; Print a message with INT 7 (BX = address, AL = length).
        ORG 1000H
MSG     DB "Hello, MSX88"
FIN     DB ?

        ORG 2000H
        MOV BX, OFFSET MSG
        MOV AL, OFFSET FIN - OFFSET MSG
        INT 7
        INT 0
        END
`,
  es: `; Imprime un mensaje con INT 7 (BX = dirección, AL = largo).
        ORG 1000H
MSG     DB "Hello, MSX88"
FIN     DB ?

        ORG 2000H
        MOV BX, OFFSET MSG
        MOV AL, OFFSET FIN - OFFSET MSG
        INT 7
        INT 0
        END
`,
};

const TITLES: Record<string, Record<Lang, string>> = {
  f10: { en: "F10 counter with an interrupt handler", es: "Contador de F10 con rutina de interrupción" },
  sum: { en: "Sum with a LOOP", es: "Suma con un LOOP" },
  print: { en: "Print a message with INT 7", es: "Imprimir un mensaje con INT 7" },
};

/** The built-in examples, with their titles and comments in the given language. */
export function examplesFor(lang: Lang): Example[] {
  const plain = (source: string): ShareState => ({ source, input: "", maxSteps: 2000, events: [] });
  return [
    {
      id: "f10",
      title: TITLES.f10[lang],
      state: {
        source: F10_COUNTER[lang],
        input: "",
        maxSteps: 2000,
        events: [
          { step: 12, line: 0 },
          { step: 40, line: 0 },
          { step: 70, line: 0 },
        ],
      },
    },
    { id: "sum", title: TITLES.sum[lang], state: plain(SUM_LOOP[lang]) },
    { id: "print", title: TITLES.print[lang], state: plain(PRINT_MESSAGE[lang]) },
  ];
}

/** English examples: what the tests and the share-link checks use. */
export const EXAMPLES: Example[] = examplesFor("en");
