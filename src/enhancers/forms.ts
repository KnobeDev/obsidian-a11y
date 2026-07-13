// Audit 04 — Setting controls: associate the visible name/description with the
// control, expose toggle state, and label the search clear button. Names are
// <div>s and the real checkbox is hidden, so we associate via aria-labelledby
// (not <label for>).

import {
  ensureId,
  hideFromAT,
  makeActivatable,
  setAttr,
  setRoleIfAbsent,
  visibleText,
} from "../dom";

const CONTROL_SELECTOR =
  'input, select, textarea, .checkbox-container, .dropdown, .slider, [role="button"]';

export function enhanceForms(doc: Document): void {
  if (!doc.body) return;
  doc.querySelectorAll<HTMLElement>(".setting-item").forEach((item) => {
    const nameEl = item.querySelector<HTMLElement>(".setting-item-name");
    const descEl = item.querySelector<HTMLElement>(".setting-item-description");
    const controlWrap = item.querySelector<HTMLElement>(".setting-item-control");

    // Headings: expose as real headings.
    if (item.classList.contains("setting-item-heading") && nameEl) {
      setRoleIfAbsent(nameEl, "heading");
      setAttr(nameEl, "aria-level", "3");
      return;
    }

    const name = nameEl ? visibleText(nameEl) : "";
    const nameId = nameEl && name ? ensureId(nameEl) : "";
    const descId = descEl && visibleText(descEl) ? ensureId(descEl) : "";

    const controls = controlWrap
      ? Array.from(controlWrap.querySelectorAll<HTMLElement>(CONTROL_SELECTOR))
      : [];

    controls.forEach((control) => {
      // The hidden <input> inside a toggle is replaced by the switch role on its
      // container; don't expose it as a second control.
      if (
        (control.tagName === "INPUT" || control.tagName === "LABEL") &&
        control.closest(".checkbox-container") &&
        !control.classList.contains("checkbox-container")
      ) {
        hideFromAT(control);
        setAttr(control, "tabindex", "-1");
        return;
      }

      const label = nameId || name;
      if (label && !control.hasAttribute("aria-label") && !control.hasAttribute("aria-labelledby")) {
        if (nameId) setAttr(control, "aria-labelledby", nameId);
      }
      if (descId && !control.hasAttribute("aria-describedby")) {
        setAttr(control, "aria-describedby", descId);
      }

      // Toggle switch: expose state + keyboard operability + guaranteed name.
      if (control.classList.contains("checkbox-container")) {
        setRoleIfAbsent(control, "switch");
        makeActivatable(control, {});
        setAttr(control, "aria-checked", String(control.classList.contains("is-enabled")));
        if (!nameId && name && !control.hasAttribute("aria-label")) {
          setAttr(control, "aria-label", name);
        }
      }
    });
  });

  // Search clear buttons are unlabeled, non-focusable divs.
  doc.querySelectorAll<HTMLElement>(".search-input-clear-button").forEach((btn) => {
    makeActivatable(btn, { role: "button" });
    if (!btn.getAttribute("aria-label")) setAttr(btn, "aria-label", "Clear search");
  });
}
