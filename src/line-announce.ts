// Audit 05 — editor position feedback. CodeMirror renders line numbers in a
// presentational gutter (aria-hidden) outside the editable region, so a screen
// reader reading .cm-content never learns the line it is on. TalkBack in
// particular gives no sense of position in a long note. This extension watches
// the caret and pushes "Line N" into a live region whenever it moves to a new
// line — read-only, so it never disturbs the document, selection, or IME.

import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";

/**
 * Build the editor extension. `enabled` gates it at runtime (a settings toggle),
 * and `announce` delivers the message via the owning document's live region.
 * Line state is tracked per view so only a genuine line change speaks — moving
 * or typing within the same line stays silent.
 */
export function lineAnnouncer(
  enabled: () => boolean,
  announce: (message: string, doc: Document) => void,
): Extension {
  const lastLine = new WeakMap<EditorView, number>();
  return EditorView.updateListener.of((update) => {
    if (!enabled()) return;
    // Only a caret move or an edit can change the current line.
    if (!update.selectionSet && !update.docChanged) return;
    const head = update.state.selection.main.head;
    const line = update.state.doc.lineAt(head).number;
    if (lastLine.get(update.view) === line) return;
    lastLine.set(update.view, line);
    announce(`Line ${line}`, update.view.dom.ownerDocument);
  });
}
