import type { ShareState } from "./share";

export interface Example {
  id: string;
  title: string;
  state: ShareState;
}

const F10_COUNTER = `; Count three F10 key presses, then end the program.
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
`;

const SUM_LOOP = `; Add 5 + 4 + 3 + 2 + 1 into AX.
        ORG 2000H
        MOV AX, 0
        MOV CX, 5
SUMA:   ADD AX, CX
        LOOP SUMA
        INT 0
        END
`;

const PRINT_MESSAGE = `; Print a message with INT 7 (BX = address, AL = length).
        ORG 1000H
MSG     DB "Hello, MSX88"
FIN     DB ?

        ORG 2000H
        MOV BX, OFFSET MSG
        MOV AL, OFFSET FIN - OFFSET MSG
        INT 7
        INT 0
        END
`;

export const EXAMPLES: Example[] = [
  {
    id: "f10",
    title: "F10 counter with an interrupt handler",
    state: {
      source: F10_COUNTER,
      input: "",
      maxSteps: 2000,
      events: [
        { step: 12, line: 0 },
        { step: 40, line: 0 },
        { step: 70, line: 0 },
      ],
    },
  },
  { id: "sum", title: "Sum with a LOOP", state: { source: SUM_LOOP, input: "", maxSteps: 2000, events: [] } },
  {
    id: "print",
    title: "Print a message with INT 7",
    state: { source: PRINT_MESSAGE, input: "", maxSteps: 2000, events: [] },
  },
];
