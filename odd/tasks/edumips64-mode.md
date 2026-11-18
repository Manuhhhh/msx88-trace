# edumips64-mode
Objective: add a second mode to msx88-trace that traces EduMIPS64 (MIPS64) syntax, including the pipeline cycle diagram. Branch: feat/edumips64-mode. Delivery: ask-on-risk. Test runner: vitest (`bun run test`, bun).

## Specs
- S1. "Quiero agregar otro modo, que es para la sintaxis de edumips64".
- S2. Trace scope, answered by the user: "Con pipeline" (functional per-instruction trace AND the IF/ID/EX/MEM/WB cycle diagram with stalls).
- S3. ASSUMPTION: the mode is an architecture selector (MSX88 | EduMIPS64); MSX88 behaviour must not change.
- S4. ASSUMPTION: source syntax is EduMIPS64's: `.data`/`.text`/`.code`, `.word`/`.byte`/`.half`/`.space`/`.asciiz`, `r0..r31` and `$0..$31`, labels, `;`/`#` comments, `syscall`/`halt`. Integer subset first; FP out of scope until asked.
- S5. ASSUMPTION (documented in code with `// ASSUMPTION:`): classic 5-stage in-order pipeline; stalls labelled RAW / WAW / structural as EduMIPS64 does; forwarding toggleable; branches resolved in ID. Exact EduMIPS64 timing to be checked against its manual (edumips64.readthedocs.io).

## Tasks
- T1 (S4) MIPS64 lexer/parser/assembler to a program image — inline — pending
- T2 (S4) functional CPU + per-instruction trace — inline — pending
- T3 (S2, S5) pipeline timing model over the executed stream (cycle diagram, stalls, forwarding flag) — inline — pending
- T4 (S3) mode selector + MIPS tables and cycle diagram in the UI, MSX88 untouched — inline — pending
- T5 (S3) highlight / autocomplete / examples / manual / i18n for MIPS — inline — pending

## Log
- L1 (2026-11-18): "Quiero agregar otro modo, que es para la sintaxis de edumips64"
- L2 (2026-11-18): scope question answered "Con pipeline".
- Route: all inline; units are sequential (T3 consumes T2's stream, T4 consumes both), so no Writer trigger.
- Research: EduMIPS64 labels RAW/WAW/structural stalls in the cycle diagram and lets forwarding be toggled (edumips.org, edumips64.readthedocs.io). Exact per-instruction timing NOT verified yet.
