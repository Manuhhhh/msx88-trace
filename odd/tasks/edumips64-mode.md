# edumips64-mode
Objective: add a second mode to msx88-trace that traces EduMIPS64 (MIPS64) syntax, including the pipeline cycle diagram. Branch: feat/edumips64-mode. Delivery: ask-on-risk. Test runner: vitest (`bun run test`, bun).

## Specs
- S1. "Quiero agregar otro modo, que es para la sintaxis de edumips64".
- S2. Trace scope, answered by the user: "Con pipeline" (functional per-instruction trace AND the IF/ID/EX/MEM/WB cycle diagram with stalls).
- S3. ASSUMPTION: the mode is an architecture selector (MSX88 | EduMIPS64); MSX88 behaviour must not change.
- S4. ASSUMPTION: source syntax is EduMIPS64's: `.data`/`.text`/`.code`, `.word`/`.byte`/`.half`/`.space`/`.asciiz`, `r0..r31` and `$0..$31`, labels, `;`/`#` comments, `syscall`/`halt`. Integer subset first; FP out of scope until asked.
- S5. ASSUMPTION (documented in code with `// ASSUMPTION:`): classic 5-stage in-order pipeline; stalls labelled RAW / WAW / structural as EduMIPS64 does; forwarding toggleable; branches resolved in ID. Exact EduMIPS64 timing to be checked against its manual (edumips64.readthedocs.io).
- S6. "Agrega una opcion para reproduciir paso a paso, como en el otro modo": a view toggle (all steps / step by step) with the stepper (reset, previous, next, play/pause, range, count), arrow keys, the source line of the current instruction highlighted, and the tables showing only what happened up to the current step, as in MSX88.
- S7. "Tmb q el grafico de los registros ocupe el doble de ancho, el de la memoria dejalo por debajo": in the EduMIPS64 screen the registers table takes twice the width it had (the full width of the trace pane) and the memory table sits below it.
- S8. "Tmb hace el lsp y el linter como en el otro": the EduMIPS64 editor gets what the MSX88 one has. ASSUMPTION: "lsp" means the editor suggestions/autocomplete (Ctrl+I, Ctrl+Space, as you type) since MSX88 has no real language server; the linter is the live one (syntax error, dead code, endless loops, unassigned registers, each toggleable) with the failing text underlined and a message on hover.

## Tasks
- T1 (S4) MIPS64 lexer/parser/assembler to a program image — inline — done, 21 tests + strict tsc OK, commit f47a7c5. Tests written after the code (no RED observed).
- T2 (S4) functional CPU + per-instruction trace — inline — done, 16 tests (RED observed: module missing) + full suite 186 + strict tsc OK, commit 9344ba1. Assumptions flagged in code: big-endian memory, overflow traps, misaligned error, syscall 0 and 5 only.
- T3 (S2, S5) pipeline timing model over the executed stream (cycle diagram, stalls, forwarding flag) — inline — done, 12 tests (RED observed: module missing) + full suite 198 + strict tsc OK, commit 61e1483. Timing is an ASSUMPTION documented at the top of src/mips/pipeline.ts; not yet checked against the EduMIPS64 manual.
- T4 (S3) mode selector + MIPS tables and cycle diagram in the UI, MSX88 untouched — inline — done, commit 7c7668a. Verified in Chromium (screenshots: loop example, RAW without/with forwarding 16 vs 10 cycles, assembler error, MSX88 header unchanged). Stepper (step-by-step) view NOT built for MIPS.
- T5 (S3) highlight / autocomplete / examples / manual / i18n for MIPS — inline — highlight, examples, i18n done in T4; autocomplete and linter done in T7. Pending: MIPS instruction manual page.
- T6 (S6, S7) step-by-step playback in the EduMIPS64 screen (shared line-highlight and reveal helpers extracted from app.ts) — inline — done, commit 81d01b7. RED observed for pipelineUpTo/stepFacts (3 tests); suite 225; verified in Chromium via CDP (stepper, arrows, play, reset, line highlight; MSX88 step mode re-checked after the refactor). Layout: pipeline, registers, memory each full width.
- T7 (S8) EduMIPS64 autocomplete and linter, wired into the editor — inline — done, commit 3450dc5. RED observed (modules missing); suite 272. Shared controllers (textpos, suggest, lintview) extracted from app.ts and reused by both screens; verified in Chromium on both (typing, Tab, Ctrl+I, Esc, underline, hover tip, toggles, run error selection). Checks: syntax, dead code, endless loops, registers read before assigned (a register left at its initial 0 counts as unassigned; the load-use example was fixed to initialise r4).

## Log
- L1 (2026-11-18): "Quiero agregar otro modo, que es para la sintaxis de edumips64"
- L2 (2026-11-18): scope question answered "Con pipeline".
- Route: all inline; units are sequential (T3 consumes T2's stream, T4 consumes both), so no Writer trigger.
- Research: EduMIPS64 labels RAW/WAW/structural stalls in the cycle diagram and lets forwarding be toggled (edumips.org, edumips64.readthedocs.io). Exact per-instruction timing NOT verified yet.
- L3 (2026-11-18): UI decision: separate screen (mips-app.ts) chosen by ?arch=mips, not wired into app.ts, to keep MSX88 untouched; switching reloads the page.
- L4 (2026-11-18): "Agrega una opcion para reproduciir paso a paso, como en el otro modo"
- L5 (2026-11-18): "Tmb q el grafico de los registros ocupe el doble de ancho, el de la memoria dejalo por debajo" (added to T6 / S7; layout becomes pipeline, registers, memory, one per row).
- L6 (2026-11-18): "Tmb hace el lsp y el linter como en el otro"
