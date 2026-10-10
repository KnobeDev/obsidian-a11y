// WCAG 2.1.2 (No Keyboard Trap). Obsidian's CodeMirror editor consumes Tab, so
// a keyboard user who lands in it cannot Tab back out to the surrounding chrome.
// This adds Escape as the documented exit: pressing Esc in the editor moves
// focus to a navigable place (the view header / active tab).
//
// Deliberately narrow so it never steals an Esc that means something else:
//   - Only the CodeMirror editor traps Tab. Plain <input>/<textarea> let Tab
//     out natively and have their own Esc semantics (e.g. file-rename cancel),
//     so they are NOT handled here.
//   - Defer until after dispatch when another handler already consumed Esc
//     (e.defaultPrevented) — so CM autocomplete/selection/tooltip Esc, and
//     Vim normal-mode Esc, all win.
//   - Ignored during IME composition.

import { App } from "obsidian";
import { isVisible } from "./dom";

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
): () => void {
  let disposed = false;
  const onKeydown = (e: KeyboardEvent): void => {
    if (e.key !== "Escape" || !isEnabled() || e.isComposing ||
        e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const el = doc.activeElement as HTMLElement | null;
    const editor = el?.closest(".cm-editor");
    if (!editor || el?.closest(".modal-container, .prompt")) return;
    if (editor.querySelector(".cm-tooltip") ||
        Array.from(doc.querySelectorAll<HTMLElement>(".suggestion-container")).some(isVisible)) return;
    const vim = (app.vault as unknown as { getConfig?: (k: string) => unknown })
      .getConfig?.("vimMode");
    if (vim) return;

    // Capture observes even when CM stops propagation. Run after dispatch so
    // native autocomplete, highlight pickers and other Escape handlers win.
    doc.defaultView?.setTimeout(() => {
      if (disposed || e.defaultPrevented || !isEnabled() || doc.activeElement !== el ||
          !editor.isConnected) return;
      exitTarget(editor, doc)?.focus();
    }, 0);
  };
  doc.addEventListener("keydown", onKeydown, true);
  return () => {
    disposed = true;
    doc.removeEventListener("keydown", onKeydown, true);
  };
}
