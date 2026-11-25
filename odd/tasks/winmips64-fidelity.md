# winmips64-fidelity
Objective: make the MIPS mode faithful to WinMIPS64 (replacing its EduMIPS64 dialect). Branch: feat/winmips64-mode. Test runner: vitest (`bun run test`).

## Specs
- S1. "Quiero que sea fiel al winmips"
- S2. Scope, answered by the user: "Reemplazar EduMIPS64 por WinMIPS64" (the MIPS mode becomes WinMIPS64 only; SYSCALL 5 and the other EduMIPS64-only features go away).
- S3. Output is memory-mapped as in WinMIPS64: CONTROL at 0x10000, DATA at 0x10008; a nonzero CONTROL is acted on and cleared. 1 = DATA as unsigned integer + "\n", 2 = signed integer + "\n", 3 = double + "\n", 4 = string at address DATA (no newline), 6 = clear the terminal. Reference: WinMIPS64 source (WinEVEDoc.cpp update_io), explorer handoff.
- S4. There is no `syscall` (unknown instruction), no `.word64`/`.dword`/`.entry`/`.globl`; directives are those of WinMIPS64 ISET.TXT: .data .text .code .org .space .asciiz .ascii .align .word(64-bit) .byte .word32 .word16 (.global with no argument).
- S5. Memory is little-endian, data is laid out sequentially with NO natural alignment (only .align / .org / .space move the pointer), .data and .text both start at 0.
- S6. Instruction names as WinMIPS64: `daddui` (not daddiu); `dmul dmulu ddiv ddivu` take three registers (rd, rs, rt); no `nor`, `mflo`, `mfhi`, `b`.
- S7. Examples, manual, autocomplete, linter and Spanish messages describe WinMIPS64, not EduMIPS64.
- ASSUMPTIONS (flagged in code): overflow and divide-by-zero stop the run (WinMIPS64 shows a status message and continues); misaligned access stops (WinMIPS64 skips it); FP, graphics (CONTROL 5/7) and input (8/9) unsupported with a clear error; pipeline timing keeps the existing in-order model, labelled RAW, with no multi-cycle mul/div latencies.

## Tasks
- T1 (S4, S5, S6) memory + assembler: little-endian, sequential layout, WinMIPS64 directives and mnemonics — inline — done (RED: 8 failures), commit 1
- T2 (S3, S4, S6) simulator: drop syscall/lo/hi, MMIO CONTROL/DATA, ddiv/dmul three-register — inline — done (RED: 4 failures), commit 1
- T3 (S6, S7) pipeline/lint/complete/view cleanups for removed instructions — inline — done, commit 1; terminal clear step added (src/ui/terminal.ts)
- T4 (S7) examples, manual, i18n messages, remaining tests — delegated to gentle-ai-worker (context backstop) — done, commit 2; suite 330 green, tsc clean, e2e Hola mundo prints "Hola mundo!"

## Log
- L1 (2026-11-25): "Quiero que sea fiel al winmips"
- L2: scope answered "Reemplazar EduMIPS64 por WinMIPS64".
- Research: WinMIPS64 source clone (mcarrickscott/WinMIPS64): directives in asm.cpp:152, MMIO in pipeline.cpp:52 and WinEVEDoc.cpp:592-650, little-endian in utils.cpp:35-68. `.word64` does not exist there; my earlier advice to use it was EduMIPS64 syntax.
- OPEN: WinMIPS64 mul/div multi-cycle latencies, delay slot, branch target buffer, FP and graphics/input CONTROL modes are not modelled; string output (CONTROL=4) follows course usage because the cloned source has that line commented out.
