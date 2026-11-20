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

const STACK_PARAMS: Record<Lang, string> = {
  en: `; Pass two parameters on the stack and return their sum in AX.
        ORG 1000H
NUM1    DW  5            ; parameters (by value)
NUM2    DW  7
RES     DW  ?

        ORG 2000H
        MOV AX, NUM1
        PUSH AX          ; push the parameters, first one first
        MOV AX, NUM2
        PUSH AX
        CALL SUMA        ; pushes the return address
        ADD SP, 4        ; the caller removes the parameters (RET has no operand here)
        MOV RES, AX
        INT 0

        ORG 3000H
SUMA:   PUSH BP
        MOV BP, SP       ; BP now points at the saved BP: [BP+2] return address, [BP+4] 2nd parameter, [BP+6] 1st
        PUSH BX          ; keep the caller's BX
        MOV BX, BP
        ADD BX, 4        ; BX -> second parameter (NUM2)
        MOV AX, [BX]
        ADD BX, 2        ; BX -> first parameter (NUM1)
        ADD AX, [BX]     ; AX = NUM2 + NUM1
        POP BX
        POP BP
        RET
        END
`,
  es: `; Pasa dos parámetros por pila y devuelve su suma en AX.
        ORG 1000H
NUM1    DW  5            ; parámetros (por valor)
NUM2    DW  7
RES     DW  ?

        ORG 2000H
        MOV AX, NUM1
        PUSH AX          ; apila los parámetros, el primero primero
        MOV AX, NUM2
        PUSH AX
        CALL SUMA        ; apila la dirección de retorno
        ADD SP, 4        ; quien llama saca los parámetros (RET no lleva operando acá)
        MOV RES, AX
        INT 0

        ORG 3000H
SUMA:   PUSH BP
        MOV BP, SP       ; BP apunta al BP guardado: [BP+2] retorno, [BP+4] 2.º parámetro, [BP+6] 1.º
        PUSH BX          ; conserva el BX de quien llama
        MOV BX, BP
        ADD BX, 4        ; BX -> segundo parámetro (NUM2)
        MOV AX, [BX]
        ADD BX, 2        ; BX -> primer parámetro (NUM1)
        ADD AX, [BX]     ; AX = NUM2 + NUM1
        POP BX
        POP BP
        RET
        END
`,
};

const ECHO_INPUT: Record<Lang, string> = {
  en: `; Ask for three characters in the terminal (INT 6) and print them back (INT 7).
        ORG 1000H
ASK     DB "Type 3 characters: "
ANS     DB "You typed: "
BUF     DB ?, ?, ?
FIN     DB ?

        ORG 2000H
        MOV BX, OFFSET ASK
        MOV AL, OFFSET ANS - OFFSET ASK
        INT 7            ; prompt
        MOV BX, OFFSET BUF
        MOV CX, 3
READ:   INT 6            ; pauses until you type in the terminal, stores the character at [BX]
        INC BX
        LOOP READ
        MOV BX, OFFSET ANS
        MOV AL, OFFSET FIN - OFFSET ANS
        INT 7            ; "You typed: " followed by the three characters
        INT 0
        END
`,
  es: `; Pide tres caracteres en la terminal (INT 6) y los imprime de vuelta (INT 7).
        ORG 1000H
ASK     DB "Type 3 characters: "
ANS     DB "You typed: "
BUF     DB ?, ?, ?
FIN     DB ?

        ORG 2000H
        MOV BX, OFFSET ASK
        MOV AL, OFFSET ANS - OFFSET ASK
        INT 7            ; pregunta
        MOV BX, OFFSET BUF
        MOV CX, 3
READ:   INT 6            ; se pausa hasta que escribas en la terminal, guarda el carácter en [BX]
        INC BX
        LOOP READ
        MOV BX, OFFSET ANS
        MOV AL, OFFSET FIN - OFFSET ANS
        INT 7            ; "You typed: " seguido de los tres caracteres
        INT 0
        END
`,
};

const TITLES: Record<string, Record<Lang, string>> = {
  f10: { en: "F10 counter with an interrupt handler", es: "Contador de F10 con rutina de interrupción" },
  sum: { en: "Sum with a LOOP", es: "Suma con un LOOP" },
  print: { en: "Print a message with INT 7", es: "Imprimir un mensaje con INT 7" },
  stack: { en: "Pass parameters on the stack", es: "Pasaje de parámetros por pila" },
  echo: { en: "Read characters from the terminal", es: "Leer caracteres desde la terminal" },
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
    { id: "stack", title: TITLES.stack[lang], state: plain(STACK_PARAMS[lang]) },
    // no input here: the run pauses at the first INT 6 and the terminal asks for it
    { id: "echo", title: TITLES.echo[lang], state: plain(ECHO_INPUT[lang]) },
  ];
}

/** English examples: what the tests and the share-link checks use. */
export const EXAMPLES: Example[] = examplesFor("en");
