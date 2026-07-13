// WCAG 2.1.2 (No Keyboard Trap). Obsidian's CodeMirror editor consumes Tab, so
// a keyboard user who lands in it cannot Tab back out to the surrounding chrome.
// This adds Escape as the documented exit: pressing Esc in the editor moves
// focus to a navigable place (the view header / active tab).
//
// Deliberately narrow so it never steals an Esc that means something else:
//   - Only the CodeMirror editor traps Tab. Plain <input>/<textarea> let Tab
//     out natively and have their own Esc semantics (e.g. file-rename cancel),
//     so they are NOT handled here.
//   - Bubble phase + defer when another handler already consumed Esc
//     (e.defaultPrevented) — so CM autocomplete/selection/tooltip Esc, and
//     Vim normal-mode Esc, all win.
//   - Ignored during IME composition.

import { App } from "obsidian";
import { once } from "./dom";

function exitTarget(editor: Element, doc: Document): HTMLElement | null {
  const leaf = editor.closest(".workspace-leaf");

  // Outward focus order from the editor: the view's own header actions first…
  const headerBtn = leaf?.querySelector<HTMLElement>(
    '.view-header [role="button"], .view-header .clickable-icon, .view-header button',
  );
  if (headerBtn) return headerBtn;

  // …then the active tab for this group…
  const group = leaf?.closest(".workspace-tabs");
  const tab =
    group?.querySelector<HTMLElement>(
      ".workspace-tab-header.is-active, .workspace-tab-header.mod-active",
    ) ??
    doc.querySelector<HTMLElement>(
      ".workspace-tab-header.is-active, .workspace-tab-header.mod-active",
    );
  if (tab) return tab;

  // …then guaranteed fallbacks so the exit always works (2.1.2).
  const header = leaf?.querySelector<HTMLElement>(".view-header");
  if (header) {
    header.setAttribute("tabindex", "-1");
    return header;
  }
  const ribbonIcon = doc.querySelector<HTMLElement>(
    ".workspace-ribbon .clickable-icon",
  );
  return ribbonIcon ?? doc.body;
}

export function installEscapeEditable(
  doc: Document,
  app: App,
  isEnabled: () => boolean,
): void {
  if (!doc.body || !once(doc.body, "EscEditable")) return;

  // Capture phase: Obsidian/CodeMirror consume Escape before it reaches the
  // document in the bubble phase, so we must look first. We defer (do nothing,
  // letting the event continue) for every case where Esc has a local meaning.
  doc.addEventListener(
    "keydown",
    (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !isEnabled() || e.isComposing) return;

      const el = doc.activeElement as HTMLElement | null;
      const editor = el?.closest(".cm-editor");
      if (!editor) return; // only the editor traps Tab
      if (el?.closest(".modal-container, .prompt")) return; // editor in a dialog: let Esc close it
      if (editor.querySelector(".cm-tooltip-autocomplete")) return; // let Esc close autocomplete

      // Vim normal-mode uses Esc; don't fight it.
      const vim = (
        app.vault as unknown as { getConfig?: (k: string) => unknown }
      ).getConfig?.("vimMode");
      if (vim) return;

      const target = exitTarget(editor, doc);
      if (!target) return;
      e.preventDefault();
      e.stopPropagation();
      target.focus();
    },
    true,
  );
}
