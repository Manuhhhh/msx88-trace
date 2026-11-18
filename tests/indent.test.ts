import { describe, expect, it } from "vitest";
import { newlineEdit, tabEdit } from "../src/ui/indent";

/** Applies an edit the way the textarea does, to read the resulting text and selection. */
function apply(value: string, start: number, end: number, shift = false) {
  const e = tabEdit(value, start, end, shift);
  return { text: value.slice(0, e.from) + e.text + value.slice(e.to), sel: [e.selStart, e.selEnd] };
}

describe("tab in the source editor", () => {
  it("types a tab at the caret and moves past it", () => {
    expect(apply("MOV AX", 3, 3)).toEqual({ text: "MOV\t AX", sel: [4, 4] });
  });

  it("replaces a selection inside one line with a tab", () => {
    expect(apply("MOV AX, 5", 4, 6)).toEqual({ text: "MOV \t, 5", sel: [5, 5] });
  });

  it("indents every line of a multi-line selection and keeps it selected", () => {
    expect(apply("a\nb\nc", 0, 3)).toEqual({ text: "\ta\n\tb\nc", sel: [0, 5] });
  });

  it("leaves out the next line when the selection ends right after a line break", () => {
    expect(apply("a\nb\nc", 0, 4).text).toBe("\ta\n\tb\nc");
  });

  it("Shift+Tab takes one tab or up to eight spaces off each line", () => {
    expect(apply("\ta\n        b\n  c", 0, 14, true).text).toBe("a\nb\nc");
  });

  it("Shift+Tab works on the caret's own line and leaves unindented lines alone", () => {
    expect(apply("\tMOV AX\nHLT", 4, 4, true)).toEqual({ text: "MOV AX\nHLT", sel: [3, 3] });
    expect(apply("HLT", 1, 1, true).text).toBe("HLT");
  });
});

describe("enter in the source editor", () => {
  /** Applies the edit the way the textarea does. */
  function enter(value: string, start: number, end = start) {
    const e = newlineEdit(value, start, end);
    return { text: value.slice(0, e.from) + e.text + value.slice(e.to), caret: e.caret };
  }

  it("keeps the tab of the line it breaks", () => {
    expect(enter("\tMOV AX, 5", 11)).toEqual({ text: "\tMOV AX, 5\n\t", caret: 13 });
  });

  it("keeps spaces and tabs together", () => {
    expect(enter("  \tINT 0", 8)).toEqual({ text: "  \tINT 0\n  \t", caret: 12 });
  });

  it("carries the rest of the line to the new one", () => {
    expect(enter("\tMOV AX, 5", 4)).toEqual({ text: "\tMOV\n\t AX, 5", caret: 6 });
  });

  it("copies only the indentation before the caret", () => {
    expect(enter("\t\tINT 0", 1)).toEqual({ text: "\t\n\t\tINT 0", caret: 3 });
  });

  it("adds nothing on a line with no indentation", () => {
    expect(enter("MOV AX, 5", 9)).toEqual({ text: "MOV AX, 5\n", caret: 10 });
  });

  it("replaces a selection with the line break", () => {
    expect(enter("\tMOV AX, 5", 5, 8)).toEqual({ text: "\tMOV \n\t 5", caret: 7 });
  });

  it("uses the line where the selection starts", () => {
    expect(enter("\ta\nb", 2, 4)).toEqual({ text: "\ta\n\t", caret: 4 });
  });
});
