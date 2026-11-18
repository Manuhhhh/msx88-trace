export type Lang = "es" | "en";
export const LANGS: readonly { id: Lang; name: string }[] = [
  { id: "es", name: "Español" },
  { id: "en", name: "English" },
];

/** Spanish (Rioplatense) is the default; the choice is remembered in this browser. */
export const DEFAULT_LANG: Lang = "es";
const STORAGE_KEY = "msx88-trace:lang";

const HELP_EN = `
<section>
  <h3>What it does</h3>
  <p>It runs an MSX88 assembly program one instruction at a time and records every value the registers, the flags, data memory and the stack go through, so you can follow the program by hand.</p>
</section>
<section>
  <h3>Using it</h3>
  <ol>
    <li>Write a program in <strong>Source</strong>, or pick one from <strong>Example</strong>.</li>
    <li>Press <strong>Run trace</strong> or <kbd>Ctrl</kbd> + <kbd>Enter</kbd>. In the editor, <kbd>Ctrl</kbd> + <kbd>I</kbd> (or <kbd>Ctrl</kbd> + <kbd>Space</kbd>) suggests instructions, registers and your own labels (suggestions also appear as you type; <kbd>↑</kbd> <kbd>↓</kbd> choose, <kbd>Tab</kbd> accepts, <kbd>Esc</kbd> closes). <kbd>Tab</kbd> indents (<kbd>Shift</kbd> + <kbd>Tab</kbd> outdents); press <kbd>Esc</kbd> and then <kbd>Tab</kbd> to move on to the next control. If a line does not assemble, it is selected in the source with the reason.</li>
    <li>Read the four tables under <strong>Trace</strong>. Every table is indexed by step: step 1 is the first instruction that ran.</li>
  </ol>
</section>
<section>
  <h3>The four tables</h3>
  <dl>
    <dt>Registers</dt>
    <dd>One column per register, one row per step in which one of them changed. A blank cell did not change. The first row, <em>start</em>, holds the initial values.</dd>
    <dt>Flags</dt>
    <dd>The same layout for ZF, SF, CF, OF, IF, PF and AF, with their value (0 or 1) after the step.</dd>
    <dt>Heap</dt>
    <dd>One row per data memory address that was written. To the right, the value it started with (<em>s0</em>) and every value it took after, oldest first. Dimmed, struck-through values were overwritten.</dd>
    <dt>Stack</dt>
    <dd>One row per stack address, from the base (<code>8000H</code>) downwards. To the right, every value pushed there, oldest first. Dimmed, struck-through values were already popped.</dd>
  </dl>
</section>
<section>
  <h3>Hover to locate a step</h3>
  <p>Pass the mouse over a row, or over a value in Heap or Stack, to see the step, the instruction address (IP), the source line and the instruction. The same step lights up in every table and its line is highlighted in the source. A blue edge on the left marks a step where the CPU accepted an interrupt.</p>
</section>
<section>
  <h3>Run settings</h3>
  <ul>
    <li><strong>Keyboard input for INT 6</strong>: the characters the program reads.</li>
    <li><strong>Step limit</strong>: stops runaway loops (up to 20000 steps).</li>
    <li><strong>Interrupt requests</strong>: raise F10, the timer or the handshake line right before a given step, to trace how the program serves an interrupt.</li>
  </ul>
</section>
<section>
  <h3>Step by step</h3>
  <p>Switch <strong>All steps</strong> to <strong>Step by step</strong> to run the program one instruction at a time. The tables fill in as you go, the step that just ran stays lit in each of them, and its line stays highlighted in the source. Use <strong>Next</strong> and <strong>Previous</strong> (or the <kbd>→</kbd> and <kbd>←</kbd> keys), drag the slider to jump to any step, or press <strong>Play</strong> to let it run on its own.</p>
</section>
<section>
  <h3>Making room</h3>
  <p><strong>Full-width source</strong> gives the editor the whole width and moves the trace below it. Each table has <strong>Expand</strong> to fill the trace area and <strong>Hide</strong> to fold it down to its title. Wide tables scroll sideways.</p>
</section>
<section>
  <h3>Sharing</h3>
  <p>The address bar always holds the source and settings of the last run. Copy the link and anyone who opens it gets the same trace. The language is a personal setting and is not part of the link.</p>
</section>`;

const HELP_ES = `
<section>
  <h3>Qué hace</h3>
  <p>Ejecuta un programa assembly MSX88 de a una instrucción y registra cada valor por el que pasan los registros, los flags, la memoria de datos y el stack, así podés seguir el programa a mano.</p>
</section>
<section>
  <h3>Cómo se usa</h3>
  <ol>
    <li>Escribí un programa en <strong>Código fuente</strong>, o elegí uno desde <strong>Ejemplo</strong>.</li>
    <li>Tocá <strong>Ejecutar traza</strong> o apretá <kbd>Ctrl</kbd> + <kbd>Enter</kbd>. En el editor, <kbd>Ctrl</kbd> + <kbd>I</kbd> (o <kbd>Ctrl</kbd> + <kbd>Espacio</kbd>) sugiere instrucciones, registros y tus propias etiquetas (las sugerencias también aparecen mientras escribís; <kbd>↑</kbd> <kbd>↓</kbd> eligen, <kbd>Tab</kbd> acepta, <kbd>Esc</kbd> cierra). <kbd>Tab</kbd> indenta (<kbd>Shift</kbd> + <kbd>Tab</kbd> desindenta); apretá <kbd>Esc</kbd> y después <kbd>Tab</kbd> para pasar al siguiente control. Si una línea no ensambla, queda seleccionada en el código con el motivo.</li>
    <li>Leé las cuatro tablas de <strong>Traza</strong>. Todas están indexadas por paso: el paso 1 es la primera instrucción que se ejecutó.</li>
  </ol>
</section>
<section>
  <h3>Las cuatro tablas</h3>
  <dl>
    <dt>Registros</dt>
    <dd>Una columna por registro y una fila por cada paso en el que alguno cambió. Una celda vacía no cambió. La primera fila, <em>inicio</em>, tiene los valores iniciales.</dd>
    <dt>Flags</dt>
    <dd>El mismo formato para ZF, SF, CF, OF, IF, PF y AF, con su valor (0 o 1) después del paso.</dd>
    <dt>Heap</dt>
    <dd>Una fila por cada dirección de memoria de datos que se escribió. A la derecha, el valor con el que arrancó (<em>s0</em>) y cada valor que tomó después, del más viejo al más nuevo. Los valores atenuados y tachados fueron sobrescritos.</dd>
    <dt>Stack</dt>
    <dd>Una fila por cada dirección del stack, desde la base (<code>8000H</code>) hacia abajo. A la derecha, cada valor que se apiló ahí, del más viejo al más nuevo. Los valores atenuados y tachados ya fueron sacados.</dd>
  </dl>
</section>
<section>
  <h3>Pasá el mouse para ubicar un paso</h3>
  <p>Pasá el mouse por una fila, o por un valor de Heap o Stack, para ver el paso, la dirección de la instrucción (IP), la línea del código y la instrucción. Ese mismo paso se ilumina en todas las tablas y su línea se resalta en el código. Un borde azul a la izquierda marca un paso en el que la CPU aceptó una interrupción.</p>
</section>
<section>
  <h3>Ajustes de ejecución</h3>
  <ul>
    <li><strong>Entrada de teclado para INT 6</strong>: los caracteres que lee el programa.</li>
    <li><strong>Límite de pasos</strong>: corta los bucles infinitos (hasta 20000 pasos).</li>
    <li><strong>Pedidos de interrupción</strong>: activan F10, el timer o la línea de handshake justo antes de un paso dado, para ver cómo atiende el programa una interrupción.</li>
  </ul>
</section>
<section>
  <h3>Paso a paso</h3>
  <p>Cambiá <strong>Todos los pasos</strong> por <strong>Paso a paso</strong> para ejecutar el programa de a una instrucción. Las tablas se van completando a medida que avanzás, el paso que acaba de correr queda iluminado en cada una y su línea queda resaltada en el código. Usá <strong>Siguiente</strong> y <strong>Anterior</strong> (o las teclas <kbd>→</kbd> y <kbd>←</kbd>), arrastrá el slider para saltar a cualquier paso, o tocá <strong>Reproducir</strong> para que avance solo.</p>
</section>
<section>
  <h3>Más espacio</h3>
  <p><strong>Código a todo el ancho</strong> le da al editor todo el ancho y mueve la traza debajo. Cada tabla tiene <strong>Agrandar</strong> para ocupar toda el área de la traza y <strong>Ocultar</strong> para plegarse hasta su título. Las tablas anchas se desplazan hacia los costados.</p>
</section>
<section>
  <h3>Compartir</h3>
  <p>La barra de direcciones siempre guarda el código y los ajustes de la última ejecución. Copiá el link y quien lo abra ve la misma traza. El idioma es una preferencia personal y no forma parte del link.</p>
</section>`;

const en = {
  "app.title": "MSX88 Trace, step by step",
  "app.description": "Run MSX88 assembly in the browser and read it as a step-by-step trace of registers, flags, stack and interrupts.",
  "wordmark.label": "MSX88 Trace, start over",
  "lang.label": "Language",
  "example.label": "Example",
  "example.choose": "Choose an example",
  "kind.ins": "Instruction",
  "kind.dir": "Directive",
  "kind.reg": "Register",
  "kind.lab": "Label",
  "kind.sym": "Symbol",
  "kind.num": "Interrupt",
  "int.0": "End of program",
  "int.3": "Breakpoint",
  "int.5": "Random number in AL",
  "int.6": "Read a character into [BX]",
  "int.7": "Print AL characters from BX",
  "suggest.aria": "Suggestions",
  "suggest.count.one": "{n} suggestion",
  "suggest.count.other": "{n} suggestions",
  "lint.options": "Linter",
  "lint.check.syntax": "Syntax errors",
  "lint.check.dead": "Code that never runs",
  "lint.check.loop": "Loops that never end",
  "lint.check.uninit": "Variables read before they are assigned",
  "lint.at": "Line {n}: {msg}",
  "lint.msg.dead": "This code is never executed: nothing runs before it can reach it",
  "lint.msg.deadLabel": "\"{name}\" is never executed: nothing calls it or jumps to it",
  "lint.msg.loop": "This loop never ends: no instruction inside it can leave it",
  "lint.msg.uninit": "\"{name}\" is read before anything is stored in it",
  "lint.msg.uninitAnon": "This reads memory declared with ? before anything is stored in it",
  "scripts.label": "My scripts",
  "scripts.choose": "Choose a saved script",
  "scripts.save": "Save",
  "scripts.delete": "Delete",
  "scripts.saveTitle": "Save script",
  "scripts.name": "Script name",
  "scripts.confirm": "Save",
  "scripts.cancel": "Cancel",
  "scripts.saved": "Saved \"{name}\"",
  "scripts.deleted": "Deleted \"{name}\"",
  "scripts.failed": "Could not save: browser storage is unavailable or full",
  "scripts.replace": "Replaces the saved script with this name",
  "help.open": "How it works",
  "manual.open": "Instruction manual",
  "manual.title": "MSX88 instruction manual",
  "manual.title.mips": "EduMIPS64 instruction manual",
  "manual.back": "Back to the simulator",
  "manual.contents": "Contents",
  run: "Run trace",
  "source.title": "Source",
  "layout.btn": "Full-width source",
  "layout.help": "Gives the source the whole width and moves the trace below it.",
  "source.aria": "MSX88 assembly source",
  "source.help": "Run with Ctrl+Enter. Ctrl+I or Ctrl+Space suggests; Tab accepts a suggestion, otherwise it indents; Esc then Tab leaves the editor. The link in the address bar reproduces this run.",
  "settings.title": "Run settings",
  "settings.title.one": "Run settings, {n} interrupt request",
  "settings.title.other": "Run settings, {n} interrupt requests",
  "settings.input": "Keyboard input for INT 6",
  "settings.max": "Step limit",
  "settings.events": "Interrupt requests",
  "settings.add": "Add request",
  "settings.remove": "Remove",
  "settings.before": "before step",
  "settings.lineAria": "Line to raise",
  "settings.stepAria": "Raise before step",
  "line.0": "F10 key (INT0)",
  "line.1": "Timer (INT1)",
  "line.2": "Handshake (INT2)",
  "trace.title": "Trace",
  "stop.halted": "Program ended",
  "stop.max-steps": "Stopped at the step limit",
  "stop.error": "Stopped by an error",
  "notice.withError": "{reason}: {error}.",
  "notice.plain": "{reason}.",
  "screen.output": "Screen output",
  "summary.steps": "{n} steps",
  "summary.interrupts.one": "{n} interrupt",
  "summary.interrupts.other": "{n} interrupts",
  "view.aria": "Trace view",
  "view.all": "All steps",
  "view.step": "Step by step",
  "step.reset": "Reset",
  "step.prev": "Previous",
  "step.next": "Next",
  "step.play": "Play",
  "step.pause": "Pause",
  "step.range": "Step",
  "hover.hint": "Hover a row to see its instruction.",
  "hover.ready": "Ready. Press Next to run the first instruction.",
  "desc.step": "Step {n} · {where} · {text}",
  "desc.ip": "IP {ip}H",
  "desc.line": ", line {n}",
  "desc.irq": "interrupt accepted before {ip}H",
  "empty.title": "No trace yet",
  "empty.body": "Write or load a program and run it. You get every value the registers, flags, memory and stack went through.",
  "empty.load": "Load the interrupt example",
  "error.title": "The program did not assemble",
  "error.fix": "Fix that line in the source and run the trace again.",
  "ledger.registers": "Registers",
  "ledger.flags": "Flags",
  "ledger.heap": "Heap",
  "ledger.stack": "Stack",
  "ledger.bytes": "Memory map",
  "hint.values": "each value placed",
  "hint.heap": "data memory writes",
  "hint.stack": "every byte of the stack; dimmed bytes were popped",
  "hint.bytes": "every byte of data memory with its bits",
  "caption.bytes": "Data memory byte by byte: address, variable, character, hexadecimal and bits; highlighted bytes were changed by a store",
  "none.bytes": "The program declares no data.",
  "table.name": "Variable",
  "table.mark": "Mark",
  "table.char": "Char",
  "table.hex": "Hex",
  "table.bits": "Bits",
  "bytes.blank": "Declared with ? and not assigned yet",
  "bytes.more": "Showing the first {shown} of {total} bytes.",
  "ledger.expand": "Expand",
  "ledger.restore": "Restore",
  "ledger.hide": "Hide",
  "ledger.show": "Show",
  "table.step": "Step",
  "table.start": "start",
  "table.address": "Address",
  "table.order": "Oldest → newest",
  "slot.base": "base",
  "slot.byte": "byte",
  "slot.word": "word",
  "cell.initial": "Value before the first step (s0)",
  "cell.popped": " · popped at step {n}",
  "cell.overwritten": " · overwritten at step {n}",
  "caption.registers": "Register values by step, hexadecimal",
  "caption.flags": "Flag values by step",
  "caption.heap": "Data memory addresses, each with the values it held in order; dimmed values were overwritten",
  "caption.stack": "Stack byte by byte from its base: address, mark, character, hexadecimal and bits; dimmed bytes were popped and SP marks the top",
  "none.heap": "Nothing was written to data memory.",
  "none.stack": "The stack was not used.",
  "arch.label": "Architecture",
  "arch.msx88": "MSX88",
  "arch.mips": "EduMIPS64",
  "mips.app.title": "EduMIPS64 Trace, step by step",
  "mips.app.description": "Run EduMIPS64 assembly in the browser and read it as a step-by-step trace with the pipeline cycle diagram.",
  "mips.wordmark.label": "EduMIPS64 Trace, back to the start",
  "mips.source.aria": "EduMIPS64 assembly source",
  "mips.source.help": "Run with Ctrl+Enter. Ctrl+I or Ctrl+Space suggests; Tab accepts a suggestion, otherwise it indents; Esc then Tab leaves the editor. The link in the address bar reproduces this run.",
  "mips.empty.body": "Write or load a program and run it. You get the pipeline cycle diagram, every register that changed and every memory access.",
  "mips.forwarding": "Forwarding",
  "mips.forwarding.help": "With forwarding a result is usable right after EX (after MEM for a load). Without it, a reader waits for the write in WB.",
  "mips.pipeline": "Pipeline",
  "mips.pipeline.hint": "One row per instruction, one column per clock cycle",
  "mips.registers": "Registers",
  "mips.registers.hint": "Value after each step; a blank cell did not change",
  "mips.bytes": "Memory map",
  "mips.bytes.hint": "Every byte of data memory with its bits; highlighted bytes were changed by a store",
  "mips.bytes.more": "Showing the first {shown} of {total} bytes.",
  "mips.none.bytes": "The program declares no data.",
  "mips.col.char": "Char",
  "mips.col.hex": "Hex",
  "mips.col.bits": "Bits",
  "mips.variables": "Variables",
  "mips.variables.hint": "Each variable and its values over time; a struck-through value was overwritten",
  "mips.none.variables": "No variable in data memory was accessed.",
  "mips.col.variable": "Variable",
  "mips.col.values": "Values (initial, then each store)",
  "mips.col.varTip": "address {addr}, {size} B",
  "mips.memory": "Data memory",
  "mips.memory.hint": "Every load and store",
  "mips.none.registers": "No register changed.",
  "mips.none.memory": "Data memory was not accessed.",
  "mips.col.instruction": "Instruction",
  "mips.col.step": "Step",
  "mips.col.access": "Access",
  "mips.col.addr": "Address",
  "mips.col.size": "Bytes",
  "mips.col.before": "Before",
  "mips.col.value": "Value",
  "mips.kind.read": "read",
  "mips.kind.write": "write",
  "mips.summary.cycles": "{n} cycles",
  "mips.summary.cpi": "CPI {n}",
  "mips.summary.raw": "RAW stall cycles: {n}",
  "mips.summary.flushes": "Taken-branch bubbles: {n}",
  "mips.page.prev": "Earlier",
  "mips.page.next": "Later",
  "mips.page.range": "Instructions {from}–{to} of {total}",
  "mips.legend": "IF fetch · ID decode · EX execute · MEM memory · WB write back · RAW waiting for an operand",
  "mips.flush": "Taken branch: the instruction being fetched is discarded",
  "mips.desc.step": "Step {n} · line {line} · {text}",
  "mips.eff.write": "wrote {size} B at {addr}: {value}",
  "mips.eff.read": "read {size} B at {addr}: {value}",
  "mips.eff.raw": "RAW stall cycles: {n}",
  "mips.eff.taken": "branch taken",
  "mips.sys.0": "End of program",
  "mips.sys.5": "printf: r14 points to the parameter block",
  "lint.msg.uninitReg": "\"{name}\" is read before anything is assigned to it",
  "mips.lint.check.uninit": "Registers read before they are assigned",
  "help.title": "How MSX88 Trace works",
  "help.close": "Close",
  "help.body": HELP_EN,
} as const;

export type Key = keyof typeof en;

const es: Record<Key, string> = {
  "app.title": "MSX88 Trace, paso a paso",
  "app.description": "Ejecutá assembly MSX88 en el navegador y leelo como una traza paso a paso de registros, flags, stack e interrupciones.",
  "wordmark.label": "MSX88 Trace, volver al inicio",
  "lang.label": "Idioma",
  "example.label": "Ejemplo",
  "example.choose": "Elegí un ejemplo",
  "kind.ins": "Instrucción",
  "kind.dir": "Directiva",
  "kind.reg": "Registro",
  "kind.lab": "Etiqueta",
  "kind.sym": "Símbolo",
  "kind.num": "Interrupción",
  "int.0": "Fin del programa",
  "int.3": "Breakpoint",
  "int.5": "Número al azar en AL",
  "int.6": "Lee un carácter en [BX]",
  "int.7": "Imprime AL caracteres desde BX",
  "suggest.aria": "Sugerencias",
  "suggest.count.one": "{n} sugerencia",
  "suggest.count.other": "{n} sugerencias",
  "lint.options": "Linter",
  "lint.check.syntax": "Errores de sintaxis",
  "lint.check.dead": "Código que nunca se ejecuta",
  "lint.check.loop": "Bucles que nunca terminan",
  "lint.check.uninit": "Variables leídas antes de asignarlas",
  "lint.at": "Línea {n}: {msg}",
  "lint.msg.dead": "Este código nunca se ejecuta: nada de lo que corre antes llega hasta acá",
  "lint.msg.deadLabel": "\"{name}\" nunca se ejecuta: nada la llama ni salta a ella",
  "lint.msg.loop": "Este bucle nunca termina: ninguna instrucción dentro de él puede salir",
  "lint.msg.uninit": "\"{name}\" se lee antes de guardarle algún valor",
  "lint.msg.uninitAnon": "Esto lee memoria declarada con ? antes de guardarle algún valor",
  "scripts.label": "Mis scripts",
  "scripts.choose": "Elegí un script guardado",
  "scripts.save": "Guardar",
  "scripts.delete": "Borrar",
  "scripts.saveTitle": "Guardar script",
  "scripts.name": "Nombre del script",
  "scripts.confirm": "Guardar",
  "scripts.cancel": "Cancelar",
  "scripts.saved": "Guardado \"{name}\"",
  "scripts.deleted": "Borrado \"{name}\"",
  "scripts.failed": "No se pudo guardar: el almacenamiento del navegador no está disponible o está lleno",
  "scripts.replace": "Reemplaza el script guardado con este nombre",
  "help.open": "Cómo funciona",
  "manual.open": "Manual de instrucciones",
  "manual.title": "Manual de instrucciones del MSX88",
  "manual.title.mips": "Manual de instrucciones de EduMIPS64",
  "manual.back": "Volver al simulador",
  "manual.contents": "Contenido",
  run: "Ejecutar traza",
  "source.title": "Código fuente",
  "layout.btn": "Código a todo el ancho",
  "layout.help": "Le da al código todo el ancho y mueve la traza debajo.",
  "source.aria": "Código assembly MSX88",
  "source.help": "Ejecutá con Ctrl+Enter. Ctrl+I o Ctrl+Espacio sugiere; Tab acepta una sugerencia y, si no hay, indenta; Esc y después Tab saca el cursor del editor. El link de la barra de direcciones reproduce esta ejecución.",
  "settings.title": "Ajustes de ejecución",
  "settings.title.one": "Ajustes de ejecución, {n} pedido de interrupción",
  "settings.title.other": "Ajustes de ejecución, {n} pedidos de interrupción",
  "settings.input": "Entrada de teclado para INT 6",
  "settings.max": "Límite de pasos",
  "settings.events": "Pedidos de interrupción",
  "settings.add": "Agregar pedido",
  "settings.remove": "Quitar",
  "settings.before": "antes del paso",
  "settings.lineAria": "Línea a activar",
  "settings.stepAria": "Activar antes del paso",
  "line.0": "Tecla F10 (INT0)",
  "line.1": "Timer (INT1)",
  "line.2": "Handshake (INT2)",
  "trace.title": "Traza",
  "stop.halted": "El programa terminó",
  "stop.max-steps": "Se detuvo en el límite de pasos",
  "stop.error": "Se detuvo por un error",
  "notice.withError": "{reason}: {error}.",
  "notice.plain": "{reason}.",
  "screen.output": "Salida en pantalla",
  "summary.steps": "{n} pasos",
  "summary.interrupts.one": "{n} interrupción",
  "summary.interrupts.other": "{n} interrupciones",
  "view.aria": "Vista de la traza",
  "view.all": "Todos los pasos",
  "view.step": "Paso a paso",
  "step.reset": "Reiniciar",
  "step.prev": "Anterior",
  "step.next": "Siguiente",
  "step.play": "Reproducir",
  "step.pause": "Pausar",
  "step.range": "Paso",
  "hover.hint": "Pasá el mouse por una fila para ver su instrucción.",
  "hover.ready": "Listo. Tocá Siguiente para ejecutar la primera instrucción.",
  "desc.step": "Paso {n} · {where} · {text}",
  "desc.ip": "IP {ip}H",
  "desc.line": ", línea {n}",
  "desc.irq": "interrupción aceptada antes de {ip}H",
  "empty.title": "Todavía no hay traza",
  "empty.body": "Escribí o cargá un programa y ejecutalo. Vas a ver cada valor por el que pasaron los registros, los flags, la memoria y el stack.",
  "empty.load": "Cargar el ejemplo de interrupciones",
  "error.title": "El programa no se pudo ensamblar",
  "error.fix": "Corregí esa línea en el código y volvé a ejecutar la traza.",
  "ledger.registers": "Registros",
  "ledger.flags": "Flags",
  "ledger.heap": "Heap",
  "ledger.stack": "Stack",
  "ledger.bytes": "Mapa de memoria",
  "hint.values": "cada valor colocado",
  "hint.heap": "escrituras en memoria de datos",
  "hint.stack": "cada byte del stack; los atenuados fueron sacados con pop",
  "hint.bytes": "cada byte de la memoria de datos con sus bits",
  "caption.bytes": "Memoria de datos byte por byte: dirección, variable, carácter, hexadecimal y bits; los bytes resaltados cambiaron por un store",
  "none.bytes": "El programa no declara datos.",
  "table.name": "Variable",
  "table.mark": "Marca",
  "table.char": "Car.",
  "table.hex": "Hex",
  "table.bits": "Bits",
  "bytes.blank": "Declarado con ? y todavía sin asignar",
  "bytes.more": "Se muestran los primeros {shown} de {total} bytes.",
  "ledger.expand": "Agrandar",
  "ledger.restore": "Restaurar",
  "ledger.hide": "Ocultar",
  "ledger.show": "Mostrar",
  "table.step": "Paso",
  "table.start": "inicio",
  "table.address": "Dirección",
  "table.order": "Del más viejo al más nuevo",
  "slot.base": "base",
  "slot.byte": "byte",
  "slot.word": "palabra",
  "cell.initial": "Valor antes del primer paso (s0)",
  "cell.popped": " · sacado en el paso {n}",
  "cell.overwritten": " · sobrescrito en el paso {n}",
  "caption.registers": "Valores de los registros por paso, en hexadecimal",
  "caption.flags": "Valores de los flags por paso",
  "caption.heap": "Direcciones de la memoria de datos, cada una con los valores que tuvo en orden; los valores atenuados fueron sobrescritos",
  "caption.stack": "Stack byte por byte desde su base: dirección, marca, carácter, hexadecimal y bits; los bytes atenuados fueron sacados con pop y SP marca la cima",
  "none.heap": "No se escribió nada en la memoria de datos.",
  "none.stack": "No se usó el stack.",
  "arch.label": "Arquitectura",
  "arch.msx88": "MSX88",
  "arch.mips": "EduMIPS64",
  "mips.app.title": "EduMIPS64 Trace, paso a paso",
  "mips.app.description": "Ejecutá assembly EduMIPS64 en el navegador y leelo como una traza paso a paso con el diagrama de ciclos del pipeline.",
  "mips.wordmark.label": "EduMIPS64 Trace, volver al inicio",
  "mips.source.aria": "Código assembly EduMIPS64",
  "mips.source.help": "Ejecutá con Ctrl+Enter. Ctrl+I o Ctrl+Espacio sugiere; Tab acepta una sugerencia y, si no hay, indenta; Esc y después Tab saca el cursor del editor. El link de la barra de direcciones reproduce esta ejecución.",
  "mips.empty.body": "Escribí o cargá un programa y ejecutalo. Obtenés el diagrama de ciclos del pipeline, cada registro que cambió y cada acceso a memoria.",
  "mips.forwarding": "Forwarding",
  "mips.forwarding.help": "Con forwarding un resultado se puede usar justo después de EX (después de MEM si es un load). Sin forwarding, quien lo lee espera la escritura en WB.",
  "mips.pipeline": "Pipeline",
  "mips.pipeline.hint": "Una fila por instrucción, una columna por ciclo de reloj",
  "mips.registers": "Registros",
  "mips.registers.hint": "Valor después de cada paso; una celda vacía no cambió",
  "mips.bytes": "Mapa de memoria",
  "mips.bytes.hint": "Cada byte de la memoria de datos con sus bits; los resaltados cambiaron por un store",
  "mips.bytes.more": "Se muestran los primeros {shown} de {total} bytes.",
  "mips.none.bytes": "El programa no declara datos.",
  "mips.col.char": "Car.",
  "mips.col.hex": "Hex",
  "mips.col.bits": "Bits",
  "mips.variables": "Variables",
  "mips.variables.hint": "Cada variable y sus valores en el tiempo; un valor tachado fue sobrescrito",
  "mips.none.variables": "No se accedió a ninguna variable de la memoria de datos.",
  "mips.col.variable": "Variable",
  "mips.col.values": "Valores (inicial y luego cada store)",
  "mips.col.varTip": "dirección {addr}, {size} B",
  "mips.memory": "Memoria de datos",
  "mips.memory.hint": "Cada load y cada store",
  "mips.none.registers": "No cambió ningún registro.",
  "mips.none.memory": "No se accedió a la memoria de datos.",
  "mips.col.instruction": "Instrucción",
  "mips.col.step": "Paso",
  "mips.col.access": "Acceso",
  "mips.col.addr": "Dirección",
  "mips.col.size": "Bytes",
  "mips.col.before": "Antes",
  "mips.col.value": "Valor",
  "mips.kind.read": "lectura",
  "mips.kind.write": "escritura",
  "mips.summary.cycles": "{n} ciclos",
  "mips.summary.cpi": "CPI {n}",
  "mips.summary.raw": "Ciclos de stall RAW: {n}",
  "mips.summary.flushes": "Burbujas por salto tomado: {n}",
  "mips.page.prev": "Anteriores",
  "mips.page.next": "Siguientes",
  "mips.page.range": "Instrucciones {from}–{to} de {total}",
  "mips.legend": "IF fetch · ID decodificación · EX ejecución · MEM memoria · WB escritura · RAW esperando un operando",
  "mips.flush": "Salto tomado: se descarta la instrucción que se estaba buscando",
  "mips.desc.step": "Paso {n} · línea {line} · {text}",
  "mips.eff.write": "escribió {size} B en {addr}: {value}",
  "mips.eff.read": "leyó {size} B en {addr}: {value}",
  "mips.eff.raw": "Ciclos de stall RAW: {n}",
  "mips.eff.taken": "salto tomado",
  "mips.sys.0": "Fin del programa",
  "mips.sys.5": "printf: r14 apunta al bloque de parámetros",
  "lint.msg.uninitReg": "\"{name}\" se lee antes de asignarle algún valor",
  "mips.lint.check.uninit": "Registros leídos antes de asignarlos",
  "help.title": "Cómo funciona MSX88 Trace",
  "help.close": "Cerrar",
  "help.body": HELP_ES,
};

export const DICTIONARIES: Record<Lang, Record<Key, string>> = { en, es };

function readSaved(): Lang | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "es" || v === "en" ? v : null;
  } catch {
    return null; // private windows or blocked storage: just use the default
  }
}

let current: Lang | undefined;

/** The language in use; the saved choice is read the first time it is needed. */
export function getLang(): Lang {
  current ??= readSaved() ?? DEFAULT_LANG;
  return current;
}

export function setLang(lang: Lang): void {
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* the choice still applies for this visit */
  }
}

/** Looks a string up and fills its `{name}` placeholders. */
export function t(key: Key, vars: Record<string, string | number> = {}, lang: Lang = getLang()): string {
  return DICTIONARIES[lang][key].replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}

/** Picks the singular or plural form of a count, e.g. `plural("summary.interrupts", 2)`. */
export function plural(base: "settings.title" | "summary.interrupts" | "suggest.count", n: number, lang: Lang = getLang()): string {
  return t(`${base}.${n === 1 ? "one" : "other"}` as Key, { n }, lang);
}

// ---- messages that come from the assembler and the CPU --------------------------------------

/** English message shape -> Spanish. The core keeps its stable English messages; only the screen translates them. */
const CORE_ES: [RegExp, string][] = [
  [/^Line (\d+): (.*)$/s, "Línea $1: $2"],
  // instruction set
  [/^Unknown instruction (.+)$/, "Instrucción desconocida $1"],
  [/^(\S+) expects (\d+) operand\(s\), got (\d+)$/, "$1 espera $2 operando(s), recibió $3"],
  [/^Invalid operands for (.+)$/, "Operandos inválidos para $1"],
  [/^(\S+): specify BYTE PTR or WORD PTR$/, "$1: indicá BYTE PTR o WORD PTR"],
  [/^(\S+) count must be 1 or CL$/, "El conteo de $1 debe ser 1 o CL"],
  [/^(\S+): operand size mismatch$/, "$1: los operandos tienen distinto tamaño"],
  [/^INT number out of range: (.+)$/, "Número de INT fuera de rango: $1"],
  [/^Port out of range \(use DX\): (.+)$/, "Puerto fuera de rango (usá DX): $1"],
  [/^Immediate (.+) does not fit in (\d+) bits$/, "El inmediato $1 no entra en $2 bits"],
  // expressions and operands
  [/^Empty operand$/, "Operando vacío"],
  [/^Unexpected text in expression: (.*)$/s, "Texto inesperado en la expresión: $1"],
  [/^Empty expression$/, "Expresión vacía"],
  [/^Unexpected (".*")$/s, "Inesperado $1"],
  [/^Invalid number (".*")$/s, "Número inválido $1"],
  [/^OFFSET needs a symbol$/, "OFFSET necesita un símbolo"],
  [/^Undefined symbol (.+)$/, "Símbolo no definido $1"],
  [/^Symbol (.+) is not defined yet$/, "El símbolo $1 todavía no está definido"],
  [/^Incomplete expression$/, "Expresión incompleta"],
  [/^Unsupported addressing mode: (.*)$/s, "Modo de direccionamiento no soportado: $1"],
  [/^Address out of range: (.+)$/, "Dirección fuera de rango: $1"],
  // directives and layout
  [/^DW cannot hold a string$/, "DW no puede contener un string"],
  [/^Invalid DUP count: (.+)$/, "Cantidad de DUP inválida: $1"],
  [/^Reserved name (.+)$/, "Nombre reservado $1"],
  [/^Duplicate symbol (.+)$/, "Símbolo duplicado $1"],
  [/^EQU expects one value$/, "EQU espera un valor"],
  [/^ORG expects one address$/, "ORG espera una dirección"],
  [/^ORG out of range: (.+)$/, "ORG fuera de rango: $1"],
  [/^(\S+) needs at least one value$/, "$1 necesita al menos un valor"],
  [/^Program exceeds 64 KiB of memory$/, "El programa excede los 64 KiB de memoria"],
  [/^Value (.+) does not fit in (\d+) bits$/, "El valor $1 no entra en $2 bits"],
  [/^Code overlaps another instruction at (.+)$/, "El código se superpone con otra instrucción en $1"],
  // running
  [/^Cannot write to an immediate$/, "No se puede escribir en un inmediato"],
  [/^Unsupported ALU operation (.+)$/, "Operación de la ALU no soportada $1"],
  [/^Unsupported jump (.+)$/, "Salto no soportado $1"],
  [/^INT 6: no input left$/, "INT 6: no queda entrada"],
  [/^Divide error: division by zero$/, "Error de división: división por cero"],
  [/^Divide error: quotient overflow$/, "Error de división: desborde del cociente"],
  [/^Unsupported instruction (.+)$/, "Instrucción no soportada $1"],
  [/^CPU is halted$/, "La CPU está detenida"],
  [/^No instruction at (.+)$/, "No hay una instrucción en $1"],
  // EduMIPS64
  [/^Unknown directive (.+)$/, "Directiva desconocida $1"],
  [/^(\S+) is only allowed in the \.data section$/, "$1 solo se permite en la sección .data"],
  [/^Instruction (\S+) found in the \.data section$/, "La instrucción $1 está en la sección .data"],
  [/^(\S+): (\S+) is not a register$/, "$1: $2 no es un registro"],
  [/^(\S+): immediate (-?\d+) does not fit in 16 bits$/, "$1: el inmediato $2 no entra en 16 bits"],
  [/^(\S+): shift amount (-?\d+) must be between 0 and 63$/, "$1: la cantidad de desplazamiento $2 debe estar entre 0 y 63"],
  [/^(\S+): expected offset\(register\), got (.+)$/, "$1: se esperaba desplazamiento(registro), se recibió $2"],
  [/^Undefined label (.+)$/, "Etiqueta no definida $1"],
  [/^(\S+): (\S+) is a data label, not a code label$/, "$1: $2 es una etiqueta de datos, no de código"],
  [/^(\S+): label (\S+) points past the last instruction$/, "$1: la etiqueta $2 apunta después de la última instrucción"],
  [/^Symbol (\S+) is already defined$/, "El símbolo $1 ya está definido"],
  [/^Data does not fit in (\d+) bytes$/, "Los datos no entran en $1 bytes"],
  [/^\.space expects a non-negative number of bytes$/, ".space espera una cantidad de bytes no negativa"],
  [/^(\.\w+) expects at least one value$/, "$1 espera al menos un valor"],
  [/^Expected a "string", got (.+)$/s, 'Se esperaba un "string", se recibió $1'],
  [/^Invalid value (.+)$/, "Valor inválido $1"],
  [/^Invalid offset (.+)$/, "Desplazamiento inválido $1"],
  [/^Entry point (\S+) is not a code label$/, "El punto de entrada $1 no es una etiqueta de código"],
  [/^(\S+): expected a syscall number$/, "$1: se esperaba un número de syscall"],
  [/^Integer overflow$/, "Desborde de entero"],
  [/^Division by zero$/, "División por cero"],
  [/^Address (-?\d+) is outside data memory$/, "La dirección $1 está fuera de la memoria de datos"],
  [/^Misaligned memory access at address (\d+) \((\d+) bytes\)$/, "Acceso a memoria desalineado en la dirección $1 ($2 bytes)"],
  [/^Invalid jump address (-?\d+)$/, "Dirección de salto inválida $1"],
  [/^Unsupported syscall (\d+)$/, "Syscall no soportada $1"],
  [/^Execution ran past the last instruction$/, "La ejecución pasó la última instrucción"],
];

/** Translates an assembler or CPU message for the screen; anything it does not know stays as it was. */
export function translateCore(message: string, lang: Lang = getLang()): string {
  if (lang === "en") return message;
  // "Line 5: <message>": translate the inside first, then the prefix
  const withLine = /^Line (\d+): (.*)$/s.exec(message);
  if (withLine) return `Línea ${withLine[1]}: ${translateCore(withLine[2], lang)}`;
  for (const [re, out] of CORE_ES) if (re.test(message)) return message.replace(re, out);
  return message;
}
