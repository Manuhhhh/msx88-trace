# msx88-trace
Objective: web trace generator for MSX88 assembly (university course use). Branch: main (feature branch `feat/core` per work unit). Delivery: ask-on-risk. Test runner: vitest (`bun run test`, package manager: bun).

## Specs
- S1. Web app built with Vite + Tailwind (TypeScript). User: "vamos con vite y tailwind", "Mejor hagamoslo una web". Static site, no backend (assumption).
- S2. Input is MSX88 assembly in the syntax of the agreed example: `EQU`, `ORG`, `DB`, `DW`, labels, `MOV`, `OUT`, `CLI`, `STI`, `CMP`, `JNZ`, `INT`, `IRET`, `PUSH`, `POP`, `INC`, `END`. User: "Quiero construir un generador de trazas para este tipo de sintaxis".
- S3. Output is a step-by-step trace table: per instruction, registers, flags, stack and memory changes, including the jump into an interrupt handler. User: "Es para usarlo en la materia".
- S4. Interrupts follow the VonSim docs: vector table 0000h-03FFh with 4-byte entries at `4n`; PIC ports EOI=20h (value 20h), IMR=21h, IRR=22h, ISR=23h, INT0..INT7 registers 24h..2Bh; INT0=F10, INT1=timer, INT2=handshake; no nesting; lower line = higher priority; CPU on interrupt: push FLAGS, IF=0, push IP, load handler from table; `IRET` returns. Software: INT 0 = end program, INT 3 = breakpoint, INT 5 = random 0..AL, INT 6 = read char, INT 7 = write string.
- S5. ASSUMPTIONS (unverified, UNLP apunte unreadable): vector entry stores only the handler offset (`DW`), CS not modelled; registers used by INT 6/INT 7 undefined; `ORG`/`EQU`/`CMP mem,imm` syntax as in the example. Mark each in code with `// ASSUMPTION:` and revisit when the apunte is available.

## Tasks
- T1 (S1) scaffold Vite + Tailwind + Vitest — inline — done, `bun run build` OK, commit 804c16d
- T2 (S2, S5) lexer/parser/assembler to memory image — inline — done, 12 tests + strict tsc OK, commit f5d5fc7. Note: tests were written after the code (no RED observed); error cases pin the behavior.
- T3 (S2, S3) CPU core + trace events — inline — pending
- T4 (S4) PIC, vector table, interrupts, simulated F10 — inline — pending
- T5 (S3) trace table UI with Tailwind — inline — pending

## Log
- L1 (2026-11-17): "Quiero construir un generador de trazas para este tipo de sintaxis"
- L2 (2026-11-17): "Es para usarlo en la materia, pensaba en usar algo nativo en rust, como la libreria grafica que usa Zed y discord en el proyecto phoenix"
- L3 (2026-11-17): "Mejor hagamoslo una web"
- L4 (2026-11-17): "vamos con vite y tailwind"
- Route: all tasks inline; no Writer trigger (units are sequential and share the core types).
- Note: `npm audit` (before switching to bun) reported picomatch ReDoS in dev tooling; suggested fix is a downgrade, ignored.
- L5 (2026-11-17): "usa bun" — switched package manager from npm to bun (bun.lock replaces package-lock.json).
